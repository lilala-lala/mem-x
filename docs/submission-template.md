# 复赛作品提交材料

> **赛道**: 飞书 OpenClaw — 企业级长程协作 Memory 系统
> **课题方向**: 个人 AI 助手的企业上下文增强（非团队共享 agent）
> **核心承诺**: Day-1 Productive + Day-N Trustworthy

---

## 一、项目结果展示（总览）

### 1. Demo 展示（可录屏）

#### 演示 1：OpenClaw 插件实时运行（推荐录屏，约 3 分钟）

```
/feishu-distill
```

**预期输出**：

```
🔄 Feishu Distillation Started
Memory dir: /Users/.../memory/feishu
Found 4 chats.
📁 飞书 AI 校园挑战赛（初赛）-官方沟通群 (oc_987536bf63fe49a7ef1f2637915ab3ca)
  Messages fetched: 49
  LLM output length: 2828 chars
  Memory files written: 4
📁 飞书 OpenClaw 赛道-企业级长程协作 Memory 系统-张飞、倪晓睿 (oc_0c81cf216a6263a57bd664f930af17cb)
  Messages fetched: 10
  LLM output length: 1497 chars
  Memory files written: 3
✅ Done. Total messages: 59, files: 5
Index: /Users/.../memory/feishu/INDEX.md
```

**录屏要点**：
1. 首次运行 `/feishu-distill`，展示 60 秒内完成冷启动
2. 运行 `/feishu-status` 查看按 importance 排序的记忆索引
3. 向 OpenClaw 提问 "复赛截止时间是什么时候？"，验证 `before_prompt_build` hook 自动注入上下文
4. 运行 `/feishu-feedback <id> outdated` 展示反馈闭环

#### 演示 2：纯离线一键演示（无需 API、无需 lark-cli）

```bash
cd tests
node demo-offline.mjs
```

自动加载预生成的 15 条结构化记忆，完整展示：
- `/feishu-status` 状态概览
- `before_prompt_build` hook 上下文注入
- `/feishu-feedback` 反馈闭环
- 记忆文件格式与五维标签

**输出示例**：

```
🎬 Feishu Context Memory — Offline Demo
📥 Loaded 13 pre-generated memory files from spike result.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▶️  /feishu-status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Feishu Context Memory Status

Total entries: 13
  Active: 12
  Superseded: 1
  Archived: 0
  Completed: 0

Top 5 active memories:
  • [decision] 缓存方案选用 Redis（否决 Memcached） (imp:0.9)
  • [task] 阿亮认领索引优化，下周二前完成 (imp:0.9)
  • [preference] PM 喜欢 PRD 以 user story 开头，mock 图居中 (imp:0.8)
...
```

---

### 2. 核心部分代码展示

#### 2.1 插件入口：`src/index.ts`

核心职责：注册 3 个命令 + 1 个 hook，实现完整的"拉取-蒸馏-校验-写入-召回"闭环。

```typescript
// 命令 1：/feishu-distill —— 拉取飞书消息并萃取记忆
api.registerCommand({
  name: "feishu-distill",
  description: "Run one-shot distillation from Feishu chats into memory files.",
  acceptsArgs: true,
  handler: async (ctx) => {
    // 1. List chats via lark-cli
    // 2. Fetch messages (with lookbackDays filter)
    // 3. Load v2 prompt (falls back to v1, then built-in)
    // 4. Build prompt with {{INPUT_JSON}} replacement
    // 5. Call LLM with exponential-backoff retry
    // 6. Parse ===FILE: delimiters, normalize, validate, write
    // 7. Update INDEX.md
  },
});

// 命令 2：/feishu-status —— 查看记忆状态
api.registerCommand({
  name: "feishu-status",
  // 按 importance 排序输出 active/superseded/archived 统计
});

// 命令 3：/feishu-feedback —— 反馈闭环
api.registerCommand({
  name: "feishu-feedback",
  // correct / outdated / noise / important 四种动作
});

// Hook：before_prompt_build —— 自动注入 top-20 记忆到系统提示
api.on("before_prompt_build", async () => {
  const active = entries
    .filter((e) => e.frontmatter.status === "active")
    .sort((a, b) => Number(b.frontmatter.importance) - Number(a.frontmatter.importance))
    .slice(0, 20);
  return { appendSystemContext: contextLines.join("\n") };
});
```

#### 2.2 LLM 输出自校验：`src/index.ts` 中的 `validateMemoryFile`

