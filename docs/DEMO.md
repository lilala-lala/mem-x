# Mem-X — 演示脚本

> 目标：在 3 分钟内展示 Day-1 Productive + Day-N Trustworthy 的完整闭环。

---

## 前置条件

1. OpenClaw 已安装并启用 `mem-x` 插件
2. `lark-cli` 已登录（`lark-cli auth status` 显示已认证）
3. 插件配置中已填写 `llmApiKey`

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

---

## 演示流程（约 3 分钟）

### Step 1: 冷启动 — 第一次蒸馏（40s）

**操作**：在 OpenClaw 中输入命令：

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

**解说要点**：

- "这是第一次运行，OpenClaw 之前完全不知道飞书上的任何信息。"
- "通过 lark-cli 直接读取本地已登录的飞书数据，无需额外授权。"
- "LLM 自动萃取成结构化记忆文件，带五维标签和证据链。"
- "48 条消息人工阅读需要 12 分钟，蒸馏后 15 条记忆 30 秒掌握——效率提升 96%。"

---

### Step 2: 查看记忆状态（20s）

**操作**：

```
/feishu-status
```

**预期输出**：

```
📊 Feishu Context Memory Status

Total entries: 5
  Active: 5
  Superseded: 0
  Archived: 0

Top 5 active memories:
  • [decision] 复赛作品提交截止时间确认 (imp:0.9)
  • [lesson] 比赛群禁止泄露项目敏感信息 (imp:0.7)
  • [lesson] 个人阶段成果小结必须开启互联网可阅读权限 (imp:0.7)
  • [lesson] 信息填写错误可重新提交并同步更正 (imp:0.5)
  • [relationship] 张飞：本项目观察员 / 评估人 (imp:0.6)

Run /feishu-distill to refresh.
```

**解说要点**：

- "所有记忆按 importance 排序，status 区分 active/superseded/archived。"
- " INDEX.md 自动维护，方便人工审阅。"

---

### Step 3: 验证上下文注入（60s）

**操作**：向 OpenClaw 提问一个需要飞书背景知识的问题：

```
> 复赛截止时间是什么时候？
```

**预期回复**：

```
根据飞书官方沟通群的信息，复赛作品截止提交时间是 2026年5月7日（周四）中午12:00。
```

**技术验证**（可选，展示给评委）：

查看系统提示中是否包含注入的上下文：

```
### Enterprise Context (from Feishu)

- DECISION: 复赛作品提交截止时间确认 (importance: 0.9)
- LESSON: 比赛群禁止泄露项目敏感信息 (importance: 0.7)
...
```

**解说要点**：

- "OpenClaw 原本不知道'复赛截止时间'，因为这不是通用知识。"
- "通过 before_prompt_build hook，飞书记忆被自动注入系统提示。"
- "用户无需手动复制粘贴，AI 在'无感知'状态下获得企业上下文。"

---

### Step 4: 抗干扰演示（30s）

**操作**：展示对 mock 数据的蒸馏结果：

```
/feishu-distill Omega
```

**预期输出**：展示从 48 条消息（含噪声）中提取的 13 条结构化记忆。

**重点展示**：

1. **客户 X 需求**被从 24 条无关消息中捕获
2. **周报 deadline 变更**（周五 → 周日）正确归档旧版本
3. **技术分歧**（Alex vs 小陈）记录为 relationship，而非任务

---

### Step 5: 第一人称视角（30s）

**操作**：展示一个 subject: 1st 的记忆条目：

```
---
id: mem_t_prd
type: task
subject: 1st
---

# 向 PM Lin 提交 PRD 版本（周四前）

我承诺在周四前给 PM Lin 一版 PRD...
```

**解说要点**：

- "subject: 1st 表示这是'我'的记忆，不是'团队共享文档'。"
- "OpenClaw 是以个人助手的身份理解这段关系，而非企业知识库。"

---

### Step 6: 反馈闭环 — Day-N Trustworthy（30s）

**操作**：标记一条记忆已过时：

```
/feishu-feedback mem_t_prd outdated deadline 已延至下周一
```

**预期输出**：

```
📝 Feedback recorded for [mem_t_prd]
  Action: outdated
  Note: deadline 已延至下周一
  New status: superseded
  Feedback count: 1

Run /feishu-status to see updated index.
```

**技术验证**：

查看记忆文件，frontmatter 中新增了 `feedback_log`：

```yaml
feedback_log:
  - action: outdated
    note: deadline 已延至下周一
    at: 2026-04-30T...
```

**解说要点**：

- "这就是 Day-N Trustworthy 的核心：用户发现记忆有误，可以直接反馈，系统自动调整 confidence 和 status。"
- "feedback_log 形成审计链，让 AI 的错误可追溯、可纠正。"
- "correct / outdated / noise / important 四种动作覆盖常见反馈场景。"

---

## 评委关注点对应表

| 评分维度         | 演示中体现的点                                                              |
| ---------------- | --------------------------------------------------------------------------- |
| **完整性与价值** | lark-cli → LLM 蒸馏 → markdown 存储 → hook 注入 → 问答验证，完整闭环        |
| **创新性**       | 五维标签体系、Prompt-as-Business-Logic、第一人称记忆、证据链                |
| **技术实现性**   | OpenClaw 原生插件、TypeScript 类型安全、monorepo 集成、SQLite-less 轻量架构 |

---

## 备用方案（如果现场 lark-cli 无数据 / 无网络）

一键纯离线演示，**无需 LLM API、无需 lark-cli**：

```bash
cd tests
node demo-offline.mjs
```

自动加载预生成的 15 条结构化记忆，完整展示：

- `/feishu-status` 状态概览
- `before_prompt_build` hook 上下文注入
- `/feishu-feedback` 反馈闭环
- 记忆文件格式与五维标签

输出示例：

```
🎬 Feishu Context Memory — Offline Demo
📥 Loaded 15 pre-generated memory files from spike result.
...
✅ Demo complete. Files: 15 | Types: task, decision, preference, relationship, lesson
```
