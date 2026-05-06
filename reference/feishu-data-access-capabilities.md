# 飞书生态信息获取能力全景图谱

> 本文档系统梳理了通过 lark-cli 获取飞书生态内各类信息来源的完整路径，涵盖即时通讯、云文档、云盘、邮件、日历、任务、会议、多维表格、审批、通讯录等全部企业协作场景。所有命令均基于 lark-skills 官方文档和实际环境验证。

---

## 一、概述

在企业级长程协作记忆系统中，飞书是核心信息汇聚平台。本报告验证了通过 **lark-cli**（飞书官方 CLI 工具）获取飞书生态内各类信息来源的完整能力链路，为后续记忆系统的"规范驱动"设计提供数据接入层的事实依据。

**核心结论**：飞书生态内的所有主要信息类型（文本、文件、图片、云文档、邮件、日历、任务、会议、表格、审批、通讯录等）均可以通过 lark-cli 的原生命令获取，**无需编写自定义 API 调用代码**。

---

## 二、信息来源分类与获取路径

### 2.1 即时通讯（IM）

#### 2.1.1 文本消息

**命令**：
```bash
lark-cli im +chat-messages-list --chat-id <chat_id>
```

**返回内容**：
- `content`: 消息纯文本内容
- `msg_type`: "text"
- `sender`: 发送者信息（name, id, sender_type）
- `create_time`: 发送时间
- `message_id`: 消息唯一标识

**关键发现**：
- 文本消息中的飞书文档链接（如 `https://xxx.feishu.cn/wiki/xxx`）以纯文本形式返回，需要二次解析提取 token
- 链接本身不包含文档内容，需要后续调用 `docs +fetch` 获取

#### 2.1.2 文件消息

**命令（获取元数据）**：
```bash
lark-cli im +chat-messages-list --chat-id <chat_id>
```

**返回内容示例**：
```xml
<file key="file_v3_00114_61240a94-abc7-4419-ad34-cd8289c4e43g" name="对信息技术新体系的思考.pdf"/>
```

**命令（下载文件）**：
```bash
lark-cli im +messages-resources-download \
  --message-id <message_id> \
  --file-key <file_key> \
  --type file \
  --output <filename>
```

**参数说明**：

| 参数 | 说明 | 示例 |
|------|------|------|
| `--message-id` | 消息 ID | `om_x100b51fb576e54a8b485c107d39b464` |
| `--file-key` | 文件资源 key | `file_v3_00114_61240a94-abc7-4419-ad34-cd8289c4e43g` |
| `--type` | 资源类型 | `file` |
| `--output` | 保存路径（**必须是相对路径**） | `downloads/test.pdf` |

**实际测试结果**：
```json
{
  "ok": true,
  "data": {
    "saved_path": "~/code/mem-x/downloads/test.pdf",
    "size_bytes": 690667
  }
}
```

**限制**：
- `--output` 仅支持相对路径，绝对路径会被拒绝
- 需要同时具备 `message_id` 和 `file_key`，不能只凭 file_key 下载

#### 2.1.3 图片消息

**命令（获取元数据）**：
```bash
lark-cli im +chat-messages-list --chat-id <chat_id>
```

**返回内容示例**：
```
[Image: img_v3_02113_ede57840-054c-43dc-a832-7c5a53de809g]
```

**命令（下载图片）**：
```bash
lark-cli im +messages-resources-download \
  --message-id <message_id> \
  --file-key <img_key> \
  --type image \
  --output <filename>
```

**实际测试结果**：
```json
{
  "ok": true,
  "data": {
    "saved_path": "~/code/mem-x/downloads/image1.jpg",
    "size_bytes": 2339965
  }
}
```

**关键发现**：
- 图片消息在 list 结果中仅显示为 `[Image: img_xxx]`，不含任何视觉内容描述
- 下载后的图片需要进一步通过 VLM（视觉语言模型）或 OCR 工具进行语义理解
- 表情包、reaction 图片也会被列出，建议通过文件大小（< 10KB）或文件名规则过滤

#### 2.1.4 系统消息

**特征**：`msg_type` 为 "system"

**内容示例**：
- "李治淳 invited openclaw to the group."
- "李治淳 updated the group name from ... to ..."

**处理建议**：
- 系统消息包含群组变更信息（成员加入、群名修改等）
- 对于记忆系统，可选择性记录（如成员变更时间线），但通常不提取为语义记忆

#### 2.1.5 消息搜索

**命令**：
```bash
lark-cli im +messages-search --query <关键词> [--chat-id <id>] [--sender <open_id>] [--time-start <ts>] [--time-end <ts>]
```

**特点**：
- 支持跨群聊全文搜索
- 支持 `--page-all` 自动翻页
- 支持按发送者、时间范围、附件类型过滤
- 结果通过 batched mget 自动富化，包含发送者名称

#### 2.1.6 群聊管理信息

