/**
 * Standalone test runner for plugin core logic.
 * Usage: node tests/run-tests.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const mockDataPath = path.resolve(rootDir, "prompts/mock_data/week1_omega_chat.json");
const spikeResultPath = path.resolve(rootDir, "prompts/results/distill_deepseek_v4.md");

// ── Simple test harness ───────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || "Assertion failed"}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(cond, msg) {
  if (!cond) {
    throw new Error(msg || "Expected true");
  }
}

// ── Import modules under test ─────────────────────────────────────────
// Since we're in ESM with no bundler, we inline the testable functions
// or import from compiled dist if available. For simplicity, inline copies
// of the pure functions are tested here.

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
      `    { "message_id": "${m.message_id}", "sender": "${m.sender.open_id}", "create_time": "${m.create_time}", "msg_type": "${m.msg_type}", "content": "${content}" },`,
    );
  }
  if (lines[lines.length - 1]?.endsWith(",")) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  lines.push(`  ]`);
  lines.push(`}`);
  return lines.join("\n");
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

function parseFrontmatter(text) {
  const lines = text.split("\n");
  const first = lines[0]?.trim();
  if (first !== "---" && first !== "===") {
    return { frontmatter: {}, body: text };
  }
  // Support mixed delimiters: === ... --- or --- ... ---
  const endDelims = ["---", "==="];
  const endIdx = lines.findIndex((l, i) => i > 0 && endDelims.includes(l.trim()));
  if (endIdx === -1) {
    return { frontmatter: {}, body: text };
  }
  const fmText = lines.slice(1, endIdx).join("\n");
  const body = lines.slice(endIdx + 1).join("\n").trimStart();
  const fm = {};
  for (const line of fmText.split("\n")) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, val] = match;
      if (val.startsWith("[") && val.endsWith("]")) {
        try {
          fm[key] = JSON.parse(val);
        } catch {
          fm[key] = val;
        }
      } else if (val === "true" || val === "false") {
        fm[key] = val === "true";
      } else if (/^-?\d+(\.\d+)?$/.test(val)) {
        fm[key] = parseFloat(val);
      } else {
        fm[key] = val;
      }
    }
  }
  return { frontmatter: fm, body };
}

// ── Test suite ────────────────────────────────────────────────────────
console.log("\n🧪 Plugin Core Logic Tests\n");

// 1. Mock data loading
const mockJson = JSON.parse(await fs.readFile(mockDataPath, "utf-8"));
test("mock data has messages array", () => {
  assertTrue(Array.isArray(mockJson.messages), "messages should be array");
  assertTrue(mockJson.messages.length > 0, "messages should not be empty");
});

test("mock data has embedded oracles", () => {
  const oracles = mockJson._test_oracles;
  assertTrue(oracles, "should have _test_oracles");
  assertTrue(oracles.decisions_expected, "should have decisions_expected");
  assertTrue(oracles.commitments_expected, "should have commitments_expected");
  assertTrue(oracles.lessons_expected, "should have lessons_expected");
  assertTrue(oracles.preferences_expected, "should have preferences_expected");
  assertTrue(oracles.relationships_expected, "should have relationships_expected");
});

// 2. formatMessagesForPrompt
const promptJson = formatMessagesForPrompt(mockJson.messages.slice(0, 3), "Omega", "oc_xxx");
test("formatMessagesForPrompt produces valid JSON", () => {
  const parsed = JSON.parse(promptJson);
  assertEqual(parsed.chat_name, "Omega", "chat_name mismatch");
  assertEqual(parsed.messages.length, 3, "message count mismatch");
});

test("formatMessagesForPrompt escapes quotes and newlines", () => {
  const msgWithQuotes = [{ message_id: "m1", sender: { open_id: "u1" }, create_time: "2024-01-01", msg_type: "text", content: 'Say "hello"\nworld' }];
  const out = formatMessagesForPrompt(msgWithQuotes, "Test", "c1");
  assertTrue(out.includes('\\"'), "should escape quotes");
  assertTrue(out.includes("\\n"), "should escape newlines");
});

// 3. parseDistillOutput
const spikeResult = await fs.readFile(spikeResultPath, "utf-8");
const parsedFiles = parseDistillOutput(spikeResult);
test("parseDistillOutput extracts files from spike result", () => {
  assertTrue(parsedFiles.length > 0, "should extract at least one file");
  const hasFrontmatter = parsedFiles.some((f) => f.content.includes("---"));
  assertTrue(hasFrontmatter, "should have frontmatter in extracted files");
});

test("parseDistillOutput respects ===FILE: delimiters", () => {
  const raw = `===FILE: task/weekly_report.md ===\n# Task\ncontent\n===FILE: decision/okr.md ===\n# Decision\nmore\n`;
  const files = parseDistillOutput(raw);
  assertEqual(files.length, 2, "file count mismatch");
  assertTrue(files[0].path.includes("task/weekly_report.md"), "first path mismatch");
  assertTrue(files[1].path.includes("decision/okr.md"), "second path mismatch");
});

// 4. Frontmatter parser
const sampleMd = `---\nid: test-1\ntype: task\nstatus: active\nimportance: 8\n---\n# Do something\nDetails here.\n`;
const parsedFm = parseFrontmatter(sampleMd);
test("parseFrontmatter extracts correct fields", () => {
  assertEqual(parsedFm.frontmatter.id, "test-1", "id mismatch");
  assertEqual(parsedFm.frontmatter.type, "task", "type mismatch");
  assertEqual(parsedFm.frontmatter.status, "active", "status mismatch");
  assertEqual(parsedFm.frontmatter.importance, 8, "importance mismatch");
  assertTrue(parsedFm.body.startsWith("# Do something"), "body should start with heading");
});

// 5. Oracle coverage check (lightweight)
const oracles = mockJson._test_oracles;
const extractedTypes = new Set(parsedFiles.map((f) => {
  const fm = parseFrontmatter(f.content).frontmatter;
  return fm.type;
}).filter(Boolean));

test("spike output covers all required memory types", () => {
  const required = new Set(["task", "decision", "preference", "relationship", "lesson"]);
  for (const t of required) {
    assertTrue(extractedTypes.has(t), `missing memory type: ${t}; found: ${Array.from(extractedTypes).join(", ")}`);
  }
});

// 6. lookbackDays filtering (unit test)
function filterByLookback(items, lookbackDays) {
  if (lookbackDays <= 0) return items;
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  return items.filter((m) => {
    const ts = new Date(m.create_time).getTime();
    return !Number.isNaN(ts) && ts >= cutoff;
  });
}

test("lookbackDays filters old messages", () => {
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const items = [
    { create_time: now },
    { create_time: old },
  ];
  const filtered = filterByLookback(items, 7);
  assertEqual(filtered.length, 1, "should keep only recent message");
});

// ── Summary ───────────────────────────────────────────────────────────
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
