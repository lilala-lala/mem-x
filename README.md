# Mem-X — OpenClaw Plugin

让 OpenClaw 第一次能"看见"飞书。

## 定位

这是一个**个人 AI 助手**的企业上下文增强插件，不是团队共享知识库。OpenClaw 以第一人称（`subject: 1st`）理解你在飞书上的协作关系、任务承诺、决策和偏好。

## 核心特性

- **Day-1 Productive**: 首次运行 `/feishu-distill`，60 秒内完成冷启动
- **Day-N Trustworthy**: 五维标签 + 版本链 + 证据链 + 用户反馈闭环
- **Prompt-as-Business-Logic v2**: 9 层架构 prompt，4 个跨行业 few-shot，带推理痕迹与自检机制
- **第一人称记忆**: 区分"我的任务"(1st)、"指派给我的任务"(2nd)、"团队背景"(3rd)
- **工程级鲁棒性**: 指数退避重试 + LLM 输出自校验 + 超时控制

## 快速开始

### 1. 安装到 OpenClaw

**方式 A：作为 bundled plugin（开发/源码集成）**

将项目复制到 OpenClaw 源码树的 `extensions/` 目录下（**不要**使用符号链接，OpenClaw 的 build 系统会跳过符号链接）：

```bash
cp -r /path/to/mem-x /path/to/openclaw/extensions/
cd /path/to/openclaw
pnpm build
```

build 完成后，OpenClaw 的 bundled plugin discovery 会自动找到 mem-x。

**方式 B：作为独立包安装**

```bash
openclaw plugins install /path/to/mem-x
```

### 2. 配置

在 OpenClaw 配置中启用插件（`~/.openclaw/openclaw.json`）：

```json
{
  "plugins": {
    "entries": {
      "mem-x": {
        "enabled": true,
        "config": {
          "llmApiKey": "sk-...",
          "llmBaseUrl": "https://api.deepseek.com/anthropic",
          "llmModel": "deepseek-v4-pro[1m]",
          "memoryDir": "memory/feishu",
          "maxMessagesPerDistill": 200,
          "lookbackDays": 7
        }
      }
    }
  }
}
```

### 3. 使用

```
/feishu-distill           # 拉取飞书消息并萃取记忆
/feishu-distill Omega     # 只处理名字含 "Omega" 的群
/feishu-status            # 查看当前记忆状态
/feishu-feedback <id> <action> [note]  # 反馈记忆质量
```

**Feedback 动作**：
- `correct` — 确认准确，confidence +0.05
- `outdated` — 标记过时，status 变为 superseded
- `noise` — 标记噪声，status 变为 archived
- `important` — 提升 importance +0.1

每次对话时，`before_prompt_build` hook 会自动将 top-20 最重要的 active 记忆注入系统提示，OpenClaw 无需显式查询即可获得企业上下文。

## 目录结构

```
src/
  index.ts     # 插件入口：2 个命令 + 1 个 hook
  lark.ts      # lark-cli 封装（chats list / messages list / lookback filter）
  llm.ts       # Anthropic-compatible LLM 调用
  memory.ts    # Markdown + frontmatter 读写 + INDEX 维护
tests/
  run-tests.mjs              # 单元测试（parseDistillOutput / frontmatter / lookback）
  eval-oracles.mjs           # Ground-truth oracle 评估
  test-real-lark.mjs         # 真实 lark-cli 集成测试
  test-hook-injection.mjs    # Hook 上下文注入验证
  test-feedback.mjs          # 反馈闭环机制验证
  test-self-validation.mjs   # LLM 输出自校验验证
  test-prompt-structure.mjs  # Prompt v2 结构验证
  compare-prompts.mjs        # v1 vs v2 A/B 对比报告
  demo-offline.mjs           # 纯离线一键演示
  e2e-distill.mjs            # 端到端真实数据蒸馏
  e2e-mock-distill.mjs       # 端到端 mock 数据蒸馏
```

## 测试

```bash
cd tests

# 纯离线一键演示（无需任何外部依赖）
node demo-offline.mjs         # 15 条预生成记忆，完整闭环演示

# 单元测试
node run-tests.mjs            # 9/9 通过

# Oracle 评估（mock 数据 100% 覆盖）
node eval-oracles.mjs         # 20/20 通过

# 真实 lark-cli 联调
node test-real-lark.mjs

# Hook 注入验证
node test-hook-injection.mjs  # 6/6 通过

# 反馈闭环机制验证
node test-feedback.mjs        # 8/8 通过

# LLM 输出自校验验证
node test-self-validation.mjs # 6/6 通过

# Prompt v2 结构验证
node test-prompt-structure.mjs # 15/15 通过

# v1 vs v2 A/B 对比报告
node compare-prompts.mjs

# 端到端 mock 蒸馏（需 LLM_API_KEY）
LLM_API_KEY=sk-... node e2e-mock-distill.mjs
```

## 记忆文件格式

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

## 依赖

- OpenClaw >= 2026.3.24-beta.2
- lark-cli >= 1.0.19（已安装并登录）
- Node.js >= 22
- DeepSeek / Kimi API key
