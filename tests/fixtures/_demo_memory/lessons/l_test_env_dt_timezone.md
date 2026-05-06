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
