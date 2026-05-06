/**
 * End-to-end distillation test with real lark-cli data.
 * Simulates /feishu-distill without requiring full OpenClaw runtime.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const memDir = path.resolve(rootDir, "tests/_test_memory_output");
const promptPath = path.resolve(rootDir, "prompts/distill_v2.skill.md");

// ── Config ────────────────────────────────────────────────────────────
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.deepseek.com/anthropic";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "deepseek-v4-pro[1m]";

if (!LLM_API_KEY) {
  console.error("❌ LLM_API_KEY not set. Export it or set in env.");
  process.exit(1);
}

// ── Lark helpers ──────────────────────────────────────────────────────
function runLark(cmd) {
  const stdout = execSync(`lark-cli ${cmd}`, { encoding: "utf-8", timeout: 30000 });
  return JSON.parse(stdout);
}

function listChats() {
  const resp = runLark("im chats list");
  return resp.data?.items ?? [];
}

function listMessages(chatId, pageSize = 50, lookbackDays = 7) {
  const resp = runLark(`im +chat-messages-list --chat-id ${chatId} --page-size ${pageSize}`);
  const items = (resp.data?.messages ?? []).map((m) => ({
    message_id: m.message_id,
    sender: { id: m.sender?.id ?? "", name: m.sender?.name },
    create_time: m.create_time,
    msg_type: m.msg_type,
    content: m.content,
  }));
  if (lookbackDays <= 0) return items;
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  return items.filter((m) => {
    const ts = new Date(m.create_time).getTime();
    return !Number.isNaN(ts) && ts >= cutoff;
  });
}

function formatMessagesForPrompt(messages, chatName, chatId) {
  const lines = [
    `{`,
    `  "chat_id": "${chatId}",`,
    `  "chat_name": "${chatName}",`,
    `  "messages": [`,
  ];
  for (const m of messages) {
    const content = m.content.replace(/"/g, '\\"').replace(/\n/g, "\\n");
    lines.push(
      `    { "message_id": "${m.message_id}", "sender": "${m.sender.id}", "create_time": "${m.create_time}", "msg_type": "${m.msg_type}", "content": "${content}" },`,
    );
  }
  if (lines[lines.length - 1]?.endsWith(",")) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  lines.push(`  ]`);
  lines.push(`}`);
  return lines.join("\n");
}

// ── LLM caller ────────────────────────────────────────────────────────
async function callDistillation(systemText, userText) {
  const url = `${LLM_BASE_URL}/v1/messages`;
  const body = {
    model: LLM_MODEL,
    max_tokens: 16384,
    messages: [{ role: "user", content: userText }],
    system: systemText,
    temperature: 0.3,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": LLM_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM HTTP ${resp.status}: ${text.slice(0, 500)}`);
  }

  const data = await resp.json();
  const blocks = data.content ?? [];
  return blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

// ── Memory I/O ────────────────────────────────────────────────────────
async function writeMemoryFile(relPath, content) {
  const abs = path.join(memDir, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

async function ensureIndex() {
  const entries = [];
  const files = await fs.readdir(memDir, { recursive: true }).catch(() => []);
  for (const f of files) {
    if (typeof f !== "string") continue;
    if (!f.endsWith(".md") || f === "INDEX.md") continue;
    const text = await fs.readFile(path.join(memDir, f), "utf-8");
    const lines = text.split("\n");
    const first = lines[0]?.trim();
    const delims = ["---", "==="];
    if (!delims.includes(first)) continue;
    const endIdx = lines.findIndex((l, i) => i > 0 && delims.includes(l.trim()));
    if (endIdx === -1) continue;
    const fmText = lines.slice(1, endIdx).join("\n");
    const fm = {};
    for (const line of fmText.split("\n")) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) {
        const [, key, val] = m;
        if (val.startsWith("[") && val.endsWith("]")) {
          try { fm[key] = JSON.parse(val); } catch { fm[key] = val; }
        } else if (val === "true" || val === "false") {
          fm[key] = val === "true";
        } else if (/^-?\d+(\.\d+)?$/.test(val)) {
          fm[key] = parseFloat(val);
        } else {
          fm[key] = val;
        }
      }
    }
    const body = lines.slice(endIdx + 1).join("\n").trimStart();
    entries.push({ relativePath: f, frontmatter: fm, body });
  }

  const active = entries.filter((e) => e.frontmatter.status === "active");
  const indexLines = [
    "# Feishu Context Memory Index",
    "",
    `Total: ${entries.length} entries | Active: ${active.length}`,
    "",
    ...active.map(
      (e) => `- [${e.frontmatter.id ?? path.basename(e.relativePath, ".md")}] ${e.frontmatter.type ?? "unknown"} | ${e.body.split("\n")[0]?.replace(/^#\s*/, "") ?? ""} | importance:${e.frontmatter.importance ?? "?"}`,
    ),
  ];
  await fs.writeFile(path.join(memDir, "INDEX.md"), indexLines.join("\n"), "utf-8");
}

function parseDistillOutput(raw) {
  const files = [];
  const lines = raw.split("\n");
  let currentPath = "";
  let currentContent = [];

  for (const line of lines) {
    const match = line.match(/^===FILE:\s*(.+?)\s*===$/);
    if (match) {
      if (currentPath) {
        files.push({ path: currentPath, content: currentContent.join("\n") });
      }
      currentPath = match[1];
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

// ── Post-processing normalization ─────────────────────────────────────
function normalizeMemoryOutput(file) {
  let content = file.content;

  // 1. Fix subject format: "2nd:ou_xxx" -> "2nd" (strict schema enforcement)
  content = content.replace(/^subject:\s*(1st|2nd|3rd):\S+/gm, "subject: $1");

  // 2. Add missing reasoning field with a default based on type and title
  if (!/^reasoning:/m.test(content)) {
    const typeMatch = content.match(/^type:\s*(\w+)$/m);
    const titleMatch = content.match(/^#\s*(.+)$/m);
    const type = typeMatch ? typeMatch[1] : "memory";
    const title = titleMatch ? titleMatch[1].trim() : "untitled";
    const defaultReasoning = `根据消息内容提取为 ${type} 类型，主题为"${title}"。`;

    // Insert reasoning after the importance line, before evidence
    content = content.replace(
      /^(importance:\s*[\d.]+\s*)$/m,
      `$1\nreasoning: "${defaultReasoning}"`,
    );
  }

  return { path: file.path, content };
}

// ── Main flow ─────────────────────────────────────────────────────────
console.log("🔄 Feishu Distillation E2E Test Started\n");

// Clean output dir
await fs.rm(memDir, { recursive: true, force: true });
await fs.mkdir(memDir, { recursive: true });

// 1. List chats
const chats = listChats();
console.log(`Found ${chats.length} chats.`);

// Filter to contest-related chats
const targetChats = chats.filter((c) =>
  c.name.includes("OpenClaw") || c.name.includes("Memory") || c.name.includes("挑战赛"),
);
console.log(`Filtered to ${targetChats.length} contest-related chats.`);

// Load prompt template
let promptTemplate;
try {
  promptTemplate = await fs.readFile(promptPath, "utf-8");
} catch {
  console.log("⚠️  distill_v2.skill.md not found, using fallback minimal prompt.");
  promptTemplate = `You are a Feishu context distiller. Extract tasks, decisions, preferences, relationships, and lessons from the JSON below. Output markdown files with frontmatter.\n\nInput: {{INPUT_JSON}}`;
}

let totalMessages = 0;
let totalFiles = 0;

for (const chat of targetChats.slice(0, 2)) {
  console.log(`\n📁 ${chat.name} (${chat.chat_id})`);

  // 2. Fetch messages
  const messages = listMessages(chat.chat_id, 50, 7);
  totalMessages += messages.length;
  console.log(`  Messages fetched: ${messages.length}`);

  if (messages.length === 0) {
    console.log("  ⚠️  No messages, skipping.");
    continue;
  }

  // 3. Build prompt
  const mockJson = formatMessagesForPrompt(messages, chat.name, chat.chat_id);
  const prompt = promptTemplate.replace("{{INPUT_JSON}}", mockJson);

  // 4. Call LLM
  console.log("  Calling LLM for distillation...");
  let rawOutput;
  try {
    rawOutput = await callDistillation(
      "You are a precise enterprise context distiller. Follow the rules strictly.",
      prompt,
    );
  } catch (e) {
    console.log(`  ⚠️  LLM call failed: ${e.message}`);
    continue;
  }
  console.log(`  LLM output length: ${rawOutput.length} chars`);

  // 5. Parse, normalize, and write files
  const files = parseDistillOutput(rawOutput).map(normalizeMemoryOutput);
  for (const f of files) {
    if (!f.path || f.path === "MEMORY.md") continue;
    await writeMemoryFile(f.path, f.content);
    totalFiles++;
  }
  console.log(`  Memory files written: ${files.length}`);
}

// 6. Update index
await ensureIndex();
console.log(`\n✅ Done. Total messages: ${totalMessages}, files: ${totalFiles}`);
console.log(`Index: ${path.join(memDir, "INDEX.md")}`);

// Print a summary of generated files
const generated = await fs.readdir(memDir, { recursive: true });
const mdFiles = generated.filter((f) => f.endsWith(".md"));
console.log(`\n📁 Generated files:`);
for (const f of mdFiles.sort()) {
  const stat = await fs.stat(path.join(memDir, f));
  console.log(`  ${f} (${stat.size} bytes)`);
}