四重校验机制，防止错误记忆入库：

```typescript
const VALID_TYPES = new Set(["task", "decision", "preference", "relationship", "lesson"]);

function validateMemoryFile(file, messageIds) {
  const errors = [];
  const { frontmatter } = parseFrontmatter(file.content);

  // 1. 必填字段检查
  const required = ["id", "type", "status", "importance", "confidence"];
  for (const key of required) {
    if (frontmatter[key] == null) errors.push(`missing: ${key}`);
  }

  // 2. 类型合法性
  if (type && !VALID_TYPES.has(type)) errors.push(`invalid type: ${type}`);

  // 3. 证据溯源：msg_id 必须存在于源消息中
  for (const ev of evidence) {
    if (ev.msg_id && !messageIds.has(ev.msg_id))
      errors.push(`msg_id not found: ${ev.msg_id}`);
  }

  // 4. 时间线一致性：created_at 不得早于最早证据时间
  if (createdAt < earliestEvidence)
    errors.push(`timeline error: ${createdAt} < ${earliestEvidence}`);

  return { valid: errors.length === 0, errors };
}
```

#### 2.3 Prompt 加载策略：`src/index.ts` 中的 `loadDistillPrompt`

支持开发、编译后、bundled build、monorepo 四种布局：

```typescript
async function loadDistillPrompt(): Promise<string> {
  const searchDirs = [
    path.join(pluginDir, "prompts"),       // src/prompts or dist/prompts
    path.join(pluginDir, "..", "prompts"), // project-root
    path.join(pluginDir, "..", "..", "prompts"), // monorepo
    path.join(pluginDir, "..", "..", "..", "extensions", pluginName, "prompts"), // bundled
  ];
  // Tries v2 first, falls back to v1, then built-in minimal prompt.
}
```

#### 2.4 记忆文件格式（Markdown + YAML Frontmatter）

```markdown
---
id: mem_d_redis_chosen
type: decision
tense: past
source: passive
subject: 3rd
structure: event
abstraction: fact
status: active
confidence: 0.95
importance: 0.9
created_at: 2026-04-22T09:50:00+08:00
visibility: team
reasoning: "PM明确拍板使用Redis并给出理由，属于团队层面的技术决策，confidence高。"
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_013
    timestamp: 2026-04-22T09:50:00+08:00
    quote: "缓存方案就用 Redis 了。"
    speaker: ou_pm_lin
---

# 缓存方案选用 Redis（否决 Memcached）

林老板最终拍板：缓存层使用 Redis...
```

---

### 3. 项目亮点介绍

#### 亮点 1：第一人称记忆（`subject: 1st/2nd/3rd`）

市面上大多数方案做"企业知识库"，我们做的是"个人助手的上下文"。OpenClaw 以第一人称理解企业关系：

- `subject: 1st` —— "我承诺周四前给 PRD"
- `subject: 2nd` —— "林老板指派给小陈的任务"
- `subject: 3rd` —— "团队层面选用了 Redis"

这让 OpenClaw 的回答不再是客观摘要，而是带主体视角的可执行上下文。

#### 亮点 2：Prompt-as-Business-Logic v2

所有业务逻辑封装在 skill prompt 中，零规则引擎：

- **v2 采用 9 层架构**：角色定义 → 记忆类型学 → 输出规范 → 决策框架 → 噪声分类 → 边界案例 → 多场景示例 → 质量自检 → 输入处理
- **4 个跨行业 few-shot**：技术/销售/HR/市场，带推理痕迹（reasoning trace）
- **v1 v2 并存**：代码自动优先加载 v2，便于 A/B 对比与迭代

#### 亮点 3：五维标签体系

每个记忆条目同时被打上五个维度的标签，解决企业协作中"这条信息现在是否有效"的分类难题：

| 维度 | 取值 | 解决的问题 |
|---|---|---|
| **时态 Tense** | past / present / future | "什么时候为真" |
| **信号来源 Source** | passive / active_inject / active_deny / action_feedback | "怎么知道的" |
| **主体 Subject** | 1st / 2nd / 3rd | "谁的事" |
| **时间结构 Structure** | event / state / cycle / dependency | "该怎么用" |
| **抽象层级 Abstraction** | fact / pattern / concept | "多通用" |

#### 亮点 4：无额外授权，复用用户已登录的 `lark-cli`