**获取群成员列表**：
```bash
lark-cli im chat.members get --params '{"chat_id":"oc_xxx"}'
```

**搜索群聊**：
```bash
lark-cli im +chat-search --query <关键词>
```

---

### 2.2 云文档/知识库

#### 2.2.1 文档内容获取

**命令**：
```bash
lark-cli docs +fetch --api-version v2 \
  --doc <文档URL或token> \
  --doc-format <格式> \
  --detail <详细程度>
```

**参数说明**：

| 参数 | 说明 | 可选值 | 推荐值 |
|------|------|--------|--------|
| `--api-version` | API 版本 | `v1` / `v2` | `v2`（v1 已废弃） |
| `--doc` | 文档标识 | 完整 URL 或 token | 均可 |
| `--doc-format` | 输出格式 | `markdown` / `text` / `xml` | 按需选择 |
| `--detail` | 详细程度 | `simple` / `with-ids` / `full` | `simple`（纯内容） |
| `--scope` | 读取范围 | `full` / `outline` / `keyword` / `range` | `full` |

**实际测试结果**：

使用 wiki 链接：
```bash
lark-cli docs +fetch --api-version v2 \
  --doc "Kix4wITfBiKcWYk7KtLcds2Zn1l" \
  --doc-format markdown \
  --detail simple
```

返回结果：成功获取完整 Markdown 内容，包含标题层级、段落、列表、引用块等结构化信息。

**关键发现**：
- `--as user` 和 `--as bot` 均可访问（取决于文档的权限设置）
- 返回的 Markdown 中，图片显示为 `![](https://internal-api-drive-stream.feishu.cn/...)` 形式
- 纯 Markdown 输出**不包含图片的 file_token**，需要通过 XML 格式获取

#### 2.2.2 文档内嵌图片获取

由于 Markdown 格式丢失了图片的 file_token，需要改用 XML 格式解析：

**步骤一：获取带 ID 的 XML 结构**
```bash
lark-cli docs +fetch --api-version v2 \
  --doc "<文档token>" \
  --doc-format xml \
  --detail with-ids
```

**图片 block 示例**：
```xml
<img id="EYhCdG4s1odDb8xLkficHixan4g"
     name="截屏2026-04-26 02.36.35.png"
     href="https://internal-api-drive-stream.feishu.cn/..."
     mime="image/png"
     src="MXjPb4stWoupDKxro8pcnvpKnke"
     width="1394"
     height="2190"/>
```

**关键字段**：
- `src`: **file_token**，下载命令必需
- `href`: 直接访问 URL（有过期风险，不建议长期存储）
- `name`: 原始文件名
- `mime`: MIME 类型

**步骤二：下载图片**
```bash
lark-cli docs +media-download \
  --token <src_value> \
  --type media \
  --output <filename>
```

**实际测试结果**：
```json
{
  "ok": true,
  "data": {
    "content_type": "image/png",
    "saved_path": "~/code/mem-x/downloads/doc_image.png",
    "size_bytes": 324390
  }
}
```

**注意事项**：
- `with-ids` 详情级别**仅支持** `--doc-format xml`，与 `markdown` 不兼容
- 这意味着需要**两次 fetch**：一次 Markdown 获取文本内容，一次 XML 获取图片标识

#### 2.2.3 Wiki 知识库

Wiki 链接（`/wiki/TOKEN`）背后可能是多种文档类型，**不能直接假设 URL 中的 token 就是 file_token**。

**查询 wiki 节点**：
```bash
lark-cli wiki spaces get_node --params '{"token":"wiki_token"}'
```

**返回关键字段**：
- `node.obj_type`: 文档类型（docx/doc/sheet/bitable/slides/file/mindnote）
- `node.obj_token`: 真实的文档 token
- `node.title`: 文档标题

**根据 obj_type 选择后续 API**：

| obj_type | 后续操作 |
|----------|---------|
| `docx` | `drive file.comments.*`、`docx.*` |
| `doc` | `drive file.comments.*` |
| `sheet` | `sheets.*` |
| `bitable` | `bitable.*` |
| `slides` / `file` / `mindnote` | `drive.*` |

---

### 2.3 云盘（Drive）

#### 2.3.1 文件搜索

**命令**：
```bash
lark-cli drive +search --query <关键词> [--edited-since <date>] [--mine] [--doc-types docx,sheet,bitable]
```

**特点**：
- 支持自然语言友好的扁平 filter flags
- 支持 `--edited-since`（最近编辑时间）、`--mine`（我创建的）、`--doc-types`（文档类型过滤）
- 覆盖文档、Wiki、电子表格、多维表格、云空间对象
- 老的 `docs +search` 进入维护期，后续会下线

#### 2.3.2 文件上传/下载/移动/删除

