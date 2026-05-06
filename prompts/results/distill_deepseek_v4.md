===FILE: projects/omega/decisions/d_caching_redis_over_memcached.md===
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
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_013
    timestamp: 2026-04-22T09:50:00+08:00
    quote: "缓存方案就用 Redis 了。理由：① 团队已有运维经验，② 后面我们要做用户登录态的持久化"
    speaker: ou_pm_lin
---

# Omega 看板缓存方案：选用 Redis，否决 Memcached

林老板最终拍板：缓存层使用 Redis。核心理由：(1) 团队已有 Redis 运维经验，可降低上手成本；(2) 后续需支持用户登录态持久化，Redis 是必然选择。Memcached 虽有 read latency 优势（低约 30%），但当前版本用不上该性能特性，且需额外搭建监控体系。

阿亮虽保留意见但服从决定，后续测试环境跑通后也认可了 Redis 的稳定性。

===FILE: projects/omega/decisions/d_caching_query_level.md===
===
id: mem_d_query_level_cache
type: decision
tense: past
source: passive
subject: 3rd
structure: event
abstraction: fact
status: active
confidence: 0.95
importance: 0.75
created_at: 2026-04-24T14:40:00+08:00
visibility: team
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_039
    timestamp: 2026-04-24T14:40:00+08:00
    quote: "OK，定 query 级。"
    speaker: ou_pm_lin
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_038
    timestamp: 2026-04-24T14:37:00+08:00
    quote: "我的 vote 也是 query 级。"
    speaker: ou_yl_alex
---

# 缓存粒度：采用 query 级缓存

经团队讨论，缓存粒度选用 query 级（而非 result 级）。小陈和阿亮均 vote query 级，理由：命中率更高。林老板拍板确认。这对后续缓存 key 设计和失效策略有直接约束。

===FILE: tasks/completed/t_redis_integration_by_chen.md===
===
id: mem_t_redis_integration_chen
type: task
tense: past
source: passive
subject: 3rd
structure: event
abstraction: fact
status: completed
confidence: 0.95
importance: 0.7
created_at: 2026-04-25T11:00:00+08:00
visibility: team
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_041
    timestamp: 2026-04-25T11:00:00+08:00
    quote: "Redis 集成完成，PR #123 已经发，麻烦大家 review。测试环境跑通了。"
    speaker: ou_chen_xb
---

# 小陈完成 Redis 集成到测试环境

小陈于周五（4/25）完成 Redis 集成，已发 PR #123，测试环境验证通过。原承诺为"周五前给到测试环境"（om_015），按时履行。

===FILE: tasks/active/t_q1_index_optimization_alex.md===
===
id: mem_t_q1_index_alex
type: task
tense: future
source: passive
subject: 2nd:ou_yl_alex
structure: event
abstraction: fact
status: active
confidence: 0.9
importance: 0.7
created_at: 2026-04-24T11:05:00+08:00
visibility: team
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_035
    timestamp: 2026-04-24T11:05:00+08:00
    quote: "我接，下周二前能搞定。"
    speaker: ou_yl_alex
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_034
    timestamp: 2026-04-24T11:00:00+08:00
    quote: "测试反馈：Q1 旧数据查询非常慢，10 秒以上，需要加索引。建议 (project_id, dt) 上加复合索引。"
    speaker: ou_wang_qa
---

# 阿亮：Q1 旧数据查询性能优化，下周二前完成

QA 反馈 Q1 旧数据查询延迟 10 秒以上，建议在 (project_id, dt) 上建复合索引。阿亮认领，承诺下周二（4/29）前搞定。这是性能关键路径任务。

===FILE: tasks/active/t_prd_v1_by_me.md===
===
id: mem_t_prd_v1
type: task
tense: future
source: passive
subject: 1st
structure: event
abstraction: fact
status: active
confidence: 0.9
importance: 0.85
created_at: 2026-04-23T11:02:00+08:00
visibility: private
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_023
    timestamp: 2026-04-23T11:00:00+08:00
    quote: "@我 PRD 周四前给我一版，按上次那种风格——开头先放 user story，技术细节放最后"
    speaker: ou_pm_lin
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_024
    timestamp: 2026-04-23T11:02:00+08:00
    quote: "好。"
    speaker: ou_me_lzc