直接调用用户本地已认证的 `lark-cli` 读取飞书数据，无需：
- 申请飞书开放平台权限
- 配置 webhook / bot
- 处理企业级 OAuth 流程

`lark-cli` 失效时优雅降级：使用已缓存的 L0 记忆继续服务，标记"飞书同步暂停"。

#### 亮点 5：三层存储架构（与 OpenClaw 原生 memory 同构）

- **L0 Active**：纯 markdown + frontmatter（< 2000 条，LLM 直接读取）
- **L1 Archive**：SQLite + markdown（容量扩展，当前版本为设计预留）
- **L2 Evidence**：source_id 指针（可追溯源消息）

存储形态 = 产品哲学：每条记忆都是一个可读的 markdown 文件，`cat` 一下就能理解。

#### 亮点 6：完整的反馈闭环 —— Day-N Trustworthy

用户发现记忆有误，可直接反馈，系统自动调整：

| 动作 | 效果 |
|---|---|
| `correct` | confidence +0.05 |
| `outdated` | status → superseded |
| `noise` | status → archived, importance = 0 |
| `important` | importance +0.1 |

`feedback_log` 形成审计链，让 AI 的错误可追溯、可纠正。

---

### 4. AI 亮点介绍

#### 4.1 高阶 AI 技巧

**① 结构化生成（Structured Generation via Prompt）**

不依赖 JSON Schema / function calling，而是通过精细的 prompt 设计让 LLM 输出带严格分隔符的多文件结构：

```
===FILE: tasks/active/t_customer_x.md ===
---
frontmatter...
---
# Title
Body
===FILE: decisions/d_redis.md ===
...
```

这种设计的优势：兼容任何 Anthropic-compatible API（DeepSeek、Kimi 等），无需 provider 特定的 schema 支持。

**② 推理痕迹注入（Reasoning Trace）**

v2 prompt 强制要求每条记忆包含 `reasoning` 字段，记录"为什么这样分类"。这不仅提升输出质量，也为后续人工 audit 提供可解释性。

**③ 噪声分类学（Noise Taxonomy）**

prompt 中明确定义三种处理策略：
- **一律丢弃**：午餐讨论、表情、通用招呼
- **通常丢弃**："收到"、"好的"（除非包含隐含承诺）
- **上下文依赖**：技术吐槽可能含教训，需结合前后文判断

这让 LLM 在萃取阶段就具备" editors 的品味"，而非盲目提取。

**④ 冲突检查与版本链**

prompt 中内置"冲突检查"步骤：如果新记忆与已有记忆矛盾（如 deadline 从周五改为周日），要求 LLM 输出 `supersedes` 指针，旧记忆标记为 `superseded`。这是实现"矛盾更新测试"通过的核心机制。

#### 4.2 人与 AI 的分工

| 环节 | 人做什么 | AI 做什么 |
|---|---|---|
| **数据接入** | 安装并登录 `lark-cli`（一次性） | 自动拉取群聊列表和消息 |
| **记忆萃取** | 配置 `llmApiKey` 和参数 | 阅读数百条消息，输出结构化记忆 |
| **质量审阅** | 浏览 `INDEX.md`，快速扫读 | 按 importance 自动排序 |
| **错误纠正** | 运行 `/feishu-feedback` | 自动调整 confidence / status |
| **日常使用** | 向 OpenClaw 提问 | 通过 hook 自动注入相关上下文 |

**关键洞察**：人不负责"整理信息"，只负责"判断对错"；AI 负责"从噪声中找信号"和"在正确时机推送"。

#### 4.3 核心模型选型思路

- **默认模型**：DeepSeek V4 Pro（通过 Anthropic-compatible API 调用）
- **选型理由**：
  1. 长上下文（支持 1M tokens），可一次性吞入 200 条飞书消息
  2. 中文理解能力强，对国内企业协作语境敏感
  3. 价格可控，适合比赛期间的反复调试
  4. Anthropic API 格式标准化，可无缝切换至 Kimi / Claude
- **Temperature = 0.3**：在创造性和确定性之间取平衡，降低幻觉同时保留对模糊语境的合理推断

#### 4.4 引入 AI 后的工作流改变

