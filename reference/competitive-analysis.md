# 企业级长程协作 Memory 系统 —— 竞争分析与市场调研

> 调研日期：2026-04-28  
> 调研范围：GitHub 公开仓库、OpenClaw 生态插件、飞书生态项目  
> 调研目标：识别同类项目，分析差异化空间，为设计决策提供依据

---

## 一、市场全景：四类现有项目

### 第一类：通用 Agent 记忆基础设施（与具体平台无关）

| 项目 | Stars | 核心定位 | 与我们思路的异同 |
|------|-------|---------|----------------|
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | 54K | "AI Agent 的通用记忆层"，YC S24 项目。支持多级记忆（User/Session/Agent）、实体链接、混合检索（语义+BM25+实体匹配） | 异：完全平台无关，不聚焦企业协作或飞书；同：也强调 memory layer 概念，有 MCP server 实现 |
| [MemoriLabs/Memori](https://github.com/MemoriLabs/Memori) | 较少 | Agent-native memory infrastructure，把 agent 执行和对话转化为结构化持久状态 | 异：面向生产系统的底层基础设施；同：也区分 memory 和 context |
| [neo4j-labs/agent-memory](https://github.com/neo4j-labs/agent-memory) | 较少 | 图数据库原生记忆系统，Neo4j 官方出品 | 异：强绑定 Neo4j；同：知识图谱是记忆组织方式 |

### 第二类：OpenClaw 生态的记忆插件/Skill

| 项目 | Stars | 核心定位 | 关键特征 |
|------|-------|---------|---------|
| [adoresever/graph-memory](https://github.com/adoresever/graph-memory) | 468 | OpenClaw 知识图谱记忆插件 | 从对话提取结构化三元组，75% 上下文压缩，跨 session 记忆，社区感知召回， Personalized PageRank 排序 |
| [joshuaswarren/remnic](https://github.com/joshuaswarren/remnic) | 较少 | OpenClaw/Claude Code/Codex 通用本地记忆层 | 本地优先（markdown 文件），混合搜索（BM25+向量+重排序），三层召回（chunk/section/raw transcript），支持"记忆 consolidation" |
| [MemTensor/MemOS-Cloud-OpenClaw-Plugin](https://github.com/MemTensor/MemOS-Cloud-OpenClaw-Plugin) | 较少 | MemOS Cloud 官方 OpenClaw 插件 | 极简生命周期：run 前 recall，run 后 add；支持多 agent 数据隔离、记忆过滤 |
| [KongDS-alien/openclaw-shared-memory-manager](https://github.com/KongDS-alien/openclaw-shared-memory-manager) | 较少 | OpenClaw 团队隐私优先共享记忆治理 Skill | 群组/项目/调度器委托的安全共享记忆 |
| [JoshKneale/claude-skill-manager](https://github.com/JoshKneale/claude-skill-manager) | 较少 | 把 Claude Code session 变成机构记忆 | 偏 coding 场景 |

### 第三类：飞书生态的记忆/办公 Agent 项目

| 项目 | Stars | 核心定位 | 关键特征 |
|------|-------|---------|---------|
| [autumnseasonism/lark-meeting-memory](https://github.com/autumnseasonism/lark-meeting-memory) | 1 | 飞书会议资产化 CLI 工具 | `brief`（会前简报）、`digest`（会后入库）、`ask`（跨期追问）、`review`（守护闭环）。基于 lark-cli，纯 Python stdlib，一条命令起步 |
| [caobotao1234-star/office-agent](https://github.com/caobotao1234-star/office-agent) | 3 | 飞书集成办公助理 | 11 个内置工具（任务/记忆/提醒/飞书云文档/日历等），斜杠命令，飞书机器人 WebSocket 长连接，ADHD 友好设计 |
| [memohai/Memoh](https://github.com/memohai/Memoh) | 较少 | 自托管多平台 AI Agent 平台（含飞书） | 类似 OpenClaw 的定位，支持多 bot + 长记忆 + 多平台 |

### 第四类：群聊总结/记忆 Bot（Telegram/WhatsApp 为主）

| 项目 | 核心定位 |
|------|---------|
| [telegram-summary-bot](https://github.com/asukaminato0721/telegram-summary-bot)（多个） | 监听群聊消息，按需生成 AI 摘要。支持中文检索、图片、链接元信息 |
| [SignalGroupChatSummaryBot](https://github.com/didigoose/SignalGroupChatSummaryBot) | Signal 群聊 AI 每日总结 |

---

## 二、直接竞争对手深度分析

### `adjcjh777/lark_ai_challenge_openclaw_longterm_memory`

**这是最重磅的发现——这是一个与我们在同一比赛、同一赛道（飞书 AI 挑战赛 OpenClaw 企业级长程记忆方向）的项目，而且成熟度极高。**

#### 2.1 项目规模

- 创建时间：2026-04-23（比我们早 5 天）
- 仓库大小：1129 KB
- 目录结构：`memory_engine/`、`agent_adapters/openclaw/`、`benchmarks/`、`docs/`、`scripts/`、`tests/`
- 已完成 Phase A-E 产品化，有白皮书、Benchmark Report、Demo Runbook

#### 2.2 架构设计

他们构建的是一个**重代码、重治理**的系统：

```
飞书用户/OpenClaw Agent → OpenClaw tools → Feishu Memory Copilot Core
                                    │
                                    ├── Governance: candidate/active/superseded/rejected/stale
                                    ├── Evidence and Version Chain
                                    ├── Retrieval and Prefetch
                                    │       ├── Cognee local knowledge substrate
                                    │       └── Keyword index / curated vector / structured filters
                                    └── Bitable / Card review surface
```

**核心工具集**（已注册为 OpenClaw first-class tools）：
- `memory.search` — 混合检索（结构化过滤 → keyword → vector → Cognee → merge/rerank）
- `memory.create_candidate` — 生成待确认记忆
- `memory.confirm` / `memory.reject` — 确认/拒绝候选
- `memory.explain_versions` — 展示版本链
- `memory.prefetch` — 任务前预取上下文包
- `heartbeat.review_due` — 主动提醒候选

#### 2.3 记忆治理模型

他们有非常严格的**状态机**：

```
raw event → candidate → active → superseded
                ↓         ↓
             rejected   stale
```

关键设计：
- **Candidate Gate**：消息不直接变成记忆，先进入 candidate，需要确认
- **Evidence Gate**：每条记忆必须有原文 quote、source ID、来源类型
- **Version Chain**：冲突更新时不覆盖旧值，旧值进入 superseded，默认检索只用 active
- **Permission & Redaction**：敏感内容脱敏，心跳提醒只做 dry-run 不真发群

#### 2.4 Benchmark 自证（已完成）

| 指标 | 结果 | 样例数 |
|------|------|--------|
| Recall@3 | 1.0 | 10 |
| Conflict Update Accuracy | 1.0 | 12 |
| Candidate Precision | 1.0 | 34 |
| Evidence Coverage | 1.0 | 全部 |
| Agent Task Context Use Rate | 1.0 | 6 |
| Sensitive Reminder Leakage Rate | 0.0 | 7 |
| Stale Leakage Rate | 0.0 | 全部 |

#### 2.5 产品化成熟度

他们已经完成了：
- OpenClaw 原生工具注册（7 个 tools）
- OpenClaw Feishu WebSocket 本机 staging 证据
- 飞书测试群 live sandbox（受控）
- Cognee + Ollama 本地 embedding gate
- Storage migration + Audit table
- 6 份契约文档（Storage/Permission/OpenClaw Payload/Audit/Migration/Negative Permission Test）

---

## 三、其他同赛道竞争对手

除了上面这个最成熟的对手，GitHub 上还有多个同期项目：

| 项目 | 描述 |
|------|------|
| [wanqiumudong/Feishu-OpenClaw-Agent](https://github.com/wanqiumudong/Feishu-OpenClaw-Agent) | "An OpenClaw-based agent for enterprise knowledge integration, distribution, and long-term collaborative memory" |
| [lulumomo118/feishu_ai_openclaw_memory_system](https://github.com/lulumomo118/feishu_ai_openclaw_memory_system) | 同题项目，具体实现不详 |
| [River-Jiang-Dev/feishu-memory-system](https://github.com/River-Jiang-Dev/feishu-memory-system) | "openclaw飞书记忆系统" |
| [galeliu-git/openclaw-brain-memory-feishu](https://github.com/galeliu-git/openclaw-brain-memory-feishu) | 另一个同方向项目 |

这说明**这个赛道的竞争相当激烈**，已经有至少 4-5 个公开项目在做同一件事。

---

## 四、与现有项目的对比分析

### 4.1 我们的设计 vs. 主流路径

| 维度 | 主流路径（以 mem0 / graph-memory / 竞争对手为代表） | 我们的路径 |
|------|--------------------------------------------------|-----------|
| **实现方式** | 重代码：自定义存储层、状态机、检索引擎、治理逻辑 | 轻代码/规范驱动：主要写 Prompt 和配置，依赖 OpenClaw skill/MCP/tool 编排 |
| **记忆存储** | 专用数据库（SQLite/Neo4j/向量数据库）+ 自定义 Schema | 利用 Agent 上下文 + 文件/简单存储 + 语义索引 |
| **治理模型** | 硬编码状态机（candidate → active → superseded） | 软规范：Agent 按行为协议执行提取/存储/检索 |
| **多模态处理** | 多数项目**不处理**或仅做简单文本提取 | 我们的重点：链接/文件/图片的深度加工和上下文注入 |
| **上下文注入** | 隐性：检索结果直接塞进 prompt | 显性：作为独立系统层，Agent 自主判断"需要什么资料" |
| **与飞书集成** | 通过 API 拉取数据，存入自建系统 | 通过 MCP/Skill 实时访问，不建独立数据仓库 |
| **评测方式** | 固定 benchmark case + 指标计算 | 同样需要 benchmark，但 Agent 行为本身是可评测的 |

### 4.2 我们的独特机会点

在与这些项目的对比中，发现了**三个明确的差异化空间**：

#### 机会 1：从"建数据库"转向"定行为规范"

竞争对手（尤其是 adjcjh777）把大量工程投入放在了**存储和治理基础设施**上——SQLite Schema、审计表、状态机、权限门控。这是一个很扎实的工程路线，但代价是：
- 代码量巨大，需要大量时间开发和维护
- 灵活性受限，改一个规则需要改代码+重新部署
- 对 OpenClaw 原生能力的利用不足，更像一个独立系统"挂靠"在 OpenClaw 上

我们的**规范驱动**路线恰好是反过来的：
- 不写状态机，而是写"Agent 遇到冲突时应该怎么做"的行为规范
- 不写审计表，而是写"Agent 记录记忆时必须包含 evidence"的契约
- 利用 OpenClaw Agent 的推理能力作为"执行引擎"

**这个差异在评审视角下可能是一个优势**：它展示了"用 AI 治理 AI"的元能力，而不是传统的软件工程能力。

#### 机会 2：富媒体上下文注入（链接/文件/图片）

这是目前**所有项目中几乎无人深入解决**的问题：

| 项目 | 对聊天记录中链接的处理 | 对文件的处理 | 对图片的处理 |
|------|----------------------|------------|------------|
| 竞争对手 adjcjh777 | 提及文档 ingestion，但主要是文本层面 | Limited ingestion，candidate-only | 未提及 |
| graph-memory | 对话文本提取三元组 | 未提及 | 未提及 |
| remnic | 对话文本提取记忆 | 未提及 | 未提及 |
| lark-meeting-memory | 会前拉取文档（brief） | 未提及 | 未提及 |
| office-agent | 飞书云文档读取 | DocumentParser stub | 未提及 |
| telegram-summary-bot | 链接元信息 | 图片支持 | 图片支持（简单） |

**我们的切入点在这里是空白的**：没有一个项目系统性地解决"聊天记录中的文档链接、PDF 文件、设计截图如何被 Agent 理解并注入上下文"这个问题。

如果我们能把**上下文注入系统**做好——让 Agent 能在对话中自主判断"这个问题需要看之前发的那个 PRD"或"需要参考上周的设计截图"——这是一个非常有说服力的差异化能力。

#### 机会 3：记忆系统 vs. 上下文注入系统的"双层面"叙事

现有项目几乎都把"记忆"当作一个统一概念来处理。我们的**双层面架构**（传统记忆 + 上下文注入）是一个更清晰的概念框架：

- **记忆层**：记住"我们决定了什么"
- **注入层**：在需要时把"相关的原始资料"带入对话

这种区分在办公场景中特别有价值：
- 记忆层回答"结论是什么"
- 注入层回答"支撑结论的原始资料在哪里"

评审看到的是一个更完整的"信息流转"设计，而不是单纯的"存储-检索"循环。

---

## 五、竞争策略建议

基于以上分析，建议围绕以下**三个叙事**展开：

### 叙事 1："低代码规范驱动" vs. "重基础设施"

> "我们没有写 5000 行 Python 代码来构建一个记忆数据库，而是定义了一套 Agent 记忆行为规范，让 OpenClaw 的 Agent 本身成为记忆系统的执行引擎。"

这个叙事的优势：
- 强调**工程效率**：用更少代码实现同等甚至更好的效果
- 强调**灵活性**：改规则不需要改代码，改 Prompt 即可
- 强调**对 OpenClaw 生态的深度理解**：不是把 OpenClaw 当入口，而是当**执行平台**

### 叙事 2："聊天记录的完整信息加工"

> "现有系统把聊天记录当成纯文本来处理，忽略了其中 40% 的信息载体——链接、文件、图片。我们设计了一套上下文注入协议，让 Agent 能够自主解析和引用这些富媒体资料。"

这个叙事的优势：
- 切中**真痛点**：任何人都能理解"群里发了 PDF 但机器人看不懂"的问题
- **差异化明确**：在所有竞品中几乎是唯一一个聚焦此问题的
- **演示效果好**：可以现场演示"用户问一个历史问题 → Agent 自动翻出之前的文档/截图来回答"

### 叙事 3："上下文注入作为独立系统层"

> "记忆不是单一概念。'记住结论'和'在需要时调取原始资料'是两个不同的能力。我们分别设计了记忆存储规范和上下文注入协议，让 Agent 既能记住'是什么'，也能在需要时拿到'为什么'。"

这个叙事的优势：
- **概念深度**：展示了架构层面的思考
- **实用价值**：在企业协作中，"结论"和"支撑材料"同样重要
- **可扩展性**：上下文注入层可以独立演进，支持更多资料类型

---

## 六、风险与应对

| 风险 | 说明 | 应对 |
|------|------|------|
| **竞争对手工程更成熟** | adjcjh777 已完成 Phase A-E，有完整的 benchmark 和 demo | 我们不需要在工程成熟度上比拼，而是在**设计范式**上差异化。评审看的不是谁的代码多，而是谁的思路有价值 |
| **"规范驱动"难以证明** | 竞争对手有硬指标（Recall@3 = 1.0），我们的 Agent 行为如何量化？ | 同样需要设计 benchmark，但评测对象是**Agent 行为的正确性**（是否按规范提取、是否按规范注入），而非底层检索准确率 |
| **富媒体加工依赖外部能力** | 解析 PDF、理解图片需要 VLM/OCR，这些可能不稳定 | 明确边界：我们设计的是**委托协议**（Agent 遇到 PDF 时调用什么 Tool），而不是**解析器本身**。解析器可以用成熟的 MCP/server |
| **OpenClaw 工具生态不成熟** | OpenClaw 的 skill/MCP 支持还在演进 | 这是共同风险。我们的优势是"更贴近 OpenClaw 原生能力"，如果 OpenClaw 演进，我们的方案更容易适配 |

---

## 七、总结

1. **这个赛道确实有竞争**，而且有一个非常成熟的直接竞争对手（adjcjh777），他们走的是"重代码、重治理、强工程"路线。
2. **但是，所有项目都有一个盲区**：聊天记录中链接/文件/图片的上下文注入能力几乎无人深入解决。
3. **我们的"规范驱动+双层面架构"路线是独特的**：它不是工程能力的竞争，而是设计范式的竞争——用 Agent 行为规范替代基础设施代码，用上下文注入能力替代纯文本检索。
4. **关键是把差异化做出来**：如果我们的 Demo 能展示"Agent 从聊天记录中自动解析文档链接、提取 PDF 内容、理解设计截图，并在回答中引用这些资料"，这个视觉冲击力会非常强。

---

## 附录：调研数据来源

- GitHub Search API（`gh search repos`）
- GitHub REST API（`api.github.com/repos/*`）
- 直接读取各仓库 README.md raw 内容
- 调研关键词："feishu memory openclaw", "lark memory", "mcp server memory", "claude skill memory", "group chat summary bot", "agent memory"