---

# PRD v1 已答应周四前交付，按林老板的专属风格写

向林老板承诺的 PRD 版本。必须遵循他指定的格式：user story 开头、技术细节放最后、中间穿插 mock 图、不堆功能列表。这是对我风格偏好的显式约束。截至窗口结束未收到完成确认，需跟踪。

===FILE: tasks/active/t_customer_x_default_view_confirmation.md===
===
id: mem_t_customer_x_default
type: task
tense: future
source: passive
subject: 1st
structure: event
abstraction: fact
status: active
confidence: 0.6
importance: 0.8
created_at: 2026-04-25T16:52:00+08:00
visibility: private
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_044
    timestamp: 2026-04-25T16:50:00+08:00
    quote: "@我 哎客户 X 那个上周数据默认的事，到底怎么处理啊，我看群里没结论。"
    speaker: ou_pm_lin
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_045
    timestamp: 2026-04-25T16:52:00+08:00
    quote: "我看一下，下午回。"
    speaker: ou_me_lzc
---

# 客户 X 反馈的"默认打开上周数据"需求，悬而未决，被老板追问

客户 X 反馈希望看板上默认展示上周数据（而非当天）。该需求最早由林老板 4/23 在群里提出（om_020），但一直无人正式认领推进。至 4/25 被林老板再次追问，我回复"看一下，下午回"。该任务尚未有明确方案或截止日期，需尽快闭环。

===FILE: lessons/l_test_env_dt_timezone.md===
===
id: mem_l_test_env_timezone
type: lesson
tense: present
source: passive
subject: 3rd
structure: state
abstraction: pattern
status: active
confidence: 0.95
importance: 0.85
created_at: 2026-04-22T14:20:00+08:00
visibility: team
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_016
    timestamp: 2026-04-22T14:20:00+08:00
    quote: "测试环境的 dt 字段存的是上海时间不是 UTC，之前 Q1 那次就因为这个查错过一周数据。建议 query 时显式 +8:00。"
    speaker: ou_wang_qa
---

# 测试环境 dt 字段是上海时间，查询必须显式指定 +8:00

测试环境的 dt 字段存储的是上海时间（UTC+8），而非 UTC。Q1 曾因此导致查询结果偏移一周的严重数据偏差。每次查询时必须显式添加 `+8:00` 偏移，尤其是做时间窗口过滤时，避免重演该问题。

===FILE: lessons/l_redis_ttl_required.md===
===
id: mem_l_redis_ttl_required
type: lesson
tense: present
source: passive
subject: 3rd
structure: state
abstraction: pattern
status: active
confidence: 0.95
importance: 0.9
created_at: 2026-04-23T15:44:00+08:00
visibility: team
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_028
    timestamp: 2026-04-23T15:44:00+08:00
    quote: "记住：所有缓存 key 必须设 TTL，没特殊原因默认 1h。这个坑我去年踩过，写到 wiki 了。"
    speaker: ou_yl_alex
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_025
    timestamp: 2026-04-23T15:40:00+08:00
    quote: "Redis 测试环境 OOM 了，看板查询全失败"
    speaker: ou_chen_xb
---

# Redis 所有缓存 key 必须设置 TTL，默认 1h

测试环境因缓存 key 未设 TTL 导致 Redis OOM，看板查询全部失败。阿亮已将此条写入团队 wiki，作为硬性规约：所有缓存 key 若无特殊原因必须设 TTL，默认 1 小时。此为已重复出现的坑，必须强制遵守。

===FILE: preferences/per_collaborator/ou_pm_lin.md===
===
id: mem_pref_pm_lin_prd_style
type: preference
tense: present
source: passive
subject: 2nd:ou_pm_lin
structure: state
abstraction: pattern
status: active
confidence: 0.95
importance: 0.8
created_at: 2026-04-23T11:00:00+08:00
visibility: private
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_023
    timestamp: 2026-04-23T11:00:00+08:00
    quote: "@我 PRD 周四前给我一版，按上次那种风格——开头先放 user story，技术细节放最后，中间穿插 mock 图。不要堆功能列表。"
    speaker: ou_pm_lin
