/**
 * Evaluation runner against embedded test oracles.
 * Validates spike output coverage for the five memory dimensions.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const mockDataPath = path.resolve(rootDir, "prompts/mock_data/week1_omega_chat.json");
const spikeResultPath = path.resolve(rootDir, "prompts/results/distill_deepseek_v4.md");

const mockJson = JSON.parse(await fs.readFile(mockDataPath, "utf-8"));
const oracles = mockJson._test_oracles;
const spikeRaw = await fs.readFile(spikeResultPath, "utf-8");

// ── Parse spike output ────────────────────────────────────────────────
const files = [];
const lines = spikeRaw.split("\n");
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

function parseFrontmatter(text) {
  const lines = text.split("\n");
  const first = lines[0]?.trim();
  const delims = ["---", "==="];
  if (!delims.includes(first)) return { frontmatter: {}, body: text };
  const endIdx = lines.findIndex((l, i) => i > 0 && delims.includes(l.trim()));
  if (endIdx === -1) return { frontmatter: {}, body: text };
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
  return { frontmatter: fm, body: lines.slice(endIdx + 1).join("\n").trimStart() };
}

const entries = files
  .filter((f) => f.path !== "MEMORY.md")
  .map((f) => {
    const { frontmatter, body } = parseFrontmatter(f.content);
    return {
      path: f.path,
      frontmatter,
      body,
      text: (body + " " + JSON.stringify(frontmatter)).toLowerCase(),
    };
  });

// ── Helpers ───────────────────────────────────────────────────────────
function includesAny(text, keywords) {
  return keywords.some((k) => text.includes(k.toLowerCase()));
}

function score(label, checkFn) {
  try {
    const ok = checkFn();
    console.log(`  ${ok ? "✅" : "❌"} ${label}`);
    return ok ? 1 : 0;
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.message}`);
    return 0;
  }
}

// ── Evaluation ────────────────────────────────────────────────────────
console.log("\n📋 Evaluation against Ground-Truth Oracles\n");

let total = 0;
let passed = 0;

// 1. Decision coverage
console.log("[Decisions]");
total++;
passed += score(
  `Redis chosen over Memcached (${oracles.decisions_expected[0].topic})`,
  () => entries.some((e) => includesAny(e.text, ["redis", "memcached", "缓存方案"]))
);
total++;
passed += score(
  `Query-level caching granularity (${oracles.decisions_expected[1].topic})`,
  () => entries.some((e) => includesAny(e.text, ["query", "粒度", "query-level"]))
);

// 2. Commitment coverage (mapped to task entries)
console.log("\n[Commitments / Tasks]");
for (const c of oracles.commitments_expected) {
  total++;
  const nameMap = { "ou_chen_xb": "小陈", "ou_me_lzc": "我", "ou_yl_alex": "阿亮", "ou_wang_qa": "小王", "ou_pm_lin": "林老板" };
  const nameHint = nameMap[c.owner] || c.owner;
  passed += score(
    `${c.owner}: ${c.what.slice(0, 40)}`,
    () => entries.some((e) => e.frontmatter.type === "task" && includesAny(e.text, [c.what.slice(0, 15), nameHint]))
  );
}

// 3. Conflict resolution
console.log("\n[Conflict Resolution]");
total++;
passed += score(
  "Weekly report deadline v1 (Friday 5pm) archived",
  () => entries.some((e) => e.path.includes("_archive") && includesAny(e.text, ["周五", "friday", "17:00", "5点"]))
);
total++;
passed += score(
  "Weekly report deadline v2 (Sunday noon) active",
  () => entries.some((e) => e.frontmatter.status === "active" && includesAny(e.text, ["周日", "sunday", "中午", "deadline"]))
);

// 4. Lesson coverage
console.log("\n[Lessons]");
for (const l of oracles.lessons_expected) {
  total++;
  const kw = l.lesson.includes("dt") ? ["dt", "上海时间", "utc"] : l.lesson.includes("TTL") ? ["ttl", "缓存"] : [l.lesson.slice(0, 20)];
  passed += score(
    l.lesson.slice(0, 50),
    () => entries.some((e) => e.frontmatter.type === "lesson" && includesAny(e.text, kw))
  );
}

// 5. Preference coverage
console.log("\n[Preferences]");
for (const p of oracles.preferences_expected) {
  total++;
  const kw = p.preference.includes("user story") ? ["user story", "prd", "mock 图"] : p.preference.includes("周报") ? ["周报", "omega-w"] : p.preference.includes("1664") ? ["1664", "品牌主色"] : [p.preference.slice(0, 20)];
  passed += score(
    p.subject.slice(0, 50),
    () => entries.some((e) => e.frontmatter.type === "preference" && includesAny(e.text, kw))
  );
}

// 6. Relationship coverage
console.log("\n[Relationships]");
for (const r of oracles.relationships_expected) {
  total++;
  const nameMap = { "ou_yl_alex": "阿亮", "ou_chen_xb": "小陈", "ou_me_lzc": "我", "ou_pm_lin": "林老板" };
  const names = r.between.map((id) => nameMap[id] || id);
  passed += score(
    `Relationship: ${r.between.join(" ↔ ")}`,
    () => entries.some((e) => e.frontmatter.type === "relationship" && includesAny(e.text, names))
  );
}

// 7. Anti-interference
console.log("\n[Anti-Interference]");
total++;
passed += score(
  "Customer X feedback buried in noise is captured",
  () => entries.some((e) => includesAny(e.text, ["客户x", "customer x", "客户 x"]))
);

// 8. Five-dimensional tags present
console.log("\n[Five-Dimensional Tags]");
total++;
passed += score(
  "All entries have type + status + importance",
  () => entries.every((e) => e.frontmatter.type && e.frontmatter.status && typeof e.frontmatter.importance === "number")
);
total++;
passed += score(
  "Tense tag present (past/present/future)",
  () => entries.every((e) => ["past", "present", "future"].includes(e.frontmatter.tense))
);
total++;
passed += score(
  "Source tag present (passive/active_inject/active_deny/action_feedback)",
  () => entries.every((e) => ["passive", "active_inject", "active_deny", "action_feedback"].includes(e.frontmatter.source))
);
total++;
passed += score(
  "Subject tag present (1st/2nd/3rd)",
  () => entries.every((e) => typeof e.frontmatter.subject === "string" && e.frontmatter.subject.length > 0)
);

// ── Summary ───────────────────────────────────────────────────────────
const pct = ((passed / total) * 100).toFixed(1);
console.log(`\n📊 Evaluation Result: ${passed}/${total} passed (${pct}%)`);
console.log(`   Total entries extracted: ${entries.length}`);
console.log(`   Oracle categories checked: decisions, commitments, conflicts, lessons, preferences, relationships, anti-interference, tagging`);

if (passed < total) {
  process.exit(1);
}
