# 复赛作品提交清单

## 基本信息

- **赛道**: 飞书 OpenClaw — 企业级长程协作 Memory 系统
- **课题方向**: 个人 AI 助手的企业上下文增强（非团队共享 agent）
- **核心承诺**: Day-1 Productive + Day-N Trustworthy

## 交付物结构

```
mem-x/
├── docs/                           # 文档
│   ├── whitepaper-v0.md           # 完整白皮书（11 章，架构与设计理念）
│   ├── DEMO.md                    # 3 分钟演示脚本（含评委关注点映射）
│   ├── problem.md                 # 赛题原文
│   ├── scoring-rules.md           # 评分规则
│   └── SUBMISSION.md              # 提交清单
├── src/                            # OpenClaw 插件（核心代码）
│   ├── index.ts                   # 插件入口：3 个命令 + 1 个 hook
│   ├── lark.ts                    # lark-cli 封装（列表/消息/过滤）
│   ├── llm.ts                     # Anthropic-compatible LLM 调用
│   ├── memory.ts                  # Markdown + frontmatter 读写
│   └── prompts/                   # 内置 skill prompts
│       ├── distill_v1.skill.md
│       └── distill_v2.skill.md
├── tests/                          # 测试与验证
│   ├── run-tests.mjs              # 单元测试（9/9 通过）
│   ├── eval-oracles.mjs           # Oracle 评估（20/20 通过）
│   ├── e2e-distill.mjs            # 真实 lark-cli + LLM 端到端
│   ├── e2e-mock-distill.mjs       # Mock 数据 + LLM 端到端
│   ├── benchmark-parallel.mjs     # 并行化性能基准测试
│   ├── test-real-lark.mjs         # lark-cli 集成测试
│   ├── test-hook-injection.mjs    # Hook 注入逻辑验证
│   ├── test-feedback.mjs          # 反馈闭环机制验证（8/8 通过）
│   ├── test-self-validation.mjs   # LLM 输出自校验验证（6/6 通过）
│   ├── test-prompt-structure.mjs  # Prompt v2 结构验证（15/15 通过）
│   ├── compare-prompts.mjs        # v1 vs v2 A/B 对比报告
│   └── demo-offline.mjs           # 纯离线一键演示（15 条预生成记忆）
├── prompts/                        # Prompt 工程预研与验证
│   ├── distill_v1.skill.md
│   ├── distill_v2.skill.md
│   ├── mock_data/week1_omega_chat.json   # 48 条消息 + 嵌入式 oracles
│   └── results/distill_deepseek_v4.md    # DeepSeek spike 输出（14 条记忆）
├── scripts/                        # 工具脚本
│   └── run_distillation.py        # Python 版 LLM 调用脚本
├── openclaw.plugin.json           # 插件配置 schema
├── package.json                   # 插件 manifest
├── tsconfig.json                  # 独立构建配置
└── README.md                      # 快速开始指南
```

## 核心创新点

1. **第一人称记忆** (`subject: 1st/2nd/3rd`)
   - OpenClaw 以"我的助手"身份理解企业关系，而非企业知识库

2. **五维标签体系** (tense × source × subject × structure × abstraction)
   - 解决企业协作中"这条信息现在是否有效"的分类难题

3. **Prompt-as-Business-Logic（v2 进化版）**
   - 零规则引擎，全部业务逻辑封装在 skill prompt 中
   - v2 prompt 采用 9 层架构：角色定义 → 类型学 → 输出规范 → 决策框架 → 噪声分类 → 边界案例 → 多场景示例 → 质量自检 → 输入处理
   - 4 个跨行业 few-shot（技术/销售/HR/市场），带推理痕迹（reasoning trace）
   - v1 v2 并存，代码自动优先加载 v2

4. **三层存储架构**
   - L0 Active: Markdown + frontmatter（< 2000 条，LLM 直接读取）
   - L1 Archive: SQLite + markdown（容量扩展）
   - L2 Evidence: source_id 指针（可追溯源消息）

5. **无额外授权**
   - 复用用户已登录的 `lark-cli`，直接读取本地数据

6. **工程级鲁棒性**
   - lark-cli 与 LLM API 均带指数退避重试（3 次）+ 超时控制
   - LLM 输出自校验：必填字段、类型合法性、证据溯源、时间线一致性四重校验

## 验证结果

| 测试项 | 结果 |
|---|---|
| 插件 TypeScript 类型检查 | ✅ 通过 (`tsc --noEmit` exit 0) |
| 单元测试 | ✅ 9/9 通过 |
| Oracle 评估（mock 数据） | ✅ 20/20 通过 (100%) |
| 真实 lark-cli 数据获取 | ✅ 4 个群，59 条消息 |
| Mock 数据 LLM 蒸馏 | ✅ 13 个文件，5 类型全覆盖 |
| Hook 注入逻辑 | ✅ 6/6 通过 |
| 反馈闭环机制 | ✅ 8/8 通过 |
| LLM 输出自校验 | ✅ 6/6 通过 |
| Prompt v2 结构验证 | ✅ 15/15 通过 |
| v1 vs v2 A/B 对比 | v2 覆盖 6/6 关键特性，v1 为 0/6 |

## 运行方式

### 方式 A：OpenClaw 插件（推荐）

```bash
# 复制到 OpenClaw extensions 目录
cp -r mem-x /path/to/openclaw/extensions/

# 在 OpenClaw 配置中启用并填写 llmApiKey
# 然后使用：
# /feishu-distill        # 拉取并蒸馏
# /feishu-status         # 查看记忆状态
```

### 方式 B：独立脚本验证

```bash
cd mem-x/tests

# 纯离线一键演示（无需 API、无需 lark-cli）
node demo-offline.mjs

# 验证 lark-cli 连通性
node test-real-lark.mjs

# 运行所有单元测试
node run-tests.mjs

# 运行 oracle 评估
node eval-oracles.mjs

# 反馈闭环机制验证
node test-feedback.mjs

# LLM 输出自校验验证
node test-self-validation.mjs

# Prompt v2 结构验证
node test-prompt-structure.mjs

# v1 vs v2 A/B 对比报告
node compare-prompts.mjs

# 端到端 mock 蒸馏（需 LLM_API_KEY）
LLM_API_KEY=sk-... node e2e-mock-distill.mjs
```

## 依赖

- OpenClaw >= 2026.3.24-beta.2
- lark-cli >= 1.0.19（已安装并登录）
- Node.js >= 22
- DeepSeek/Kimi API key（用于蒸馏）