| 场景 | 传统方式 | 使用 Mem-X 后 |
|---|---|---|
| 新成员了解项目背景 | 翻 500+ 条历史消息 + 问老员工 | `/feishu-distill` + 提问，60 秒 |
| 确认 deadline 是否变更 | 人工翻聊天记录，凭记忆核对 | 直接问 OpenClaw，带版本链和 evidence |
| 周报准备 | 回忆本周进展，手动整理 | OpenClaw 主动提醒待办项和约束条件 |
| 信息沉没后的补救 | 想不起来，再问一遍同事 | 结构化记忆持久保留，零遗漏 |

**量化效率提升**（基于 mock 数据集 48 条消息）：
- 信息消化时间：12 分钟 → 30 秒（**提升 96%**）
- 上下文检索：5 分钟 + 10 步操作 → < 5 秒 + 1 步（**提升 99%**）

---

### 5. 其他任何信息补充

#### 5.1 完整的测试矩阵

| 测试项 | 文件 | 结果 |
|---|---|---|
| 插件 TypeScript 类型检查 | `tsc --noEmit` | 通过 |
| 单元测试（解析/格式化/过滤） | `tests/run-tests.mjs` | **9/9 通过** |
| Oracle 评估（mock 数据 ground-truth） | `tests/eval-oracles.mjs` | **20/20 通过 (100%)** |
| Hook 注入逻辑验证 | `tests/test-hook-injection.mjs` | **6/6 通过** |
| 反馈闭环机制验证 | `tests/test-feedback.mjs` | **8/8 通过** |
| LLM 输出自校验验证 | `tests/test-self-validation.mjs` | **6/6 通过** |
| Prompt v2 结构验证 | `tests/test-prompt-structure.mjs` | **15/15 通过** |
| v1 vs v2 A/B 对比 | `tests/compare-prompts.mjs` | v2 覆盖 6/6 关键特性，v1 为 0/6 |
| 真实 lark-cli 数据获取 | `tests/test-real-lark.mjs` | 4 个群，59 条消息成功获取 |
| Mock 数据 LLM 蒸馏 | `tests/e2e-mock-distill.mjs` | 13 个文件，5 类型全覆盖 |
| 纯离线演示 | `tests/demo-offline.mjs` | 一键运行，无需任何外部依赖 |

#### 5.2 与评分维度的对齐

| 评分维度 | 本项目体现 |
|---|---|
| **完整性与价值 (50%)** | lark-cli → LLM 蒸馏 → markdown 存储 → hook 注入 → 问答验证，完整闭环；Demo 稳定（有离线 fallback）；效率提升 96% |
| **创新性 (25%)** | 第一人称记忆、五维标签、Prompt-as-Business-Logic、证据链、反馈闭环；方案可复用至任何 Anthropic-compatible 生态 |
| **技术实现性 (25%)** | TypeScript ESM、OpenClaw 原生插件、指数退避重试、四重自校验、monorepo 集成；核心代码极简，复杂度在 prompt 设计 |

#### 5.3 已知限制与诚实声明

以下白皮书设计中描述的能力，当前代码已实现 vs 待实现：

| 能力 | 状态 | 说明 |
|---|---|---|
| `/feishu-distill` 命令 | 已实现 | 核心闭环 |
| `/feishu-status` 命令 | 已实现 | 记忆状态概览 |
| `/feishu-feedback` 命令 | 已实现 | 四种反馈动作 |
| `before_prompt_build` hook | 已实现 | top-20 记忆注入 |
| `session_start` hook | 设计预留 | 白皮书描述，待实现 |
| `before_compaction` hook | 设计预留 | 白皮书描述，待实现 |
| 自动遗忘/衰减机制 | 部分实现 | 用户可手动标记 outdated；自动衰减需 cron 触发器 |
| SQLite Archive (L1) | 设计预留 | 当前仅 L0 markdown，L1 为容量扩展预留 |
| `memory_search` / `memory_get` tools | 设计预留 | 当前通过 hook 被动注入，主动检索工具待注册 |
| 飞书 Bot 交互 | 未实现 | 超出 MVP 范围 |
| 云文档/会议纪要/日历接入 | 未实现 | 当前仅群聊，其他数据源为扩展方向 |

**我们的态度**：不隐瞒差距。已交付的是一个"可运行、可测试、可演示"的完整 MVP，而非 PPT 架构。所有"设计预留"项都有清晰的代码插入点和数据 schema 支持。

---

## 二、小组成员各自负责部分信息

### 成员 1：黎兆兰 — 项目组长、产品架构师与核心开发

