import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { resolveDefaultAgentId } from "openclaw/plugin-sdk/agent-runtime";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listChats, listMessages, formatMessagesForPrompt, type LarkChat, type LarkMessage } from "./lark.js";
import { callDistillation, buildDistillationPrompt } from "./llm.js";
import { readMemoryDir, writeMemoryFile, ensureIndex, updateMemoryFile, parseFrontmatter, serializeFrontmatter } from "./memory.js";

const PLUGIN_ID = "mem-x";

// Simple file-based prompt loading (no bundler needed for skill md)
// Tries v2 first, falls back to v1, then built-in minimal prompt.
async function loadDistillPrompt(): Promise<string> {
  const pluginDir = path.dirname(fileURLToPath(import.meta.url));

  // Search paths: pluginDir may be src/ (dev) or dist/ (compiled)
  const pluginName =
    path.basename(pluginDir) === "src"
      ? path.basename(path.resolve(pluginDir, ".."))
      : path.basename(pluginDir);
  const searchDirs = [
    path.join(pluginDir, "prompts"),       // src/prompts or dist/prompts
    path.join(pluginDir, "..", "prompts"), // project-root/prompts
    path.join(pluginDir, "..", "..", "prompts"), // monorepo fallback
    path.join(pluginDir, "..", "..", "..", "extensions", pluginName, "prompts"), // bundled build fallback
  ];

  for (const dir of searchDirs) {
    try {
      return await fs.readFile(path.join(dir, "distill_v2.skill.md"), "utf-8");
    } catch {
      // try v1 in same dir
    }
    try {
      return await fs.readFile(path.join(dir, "distill_v1.skill.md"), "utf-8");
    } catch {
      // next dir
    }
  }

  // Fallback minimal prompt if no files found
  return `You are a Feishu context distiller. Extract tasks, decisions, preferences, relationships, and lessons from the JSON below. Output markdown files with frontmatter.

Input: {{INPUT_JSON}}
`;
}

function parseDistillOutput(raw: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const lines = raw.split("\n");
  let currentPath = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const match = line.match(/^===FILE:\s*(.+?)\s*===$/);
    if (match) {
      if (currentPath) {
        files.push({ path: currentPath, content: currentContent.join("\n") });
      }
      currentPath = match[1]!;
      currentContent = [];
    } else if (currentPath) {
      currentContent.push(line);
    }
  }
  if (currentPath) {
    files.push({ path: currentPath, content: currentContent.join("\n") });
  }
  return files;
}

