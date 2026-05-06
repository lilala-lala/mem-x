# 飞书 OpenAPI 能力调研与记忆系统设计方案

> 调研日期：2026-04-28
> 目标：为"企业级长程协作 Memory 系统"确定最简洁、可行的消息获取架构

---

## 一、设计目标与约束

### 1.1 核心定位

- **单一用户服务**：Agent 只服务于一个 host 用户（私人助理模式）
- **不加入群聊**：Agent 不以 Bot 身份加入任何群聊，不建立 WebSocket 长连接
- **用户身份认证**：用户完成 OAuth 授权后，Agent 以 `user_access_token` 身份运行
- **最大化信息覆盖**：在用户授权范围内，尽可能获取用户所有的聊天信息（群聊 + 私聊）
- **极简架构**：只依赖"根据 chat_id 查询聊天记录"这一个核心机制，不做事件订阅、状态机等复杂设计

### 1.2 交互模式

```
Host 用户 <-> Agent（一对一私人助理）
                │
                └── Agent 以 User 身份从飞书拉取用户的聊天数据
                └── Agent 分析、记忆、提取结论
                └── 用户查询时，Agent 基于记忆回答
```

---

## 二、飞书消息 API 能力全景

### 2.1 两种身份的核心差异

| 能力 | Bot 身份 (`tenant_access_token`) | User 身份 (`user_access_token`) |
|------|----------------------------------|--------------------------------|
| **群聊 chat_id 发现** | 只能获取 Bot **已加入**的群 | 可以获取用户**所在的所有群** |
| **群聊历史查询** | 必须在群里才能查 | 可以查用户所在的所有群 |
| **私聊范围** | 只能查 **用户↔Bot** 的单聊 | 可以查 **用户↔任何人** 的单聊 |
| **事件订阅** | 支持 WebSocket/HTTP 实时推送 | 不支持事件订阅 |
| **实时性** | 实时（Push） | 只能主动拉取（Pull） |
| **所需权限** | 需开启机器人能力 | 需用户 OAuth + 管理员审批 |

### 2.2 关键 API 梳理

#### API 1：获取用户/机器人所在的群列表

```
GET /open-apis/im/v1/chats
```

| 项目 | 说明 |
|------|------|
| 支持身份 | `tenant_access_token` 或 `user_access_token` |
| 返回内容 | 群聊 ID（`chat_id`）、群名称、群主、是否外部群 |
| 分页 | `page_size` 最大 100 |
| 权限要求 | `im:chat` / `im:chat:readonly` / `im:chat:read` |
| **关键限制** | **不包含单聊（p2p）** |

#### API 2：搜索消息

```
lark-cli im +messages-search
# 内部调用：POST /open-apis/im/v2/messages/search
```

| 参数 | 能力 |
|------|------|
| `--query` | 关键词搜索 |
| `--chat-type p2p` | 只搜索私聊 |
| `--chat-type group` | 只搜索群聊 |
| `--sender` | 按发送者 open_id 过滤 |
| `--start` / `--end` | 时间范围过滤 |
| `--page-all` | 自动分页（最多 40 页） |
| `--page-size` | 每页 1-50 条 |
| **身份限制** | **User-only**，不支持 Bot |

**返回值包含**：`chat_id`、`chat_type`（p2p/group）、`chat_partner`（私聊对方信息）、消息内容、发送者等。

#### API 3：获取会话历史消息

```
lark-cli im +chat-messages-list
# 内部调用：GET /open-apis/im/v1/messages
```

| 参数 | 能力 |
|------|------|
| `--chat-id` | 指定聊天 ID |
| `--user-id` | **User identity only**：直接指定对方 open_id，自动解析 P2P chat_id |
| `--start` / `--end` | 时间范围 |
| `--sort` | 排序（asc/desc） |
| `--page-size` | 每页 1-50 条 |
| `--page-token` | 分页标记 |

