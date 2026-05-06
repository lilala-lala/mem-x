/**
 * Test feedback loop: serializeFrontmatter, updateMemoryFile, and feedback actions.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = await fs.mkdtemp(path.join(__dirname, "_test_feedback_tmp_"));

// ── Inline copies of functions under test (TypeScript -> ESM) ──────────
function serializeFrontmatter(fm) {
  const lines = [];
  for (const [key, val] of Object.entries(fm)) {
    if (Array.isArray(val)) {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    } else if (typeof val === "boolean") {
      lines.push(`${key}: ${val}`);
    } else if (typeof val === "number") {
      lines.push(`${key}: ${val}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(String(val))}`);
    }
  }
  return lines.join("\n");
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

async function updateMemoryFile(dir, id, updates) {
  const files = await fs.readdir(dir, { recursive: true });
  for (const f of files) {
    if (typeof f !== "string" || !f.endsWith(".md")) continue;
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

// ── Test harness ──────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const testPromises = [];
async function test(name, fn) {
  const p = (async () => {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${name}: ${e.message}`);
      failed++;
    }
  })();
  testPromises.push(p);
  return p;
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "Assertion"}: expected ${b}, got ${a}`);
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || "Expected true");
}

console.log("\n📝 Feedback Loop Tests\n");

// 1. serializeFrontmatter round-trip
const sampleFm = {
  id: "mem_t_test",
  type: "task",
  status: "active",
  confidence: 0.85,
  importance: 0.9,
  tags: ["urgent", "backend"],
  title: 'Say "hello" to the world',
};
const serialized = serializeFrontmatter(sampleFm);
const roundTripMd = `---\n${serialized}\n---\n\n# Test Title\nBody here.`;
const parsed = parseFrontmatter(roundTripMd);

test("serializeFrontmatter round-trip preserves id", () => assertEqual(parsed.frontmatter.id, "mem_t_test"));
test("serializeFrontmatter round-trip preserves type", () => assertEqual(parsed.frontmatter.type, "task"));
test("serializeFrontmatter round-trip preserves status", () => assertEqual(parsed.frontmatter.status, "active"));
test("serializeFrontmatter round-trip preserves confidence", () => assertEqual(parsed.frontmatter.confidence, 0.85));
test("serializeFrontmatter round-trip preserves importance", () => assertEqual(parsed.frontmatter.importance, 0.9));
test("serializeFrontmatter round-trip preserves tags array", () => {
  assertTrue(Array.isArray(parsed.frontmatter.tags), "tags should be array");
  assertEqual(parsed.frontmatter.tags.length, 2, "tags length");
  assertEqual(parsed.frontmatter.tags[0], "urgent", "first tag");
});
test("serializeFrontmatter round-trip preserves quoted string", () => assertEqual(parsed.frontmatter.title, 'Say "hello" to the world'));

// 2. updateMemoryFile & feedback log (single sequential test)
test("updateMemoryFile and feedback log workflow", async () => {
  const testFilePath = path.join(tmpDir, "task", "test_task.md");
  const initialContent = `---\nid: mem_t_prd\ntype: task\nstatus: active\nconfidence: 0.8\nimportance: 0.7\n---\n\n# Submit PRD\nDetails here.`;
  await fs.mkdir(path.dirname(testFilePath), { recursive: true });
  await fs.writeFile(testFilePath, initialContent, "utf-8");

  // a) Update existing entry
  const ok1 = await updateMemoryFile(tmpDir, "mem_t_prd", { importance: 0.95, status: "superseded" });
  assertTrue(ok1, "should return true for existing entry");

  // b) Missing entry returns false
  const ok2 = await updateMemoryFile(tmpDir, "nonexistent", { importance: 1.0 });
  assertTrue(!ok2, "should return false for missing entry");

  // c) Verify updates and preservation
  const updatedText = await fs.readFile(testFilePath, "utf-8");
  const updatedParsed = parseFrontmatter(updatedText);
  assertEqual(updatedParsed.frontmatter.importance, 0.95, "importance should update");
  assertEqual(updatedParsed.frontmatter.status, "superseded", "status should update");
  assertEqual(updatedParsed.frontmatter.confidence, 0.8, "confidence should be preserved");
  assertTrue(updatedParsed.body.includes("# Submit PRD"), "body should be preserved");

  // d) Feedback log append
  const now = new Date().toISOString();
  const feedbackLog = (updatedParsed.frontmatter.feedback_log ?? []);
  feedbackLog.push({ action: "correct", note: "verified", at: now });
  await updateMemoryFile(tmpDir, "mem_t_prd", { feedback_log: feedbackLog, confidence: 0.9 });

  const afterFeedbackText = await fs.readFile(testFilePath, "utf-8");
  const afterFeedback = parseFrontmatter(afterFeedbackText);
  assertTrue(Array.isArray(afterFeedback.frontmatter.feedback_log), "feedback_log should be array");
  assertEqual(afterFeedback.frontmatter.feedback_log[0].action, "correct", "action mismatch");
  assertEqual(afterFeedback.frontmatter.feedback_log[0].note, "verified", "note mismatch");
  assertEqual(afterFeedback.frontmatter.confidence, 0.9, "confidence should bump");
});

await Promise.all(testPromises);

// Cleanup
try {
  await fs.rm(tmpDir, { recursive: true, force: true });
} catch (e) {
  // Ignore cleanup errors on some Node versions
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