| 操作 | 命令 |
|------|------|
| 上传文件 | `lark-cli drive +upload --folder-token <id> --file <path>` |
| 下载文件 | `lark-cli drive +download --token <file_token> --output <path>` |
| 创建文件夹 | `lark-cli drive +create-folder --name <name> [--parent-token <id>]` |
| 移动文件 | `lark-cli drive +move --token <id> --target-folder-token <id>` |
| 删除文件 | `lark-cli drive +delete --token <id>` |
| 导出文档 | `lark-cli drive +export --token <id> --type <format>` |

#### 2.3.3 文档评论

**查询评论（默认仅未解决）**：
```bash
lark-cli drive file.comments list \
  --params '{"file_token":"xxx","file_type":"docx","is_solved":false}'
```

**关键规则**：
- 默认必须传 `is_solved:false`，仅查询未解决评论
- 仅当用户明确要求包含已解决评论时，才可省略 `is_solved`
- 统计"评论卡片数"统计 `items` 长度；统计"回复数"需排除首条评论

**添加评论**：
```bash
lark-cli drive +add-comment --doc <url_or_token> --content '[{"type":"text","text":"评论内容"}]'
```

**评论写入限制**：
- 全文评论（`is_whole=true`）不支持回复
- 已解决评论（`is_solved=true`）不支持回复
- 文本内容中的 `<`、`>` 需转义为 `&lt;`、`&gt;`

#### 2.3.4 文档访问记录

```bash
lark-cli drive file.view_records list --params '{"token":"xxx","file_type":"docx"}'
```

#### 2.3.5 文档权限管理

```bash
lark-cli drive permission.members create \
  --params '{"token":"xxx","type":"docx"}' \
  --data '{"member_type":"openid","member_id":"xxx","perm":"view","type":"user"}'
```

---

### 2.4 邮件（Mail）

#### 2.4.1 邮件搜索与读取

**获取收件箱摘要**：
```bash
lark-cli mail +triage --query <关键词> [--folder-id INBOX]
```

**读取单封邮件**：
```bash
lark-cli mail +message --message-id <id> [--html=false]
```

**读取整个会话**：
```bash
lark-cli mail +thread --thread-id <id>
```

#### 2.4.2 邮件附件下载

```bash
lark-cli mail user_mailbox.message.attachments download_url \
  --params '{"user_mailbox_id":"me","message_id":"xxx","attachment_id":"xxx"}'
```

#### 2.4.3 邮件事件监听

```bash
lark-cli mail +watch  # WebSocket 实时监听新邮件
```

**要求**：需要 scope `mail:event` 和 bot event `mail.user_mailbox.event.message_received_v1`

---

### 2.5 日历（Calendar）

#### 2.5.1 获取日历事件列表

```bash
lark-cli calendar events list \
  --params '{"start_time":"1714291200","end_time":"1714377600"}'
```

**返回内容**：事件标题、时间、地点、参与人、描述、重复规则等

#### 2.5.2 获取事件详情

```bash
lark-cli calendar events get --params '{"event_id":"xxx"}'
```

#### 2.5.3 获取会议室/忙闲信息

```bash
lark-cli calendar freebusy list --params '{"time_min":"...","time_max":"...","user_ids":["xxx"]}'
```

---

### 2.6 任务（Task）

#### 2.6.1 获取任务列表

**我负责的任务**：
```bash
lark-cli task +get-my-tasks
```

**与我相关的任务**：
```bash
lark-cli task +get-related-tasks
```

**搜索任务**：
```bash
lark-cli task +search --query <关键词>
```

#### 2.6.2 任务详情与操作

**获取任务详情**：
```bash
lark-cli task tasks get --params '{"task_guid":"xxx"}'
```

**创建任务**：
```bash
lark-cli task +create --summary <标题> [--due <截止时间>] [--start <开始时间>]
```

**完成任务**：
```bash
lark-cli task +complete --task-guid <guid>
```

#### 2.6.3 任务清单

**列取清单**：
```bash
lark-cli task tasklists list
```

**获取清单任务**：
```bash
lark-cli task tasklists tasks --params '{"tasklist_guid":"xxx"}'
```

---

### 2.7 多维表格 / Base（Bitable）

#### 2.7.1 表结构与记录操作

**获取表列表**：
```bash
lark-cli base tables list --params '{"app_token":"xxx"}'
```

**获取记录列表**：
```bash
lark-cli base records list --params '{"app_token":"xxx","table_id":"xxx"}'
```

**获取记录详情**：
```bash
lark-cli base records get --params '{"app_token":"xxx","table_id":"xxx","record_id":"xxx"}'
```

#### 2.7.2 记录变更历史（版本追踪）

```bash
lark-cli base +record-history-list --app-token <token> --table-id <id> --record-id <id>
```

**关键发现**：
- Base/多维表格**原生支持记录级别的变更历史追踪**
- 这是飞书生态中少有的具备完整版本历史感知能力的数据源
- 对记忆系统的"变化检测"和"冲突处理"极具价值