**权限要求**：
- 群聊：需 `im:message.group_msg:get_as_user`
- 单聊：需 `im:message.p2p_msg:get_as_user`

#### API 4：批量获取消息详情

```
lark-cli im +messages-mget
# 内部调用：GET /open-apis/im/v1/messages/mget
```

| 项目 | 说明 |
|------|------|
| `--message-ids` | 最多 50 个 message_id，逗号分隔 |
| 返回 | 完整消息内容（含发送者名字） |
| 用途 | 配合 `+chat-messages-list` 获取的消息 ID，批量拉取完整内容 |

#### API 5：搜索用户（按亲密度排序）

```
lark-cli contact +search-user
# 内部调用：GET /open-apis/search/v1/user
```

| 参数 | 能力 |
|------|------|
| `--query` | 搜索关键词（姓名/邮箱/手机号等） |
| `--page-size` | 分页大小（默认 20，最大 200） |
| `--page-token` | 分页标记 |
| **排序特性** | **结果按亲密度排序**，最相关的联系人在前面 |
| **身份限制** | User / Bot 均支持 |

**返回值包含**：`open_id`、`user_id`、`union_id`、姓名、部门等。

#### API 6：获取群成员列表

```
lark-cli im chat.members.get --chat-id oc_xxx
# 内部调用：GET /open-apis/im/v1/chats/:chat_id/members
```

| 项目 | 说明 |
|------|------|
| 返回内容 | 群成员 open_id 列表 |
| 权限要求 | `im:chat.members:read` |
| 用途 | 配合群列表，构建用户关联联系人池 |

---

## 三、核心难题：私聊的发现与 chat_id 的获取

### 3.1 问题描述

飞书 OpenAPI 存在一个设计缺口：

- ✅ 可以获取**所有群聊**的 chat_id（`GET /im/v1/chats`）
- ❌ **无法列举所有私聊**的 chat_id（没有对应 API）
- 官方文档明确说明："获取到的群列表中，不包含单聊（群模式为 `p2p`）"

### 3.2 方案一：用户指定名字 → contact 搜索 → 直拉历史（**首选**）

**核心洞察**：`lark-cli contact +search-user` 可以按亲密度排序搜索用户，返回 `open_id`；而 `+chat-messages-list --user-id` 可以直接用对方 open_id 拉取私聊历史，自动解析 p2p chat_id。

**链路验证**：

```bash
# Step 1: 搜索用户，获取 open_id（结果按亲密度排序）
lark-cli contact +search-user --query "黎兆兰"
```

返回：
```json
{
  "users": [
    {
      "open_id": "ou_1b91a7bcd99b1a9476a20d2d1559f3be",
      "name": "黎兆兰",
      "department": "产品部"
    }
  ]
}
```

```bash
# Step 2: 直接用 user-id 拉取私聊历史（自动解析 P2P chat_id）
lark-cli im +chat-messages-list --user-id ou_1b91a7bcd99b1a9476a20d2d1559f3be
```

**优势**：
- **无需关键词**：不依赖聊天记录中是否包含可搜索内容
- **一步直达**：open_id → 历史消息，无需中间提取 chat_id
- **亲密度排序**：搜索结果自然把最相关的联系人排在前面，减少歧义
- **支持 dormant chats**：即使和对方很久没有聊天记录，仍能定位并拉取历史

### 3.3 方案二：关键词搜索消息 → 提取 chat_id（**次选/兜底**）

当用户无法提供明确的名字，或 `contact +search-user` 未返回结果时，使用消息搜索作为 fallback：

```bash
# 搜索关键词，跨所有私聊查找
lark-cli im +messages-search --query "项目预算" --chat-type p2p
```

返回结果中包含 `chat_id` 和 `chat_partner`，后续通过 `--chat-id` 拉取完整历史。

**适用场景**：
- 用户只记得聊天内容的关键词，不记得对方名字
- `contact +search-user` 因权限或租户边界问题未返回目标用户
- 对方是外部联系人，不在组织架构内

