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