// ── LLM output normalization ─────────────────────────────────────────
function normalizeMemoryOutput(
  file: { path: string; content: string },
): { path: string; content: string } {
  let content = file.content;

  // 1. Fix subject format: "2nd:ou_xxx" -> "2nd" (strict schema enforcement)
  content = content.replace(/^subject:\s*(1st|2nd|3rd):\S+/gm, "subject: $1");

  // 2. Add missing reasoning field
  if (!/^reasoning:/m.test(content)) {
    const { frontmatter } = parseFrontmatter(content);
    const type = String(frontmatter.type ?? "memory");
    const title = content.split("\n").find((l) => l.startsWith("# "))?.replace(/^#\s*/, "").trim() ?? "untitled";
    const defaultReasoning = `根据消息内容提取为 ${type} 类型，主题为"${title}"。`;

    // Rebuild frontmatter with reasoning inserted
    frontmatter.reasoning = defaultReasoning;
    const fmText = serializeFrontmatter(frontmatter);
    const bodyIdx = content.indexOf("\n#");
    const body = bodyIdx >= 0 ? content.slice(bodyIdx + 1) : "";
    content = `---\n${fmText}\n---\n${body}`;
  }

  return { path: file.path, content };
}

// ── LLM output self-validation ───────────────────────────────────────
const VALID_TYPES = new Set(["task", "decision", "preference", "relationship", "lesson"]);

function validateMemoryFile(
  file: { path: string; content: string },
  messageIds: Set<string>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const { frontmatter } = parseFrontmatter(file.content);

  // 1. Required fields
  const required = ["id", "type", "status", "importance", "confidence"];
  for (const key of required) {
    if (frontmatter[key] === undefined || frontmatter[key] === null) {
      errors.push(`missing required field: ${key}`);
    }
  }

  // 2. Type validity
  const type = frontmatter.type as string | undefined;
  if (type && !VALID_TYPES.has(type)) {
    errors.push(`invalid type: ${type}`);
  }

  // 3. Evidence msg_id existence
  const evidence = frontmatter.evidence as Array<{ msg_id?: string; timestamp?: string }> | undefined;
  if (Array.isArray(evidence)) {
    for (const ev of evidence) {
      if (ev.msg_id && !messageIds.has(ev.msg_id)) {
        errors.push(`evidence msg_id not found in source: ${ev.msg_id}`);
      }
    }
  }

  // 4. Timeline consistency: created_at should not be before earliest evidence
  const createdAt = frontmatter.created_at as string | undefined;
  if (createdAt && Array.isArray(evidence)) {
    const evidenceTimes = evidence
      .map((e) => e.timestamp)
      .filter((t): t is string => typeof t === "string");
    if (evidenceTimes.length > 0) {
      const earliestEvidence = evidenceTimes.sort()[0];
      if (createdAt < earliestEvidence) {
        errors.push(`created_at (${createdAt}) earlier than earliest evidence (${earliestEvidence})`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Mem-X",
  description: "Distills Feishu chat history into OpenClaw memory. Enables Day-1 productive enterprise context.",
  register(api) {
    const cfg = (api.pluginConfig ?? {}) as Record<string, unknown>;
    const enabled = cfg.enabled !== false;
    const larkCliPath = String(cfg.larkCliPath ?? "lark-cli");
    const memoryDirName = String(cfg.memoryDir ?? "memory/feishu");
    const maxMessages = Number(cfg.maxMessagesPerDistill ?? 200);
    const lookbackDays = Number(cfg.lookbackDays ?? 7);
    const llmBaseUrl = String(cfg.llmBaseUrl ?? "https://api.deepseek.com/anthropic");
    const llmApiKey = String(cfg.llmApiKey ?? "");
    const llmModel = String(cfg.llmModel ?? "deepseek-v4-pro[1m]");

    function resolveMemoryDir(): string {
      // OpenClaw workspace is where MEMORY.md lives
      const agentId = resolveDefaultAgentId(api.config);
      const ws = api.runtime.agent.resolveAgentWorkspaceDir(api.config, agentId);
      return path.join(ws, memoryDirName);
    }

    // ── Command: feishu-distill ──────────────────────────────────────────
    api.registerCommand({
      name: "feishu-distill",
      description: "Run one-shot distillation from Feishu chats into memory files.",
      acceptsArgs: true,
      handler: async (ctx) => {
        if (!enabled) {
          return { text: "Feishu Context Memory is disabled. Enable it in plugin config." };
        }
        if (!llmApiKey) {
          return { text: "LLM API key not configured. Set llmApiKey in plugin config." };
        }

        const memDir = resolveMemoryDir();
        const args = ctx.args?.trim() ?? "";
        const chatFilter = args ? args.split(/\s+/) : [];

        let report = [`🔄 Feishu Distillation Started`, `Memory dir: ${memDir}`, ``];

        // 1. List chats
        let chats: LarkChat[];
        try {
          chats = await listChats(larkCliPath);
        } catch (e) {
          return { text: `Failed to list chats via lark-cli: ${e}` };
        }
        report.push(`Found ${chats.length} chats.`);

        if (chatFilter.length > 0) {
          chats = chats.filter((c) => chatFilter.some((f) => c.name.includes(f)));
          report.push(`Filtered to ${chats.length} chats matching: ${chatFilter.join(", ")}`);
        }

        // 2. Load prompt template
        const promptTemplate = await loadDistillPrompt();

        let totalMessages = 0;
        let totalFiles = 0;

        // Process chats in parallel to reduce total wall-clock time
        const chatResults = await Promise.all(
          chats.slice(0, 5).map(async (chat) => {
            const chatReport: string[] = [];
            chatReport.push(`\n📁 ${chat.name} (${chat.chat_id})`);

            // 3. Fetch messages
            let messages: LarkMessage[];
            try {
              messages = await listMessages(chat.chat_id, larkCliPath, maxMessages, lookbackDays);
            } catch (e) {
              chatReport.push(`  ⚠️  Failed to fetch messages: ${e}`);
              return { chatReport, chatMessages: 0, chatFiles: 0 };
            }
            chatReport.push(`  Messages fetched: ${messages.length}`);

            // 4. Build prompt
            const mockJson = formatMessagesForPrompt(messages, chat.name, chat.chat_id);
            const prompt = buildDistillationPrompt(promptTemplate, mockJson);

            // 5. Call LLM
            let rawOutput: string;
            try {
              rawOutput = await callDistillation(
                "You are a precise enterprise context distiller. Follow the rules strictly.",
                prompt,
                { baseUrl: llmBaseUrl, apiKey: llmApiKey, model: llmModel },
              );
            } catch (e) {
              chatReport.push(`  ⚠️  LLM call failed: ${e}`);
              return { chatReport, chatMessages: messages.length, chatFiles: 0 };
            }

            // 6. Parse output, normalize, validate, and write files
            const files = parseDistillOutput(rawOutput).map(normalizeMemoryOutput);
            const messageIds = new Set(messages.map((m) => m.message_id).filter((id): id is string => !!id));
            let validCount = 0;
            let invalidCount = 0;
            for (const f of files) {
              if (!f.path || f.path === "MEMORY.md") continue;
              const { valid, errors } = validateMemoryFile(f, messageIds);
              if (valid) {
                await writeMemoryFile(memDir, f.path, f.content);
                validCount++;
              } else {
                invalidCount++;
                chatReport.push(`  ⚠️  Validation failed for ${f.path}: ${errors.join("; ")}`);
              }
            }
            chatReport.push(`  Memory files written: ${validCount} (validation failed: ${invalidCount})`);
            return { chatReport, chatMessages: messages.length, chatFiles: validCount };
          }),
        );

        for (const r of chatResults) {
          report.push(...r.chatReport);
          totalMessages += r.chatMessages;
          totalFiles += r.chatFiles;
        }

        // 7. Update index
        await ensureIndex(memDir);
        report.push(`\n✅ Done. Total messages: ${totalMessages}, files: ${totalFiles}`);
        report.push(`Index: ${path.join(memDir, "INDEX.md")}`);

        return { text: report.join("\n") };
      },
    });

    // ── Command: feishu-status ───────────────────────────────────────────
    api.registerCommand({
      name: "feishu-status",
      description: "Show current Feishu memory status.",
      acceptsArgs: false,
      handler: async () => {
        const memDir = resolveMemoryDir();
        const entries = await readMemoryDir(memDir).catch(() => []);
        const active = entries.filter((e) => e.frontmatter.status === "active");
        const superseded = entries.filter((e) => e.frontmatter.status === "superseded");
        const archived = entries.filter((e) => e.frontmatter.status === "archived");

        const top5 = active
          .sort((a, b) => Number(b.frontmatter.importance ?? 0) - Number(a.frontmatter.importance ?? 0))
          .slice(0, 5)
          .map((e) => `  • [${e.type}] ${e.body.split("\n")[0]?.replace(/^#\s*/, "") ?? e.id} (imp:${e.frontmatter.importance ?? "?"})`);

        const lines = [
          `📊 Feishu Context Memory Status`,
          ``,
          `Total entries: ${entries.length}`,
          `  Active: ${active.length}`,
          `  Superseded: ${superseded.length}`,
          `  Archived: ${archived.length}`,
          ``,
          `Top 5 active memories:`,
          ...top5,
          ``,
          `Run /feishu-distill to refresh.`,
        ];
        return { text: lines.join("\n") };
      },
    });

    // ── Command: feishu-feedback ─────────────────────────────────────────
    api.registerCommand({
      name: "feishu-feedback",
      description: "Provide feedback on a memory entry: correct, outdated, noise, or important.",
      acceptsArgs: true,
      handler: async (ctx) => {
        const args = ctx.args?.trim() ?? "";
        const parts = args.split(/\s+/);
        const id = parts[0];
        const action = parts[1];
        const note = parts.slice(2).join(" ");

        const validActions = ["correct", "outdated", "noise", "important"];
        if (!id || !action || !validActions.includes(action)) {
          return {
            text: `Usage: /feishu-feedback <memory-id> <${validActions.join("|")}> [note]`,
          };
        }

        const memDir = resolveMemoryDir();
        const entries = await readMemoryDir(memDir);
        const entry = entries.find((e) => e.id === id);
        if (!entry) {
          return { text: `Memory not found: ${id}` };
        }

        const now = new Date().toISOString();
        const feedbackLog = (entry.frontmatter.feedback_log ?? []) as Array<{
          action: string;
          note: string;
          at: string;
        }>;
        feedbackLog.push({ action, note: note || "", at: now });

        const updates: Record<string, unknown> = { feedback_log: feedbackLog };

        switch (action) {
          case "correct": {
            const oldConf = Number(entry.frontmatter.confidence ?? 0.8);
            updates.confidence = Math.min(1.0, Math.round((oldConf + 0.05) * 100) / 100);
            break;
          }
          case "outdated":
            updates.status = "superseded";
            break;
          case "noise":
            updates.status = "archived";
            updates.importance = 0;
            break;
          case "important": {
            const oldImp = Number(entry.frontmatter.importance ?? 0.5);
            updates.importance = Math.min(1.0, Math.round((oldImp + 0.1) * 100) / 100);
            break;
          }
        }

        const ok = await updateMemoryFile(memDir, id, updates);
        if (!ok) {
          return { text: `Failed to update memory: ${id}` };
        }

        await ensureIndex(memDir);

        const lines = [
          `📝 Feedback recorded for [${id}]`,
          `  Action: ${action}`,
          `  Note: ${note || "(none)"}`,
        ];
        if (updates.confidence !== undefined) {
          lines.push(`  New confidence: ${updates.confidence}`);
        }
        if (updates.status !== undefined) {
          lines.push(`  New status: ${updates.status}`);
        }
        if (updates.importance !== undefined) {
          lines.push(`  New importance: ${updates.importance}`);
        }
        lines.push(`  Feedback count: ${feedbackLog.length}`);
        lines.push(`\nRun /feishu-status to see updated index.`);
        return { text: lines.join("\n") };
      },
    });

    // ── Hook: before_prompt_build ────────────────────────────────────────
    api.on("before_prompt_build", async () => {
      if (!enabled) return undefined;

      try {
        const memDir = resolveMemoryDir();
        const entries = await readMemoryDir(memDir).catch(() => []);
        const active = entries
          .filter((e) => e.frontmatter.status === "active")
          .sort((a, b) => Number(b.frontmatter.importance ?? 0) - Number(a.frontmatter.importance ?? 0))
          .slice(0, 20); // Inject top 20 most important

        if (active.length === 0) return undefined;

        const contextLines = [
          "",
          "### Enterprise Context (from Feishu)",
          "",
          ...active.map((e) => {
            const title = e.body.split("\n")[0]?.replace(/^#\s*/, "") ?? e.id;
            return `- ${e.type.toUpperCase()}: ${title} (importance: ${e.frontmatter.importance ?? "?"})`;
          }),
          "",
        ];

        // Append to system prompt via cacheable appendSystemContext
        return {
          appendSystemContext: contextLines.join("\n"),
        };
      } catch (e) {
        console.error("[mem-x] before_prompt_build hook failed:", e);
        return undefined;
      }
    });
  },
});
