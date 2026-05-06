# Feishu Context Memory Index

Total: 15 entries | Active: 12

- [mem_t_customer_x_default] task | 客户 X 反馈的"默认打开上周数据"需求，悬而未决，被老板追问 | importance:0.8
- [mem_t_prd_v1] task | PRD v1 已答应周四前交付，按林老板的专属风格写 | importance:0.85
- [mem_t_q1_index_alex] task | 阿亮：Q1 旧数据查询性能优化，下周二前完成 | importance:0.7
- [mem_d_query_level_cache] decision | 缓存粒度：采用 query 级缓存 | importance:0.75
- [mem_d_redis_chosen] decision | Omega 看板缓存方案：选用 Redis，否决 Memcached | importance:0.9
- [mem_pref_brand_color_1664ff] preference | 前端品牌主色 #1664FF，锁定 | importance:0.65
- [mem_pref_team_weekly_format] preference | 团队周报硬规定：周五下午 5 点前发，标题格式固定 | importance:0.9
- [mem_pref_pm_lin_prd_style] preference | 林老板的 PRD 格式偏好 | importance:0.8
- [mem_rel_alex_chen_disagree_align] relationship | 阿亮与陈 有技术分歧但服判，且会事后承认他人正确 | importance:0.65
- [mem_rel_pm_lin_assigns_docs_style] relationship | 林老板倾向直接给我分配 PRD/文档类任务，且对风格有明确要求 | importance:0.7
- [mem_l_redis_ttl_required] lesson | Redis 所有缓存 key 必须设置 TTL，默认 1h | importance:0.9
- [mem_l_test_env_timezone] lesson | 测试环境 dt 字段是上海时间，查询必须显式指定 +8:00 | importance:0.85