/**
 * Test LLM output self-validation logic.
 */

// Inline parseFrontmatter (same as memory.ts)
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

// Inline validateMemoryFile (same as index.ts)
const VALID_TYPES = new Set(["task", "decision", "preference", "relationship", "lesson"]);

function validateMemoryFile(file, messageIds) {
  const errors = [];
  const { frontmatter } = parseFrontmatter(file.content);

  const required = ["id", "type", "status", "importance", "confidence"];
  for (const key of required) {
    if (frontmatter[key] === undefined || frontmatter[key] === null) {
      errors.push(`missing required field: ${key}`);
    }
  }

  const type = frontmatter.type;
  if (type && !VALID_TYPES.has(type)) {
    errors.push(`invalid type: ${type}`);
  }

  const evidence = frontmatter.evidence;
  if (Array.isArray(evidence)) {
    for (const ev of evidence) {
      if (ev.msg_id && !messageIds.has(ev.msg_id)) {
        errors.push(`evidence msg_id not found in source: ${ev.msg_id}`);
      }
    }
  }

  const createdAt = frontmatter.created_at;
  if (createdAt && Array.isArray(evidence)) {
    const evidenceTimes = evidence
      .map((e) => e.timestamp)
      .filter((t) => typeof t === "string");
    if (evidenceTimes.length > 0) {
      const earliestEvidence = evidenceTimes.sort()[0];
      if (createdAt < earliestEvidence) {
        errors.push(`created_at (${createdAt}) earlier than earliest evidence (${earliestEvidence})`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
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
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || "Expected true");
}
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "Assertion"}: expected ${b}, got ${a}`);
}

console.log("\n🔍 Self-Validation Tests\n");

const validIds = new Set(["om_001", "om_002"]);

test("valid memory passes all checks", () => {
  const content = `---
id: mem_t_test
type: task
status: active
confidence: 0.9
importance: 0.8
created_at: 2026-04-22T10:00:00+08:00
evidence:
  - msg_id: om_001
    timestamp: 2026-04-22T09:00:00+08:00
---

# Test task
Body.`;
  const result = validateMemoryFile({ path: "test.md", content }, validIds);
  assertTrue(result.valid, `should be valid, got errors: ${result.errors.join(", ")}`);
  assertEqual(result.errors.length, 0, "no errors");
});

test("missing required field fails", () => {
  const content = `---
id: mem_t_test
type: task
status: active
---

# Test`;
  const result = validateMemoryFile({ path: "test.md", content }, validIds);
  assertTrue(!result.valid, "should be invalid");
  assertTrue(result.errors.some((e) => e.includes("missing required field: importance")), "should report missing importance");
  assertTrue(result.errors.some((e) => e.includes("missing required field: confidence")), "should report missing confidence");
});

test("invalid type fails", () => {
  const content = `---
id: mem_t_test
type: meeting
status: active
confidence: 0.9
importance: 0.8
---

# Test`;
  const result = validateMemoryFile({ path: "test.md", content }, validIds);
  assertTrue(!result.valid, "should be invalid");
  assertTrue(result.errors.some((e) => e.includes("invalid type: meeting")), "should report invalid type");
});

test("evidence msg_id not in source fails", () => {
  const content = `---
id: mem_t_test
type: task
status: active
confidence: 0.9
importance: 0.8
evidence: [{"msg_id":"om_999","timestamp":"2026-04-22T09:00:00+08:00"}]
---

# Test`;
  const result = validateMemoryFile({ path: "test.md", content }, validIds);
  assertTrue(!result.valid, "should be invalid");
  assertTrue(result.errors.some((e) => e.includes("evidence msg_id not found in source: om_999")), "should report missing msg_id");
});

test("created_at earlier than evidence fails", () => {
  const content = `---
id: mem_t_test
type: task
status: active
confidence: 0.9
importance: 0.8
created_at: 2026-04-22T08:00:00+08:00
evidence: [{"msg_id":"om_001","timestamp":"2026-04-22T09:00:00+08:00"}]
---

# Test`;
  const result = validateMemoryFile({ path: "test.md", content }, validIds);
  assertTrue(!result.valid, "should be invalid");
  assertTrue(result.errors.some((e) => e.includes("created_at")), "should report timeline error");
});

test("created_at after evidence passes", () => {
  const content = `---
id: mem_t_test
type: task
status: active
confidence: 0.9
importance: 0.8
created_at: 2026-04-22T10:00:00+08:00
evidence: [{"msg_id":"om_001","timestamp":"2026-04-22T09:00:00+08:00"}]
---

# Test`;
  const result = validateMemoryFile({ path: "test.md", content }, validIds);
  assertTrue(result.valid, `should be valid, got errors: ${result.errors.join(", ")}`);
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
