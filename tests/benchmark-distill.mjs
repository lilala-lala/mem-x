import { spawn } from "node:child_process";
import fs from "node:fs/promises";

// Mock OpenClaw SDK modules
await fs.mkdir("/tmp/mock-openclaw-sdk/openclaw/plugin-sdk", { recursive: true });
await fs.writeFile(
  "/tmp/mock-openclaw-sdk/openclaw/package.json",
  JSON.stringify({ name: "openclaw", exports: {
    "./plugin-sdk/plugin-entry": "./plugin-sdk/plugin-entry.js",
    "./plugin-sdk/agent-runtime": "./plugin-sdk/agent-runtime.js"
  }}),
  "utf-8"
);
await fs.writeFile(
  "/tmp/mock-openclaw-sdk/openclaw/plugin-sdk/plugin-entry.js",
  `export { definePluginEntry } from "/Users/lizhichun/code/openclaw/dist/plugin-sdk/plugin-entry.js";`,
  "utf-8"
);
await fs.writeFile(
  "/tmp/mock-openclaw-sdk/openclaw/plugin-sdk/agent-runtime.js",
  `export { resolveDefaultAgentId } from "/Users/lizhichun/code/openclaw/dist/plugin-sdk/agent-runtime.js";`,
  "utf-8"
);

const testScript = `
import plugin from "/Users/lizhichun/code/feishu-contest/mem-x/src/index.ts";

(async () => {
  const registeredCommands = [];
  const mockApi = {
    pluginConfig: {
      enabled: true,
      llmApiKey: process.env.LLM_API_KEY || "",
      llmBaseUrl: process.env.LLM_BASE_URL || "",
      llmModel: process.env.LLM_MODEL || "",
      memoryDir: "memory/feishu",
      maxMessagesPerDistill: 200,
      lookbackDays: 7,
    },
    config: {
      agents: {
        defaults: {
          workspace: "/Users/lizhichun/.openclaw/workspace",
        },
      },
    },
    runtime: {
      agent: {
        resolveAgentWorkspaceDir: (cfg, agentId) => "/Users/lizhichun/.openclaw/workspace",
      },
    },
    registerCommand: (cmd) => {
      registeredCommands.push(cmd);
    },
    on: () => {},
  };

  plugin.register(mockApi);

  const distillCmd = registeredCommands.find(c => c.name === "feishu-distill");
  if (!distillCmd) {
    console.error("feishu-distill command not found");
    process.exit(1);
  }

  console.log("Starting benchmark...");
  const start = Date.now();
  const result = await distillCmd.handler({ args: "" });
  const elapsed = Date.now() - start;

  console.log("\\n=== RESULT ===");
  console.log(result.text);
  console.log("\\n=== TIME ===");
  console.log("Elapsed: " + elapsed + "ms (" + (elapsed / 1000).toFixed(1) + "s)");
})();
`;

await fs.writeFile("/tmp/benchmark-run.ts", testScript, "utf-8");

const child = spawn("npx", ["tsx", "/tmp/benchmark-run.ts"], {
  env: {
    ...process.env,
    NODE_PATH: "/tmp/mock-openclaw-sdk",
    LLM_BASE_URL: "https://ark.cn-beijing.volces.com/api/compatible",
    LLM_API_KEY: "ark-68e0d61c-2646-4a0e-8ac1-7ea35da99d21-a6c8f",
    LLM_MODEL: "ep-20260423222610-xbx2l",
  },
  stdio: "inherit",
  cwd: "/Users/lizhichun/code/feishu-contest/mem-x",
});