---

# 林老板的 PRD 格式偏好

林老板期望的 PRD 结构：(1) 以 user story 开头；(2) 中间穿插 mock 图；(3) 技术细节放最后；(4) 禁止堆砌功能列表。格式为"上次那种风格"，说明曾有成功交付经验。为我与 PM 协作时必须遵守的输出规范。

===FILE: preferences/team/weekly_report_format.md===
===
id: mem_pref_team_weekly_format
type: preference
tense: present
source: passive
subject: 3rd
structure: cycle
abstraction: fact
status: active
confidence: 0.95
importance: 0.9
created_at: 2026-04-21T10:07:00+08:00
visibility: team
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_007
    timestamp: 2026-04-21T10:07:00+08:00
    quote: "每周五下午 5 点前在群里发，标题统一格式：周报-Omega-Wxx。这是硬规定。"
    speaker: ou_pm_lin
---

# 团队周报硬规定：周五下午 5 点前发，标题格式固定

林老板规定：周报每周五下午 5 点前在群内发出（已因 Q2 汇报临时提前，见 supersedes 链），标题统一为 `周报-Omega-Wxx`。"硬规定"表明此为强制要求，不可协商。

===FILE: preferences/team/brand_color_1664ff.md===
===
id: mem_pref_brand_color_1664ff
type: preference
tense: present
source: passive
subject: 3rd
structure: state
abstraction: fact
status: active
confidence: 0.9
importance: 0.65
created_at: 2026-04-22T16:00:00+08:00
visibility: team
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_018
    timestamp: 2026-04-22T16:00:00+08:00
    quote: "前端这次 brand 主色用 #1664FF，按 design 给的稿，不要再调。"
    speaker: ou_yl_alex
---

# 前端品牌主色 #1664FF，锁定

阿亮（前端 lead）明确：本次 brand 主色为 #1664FF，按设计稿执行，不允许再调整。隐含以前曾有擅自修改主色的先例。

===FILE: people/ou_yl_alex/alex_chen_tech_disagree_but_align.md===
===
id: mem_rel_alex_chen_disagree_align
type: relationship
tense: present
source: passive
subject: 3rd
structure: state
abstraction: pattern
status: active
confidence: 0.85
importance: 0.65
created_at: 2026-04-22T09:51:00+08:00
visibility: team
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_014
    timestamp: 2026-04-22T09:51:00+08:00
    quote: "OK，我保留意见但服从决定。👍"
    speaker: ou_yl_alex
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_046
    timestamp: 2026-04-25T17:00:00+08:00
    quote: "Memcached 那个事我服气了，Redis 跑测试环境表现很稳。"
    speaker: ou_yl_alex
---

# 阿亮与陈 有技术分歧但服判，且会事后承认他人正确

阿亮和小陈在缓存技术选型上常有分歧（阿亮倾向性能优先如 Memcached，小陈倾向运维可行性如 Redis），但一旦决策做出，阿亮会保留意见但服从，且在实际验证后会坦率承认对方正确。这是一种健康的建设性异议模式。

===FILE: people/ou_pm_lin/lin_assigns_docs_to_me.md===
===
id: mem_rel_pm_lin_assigns_docs_style
type: relationship
tense: present
source: passive
subject: 2nd:ou_pm_lin
structure: state
abstraction: pattern
status: active
confidence: 0.85
importance: 0.7
created_at: 2026-04-23T11:02:00+08:00
visibility: private
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_023
    timestamp: 2026-04-23T11:00:00+08:00
    quote: "@我 PRD 周四前给我一版，按上次那种风格"
    speaker: ou_pm_lin
---

# 林老板倾向直接给我分配 PRD/文档类任务，且对风格有明确要求

林老板与我的协作模式中，PM 倾向于直接让我负责 PRD 等文档类交付，且每次都会附带明确的格式/风格指令。表明我这侧是他交付这类任务的可信接口。

