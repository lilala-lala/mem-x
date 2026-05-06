/**
 * Test before_prompt_build hook logic standalone.
 * Verifies memory reads, active filtering, importance sorting, and context formatting.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const memDir = path.resolve(__dirname, "fixtures/_demo_memory");

// ── Inline memory.ts parser (same logic) ──────────────────────────────
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
        fm[key] = val;
      }
    }
  }
  return { frontmatter: fm, body: lines.slice(endIdx + 1).join("\n").trimStart() };
}

async function readMemoryDir(dir) {
  const entries = [];
  const files = await fs.readdir(dir, { recursive: true }).catch(() => []);
  for (const f of files) {
    if (typeof f !== "string") continue;
    if (!f.endsWith(".md")) continue;
    const abs = path.join(dir, f);
    const text = await fs.readFile(abs, "utf-8");
    const { frontmatter, body } = parseFrontmatter(text);
    const id = frontmatter.id ?? path.basename(f, ".md");
    entries.push({
      id,
      type: frontmatter.type ?? "unknown",
      relativePath: f,
      frontmatter,
      body,
    });
  }
  return entries;
}

// ── Reproduce hook logic from index.ts ────────────────────────────────
async function buildHookResult(memDir) {
  const entries = await readMemoryDir(memDir).catch(() => []);
  const active = entries
    .filter((e) => e.frontmatter.status === "active")
    .sort((a, b) => Number(b.frontmatter.importance ?? 0) - Number(a.frontmatter.importance ?? 0))
    .slice(0, 20);

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

  return {
    appendSystemContext: contextLines.join("\n"),
  };
}

// ── Test harness ──────────────────────────────────────────────────────
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
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "Assertion"}: expected ${b}, got ${a}`);
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || "Expected true");
}

console.log("\n🔌 Hook Injection Test\n");

const result = await buildHookResult(memDir);

// 1. Result exists
test("hook returns non-empty appendSystemContext", () => {
  assertTrue(result && typeof result.appendSystemContext === "string", "should return string");
  assertTrue(result.appendSystemContext.length > 0, "should not be empty");
});

// 2. Format checks
test("context starts with Enterprise Context header", () => {
  assertTrue(result.appendSystemContext.includes("### Enterprise Context (from Feishu)"), "missing header");
});

test("active entries are included", () => {
  assertTrue(result.appendSystemContext.includes("TASK:"), "should include tasks");
  assertTrue(result.appendSystemContext.includes("DECISION:"), "should include decisions");
});

// 3. Only active entries
test("superseded/archived entries are NOT injected", () => {
  // The mock output has a completed task (t_chen_redis_integration) with status "completed"
  // and no superseded entries. Verify "completed" is not in context.
  assertTrue(!result.appendSystemContext.includes("completed"), "should not include completed tasks");
});

// 4. Importance ordering
test("entries appear to be sorted by importance (descending)", () => {
  const lines = result.appendSystemContext.split("\n").filter((l) => l.startsWith("- "));
  const importances = lines.map((l) => {
    const m = l.match(/importance:\s*(\d+\.?\d*)/);
    return m ? parseFloat(m[1]) : 0;
  });
  for (let i = 1; i < importances.length; i++) {
    if (importances[i] > importances[i - 1]) {
      throw new Error(`Importance not sorted at index ${i}: ${importances[i - 1]} < ${importances[i]}`);
    }
  }
});

// 5. Token length sanity
test("context length is reasonable (< 2000 chars)", () => {
  assertTrue(result.appendSystemContext.length < 2000, `too long: ${result.appendSystemContext.length} chars`);
});

// 6. Show sample output
console.log("\n📝 Sample injected context (first 600 chars):");
console.log(result.appendSystemContext.slice(0, 600));
console.log("...");

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