#### 2.7.3 数据查询（SQL-like）

```bash
lark-cli base +query --app-token <token> --sql <sql>
```

---

### 2.8 会议与妙记（Minutes / VC）

#### 2.8.1 妙记搜索与获取

**搜索妙记**：
```bash
lark-cli minutes search --params '{"query":"xxx"}'
```

**获取妙记详情**：
```bash
lark-cli minutes get --params '{"minutes_id":"xxx"}'
```

#### 2.8.2 视频会议记录（VC）

**获取会议列表**：
```bash
lark-cli vc meetings list --params '{"start_time":"...","end_time":"..."}'
```

**获取会议详情/会议纪要**：
```bash
lark-cli vc +notes --meeting-id <id>
```

**返回内容**：
- AI 会议摘要
- 会议待办（todos）
- 完整转录文本（transcript）
- 会议元数据（时间、参与人、时长等）

---

### 2.9 通讯录（Contact）

#### 2.9.1 获取用户信息

**获取当前登录用户信息**：
```bash
lark-cli contact +get-user
```

**获取指定用户信息**：
```bash
lark-cli contact +get-user --user-id <open_id>
```

**搜索用户**：
```bash
lark-cli contact +search-user --query <姓名/邮箱/手机号>
```

**价值**：用于将任务、评论、消息中的 `open_id` 解析为真实人名，提升记忆可读性

---

### 2.10 审批（Approval）

#### 2.10.1 获取审批实例

```bash
lark-cli approval instances get --params '{"instance_id":"xxx"}'
```

**返回内容**：审批表单数据、审批流程、审批人意见、当前状态等

---

### 2.11 电子表格（Sheets）

#### 2.11.1 读取与写入

**获取表格信息**：
```bash
lark-cli sheets +info --url <spreadsheet_url>
```

**读取单元格**：
```bash
lark-cli sheets +read --url <url> --sheet-id <id> --range A1:C10
```

**写入单元格**：
```bash
lark-cli sheets +write --url <url> --sheet-id <id> --range A1 --values '[["数据1","数据2"]]'
```

#### 2.11.2 导出表格

```bash
lark-cli sheets +export --url <url> --type xlsx [--download]
```

---

### 2.12 OKR

#### 2.12.1 获取 OKR 周期与目标

**获取用户 OKR 周期列表**：
```bash
lark-cli okr +cycle-list --user-id <open_id>
```

**获取周期内所有目标与关键结果详情**：
```bash
lark-cli okr +cycle-detail --cycle-id <cycle_id>
```

**返回内容**：
- 目标（Objective）标题、描述、进度、权重
- 关键结果（Key Result）标题、当前值、目标值、进度
- 对齐关系（alignment）
- 量化指标（indicators）

**记忆价值**：OKR 是**企业级战略意图的集中表达**，直接反映团队/个人的优先事项和进展，属于高价值记忆源。

---

### 2.13 幻灯片（Slides）

#### 2.13.1 读取幻灯片内容

**获取完整 XML 内容**：
```bash
lark-cli slides xml_presentations get --params '{"xml_presentation_id":"xxx"}'
```

**获取单页内容**：
```bash
lark-cli slides xml_presentation.slide get --params '{"xml_presentation_id":"xxx","slide_id":"xxx"}'
```

**关键发现**：
- 幻灯片内容以 XML 格式返回，包含文本、形状、图片、表格、图表等元素的完整结构
- 图片需通过 `src` 中的 `file_token` 另行下载
- Wiki 中的幻灯片需先通过 `wiki spaces get_node` 解析获取真实 `xml_presentation_id`

**记忆价值**：演示文稿通常包含**经过提炼的决策结论、数据洞察、方案对比**，是重要的结构化知识载体。

---

### 2.14 实时事件订阅（Event）

#### 2.12.1 WebSocket 事件监听

**命令**：
```bash
lark-cli event +subscribe [--compact] [--route <regex>] [--output <file>]
```

**输出格式**：NDJSON（每行一个 JSON 对象）

**支持的事件类型**（需提前在开发者后台配置）：
- `im.message.receive_v1`：收到新消息
- `im.message.reaction.created_v1`：消息表情回复
- `drive.file.deleted_v1`：文件删除
- `drive.file.permission_member_changed_v1`：文件权限变更
- `calendar.calendar.event.changed_v1`：日历事件变更
- `task.task.updated_v1`：任务更新
- `approval.instance.updated_v1`：审批实例更新
- `mail.user_mailbox.event.message_received_v1`：收到新邮件

**关键发现**：
- 这是**被动感知信息变化的唯一途径**，弥补了主动轮询的不足
- 对记忆系统的"实时同步"和"增量更新"至关重要
- 采用 WebSocket 长连接，输出到 stdout，适合管道化处理

---

