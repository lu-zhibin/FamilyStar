# 核心数据模型

## 定位

任务 2.1 使用 Prisma 6.19.2 描述 PostgreSQL 16 核心数据结构，后续阶段追加可靠事件、凭证保险库、身份保护、打卡媒体、提交审核、协作奖励和奖励兑换保护。阶段 7 为兑换追加请求指纹，为愿望追加取消与采纳时间，并以 SQL 约束保护兑换和愿望状态一致性、退款唯一性及频次查询。

## 聚合

| 领域 | 核心模型 | 关键规则 |
|---|---|---|
| 家庭与身份 | `Family`、`User`、`Invitation` | 用户属于单个家庭，家庭创建者使用可空循环外键 |
| 任务 | `TaskTypeTemplate`、`TaskType`、`Task`、`TaskAssignment` | 全局模板复制为家庭私有任务类型 |
| 协作 | `CollaborationRound`、`CollaborationRoundParticipant`、`CollaborationSubmission`、`CollaborationSubmissionAttempt` | 周期、参与者和孩子提交均使用业务唯一键，参与者保存奖励基础与实得快照，attempt 保存重提历史 |
| 单人打卡 | `CheckIn`、`CheckInSubmissionAttempt` | 聚合根保存最新状态，attempt 保存不可变内容与旧审核快照 |
| 提交审核 | `SubmissionReview` | 关联单人或协作 attempt，保存家庭幂等键、最终决策、人工/超时来源、原因、可空审核人和审核时间 |
| 媒体 | `MediaAsset`、`MediaUploadSession`、`MediaUploadPart`、`CheckInMedia`、`CollaborationSubmissionMedia` | 数据库存对象键、multipart 恢复状态和有序业务关联 |
| 积分等级 | `PointsLog`、`LevelConfig`、`LevelReward` | 用户缓存余额、累计积分、等级和乐观锁版本 |
| 奖励愿望 | `Reward`、`Redemption`、`Wish` | 奖励保存库存计数，兑换保存价格与折扣快照、家庭级幂等键和状态审计字段，愿望保存终态时间 |
| 审计 | `AuditLog` | 保存家庭、操作者、业务键、请求 ID、结果和 UTC 时间 |
| 可靠事件 | `OutboxEvent` | 保存事件信封、投递时间、尝试次数、租约和发布结果 |
| 家庭集成 | `FamilyIntegrationSetting` | 家庭内邮件/COS 唯一，非敏感配置与信封密文字段分离 |

## 家庭边界

除 `Family` 自身和全局 `TaskTypeTemplate` 外，核心业务模型均包含 UUID `family_id`。后续数据访问服务必须从认证上下文注入家庭条件，并校验关联实体属于同一家庭。

## 一致性

- UUID 主键由 PostgreSQL `gen_random_uuid()` 生成。
- 服务端时间使用 `TIMESTAMPTZ(3)`，业务日期使用 `DATE`。
- 用户余额、累计积分和版本号使用整数。
- `PointsLog` 唯一业务键防止同一业务重复记账，SQL CHECK 保证余额守恒和流水方向。
- 单人打卡 EARN 使用 `(EARN, check_in, checkInId, childId)`，同时递增当前余额、累计获得积分和用户版本，并将动态倍率与实际积分保存到 `CheckIn` 快照。
- 协作周期 EARN 使用 `(EARN, collaboration_round, roundId, childId)`，按每个活动参与者的 `rewardPointsSnapshot` 计算积分，并将实得积分与倍率保存到参与者快照。
- 用户乐观更新同时限定 `id`、`family_id`、`version` 和活动状态；版本冲突使完整事务回滚并重试。
- EARN 使用变更后的累计积分派生最高资格等级，并以缓存等级和资格等级的最大值同步 `current_level`；跨级升级与积分流水共享事务。
- `Redemption` 的 `(family_id, idempotency_key)` 负责最终幂等保护。
- 兑换退款使用 `points_logs_redemption_refund_once_idx` 保证每个 `redemption` 业务 ID 最多一条 REFUND。
- `redemptions_status_consistency_check` 和 `wishes_status_adoption_consistency_check` 保护终态时间、操作者与关联奖励字段。
- 协作周期的 `(task_id, round_number)` 和参与者的 `(round_id, child_id)` 保证重复调度安全。
- `collaboration_round_participants_award_snapshot_check` 要求参与者 `points_earned` 与 `streak_multiplier` 同时为空，或同时为正值。
- 单人和协作提交分别以家庭幂等键防止重复写入；同一聚合的 attempt number 唯一且递增。
- 提交审核以 `(family_id, idempotency_key)` 保证家庭级请求幂等；单人和协作 attempt 外键分别唯一，确保每次 attempt 最多对应一条审核记录。
- `submission_reviews_target_check` 保证目标类型与两个可空 attempt 外键严格对应，`submission_reviews_rejection_reason_check` 保证拒绝决策包含去除空白后非空的原因。
- `submission_reviews_source_reviewer_check` 要求 `PARENT` 来源具有审核人，并要求 `TIMEOUT` 来源的审核人为空。
- 媒体上传会话使用家庭幂等键，分片以 `(upload_session_id, part_number)` 唯一，状态约束保护初始化、上传、完成、就绪和失败转换。
- 奖励库存 CHECK 保证总量、预占量和消耗量保持合法容量关系。
- Outbox CHECK 保证尝试次数非负、发布时间不早于发生时间、租约字段成对存在且事件名带正版本号。
- Outbox claim 索引按发布状态、可投递时间和创建时间支持稳定批处理，Worker 使用 `FOR UPDATE SKIP LOCKED` 并发 claim。
- `WorkerJobRun` 按 `(job_name, run_key)` 唯一，记录 `RUNNING`、`SUCCEEDED` 或 `FAILED` 状态、尝试次数、结果摘要、脱敏错误码和下次重试时间，为 Redis 锁之外提供数据库最终防重。
- 家庭集成记录以 `(family_id, integration_type)` 唯一，SQL CHECK 固定 12 字节 nonce、16 字节认证标签和 32 字节包裹数据密钥。
- 待处理邀请以家庭和规范化邮箱唯一，状态 CHECK 约束接受人和接受时间仅随 `ACCEPTED` 同时存在。
- 用户角色凭据 CHECK 要求家长具备邮箱和家长密码哈希，孩子具备凭据类型、bcrypt cost 12 哈希与性别，并保持两组凭据字段互斥。

## 软删除

家庭、用户、任务类型、任务、任务分配、打卡、媒体资产、奖励和愿望使用 `deleted_at`。默认查询应过滤已删除记录，审计、流水和不可变关联历史保持保留。

## 验证

`pnpm verify:data-model` 同时读取 Prisma Schema 和按目录排序的完整迁移历史，验证 28 个核心模型、家庭字段、软删除字段、业务唯一键、Outbox、凭证、媒体、审核、协作奖励及关键 CHECK 与索引。真实数据库迁移通过 `pnpm db:migrate:deploy` 应用，并要求显式 `DATABASE_URL`。