### 3.4 方案三：群成员遍历 → 批量探测（**系统性但成本高**）

如果需要**全自动发现所有私聊**（用户不指定任何目标），可以走这条路径：

```
chats.list → 获取所有群聊
    │
    └── 对每个群：chat.members.get → 获取群成员 open_id
            │
            └── 去重后，对每个 open_id：
                    +chat-messages-list --user-id <open_id>
                    → 若返回消息，则该私聊存在；若返回"P2P chat not found"，则不存在
```

**成本评估**：
- 假设用户在 50 个群，平均每群 50 人
- `chats.list`：1 次调用
- `chat.members.get`：50 次调用
- 去重后可能得到 ~500 个唯一 open_id
- `+chat-messages-list` 探测：500 次调用
- **总计约 550 次 API 调用**，在 1000 次/分钟的频控范围内，可行但较重

**适用场景**：
- 首次初始化时，用户希望 Agent "记住所有可能的私聊"
- 定期全量扫描，发现新增的私聊关系

---

## 四、最终架构方案

### 4.1 方案概述

采用 **"User 身份私人助理"** 模式：

```
┌─────────────────────────────────────────────────────────────┐
│                      Host 用户（一对一交互）                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       Agent（私人助理）                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │   数据发现层     │  │   数据轮询层     │  │  记忆提取层  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ user_access_token
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     飞书 OpenAPI（User 身份）                  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 数据发现层

#### 群聊发现（全自动）

```bash
lark-cli im +chat-search --query "" --format json
# 或调用 GET /open-apis/im/v1/chats?page_size=100
```

- 获取用户所在的所有群聊列表
- Agent 展示群列表（名称、成员数等）
- 用户勾选要记忆的群 → 保存 `chat_id` 到记忆配置

#### 私聊发现（分层策略）

**第一层：用户直接提供名字（最简路径）**

```
用户说："记住我和黎兆兰的聊天"
    │
    ▼
Agent 执行：
    lark-cli contact +search-user --query "黎兆兰"
    │
    ▼
Agent 展示候选（按亲密度排序）：
    "找到以下联系人，请确认：
     1. 黎兆兰（产品部）— 亲密度最高
     2. 黎兆兰（外部联系人）"
    │
    ▼
用户选择第 1 项
    │
    ▼
Agent 保存 open_id，并立即用 --user-id 拉取历史验证
    lark-cli im +chat-messages-list --user-id ou_xxx --page-size 10
```

**第二层：用户只记得关键词（兜底路径）**

```
用户说："记住我关于项目预算的私聊"
    │
    ▼
Agent 执行：
    lark-cli im +messages-search --query "项目预算" --chat-type p2p --page-size 20
    │
    ▼
Agent 展示候选：
    "找到以下私聊，请确认：
     1. 你和黎兆兰的聊天（最近消息：'项目预算大概 50w'）
     2. 你和张三的聊天（最近消息：'预算表发你了'）"
    │
    ▼
用户选择 → Agent 保存 chat_id
```

**第三层：用户要求"记住所有私聊"（全量扫描）**

```
用户说："把我所有的私聊都记下来"
    │
    ▼
Agent 执行：
    Step 1: lark-cli im chats.list --as user
    Step 2: 对每个群：lark-cli im chat.members.get --chat-id oc_xxx
    Step 3: 去重所有 open_id
    Step 4: 对每个 open_id：lark-cli im +chat-messages-list --user-id <open_id> --page-size 1
    Step 5: 过滤掉返回"P2P chat not found"的，保留有消息的
    │
    ▼
Agent 展示发现的私聊列表（按最近活跃度排序）
用户确认后，全部加入轮询配置
```

### 4.3 数据轮询层

**核心逻辑**：对每个已保存的 `chat_id`（群聊）或 `open_id`（私聊），定时增量拉取新消息。

```python
# 伪代码
for chat in registered_group_chats:
    last_poll = get_last_poll_time(chat.chat_id)
    messages = lark_cli.chat_messages_list(
        chat_id=chat.chat_id,
        start=last_poll,
        sort="asc",
        page_size=50
    )
    for msg in messages:
        memory_engine.ingest(msg)
    set_last_poll_time(chat.chat_id, now())

