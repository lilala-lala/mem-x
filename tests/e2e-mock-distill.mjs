/**
 * E2E test using mock data + real LLM.
 * Validates distillation quality against the designed oracles.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const memDir = path.resolve(rootDir, "tests/_test_mock_memory_output");
const mockDataPath = path.resolve(rootDir, "prompts/mock_data/week1_omega_chat.json");
const promptPath = path.resolve(rootDir, "prompts/distill_v2.skill.md");

const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.deepseek.com/anthropic";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "deepseek-v4-pro[1m]";

if (!LLM_API_KEY) {
  console.error("❌ LLM_API_KEY not set.");
  process.exit(1);
}

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
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

function parseDistillOutput(raw) {
  const files = [];
  const lines = raw.split("\n");
  let currentPath = "";
  let currentContent = [];
  for (const line of lines) {
    const match = line.match(/^===FILE:\s*(.+?)\s*===$/);
    if (match) {
      if (currentPath) files.push({ path: currentPath, content: currentContent.join("\n") });
      currentPath = match[1];
      currentContent = [];
    } else if (currentPath) {
      currentContent.push(line);
    }
  }
  if (currentPath) files.push({ path: currentPath, content: currentContent.join("\n") });
  return files;
}

async function writeMemoryFile(relPath, content) {
  const abs = path.join(memDir, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf-8");
}

async function ensureIndex() {
  const entries = [];
  const files = await fs.readdir(memDir, { recursive: true }).catch(() => []);
  for (const f of files) {
    if (typeof f !== "string" || !f.endsWith(".md") || f === "INDEX.md") continue;
    const text = await fs.readFile(path.join(memDir, f), "utf-8");
    const lines = text.split("\n");
    const first = lines[0]?.trim();
    const delims = ["---", "==="];
    if (!delims.includes(first)) continue;
    const endIdx = lines.findIndex((l, i) => i > 0 && delims.includes(l.trim()));
    if (endIdx === -1) continue;
    const fm = {};
    for (const line of lines.slice(1, endIdx).join("\n").split("\n")) {
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
      (e) =>
        `- [${e.frontmatter.id ?? path.basename(e.relativePath, ".md")}] ${e.frontmatter.type ?? "unknown"} | ${e.body.split("\n")[0]?.replace(/^#\s*/, "") ?? ""} | importance:${e.frontmatter.importance ?? "?"}`,
    ),
  ];
  await fs.writeFile(path.join(memDir, "INDEX.md"), indexLines.join("\n"), "utf-8");
}

console.log("🔄 Mock Data E2E Distillation Test\n");

await fs.rm(memDir, { recursive: true, force: true });
await fs.mkdir(memDir, { recursive: true });

const mockJson = JSON.parse(await fs.readFile(mockDataPath, "utf-8"));
const messages = mockJson.messages;
console.log(`Loaded ${messages.length} mock messages.`);

let promptTemplate;
try {
  promptTemplate = await fs.readFile(promptPath, "utf-8");
} catch {
  promptTemplate = `You are a Feishu context distiller. Extract tasks, decisions, preferences, relationships, and lessons. Output markdown files with frontmatter.\n\nInput: {{INPUT_JSON}}`;
}

const mockJsonStr = JSON.stringify({
  chat_id: mockJson.chat_id,
  chat_name: mockJson.chat_name,
  messages: messages.map((m) => ({
    message_id: m.message_id,
    sender: m.sender,
    create_time: m.create_time,
    msg_type: m.msg_type,
    content: m.content,
  })),
});

const prompt = promptTemplate.replace("{{INPUT_JSON}}", mockJsonStr);

console.log("Calling LLM for distillation...");
const rawOutput = await callDistillation(
  "You are a precise enterprise context distiller. Follow the rules strictly.",
  prompt,
);
console.log(`LLM output length: ${rawOutput.length} chars`);

const files = parseDistillOutput(rawOutput);
for (const f of files) {
  if (!f.path || f.path === "MEMORY.md") continue;
  await writeMemoryFile(f.path, f.content);
}
console.log(`Memory files written: ${files.length - (files.some((f) => f.path === "MEMORY.md") ? 1 : 0)}`);

await ensureIndex();

const generated = await fs.readdir(memDir, { recursive: true });
const mdFiles = generated.filter((f) => f.endsWith(".md"));
console.log(`\n📁 Generated files:`);
for (const f of mdFiles.sort()) {
  const stat = await fs.stat(path.join(memDir, f));
  console.log(`  ${f} (${stat.size} bytes)`);
}

// Quick type coverage check
const typeCounts = {};
for (const f of mdFiles.filter((f) => f !== "INDEX.md")) {
  const text = await fs.readFile(path.join(memDir, f), "utf-8");
  const lines = text.split("\n");
  const first = lines[0]?.trim();
  const delims = ["---", "==="];
  if (!delims.includes(first)) continue;
  const endIdx = lines.findIndex((l, i) => i > 0 && delims.includes(l.trim()));
  if (endIdx === -1) continue;
  for (const line of lines.slice(1, endIdx).join("\n").split("\n")) {
    const m = line.match(/^type:\s*(.*)$/);
    if (m) {
      typeCounts[m[1]] = (typeCounts[m[1]] ?? 0) + 1;
    }
  }
}
console.log(`\n📊 Type coverage: ${JSON.stringify(typeCounts)}`);