===FILE: tasks/active/t_weekly_report_v2_sunday_noon.md===
===
id: mem_t_weekly_report_v2
type: task
tense: future
source: passive
subject: 3rd
structure: cycle
abstraction: fact
status: active
confidence: 0.95
importance: 0.9
created_at: 2026-04-24T09:15:00+08:00
visibility: team
supersedes: [mem_t_weekly_report_v1]
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_030
    timestamp: 2026-04-24T09:15:00+08:00
    quote: "重要变更：本周周报提前到周日下午前发，因为周一一早老板那边要听 Q2 项目汇报"
    speaker: ou_pm_lin
---

# 周报提交 deadline 本周临时改为周日下午前

因 Q2 项目汇报需要，林老板将本周周报提交时间从周五下午 5 点提前至周日下午前。这是临时变更，原规则（周五下午 5 点）在非汇报周可能恢复，需注意区分。

===FILE: _archive/t_weekly_report_v1_friday.md===
===
id: mem_t_weekly_report_v1
type: task
tense: future
source: passive
subject: 3rd
structure: cycle
abstraction: fact
status: superseded
superseded_by: mem_t_weekly_report_v2
confidence: 0.95
importance: 0.9
created_at: 2026-04-21T10:07:00+08:00
visibility: team
evidence:
  - source: feishu_chat
    chat_id: oc_omega_team_2026
    msg_id: om_007
    timestamp: 2026-04-21T10:07:00+08:00
    quote: "每周五下午 5 点前在群里发，标题统一格式：周报-Omega-Wxx。这是硬规定。"
    speaker: ou_pm_lin
---

# 周报提交 deadline：每周五下午 5 点（本周已改期）

原定每周五下午 5 点前提交周报。于 2026-04-24 被林老板临时变更为本周日中午前（见 mem_t_weekly_report_v2）。此条目保留作为版本链。

===FILE: MEMORY.md===
- [mem_d_redis_chosen] decision | 缓存方案选用 Redis，否决 Memcached（理由：运维经验+持久化需求） | importance:0.9
- [mem_d_query_level_cache] decision | 缓存粒度采用 query 级（小陈、阿亮均 vote） | importance:0.75
- [mem_t_redis_integration_chen] task | 小陈完成 Redis 集成到测试环境，PR #123 已发（completed） | importance:0.7
- [mem_t_q1_index_alex] task | 阿亮认领 Q1 索引优化，下周二前完成 | importance:0.7
- [mem_t_prd_v1] task | PRD v1 周四前交付，按 PM 指定格式（user story 开头，不加功能列表） | importance:0.85
- [mem_t_customer_x_default] task | 客户 X 反馈"默认上周数据"需求，悬而未决，被老板追问 | importance:0.8
- [mem_l_test_env_timezone] lesson | 测试环境 dt 字段是上海时间，查询必须显式 +8:00 | importance:0.85
- [mem_l_redis_ttl_required] lesson | Redis 所有缓存 key 必须设 TTL，默认 1h（写入 wiki） | importance:0.9
- [mem_pref_pm_lin_prd_style] preference | PM 林老板的 PRD 格式偏好：user story 开头、mock 图居中、技术细节放最后 | importance:0.8
- [mem_pref_team_weekly_format] preference | 团队周报硬规定：周五下午 5 点发，标题"周报-Omega-Wxx" | importance:0.9
- [mem_pref_brand_color_1664ff] preference | 前端品牌主色 #1664FF，不要再调 | importance:0.65
- [mem_rel_alex_chen_disagree_align] relationship | 阿亮与小陈有技术分歧但服判，事后会承认他人正确 | importance:0.65
- [mem_rel_pm_lin_assigns_docs_style] relationship | PM 倾向直接给我分配 PRD/文档类任务，且附带明确格式要求 | importance:0.7
- [mem_t_weekly_report_v2] task | 周报本周临时改为周日下午前提交（supersedes v1） | importance:0.9
- [mem_t_weekly_report_v1] task | 周报原定每周五下午 5 点提交（已 superseded） | importance:0.9