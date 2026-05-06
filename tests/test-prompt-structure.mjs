/**
 * Validate prompt file structure for completeness and correctness.
 * Checks v2 prompt for all required sections, few-shots, rules, and guardrails.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const v2Path = path.resolve(rootDir, "prompts/distill_v2.skill.md");
const v1Path = path.resolve(rootDir, "prompts/distill_v1.skill.md");

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

console.log("\n📋 Prompt Structure Validation\n");

// Load prompts
const v2Text = await fs.readFile(v2Path, "utf-8");
const v1Text = await fs.readFile(v1Path, "utf-8");

test("v2 prompt file exists and is non-empty", () => {
  assertTrue(v2Text.length > 5000, "v2 prompt should be substantial");
});

test("v2 prompt includes version 0.2", () => {
  assertTrue(v2Text.includes("version: 0.2"), "should declare v0.2");
});

test("v2 prompt has all required layers", () => {
  const requiredLayers = [
    "Layer 1: 角色与使命",
    "Layer 2: 记忆类型学",
    "Layer 3: 输出格式规范",
    "Layer 4: 决策框架",
    "Layer 5: 噪声分类学",
    "Layer 6: 边界案例处理指南",
    "Layer 7: 多场景 Few-shot 示例",
    "Layer 8: 输出后质量自检清单",
    "Layer 9: 输入处理",
  ];
  for (const layer of requiredLayers) {
    assertTrue(v2Text.includes(layer), `missing layer: ${layer}`);
  }
});

test("v2 prompt has 4 few-shot examples", () => {
  const exampleMatches = v2Text.match(/示例 \d+[：:]/g) ?? [];
  assertEqual(exampleMatches.length, 4, "should have 4 numbered examples");
});

test("v2 prompt covers cross-industry scenarios", () => {
  const industries = ["技术", "销售", "HR", "市场"];
  for (const ind of industries) {
    assertTrue(v2Text.includes(ind), `missing industry context: ${ind}`);
  }
});

test("v2 prompt includes reasoning trace requirement", () => {
  assertTrue(v2Text.includes("reasoning:"), "should require reasoning field");
  assertTrue(v2Text.includes("reasoning 存在"), "should check reasoning in quality checklist");
});

test("v2 prompt has comprehensive noise taxonomy", () => {
  assertTrue(v2Text.includes("一律丢弃"), "should have 'always discard' category");
  assertTrue(v2Text.includes("通常丢弃"), "should have 'usually discard' category");
  assertTrue(v2Text.includes("上下文依赖"), "should have 'context-dependent' category");
});

test("v2 prompt has decision framework with 5 steps", () => {
  assertTrue(v2Text.includes("Step 1"), "should have step 1");
  assertTrue(v2Text.includes("Step 2"), "should have step 2");
  assertTrue(v2Text.includes("Step 3"), "should have step 3");
  assertTrue(v2Text.includes("Step 4"), "should have step 4");
  assertTrue(v2Text.includes("Step 5"), "should have step 5");
});

test("v2 prompt includes conflict resolution rules", () => {
  assertTrue(v2Text.includes("supersedes"), "should mention supersedes");
  assertTrue(v2Text.includes("版本链"), "should mention version chain");
  assertTrue(v2Text.includes("冲突检查"), "should have conflict check");
});

test("v2 prompt has quality checklist with ≥6 items", () => {
  const checklistItems = v2Text.match(/- \[ \]/g) ?? [];
  assertTrue(checklistItems.length >= 6, `quality checklist too short: ${checklistItems.length} items`);
});

test("v2 prompt includes edge case guidance", () => {
  assertTrue(v2Text.includes("模糊承诺"), "should cover ambiguous commitments");
  assertTrue(v2Text.includes("部分取消"), "should cover partial cancellation");
  assertTrue(v2Text.includes("多消息证据"), "should cover multi-message evidence");
});

test("v2 prompt includes importance anchors", () => {
  assertTrue(v2Text.includes("0.9+"), "should have 0.9+ anchor");
  assertTrue(v2Text.includes("0.7-0.9"), "should have 0.7-0.9 anchor");
  assertTrue(v2Text.includes("0.4-0.7"), "should have 0.4-0.7 anchor");
});

test("v2 prompt has format guardrails", () => {
  assertTrue(v2Text.includes("格式铁律"), "should have format iron rules");
  assertTrue(v2Text.includes("===FILE:"), "should specify ===FILE delimiter");
});

test("v2 prompt is significantly larger than v1", () => {
  assertTrue(v2Text.length > v1Text.length * 1.5, `v2 (${v2Text.length}) should be > 1.5x v1 (${v1Text.length})`);
});

test("v1 prompt is preserved and still readable", () => {
  assertTrue(v1Text.includes("version: 0.1"), "v1 should still declare v0.1");
  assertTrue(v1Text.includes("{{INPUT_JSON}}"), "v1 should have input marker");
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
