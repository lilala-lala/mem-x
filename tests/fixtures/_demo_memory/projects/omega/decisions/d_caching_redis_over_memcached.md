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
