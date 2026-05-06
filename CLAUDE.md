# CLAUDE.md

本文件为 Claude Code（claude.ai/code）提供当前代码库的操作指引。

## 项目概述

Mem-X 是一个 OpenClaw 插件，用于将飞书（Lark）群聊历史提炼为结构化的第一人称企业上下文记忆。它从群聊中提取任务、决策、偏好、关系和教训五类记忆，并通过 `before_prompt_build` 钩子将最重要的 20 条活跃记忆注入 OpenClaw 的系统提示词中。

## 构建与开发命令

```bash
# TypeScript 类型检查（需要 openclaw  monorepo 上下文）
# 本插件依赖 openclaw 作为 peer dependency；独立运行 tsc 无法解析 openclaw/* 类型。
# 当插件通过软链接放入 openclaw/extensions/ 后：
../../node_modules/.bin/tsc --noEmit

# 本地安装 npm 依赖（仅安装 typescript；不足以执行 npm run build）
npm install

# 测试（所有测试均为独立的 .mjs 文件，直接用 node 运行）
node tests/run-tests.mjs              # 单元测试 9 项（parseDistillOutput、frontmatter、lookback）
node tests/eval-oracles.mjs           # Oracle 评估 20 项，基于 mock 数据
node tests/demo-offline.mjs           # 纯离线演示，无需任何外部依赖
node tests/test-feedback.mjs          # 反馈闭环机制 8 项
node tests/test-self-validation.mjs   # LLM 输出自校验 6 项
node tests/test-hook-injection.mjs    # Hook 上下文注入逻辑 6 项
node tests/test-prompt-structure.mjs  # Prompt v2 结构验证 15 项
node tests/compare-prompts.mjs        # v1 vs v2 A/B 对比报告

# 端到端测试（需要 LLM_API_KEY）
LLM_API_KEY=sk-... node tests/e2e-mock-distill.mjs
LLM_API_KEY=sk-... node tests/e2e-distill.mjs      # 需要 lark-cli

# lark-cli 集成测试（需要 lark-cli 已安装并登录）
node tests/test-real-lark.mjs
```

**注意：** `package.json` 中没有 `npm test` 脚本。所有测试都直接用 `node` 执行。

## OpenClaw 集成

OpenClaw 安装位置：`/Users/lizhichun/code/openclaw`。要在 OpenClaw 中使用本插件：

1. 将项目通过软链接或复制放入 `openclaw/extensions/`：
   ```bash
   ln -s /Users/lizhichun/code/feishu-contest/mem-x /Users/lizhichun/code/openclaw/extensions/mem-x
   ```
2. 在 OpenClaw 配置中启用插件并填写 `llmApiKey`。
3. OpenClaw 直接从 `src/index.ts` 加载插件（由 `package.json` 中 `openclaw.extensions` 指定），而非编译后的 `dist/` 目录。

## 架构

### 插件入口（`src/index.ts`）

通过 OpenClaw 的 `definePluginEntry` API 注册三个命令和一个钩子：

- `/feishu-distill [filter]` — 通过 `lark-cli` 列出飞书群聊，拉取消息（受 `lookbackDays` 限制），构建提炼提示词，调用 LLM，解析多文件输出，规范化、校验后写入记忆文件。
- `/feishu-status` — 读取记忆目录，输出活跃/已取代/已归档条目的统计摘要。
- `/feishu-feedback <id> <action> [note]` — 调整记忆元数据。动作：`correct`（置信度 +0.05）、`outdated`（状态变为 superseded）、`noise`（状态变为 archived，重要性置 0）、`important`（重要性 +0.1）。
- `before_prompt_build` 钩子 — 加载最多 20 条按重要性排序的活跃记忆，追加到系统提示词中。

### 核心模块

- `src/lark.ts` — 封装 `lark-cli`（子进程调用）以列出群聊和拉取消息。包含指数退避重试（3 次，最大延迟 8 秒）和 lookback-day 过滤。
- `src/llm.ts` — 调用 Anthropic 兼容 API（默认 DeepSeek）。包含指数退避重试和 60 秒超时。`buildDistillationPrompt` 将模板中的 `{{INPUT_JSON}}` 替换为实际消息 JSON。
- `src/memory.ts` — 读写带 YAML frontmatter 的 Markdown 文件。维护 `INDEX.md` 索引。Frontmatter 值自动类型化（数字、布尔、JSON 数组、字符串）。

### 提示词加载策略

`index.ts` 中的 `loadDistillPrompt` 尝试多条路径，以同时支持开发环境和插件安装后的布局：
1. `src/prompts/distill_v2.skill.md`（插件目录，OpenClaw 运行时加载）
2. `src/prompts/distill_v1.skill.md`
3. `../../prompts/distill_v2.skill.md`（monorepo 降级路径）
4. `../../prompts/distill_v1.skill.md`
5. 最小内置提示词（最后兜底）

v2 提示词是当前的实际业务逻辑，采用 9 层架构，定义 5 种记忆类型、文件路径规则和必填 frontmatter  schema。

### LLM 输出处理流水线

1. **解析** — 按 `===FILE: <path> ===` 分隔符拆分 LLM 输出。
2. **规范化** — 修复 `subject: 2nd:ou_xxx` → `subject: 2nd`；为缺失的 `reasoning` 字段注入默认值。
3. **校验** — 检查必填字段（`id`、`type`、`status`、`importance`、`confidence`）、类型合法性（`VALID_TYPES`）、证据 `msg_id` 是否存在于源消息中、时间线一致性（`created_at` 不早于最早证据时间）。
4. **写入** — 有效文件写入磁盘；无效文件记录日志后跳过。

### 记忆 Schema

Frontmatter 字段（详见 `src/memory.ts` 和 `prompts/distill_v2.skill.md`）：
- `id`、`type`（task|decision|preference|relationship|lesson）、`status`（active|superseded|archived|completed）
- `tense`、`source`、`subject`（1st|2nd|3rd）、`structure`、`abstraction`、`visibility`
- `confidence`（0.0–1.0）、`importance`（0.0–1.0）
- `created_at`（ISO8601）、`supersedes`（mem_id 数组）、`reasoning`（字符串）
- `evidence`（`{source, chat_id, msg_id, timestamp, quote, speaker}` 数组）

按类型划分的文件路径约定：
- `tasks/active/t_<slug>.md` 或 `tasks/completed/t_<slug>.md`
- `projects/<project>/decisions/d_<slug>.md`
- `preferences/<scope>/<slug>.md` 或 `preferences/per_collaborator/<open_id>.md`
- `people/<open_id>/<slug>.md`
- `lessons/l_<slug>.md`

### 配置

插件配置定义在 `openclaw.plugin.json` 中。运行时从 `api.pluginConfig` 读取：
- `llmApiKey`、`llmBaseUrl`、`llmModel` — LLM 凭据与端点
- `memoryDir` — Agent 工作区下的子目录（默认：`memory/feishu`）
- `maxMessagesPerDistill`（10–1000，默认 200）、`lookbackDays`（1–30，默认 7）
- `larkCliPath` — `lark-cli` 二进制路径（默认：`lark-cli`）

### 关键约定

- 纯 ESM（`"type": "module"`）。编译目标 ES2022，模块解析 NodeNext。
- 除可选的 `openclaw` peer dependency 外，无运行时依赖。
- `lark-cli` 必须单独安装并认证；插件通过子进程调用它。
- 记忆目录解析相对于 OpenClaw Agent 工作区（`MEMORY.md` 所在目录），而非插件安装目录。