## 三、完整信息获取链路图谱

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         飞书生态信息来源全景图                               │
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬───────────┤
│  即时通讯 │  云文档   │  云盘    │   邮件   │   日历   │   任务   │   会议    │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼───────────┤
│ 文本消息  │ 文本内容  │ 文件搜索  │ 收件箱   │ 事件列表  │ 任务列表  │ 妙记搜索  │
│ 文件消息  │ 内嵌图片  │ 文件下载  │ 邮件详情  │ 事件详情  │ 任务详情  │ 会议纪要  │
│ 图片消息  │ 评论      │ 上传/移动 │ 附件下载  │ 忙闲查询  │ 任务清单  │ 转录文本  │
│ 消息搜索  │ 访问记录  │ 评论管理  │ 邮件监听  │          │ 子任务   │ 会议待办  │
│ 群成员    │ 权限管理  │ 权限管理  │          │          │          │           │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼───────────┤
│ 多维表格  │  通讯录   │  审批    │ 电子表格  │   OKR   │  幻灯片   │  事件订阅  │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼───────────┤
│ 记录列表  │ 用户信息  │ 审批实例  │ 单元格读  │ 周期列表  │ XML全文  │ WebSocket │
│ 记录历史  │ 用户搜索  │          │ 单元格写  │ 目标详情  │ 单页内容  │ 实时事件  │
│ SQL查询   │          │          │ 表格导出  │ 关键结果  │ 图片提取  │          │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴───────────┘
```

---

## 四、对记忆系统设计的规范建议

### 4.1 Agent 信息提取行为规范

基于上述验证结果，定义 Agent 面对不同信息来源时的标准处理流程：

#### 群聊/私聊消息处理规范

```
消息到达 → 判断 msg_type
    │
    ├── text → 提取 content
    │       ├── 如果包含 feishu.cn 链接 → 调用 docs +fetch 获取文档内容
    │       └── 生成文本摘要 → 存入记忆
    │
    ├── file → 提取 file_key + message_id
    │       ├── 调用 im +messages-resources-download --type file 下载
    │       ├── 调用格式解析器提取内容
    │       └── 生成文件内容摘要 → 存入记忆
    │
    ├── image → 提取 img_key + message_id
    │       ├── 调用 im +messages-resources-download --type image 下载
    │       ├── 调用 VLM 生成图片描述 + OCR 提取文字
    │       └── 生成图片语义摘要 → 存入记忆
    │
    └── system → 选择性记录（成员变更等），不提取语义记忆
```

#### 云文档处理规范

```
检测到文档链接/token → 并行执行两路 fetch
    │
    ├── 路径 A：docs +fetch --doc-format markdown --detail simple
    │       └── 获取纯文本内容 → 生成文本摘要
    │
    └── 路径 B：docs +fetch --doc-format xml --detail with-ids
            └── 解析所有 <img> 标签 → 提取 src 属性
                └── 对每个 src 调用 docs +media-download
                    └── 下载后调用 VLM/OCR → 生成图片描述
                            └── 与文本摘要关联存储
```

#### 会议处理规范

```
检测到会议/妙记 → 调用 vc +notes 或 minutes get
    │
    ├── 提取 AI 摘要 → 生成会议核心结论记忆
    ├── 提取 todos → 生成行动项记忆
    ├── 提取 transcript → 生成详细讨论记忆（按需）
    └── 关联参与人（通过 contact +get-user 解析人名）
```

#### 任务处理规范

```
任务相关事件 → 调用 task tasks get
    │
    ├── 提取摘要、负责人、截止时间 → 生成任务状态记忆
    ├── 提取子任务 → 生成分层任务记忆
    └── 关联任务清单上下文