for p2p in registered_p2p_chats:
    last_poll = get_last_poll_time(p2p.open_id)
    messages = lark_cli.chat_messages_list(
        user_id=p2p.open_id,   # 自动解析 P2P chat_id
        start=last_poll,
        sort="asc",
        page_size=50
    )
    for msg in messages:
        memory_engine.ingest(msg)
    set_last_poll_time(p2p.open_id, now())
```

**轮询策略**：
- 高频群/私聊：每 5 分钟轮询一次
- 低频群/私聊：每 30 分钟轮询一次
- 新注册的聊天：首次全量拉取，后续增量

### 4.4 记忆提取层

对拉取到的原始消息，执行：
1. **去噪**：过滤"收到"、"好的"、emoji 等低信息密度消息
2. **摘要**：对连续对话生成语义摘要
3. **实体提取**：识别人名、项目名、日期、决策点
4. **结构化**：转化为 Memory Schema（决策、任务、信息等类型）
5. **链接/文件/图片加工**：解析消息中的富媒体引用

---

## 五、技术工具链

| 层级 | 工具 | 说明 |
|------|------|------|
| **身份认证** | `lark-cli auth login` | User 身份 OAuth 登录 |
| **用户搜索** | `lark-cli contact +search-user` | 按亲密度排序搜索用户，获取 open_id |
| **群聊发现** | `lark-cli im +chat-search` | 搜索用户可见的群聊 |
| **群成员获取** | `lark-cli im chat.members.get` | 获取群成员列表，构建联系人池 |
| **消息搜索** | `lark-cli im +messages-search` | 跨聊天搜索消息，兜底发现私聊 chat_id |
| **历史轮询（群聊）** | `lark-cli im +chat-messages-list --chat-id` | 根据 chat_id 拉取群聊历史 |
| **历史轮询（私聊）** | `lark-cli im +chat-messages-list --user-id` | 根据对方 open_id 直接拉取私聊历史 |
| **详情补全** | `lark-cli im +messages-mget` | 批量获取消息完整内容 |
| **资源下载** | `lark-cli im +messages-resources-download` | 下载消息中的图片/文件 |
| **文档读取** | `lark-cli docx get` / `drive file download` | 解析聊天中引用的文档 |

---

## 六、权限申请清单

以 User 身份运行所需的核心权限：

| 权限 | 用途 | 敏感度 |
|------|------|--------|
| `im:chat:read` | 获取群聊列表 | 低 |
| `im:chat.members:read` | 获取群成员列表 | 低 |
| `im:message` 或 `im:message:readonly` | 基础消息读取 | 中 |
| `im:message.group_msg:get_as_user` | 以用户身份获取群聊消息 | **高** |
| `im:message.p2p_msg:get_as_user` | 以用户身份获取单聊消息 | **高** |
| `contact:user.base:readonly` | 获取用户基本信息（名字等） | 低 |
| `search:user:read` | 搜索用户（contact +search-user） | 低 |

**审批要求**：
- `get_as_user` 类权限通常需要**企业管理员审批**
- 这是本方案最大的外部依赖

---

## 七、限制与风险

| 限制/风险 | 说明 | 应对策略 |
|-----------|------|---------|
| **contact +search-user 查询限制** | 需要 `--query` 关键词，无法一次性返回所有联系人 | 用群成员遍历作为全量发现的补充方案 |
| **搜索索引盲区** | `+messages-search` 可能不索引全部历史消息（可能有时间窗口） | 明确告知用户"只能搜索到索引范围内的消息"；老旧私聊需用户手动提供名字 |
| **搜索词匹配失败** | 用户提供的线索可能搜不到结果 | 提示用户提供更具体的消息内容；支持多次尝试 |
| **多结果歧义** | 同一关键词可能匹配多个私聊 | Agent 展示候选列表（对方名字+消息摘要+时间），让用户选择 |
| **频控** | 历史消息 API 限流 1000 次/分钟、50 次/秒 | 合理控制轮询频率；分页拉取；批量请求；全量扫描分批执行 |
| **管理员审批** | `get_as_user` 权限需企业管理员审批 | 提前申请；设计降级方案（只记忆用户主动授权的聊天） |
| **无实时性** | Pull 模式有分钟级延迟 | 接受延迟；记忆场景对实时性要求不高 |
| **隐私合规** | Agent 能访问用户所有聊天 | 用户明确授权每个聊天；敏感内容脱敏；本地存储 |
| **chat_id 稳定性** | 私聊 chat_id 是否长期稳定 | 观察验证；若变化需重新发现；`--user-id` 方式不受 chat_id 变化影响 |
| **外部联系人** | `contact +search-user` 可能搜不到外部联系人 | 对外部联系人回退到 `+messages-search` 方案 |

---

## 八、与传统 Bot 模式的对比

| 维度 | 传统 Bot 模式 | User 身份私人助理模式（本方案） |
|------|-------------|------------------------------|
| **群聊覆盖** | Bot 必须在群里 | 用户在任何群里都可以被查 |
| **私聊覆盖** | 只能收用户↔Bot 的私聊 | **任何私聊都可以通过用户搜索 + user-id 直拉** |
| **私聊发现** | N/A | **三层策略：用户搜索 → 消息搜索 → 群成员遍历** |
| **实时性** | WebSocket 实时推送 | 轮询（分钟级延迟） |
| **架构复杂度** | 高（Bot 能力+事件订阅+长连接+状态机） | **低（纯 User 身份+定时轮询）** |
| **部署成本** | 需公网服务器或长连接 SDK | 本地运行即可 |
| **隐私控制** | 弱（Bot 在群里所有人可见） | 强（无感知，用户完全控制） |
| **权限审批** | 相对简单 | 需管理员审批敏感权限 |
| **适用场景** | 团队协作机器人 | **个人私人助理** |

---

## 九、待验证项

1. `+messages-search` 的搜索索引覆盖时间范围（是全部历史还是最近 N 个月？）
2. `contact +search-user` 对重名用户的区分精度（亲密度排序是否足够可靠）
3. `contact +search-user` 是否能搜到外部联系人/跨租户用户
4. `+chat-messages-list --user-id` 对超大规模私聊历史的返回性能
5. `chat_id` 在私聊中的长期稳定性（`--user-id` 方式已天然免疫此问题）
6. `get_as_user` 权限在具体企业环境中的审批难度
7. 消息中链接、文件、图片的解析链路是否完整可用

---

## 十、结论

本方案通过 **"User 身份 + contact 搜索发现联系人 + user-id 直拉私聊历史 + chat_id 轮询群聊历史"** 的组合，建立了三层私聊发现策略：

1. **首选**：用户指定名字 → `contact +search-user` 获取 open_id → `--user-id` 直拉历史
2. **次选**：用户提供关键词 → `+messages-search` 跨私聊搜索 → 提取 chat_id
3. **全量**：群成员遍历 → 去重 open_id → 批量探测私聊存在性

这套策略实现了：
- **群聊全覆盖**：通过 `GET /im/v1/chats` 自动发现
- **私聊多层可达**：从精准搜索到全量扫描，覆盖所有场景
- **架构极简**：不依赖 Bot 能力、事件订阅、长连接
- **隐私可控**：用户明确授权每个被记忆的聊天
- **免疫 chat_id 变化**：`--user-id` 方式不依赖 chat_id 稳定性

这是一个**高度契合"私人助理"定位**的设计，比传统的 Bot 中心架构更适合单一用户的长程记忆场景。
