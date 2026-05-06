/**
 * 纯离线一键演示脚本 —— 无需 LLM API、无需 lark-cli。
 * 从预生成的 spike 结果直接加载记忆，展示完整闭环。
 *
 * Usage: node tests/demo-offline.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const memDir = path.resolve(rootDir, "tests/_demo_memory");
const spikeResultPath = path.resolve(rootDir, "prompts/results/distill_deepseek_v4.md");

// ── Inline utilities ──────────────────────────────────────────────────
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

function parseFrontmatter(text) {
  const lines = text.split("\n");
  const first = lines[0]?.trim();
  const delims = ["---", "==="];
  if (!delims.includes(first)) return { frontmatter: {}, body: text };
  const endIdx = lines.findIndex((l, i) => i > 0 && delims.includes(l.trim()));
  if (endIdx === -1) return { frontmatter: {}, body: text };
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
        if (val.startsWith('"') && val.endsWith('"')) {
          try { fm[key] = JSON.parse(val); } catch { fm[key] = val; }
        } else {
          fm[key] = val;
        }
      }
    }
  }
  return { frontmatter: fm, body: lines.slice(endIdx + 1).join("\n").trimStart() };
}

function serializeFrontmatter(fm) {
  const lines = [];
  for (const [key, val] of Object.entries(fm)) {
    if (Array.isArray(val)) lines.push(`${key}: ${JSON.stringify(val)}`);
    else if (typeof val === "boolean") lines.push(`${key}: ${val}`);
    else if (typeof val === "number") lines.push(`${key}: ${val}`);
    else lines.push(`${key}: ${JSON.stringify(String(val))}`);
  }
  return lines.join("\n");
}

async function ensureIndex(dir) {
  const entries = [];
  const files = await fs.readdir(dir, { recursive: true }).catch(() => []);
  for (const f of files) {
    if (typeof f !== "string" || !f.endsWith(".md") || f === "INDEX.md") continue;
    const text = await fs.readFile(path.join(dir, f), "utf-8");
    const { frontmatter, body } = parseFrontmatter(text);
    entries.push({ relativePath: f, frontmatter, body, id: frontmatter.id ?? path.basename(f, ".md") });
  }
  const active = entries.filter((e) => e.frontmatter.status === "active");
  const indexLines = [
    "# Feishu Context Memory Index",
    "",
    `Total: ${entries.length} entries | Active: ${active.length}`,
    "",
    ...active.map(
      (e) =>
        `- [${e.id}] ${e.frontmatter.type ?? "unknown"} | ${e.body.split("\n")[0]?.replace(/^#\s*/, "") ?? ""} | importance:${e.frontmatter.importance ?? "?"}`,
    ),
  ];
  await fs.writeFile(path.join(dir, "INDEX.md"), indexLines.join("\n"), "utf-8");
  return { entries, active };
}

async function buildHookResult(dir) {
  const { active } = await ensureIndex(dir);
  const top20 = active
    .sort((a, b) => Number(b.frontmatter.importance ?? 0) - Number(a.frontmatter.importance ?? 0))
    .slice(0, 20);
  if (top20.length === 0) return undefined;
  const lines = [
    "",
    "### Enterprise Context (from Feishu)",
    "",
    ...top20.map((e) => {
      const title = e.body.split("\n")[0]?.replace(/^#\s*/, "") ?? e.id;
      return `- ${e.frontmatter.type?.toUpperCase() ?? "UNKNOWN"}: ${title} (importance: ${e.frontmatter.importance ?? "?"})`;
    }),
    "",
  ];
  return lines.join("\n");
}

async function updateMemoryFile(dir, id, updates) {
  const files = await fs.readdir(dir, { recursive: true });
  for (const f of files) {
    if (typeof f !== "string" || !f.endsWith(".md") || f === "INDEX.md") continue;
    const abs = path.join(dir, f);
    const text = await fs.readFile(abs, "utf-8");
    const { frontmatter, body } = parseFrontmatter(text);
    if ((frontmatter.id ?? path.basename(f, ".md")) === id) {
      const newFm = { ...frontmatter, ...updates };
      const newContent = `---\n${serializeFrontmatter(newFm)}\n---\n\n${body}`;
      await fs.writeFile(abs, newContent, "utf-8");
      return true;
    }
  }
  return false;
}

// ── Demo script ───────────────────────────────────────────────────────
console.log("========================================");
console.log("🎬 Feishu Context Memory — Offline Demo");
console.log("========================================\n");

// 1. Setup: clean and load pre-generated memories
await fs.rm(memDir, { recursive: true, force: true });
await fs.mkdir(memDir, { recursive: true });

const spikeResult = await fs.readFile(spikeResultPath, "utf-8");
const files = parseDistillOutput(spikeResult);
let written = 0;
for (const f of files) {
  if (!f.path || f.path === "MEMORY.md") continue;
  const abs = path.join(memDir, f.path);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, f.content, "utf-8");
  written++;
}
console.log(`📥 Loaded ${written} pre-generated memory files from spike result.\n`);

// 2. Simulate /feishu-status
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("▶️  /feishu-status");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const { entries, active } = await ensureIndex(memDir);
const superseded = entries.filter((e) => e.frontmatter.status === "superseded");
const archived = entries.filter((e) => e.frontmatter.status === "archived");
const completed = entries.filter((e) => e.frontmatter.status === "completed");

console.log(`📊 Feishu Context Memory Status`);
console.log("");
console.log(`Total entries: ${entries.length}`);
console.log(`  Active: ${active.length}`);
console.log(`  Superseded: ${superseded.length}`);
console.log(`  Archived: ${archived.length}`);
console.log(`  Completed: ${completed.length}`);
console.log("");

const top5 = active
  .sort((a, b) => Number(b.frontmatter.importance ?? 0) - Number(a.frontmatter.importance ?? 0))
  .slice(0, 5);
console.log("Top 5 active memories:");
for (const e of top5) {
  const title = e.body.split("\n")[0]?.replace(/^#\s*/, "") ?? e.id;
  console.log(`  • [${e.frontmatter.type}] ${title} (imp:${e.frontmatter.importance ?? "?"})`);
}
console.log("");

// 3. Simulate hook injection
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("▶️  before_prompt_build hook injection");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
const hookResult = await buildHookResult(memDir);
console.log(hookResult?.slice(0, 800) ?? "(no active memories)");
console.log("...\n");

// 4. Simulate /feishu-feedback
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("▶️  /feishu-feedback mem_t_prd outdated deadline changed to next Monday");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

const target = active.find((e) => e.frontmatter.type === "task");
if (target) {
  const now = new Date().toISOString();
  const feedbackLog = (target.frontmatter.feedback_log ?? []);
  feedbackLog.push({ action: "outdated", note: "deadline changed to next Monday", at: now });
  await updateMemoryFile(memDir, target.id, { feedback_log: feedbackLog, status: "superseded" });
  await ensureIndex(memDir);

  console.log(`📝 Feedback recorded for [${target.id}]`);
  console.log(`  Action: outdated`);
  console.log(`  Note: deadline changed to next Monday`);
  console.log(`  New status: superseded`);
  console.log(`  Feedback count: ${feedbackLog.length}\n`);
} else {
  console.log(`No active task found for feedback demo, skipping.\n`);
}

// 5. Show a sample memory file
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("▶️  Sample memory file (first active decision)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
const sample = active.find((e) => e.frontmatter.type === "decision") ?? active[0];
if (sample) {
  const text = await fs.readFile(path.join(memDir, sample.relativePath), "utf-8");
  console.log(text.slice(0, 600));
  console.log("...\n");
}

// 6. Summary
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("✅ Demo complete.");
console.log(`   Memory dir: ${memDir}`);
console.log(`   Files: ${written}`);
console.log(`   Types: ${[...new Set(entries.map((e) => e.frontmatter.type).filter(Boolean))].join(", ")}`);
console.log("========================================\n");