```

### 4.2 记忆条目中的引用存储规范

对于从飞书获取的信息，记忆条目中应记录以下溯源字段：

```json
{
  "source": {
    "platform": "feishu",
    "source_type": "chat_message | document | document_media | mail | calendar_event | task | meeting | base_record",
    "chat_id": "oc_xxx",
    "message_id": "om_xxx",
    "sender_open_id": "ou_xxx",
    "sender_name": "用户名称（通过 contact 解析）",
    "timestamp": "2026-04-26T00:53:00+08:00",
    "document_id": "doxcnxxx",
    "revision_id": 629,
    "file_token": "xxx",
    "wiki_token": "wikcnxxx",
    "task_guid": "xxx",
    "meeting_id": "xxx",
    "mail_message_id": "xxx"
  },
  "raw_refs": {
    "file_key": "file_v3_xxx",
    "img_key": "img_v3_xxx",
    "media_token": "MXjPb4stWoupDKxro8pcnvpKnke"
  }
}
```

**设计意图**：保留原始资源标识，以便在需要时重新拉取或验证。

### 4.3 异步与按需的权衡策略

| 信息类型 | 建议策略 | 理由 |
|---------|---------|------|
| 文本消息 | **即时提取** | 成本低，可直接生成摘要 |
| 文档链接 | **延迟提取** | 放入队列异步处理，避免阻塞 |
| 文件 | **按需提取** | 下载和解析成本高，仅在记忆被查询时触发 |
| 图片 | **按需提取** | VLM 调用成本高，建议按需处理 |
| 文档内嵌图片 | **按需提取** | 需要先 XML 解析再下载，流程较长 |
| 邮件 | **事件驱动** | 通过 `mail +watch` 实时监听，即时提取 |
| 日历事件 | **事件驱动** | 通过 event subscribe 监听变更 |
| 任务变更 | **事件驱动** | 通过 event subscribe 监听变更 |
| 会议纪要 | **按需提取** | 会议结束后统一提取摘要 |
| Base 记录变更 | **事件驱动+历史回溯** | 利用 `+record-history-list` 追踪变更 |

---

## 五、记忆价值评估矩阵

为帮助记忆系统设计时进行数据源优先级取舍，以下从**信息密度**、**结构化程度**、**变更频率**、**版本追踪能力**、**被动感知能力**五个维度对各数据源进行评估。

| 数据源 | 信息密度 | 结构化程度 | 变更频率 | 版本追踪 | 被动感知 | 综合价值 | 核心用途 |
|--------|---------|-----------|---------|---------|---------|---------|---------|
| **会议纪要** | 极高 | 高（AI已摘要） | 低 | 无 | 无 | ★★★★★ | 决策结论、行动项、讨论要点 |
| **云文档** | 高 | 中 | 中 | 有限（revision_id可用但不可枚举） | 有（事件） | ★★★★★ | 方案、PRD、规范、知识沉淀 |
| **任务** | 高 | 高 | 中 | 无 | 有（事件） | ★★★★☆ | 行动项、责任人、截止日期、状态 |
| **OKR** | 极高 | 高 | 低（周期制） | 无 | 无 | ★★★★☆ | 战略目标、优先级、进展对齐 |
| **邮件** | 高 | 中 | 中 | 无 | 有（watch） | ★★★★☆ | 正式通知、跨团队沟通、决策记录 |
| **日历事件** | 中 | 高 | 中 | 无 | 有（事件） | ★★★☆☆ | 时间线、参与人、会议主题 |
| **群聊消息** | 中 | 低 | 极高 | 无 | 有（事件） | ★★★☆☆ | 日常沟通、链接分享、快速决策 |
| **Base/多维表格** | 高 | 极高 | 高 | **有（record-history）** | 有（事件） | ★★★★★ | 结构化数据、项目追踪、变更审计 |
| **幻灯片** | 高 | 中 | 低 | 无 | 无 | ★★★☆☆ | 汇报结论、数据洞察、方案展示 |
| **审批** | 高 | 高 | 低 | 有（流程状态） | 有（事件） | ★★★☆☆ | 流程决策、权限变更、合规记录 |
| **电子表格** | 中 | 高 | 中 | 无 | 无 | ★★☆☆☆ | 数据表、统计、轻量数据库 |
| **文件（PDF/Word）** | 中 | 低 | 低 | 无 | 无 | ★★☆☆☆ | 附件内容、报告、合同 |
| **图片** | 可变 | 无 | 低 | 无 | 无 | ★★☆☆☆ | 截图、设计稿、照片（需VLM解析） |

### 关键洞察

1. **会议纪要和云文档是信息密度最高的来源**，应作为记忆提取的优先目标。会议纪要已通过飞书 AI 完成初步结构化，直接可用。
2. **Base/多维表格是唯一原生支持版本历史的数据源**，其 `+record-history-list` 能力对记忆系统的"冲突检测"和"变化归因"极具战略价值。
3. **群聊消息变更频率极高但信息密度低**，不建议全量记忆，应聚焦于链接分享、@提及、关键决策句等信号提取。
4. **OKR 变更频率低但战略价值高**，适合作为"背景记忆"（contextual memory）注入到长期对话中。
5. **被动感知能力决定了实时性**：具备事件订阅的数据源（消息、文档、日历、任务、Base、审批、邮件）可实现近实时记忆更新；无事件订阅的数据源（幻灯片、电子表格、文件）依赖主动轮询或按需拉取。

---

## 六、所需权限汇总

记忆系统在实际部署时，需要根据接入的数据源申请对应的 scope。以下是各数据源所需权限的完整清单。

### 6.1 即时通讯

| 所需能力 | 所需 scope |
|---------|-----------|
| 读取群聊消息 | `im:message:readonly` |
| 发送消息 | `im:message:send` |
| 搜索消息 | `im:message:readonly` |
| 获取群成员 | `im:chat.members:read` |
| 搜索群聊 | `im:chat:read` |
| 下载消息资源 | `im:resource` |
| 消息表情 | `im:message.reactions:read`, `im:message.reactions:write_only` |

### 6.2 云文档与云盘

| 所需能力 | 所需 scope |
|---------|-----------|
| 读取文档内容 | `docx:document:readonly` |
| 下载文档内图片 | `docs:document.media:download` |
| 搜索文件 | `drive:drive.metadata:readonly` |
| 文件上传/下载 | `space:document:retrieve`, `docs:document.media:upload` |
| 创建文件夹 | `space:folder:create` |
| 文档评论读取 | `docs:document.comment:read` |
| 文档评论写入 | `docs:document.comment:create` |
| 文档权限管理 | `docs:permission.member:create` |
| 访问记录 | `drive:file:view_record:readonly` |
| 幻灯片读取 | `slides:presentation:read` |

### 6.3 邮件

| 所需能力 | 所需 scope |
|---------|-----------|
| 读取邮件 | `mail:user_mailbox.message:readonly`, `mail:user_mailbox.message.body:read` |
| 监听新邮件 | `mail:event` |

### 6.4 日历

| 所需能力 | 所需 scope |
|---------|-----------|
| 读取事件 | `calendar:calendar:readonly` |
| 忙闲查询 | `calendar:calendar:readonly` |

### 6.5 任务

| 所需能力 | 所需 scope |
|---------|-----------|
| 读取任务 | `task:task:read`, `task:tasklist:read` |
| 创建/更新任务 | `task:task:write`, `task:tasklist:write` |

### 6.6 Base/多维表格

| 所需能力 | 所需 scope |
|---------|-----------|
| 读取记录 | `bitable:app:readonly` |
| 记录历史 | `bitable:app:readonly` |
| 数据查询 | `bitable:app:readonly` |

### 6.7 会议与妙记

| 所需能力 | 所需 scope |
|---------|-----------|
| 搜索妙记 | `vc:meeting:readonly` |
| 获取会议纪要 | `vc:meeting:readonly` |

### 6.8 通讯录

| 所需能力 | 所需 scope |
|---------|-----------|
| 读取用户信息 | `contact:user:readonly` |
| 搜索用户 | `contact:user:readonly` |

### 6.9 审批

| 所需能力 | 所需 scope |
|---------|-----------|
| 读取审批实例 | `approval:instance:readonly` |

### 6.10 OKR

| 所需能力 | 所需 scope |
|---------|-----------|
| 读取 OKR | `okr:okr.content:readonly` |

### 6.11 事件订阅

| 所需能力 | 所需 scope / 配置 |
|---------|------------------|
| 消息事件 | `im:message:readonly` + 事件配置 `im.message.receive_v1` |
| 文档事件 | `drive:drive.metadata:readonly` + 事件配置 `drive.file.deleted_v1` 等 |
| 日历事件 | `calendar:calendar:readonly` + 事件配置 `calendar.calendar.event.changed_v1` |
| 任务事件 | `task:task:read` + 事件配置 `task.task.updated_v1` |
| 审批事件 | `approval:instance:readonly` + 事件配置 `approval.instance.updated_v1` |
| 邮件事件 | `mail:event` + 事件配置 `mail.user_mailbox.event.message_received_v1` |

> **部署建议**：实际申请权限时，优先申请**读取类 scope**。写入类 scope（如发送消息、创建任务、添加评论）仅在记忆系统需要主动输出（如提醒、生成报告）时才需要。

---

## 七、已知限制与注意事项

### 5.1 路径限制

`im +messages-resources-download` 和 `docs +media-download` 的 `--output` 参数**仅支持相对路径**，使用绝对路径会返回验证错误：
```json
{
  "ok": false,
  "error": {
    "type": "validation",
    "message": "absolute paths are not allowed"
  }
}
```

** workaround**：在执行命令前 `cd` 到目标目录，或使用相对路径。

### 5.2 身份权限

- 部分文档/群聊可能仅对特定身份（user vs bot）可见
- `lark-cli` 支持 `--as user` 和 `--as bot` 切换身份，遇到权限问题时建议尝试切换
- 邮箱写操作（发送、回复、转发）**仅支持 user 身份**

### 5.3 资源有效期

- `docs +fetch` 返回的 Markdown 中，图片的 `href` URL 包含临时 authcode，有过期风险
- **不要长期存储 href URL**，应存储 `src`（file_token），需要时调用 `+media-download`

### 5.4 格式兼容性

- `--detail with-ids` **仅支持** `--doc-format xml`
- 如需同时获取 Markdown 内容和图片标识，需要**两次独立的 fetch 调用**

### 5.5 文档版本历史

- `docs +fetch` 支持 `--revision-id` 获取指定版本内容
- **但无法枚举版本历史**（`GET /open-apis/docx/v1/documents/{id}/versions` 返回 404）
- 这意味着无法被动感知"文档何时变更"，必须依赖 event subscribe 或其他机制

### 5.6 事件订阅配置

- `lark-event +subscribe` 需要先在飞书开发者后台配置事件订阅权限
- 不同事件类型需要不同的 scope 和事件配置
- 不是所有事件类型都默认开启，需要按需申请

---

## 八、命令速查表

### 6.1 即时通讯

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 列出群聊消息 | `im +chat-messages-list` | `--chat-id` |
| 批量获取消息详情 | `im +messages-mget` | 消息 ID 列表 |
| 搜索消息 | `im +messages-search` | `--query` |
| 下载群聊文件 | `im +messages-resources-download` | `--message-id`, `--file-key`, `--type file` |
| 下载群聊图片 | `im +messages-resources-download` | `--message-id`, `--file-key`, `--type image` |
| 搜索群聊 | `im +chat-search` | `--query` |
| 获取群成员 | `im chat.members get` | `--params '{"chat_id":"xxx"}'` |
| 发送消息 | `im +messages-send` | `--chat-id` 或 `--user-id` |

### 6.2 云文档

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 获取文档内容 | `docs +fetch` | `--doc`, `--doc-format`, `--detail` |
| 下载文档内图片 | `docs +media-download` | `--token` |
| 搜索文档 | `drive +search` | `--query` |
| 查询 wiki 节点 | `wiki spaces get_node` | `--params '{"token":"xxx"}'` |

### 6.3 云盘

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 搜索文件 | `drive +search` | `--query` |
| 上传文件 | `drive +upload` | `--folder-token`, `--file` |
| 下载文件 | `drive +download` | `--token`, `--output` |
| 创建文件夹 | `drive +create-folder` | `--name` |
| 导出文档 | `drive +export` | `--token`, `--type` |
| 添加评论 | `drive +add-comment` | `--doc`, `--content` |
| 查询评论 | `drive file.comments list` | `--params '{"file_token":"xxx","is_solved":false}'` |
| 查询访问记录 | `drive file.view_records list` | `--params '{"token":"xxx"}'` |

### 6.4 邮件

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 收件箱摘要 | `mail +triage` | `--query`, `--folder-id` |
| 读取邮件 | `mail +message` | `--message-id` |
| 读取会话 | `mail +thread` | `--thread-id` |
| 监听新邮件 | `mail +watch` | WebSocket |

### 6.5 日历

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 事件列表 | `calendar events list` | `--params '{"start_time":"...","end_time":"..."}'` |
| 事件详情 | `calendar events get` | `--params '{"event_id":"xxx"}'` |
| 忙闲查询 | `calendar freebusy list` | `--params '{"time_min":"...","time_max":"..."}'` |

### 6.6 任务

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 我的任务 | `task +get-my-tasks` | - |
| 相关任务 | `task +get-related-tasks` | - |
| 搜索任务 | `task +search` | `--query` |
| 任务详情 | `task tasks get` | `--params '{"task_guid":"xxx"}'` |
| 创建任务 | `task +create` | `--summary` |
| 完成任务 | `task +complete` | `--task-guid` |
| 清单列表 | `task tasklists list` | - |

### 6.7 Base/多维表格

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 表列表 | `base tables list` | `--params '{"app_token":"xxx"}'` |
| 记录列表 | `base records list` | `--params '{"app_token":"xxx","table_id":"xxx"}'` |
| 记录历史 | `base +record-history-list` | `--app-token`, `--table-id`, `--record-id` |
| 数据查询 | `base +query` | `--app-token`, `--sql` |

### 6.8 会议/妙记

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 搜索妙记 | `minutes search` | `--params '{"query":"xxx"}'` |
| 妙记详情 | `minutes get` | `--params '{"minutes_id":"xxx"}'` |
| 会议纪要 | `vc +notes` | `--meeting-id` |

### 6.9 通讯录

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 当前用户 | `contact +get-user` | - |
| 指定用户 | `contact +get-user` | `--user-id` |
| 搜索用户 | `contact +search-user` | `--query` |

### 6.10 OKR

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 周期列表 | `okr +cycle-list` | `--user-id` |
| 周期详情 | `okr +cycle-detail` | `--cycle-id` |

### 6.11 幻灯片

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 读取全文 | `slides xml_presentations get` | `--params '{"xml_presentation_id":"xxx"}'` |
| 读取单页 | `slides xml_presentation.slide get` | `--params '{"xml_presentation_id":"xxx","slide_id":"xxx"}'` |

### 6.12 事件订阅

| 目标 | 命令 | 关键参数 |
|------|------|---------|
| 实时事件监听 | `event +subscribe` | `[--compact]`, `[--route]` |

---

## 九、附录：测试环境信息

- **测试时间**：2026-04-28
- **lark-cli 版本**：1.0.19
- **测试账号**：user 身份（李治淳）和 bot 身份（openclaw）
- **测试群聊**：`oc_ceeec80e5bfce482978ccc7164f18a32`
- **测试文档**：wiki `Kix4wITfBiKcWYk7KtLcds2Zn1l`

---

*本文档为记忆系统设计的输入依据，后续规范迭代时应同步更新。*
