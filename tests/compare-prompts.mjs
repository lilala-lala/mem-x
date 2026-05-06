/**
 * A/B structural comparison of v1 vs v2 prompts.
 * Produces metrics without requiring LLM API calls.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const v1Path = path.resolve(rootDir, "prompts/distill_v1.skill.md");
const v2Path = path.resolve(rootDir, "prompts/distill_v2.skill.md");

const v1 = await fs.readFile(v1Path, "utf-8");
const v2 = await fs.readFile(v2Path, "utf-8");

function analyze(text, name) {
  const lines = text.split("\n");
  const wordCount = text.length;
  const lineCount = lines.length;
  const fewShotCount = (text.match(/示例 \d+[：:]/g) ?? []).length;
  const ruleCount = (text.match(/^\d+\./gm) ?? []).length;
  const checklistCount = (text.match(/- \[ \]/g) ?? []).length;
  const layerCount = (text.match(/# Layer \d+:/g) ?? []).length;
  const hasReasoning = text.includes("reasoning");
  const hasNoiseTaxonomy = text.includes("噪声分类学") || text.includes("Noise Taxonomy");
  const hasDecisionFramework = text.includes("决策框架") || text.includes("Decision Framework");
  const hasEdgeCases = text.includes("边界案例") || text.includes("Edge Case");
  const hasQualityChecklist = text.includes("自检清单") || text.includes("Quality Checklist");
  const hasImportanceAnchors = text.includes("0.9+") && text.includes("0.4-0.7");

  return {
    name,
    wordCount,
    lineCount,
    fewShotCount,
    ruleCount,
    checklistCount,
    layerCount,
    hasReasoning,
    hasNoiseTaxonomy,
    hasDecisionFramework,
    hasEdgeCases,
    hasQualityChecklist,
    hasImportanceAnchors,
  };
}

const a = analyze(v1, "v1");
const b = analyze(v2, "v2");

console.log("\n📊 Prompt A/B Structural Comparison\n");
console.log("| Metric | v1 | v2 | Δ |");
console.log("|---|---|---|---|");
console.log(`| Characters | ${a.wordCount.toLocaleString()} | ${b.wordCount.toLocaleString()} | +${((b.wordCount / a.wordCount - 1) * 100).toFixed(0)}% |`);
console.log(`| Lines | ${a.lineCount} | ${b.lineCount} | +${b.lineCount - a.lineCount} |`);
console.log(`| Few-shot examples | ${a.fewShotCount} | ${b.fewShotCount} | +${b.fewShotCount - a.fewShotCount} |`);
console.log(`| Numbered rules | ${a.ruleCount} | ${b.ruleCount} | +${b.ruleCount - a.ruleCount} |`);
console.log(`| Quality checklist items | ${a.checklistCount} | ${b.checklistCount} | +${b.checklistCount - a.checklistCount} |`);
console.log(`| Architecture layers | ${a.layerCount} | ${b.layerCount} | +${b.layerCount - a.layerCount} |`);
console.log(`| Reasoning trace | ${a.hasReasoning ? "✅" : "❌"} | ${b.hasReasoning ? "✅" : "❌"} | ${b.hasReasoning ? "新增" : "-"} |`);
console.log(`| Noise taxonomy | ${a.hasNoiseTaxonomy ? "✅" : "❌"} | ${b.hasNoiseTaxonomy ? "✅" : "❌"} | ${b.hasNoiseTaxonomy && !a.hasNoiseTaxonomy ? "新增" : "-"} |`);
console.log(`| Decision framework | ${a.hasDecisionFramework ? "✅" : "❌"} | ${b.hasDecisionFramework ? "✅" : "❌"} | ${b.hasDecisionFramework && !a.hasDecisionFramework ? "新增" : "-"} |`);
console.log(`| Edge case guide | ${a.hasEdgeCases ? "✅" : "❌"} | ${b.hasEdgeCases ? "✅" : "❌"} | ${b.hasEdgeCases && !a.hasEdgeCases ? "新增" : "-"} |`);
console.log(`| Quality checklist | ${a.hasQualityChecklist ? "✅" : "❌"} | ${b.hasQualityChecklist ? "✅" : "❌"} | ${b.hasQualityChecklist && !a.hasQualityChecklist ? "新增" : "-"} |`);
console.log(`| Cross-industry anchors | ${a.hasImportanceAnchors ? "✅" : "❌"} | ${b.hasImportanceAnchors ? "✅" : "❌"} | ${b.hasImportanceAnchors && !a.hasImportanceAnchors ? "新增" : "-"} |`);
console.log("");

// Coverage score
let v1Score = 0;
let v2Score = 0;
const features = [
  "hasReasoning",
  "hasNoiseTaxonomy",
  "hasDecisionFramework",
  "hasEdgeCases",
  "hasQualityChecklist",
  "hasImportanceAnchors",
];
for (const f of features) {
  if (a[f]) v1Score++;
  if (b[f]) v2Score++;
}
console.log(`🎯 Coverage score: v1=${v1Score}/${features.length}, v2=${v2Score}/${features.length}`);
console.log("");