**负责部分**：
- **整体产品定位与架构设计**：提出 Day-1 Productive + Day-N Trustworthy 双时间维度理念，设计第一人称记忆模型与五维标签体系（tense/source/subject/structure/abstraction）
- **核心插件全栈实现**：
  - 插件入口与生命周期管理（`src/index.ts`）：3 个命令（`/feishu-distill`、`/feishu-status`、`/feishu-feedback`）+ `before_prompt_build` hook 的注册与调度
  - 数据接入层（`src/lark.ts`）：`lark-cli` 子进程封装、指数退避重试（3 次，最大延迟 8 秒）、lookbackDays 消息过滤
  - LLM 调用层（`src/llm.ts`）：Anthropic-compatible API 封装、60 秒超时控制、请求体重试机制
  - 存储引擎（`src/memory.ts`）：Markdown + YAML frontmatter 读写、INDEX 索引自动维护、目录遍历安全检查
- **LLM 输出处理流水线设计与实现**：`parseDistillOutput`（`===FILE:` 分隔符解析）、`normalizeMemoryOutput`（subject 格式修复、reasoning 缺省值注入）、`validateMemoryFile`（四重自校验：必填字段、类型合法、证据溯源、时间线一致性）
- **Prompt 工程**：v1/v2 distillation prompt 完整设计，v2 采用 9 层架构 + 4 个跨行业 few-shot + 噪声分类学 + 冲突检查机制；代码层实现 v1/v2 自动降级加载策略
- **数据与评测体系构建**：
  - mock 数据集设计（`prompts/mock_data/week1_omega_chat.json`）：48 条消息覆盖 5 类记忆、矛盾更新、抗干扰场景
  - Oracle 评估集（`_test_oracles`）：20 项 ground-truth 检查点（决策/承诺/冲突/教训/偏好/关系/抗干扰/标签）
  - 8 组独立测试的设计与实现（`tests/*.mjs`）
  - 评测报告撰写（`tests/benchmark-report.md`）
- **产品文档**：白皮书（`docs/whitepaper-v0.md`）、DEMO 脚本（`docs/DEMO.md`）、提交材料整合

**核心代码**：
- `src/index.ts`（插件入口、命令与 hook 注册、LLM 输出处理流水线）
- `src/lark.ts`（lark-cli 封装与数据接入）
- `src/llm.ts`（LLM 调用层）
- `src/memory.ts`（存储引擎）
- `prompts/distill_v2.skill.md`（9 层架构 prompt）
- `tests/eval-oracles.mjs`（20 项 ground-truth 评估）
- `tests/benchmark-report.md`（矛盾更新/抗干扰/效能三项评测报告）

### 成员 2：李治淳 — 工程实现辅助

**负责部分**：
- 协助完成部分 TypeScript 工具函数的编码实现与类型标注
- 协助调试 ESM 模块兼容性与 `lark-cli` 返回数据格式适配
- 协助整理 `tests/demo-offline.mjs` 离线演示脚本与测试 fixtures
- 参与代码 review 与工程规范检查
- 协助文档校对、格式排版与代码注释补充

**核心代码**：
- `tests/run-tests.mjs` 部分辅助编写
- `tests/demo-offline.mjs` 离线演示脚本辅助整理

---

## 三、其他信息（可选）

### 3.1 快速开始（评委复现指南）

**方式 A：纯离线演示（无需任何配置）**

```bash
cd tests
node demo-offline.mjs
```

**方式 B：运行全部测试**

```bash
cd tests
node run-tests.mjs
node eval-oracles.mjs
node test-feedback.mjs
node test-self-validation.mjs
node test-prompt-structure.mjs
node test-hook-injection.mjs
node compare-prompts.mjs
```

**方式 C：OpenClaw 插件模式**

```bash
# 复制到 OpenClaw 源码树
cp -r mem-x /path/to/openclaw/extensions/
cd /path/to/openclaw && pnpm build

# 在 ~/.openclaw/openclaw.json 中启用插件并配置 llmApiKey
# 然后使用：/feishu-distill、/feishu-status、/feishu-feedback
```

### 3.2 项目仓库

- 代码：`extensions/mem-x/`（OpenClaw monorepo 内）
- 核心入口：`src/index.ts`
- 测试目录：`tests/`
- 文档目录：`docs/`

### 3.3 致谢

感谢 OpenClaw 团队提供的插件 SDK 和 `lark-cli` 工具链，让"个人 AI 助手的企业上下文增强"这一设想能够在 5 天内从白纸变成可运行的代码。
