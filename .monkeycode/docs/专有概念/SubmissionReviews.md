# 提交审核

## 定位

审核领域为单人打卡与协作提交提供家长人工审核、家庭规则驱动的超时自动通过、积分事务和动态 Streak。产品补全任务 6.2 进一步补齐实际审核截止时间、超时状态、家庭审核历史筛选、凭证弹窗键盘交互和冲突后的权威状态刷新。实现位于 `apps/api/src/check-ins/review-*` 与 `apps/web/components/parent-portal.tsx`，覆盖队列读取、审核决策、历史查询、家庭隔离、有界候选批次、幂等重试和并发保护。

## 审核目标

| 目标类型 | 当前聚合 | 历史关联 |
|---|---|---|
| `CHECK_IN` | `CheckIn` | 最新 `CheckInSubmissionAttempt` |
| `COLLABORATION_SUBMISSION` | `CollaborationSubmission` | 最新 `CollaborationSubmissionAttempt` |

每次审核只接受 `APPROVED` 或 `REJECTED`。拒绝原因在领域层去除首尾空白后必须非空，HTTP 层将 reason 长度限制为 2000 字符。

## 待审队列

`listPendingReviews()` 分别读取当前家庭仍为 `PENDING` 的单人打卡和协作提交。聚合状态是待审资格的唯一依据，latest attempt 只提供内容、媒体和提交时间快照。Prisma 查询同时限定家庭、活动任务、活动孩子和未软删除目标；两类结果合并后按提交时间、目标类型和目标 ID 稳定排序，最多返回 100 条。

队列记录提供目标与 attempt ID、任务与孩子摘要、可空文字、媒体 ID/类型以及提交时间。服务根据家庭 `reviewTimeoutHours` 派生 `review_deadline_at` 和 `is_overdue`；配置值为 0 时截止时间返回 `null`，页面说明仅由家长人工处理。媒体访问继续通过同家庭 `GET /api/v1/media/:id/access-url` 获取短期 URL。

家长 Web 页面为每个 attempt 和决定生成 `review:<attemptId>:<APPROVED|REJECTED>` 幂等键。审核 POST 成功后立即重新 GET 权威队列和家庭历史。写入返回 `409` 时，页面同时刷新待审队列、目标审核历史和家庭审核历史；服务端已有终态时保留当前卡片和原因输入，显示权威结果并移除重复审核动作。

凭证弹窗打开后聚焦关闭按钮，并将 Tab 与 Shift+Tab 约束在弹窗内。Escape 关闭弹窗，左右方向键切换前后凭证，关闭后焦点恢复到“查看凭证”触发按钮。

## 权限与家庭边界

审核写入和历史查询均从 `familystar_session` Cookie 读取会话。服务要求角色为 `parent`，并从会话注入 `familyId` 和审核人 ID。Prisma 查询和条件更新同时限定家庭 ID，其他家庭的目标对当前调用方不可见。

## 写入流程

```mermaid
flowchart LR
    Request["家长审核请求"] --> Idempotency["查询家庭幂等键"]
    Idempotency --> Lock["获取目标级 Redis owner-lock"]
    Lock --> Recheck["锁内复查幂等键"]
    Recheck --> Transaction["Prisma 事务"]
    Transaction --> Update["条件更新 PENDING 聚合"]
    Update --> History["创建 attempt 级 SubmissionReview"]
    History --> Award["APPROVED 计算单人积分或尝试完成协作周期"]
    Award --> Release["按 owner token 释放锁"]
```

目标锁 TTL 为 10 秒，键由 `reviewLock(targetType, targetId)` 构造。锁释放使用比较 owner token 的 Lua 原子操作。人工请求的锁竞争、目标状态竞争和冲突幂等键形成 `409 CONFLICT`；自动审核遇到相同竞争时安全跳过。

## 超时自动通过

`SubmissionReviewTimeoutService.runBatch()` 每次只读取一次有限候选批次。候选覆盖单人打卡与协作提交，并携带最新 attempt 的 `submittedAt` 和所属家庭设置。服务通过 `normalizeFamilySettings()` 取得每条记录自己的 `reviewTimeoutHours`：值为 0 时保持人工审核，缺失或损坏配置回退为 48 小时，到期边界为 `submittedAt + timeout <= now`。

每条到期候选使用与家长审核相同的目标锁，幂等键固定为 `timeout:<targetType>:<attemptId>`。Prisma 事务再次确认候选 attempt 仍为最新 attempt，只对 `PENDING` 聚合执行 `APPROVED` 条件更新，并创建 `TIMEOUT` 历史。家长抢先审核、重提、重复批次、锁竞争和唯一冲突均返回跳过。独立 Worker 按分钟运行键周期调用该单批执行器。

单人打卡通过时，审核事务按 assignment 覆盖或任务基础积分调用共享积分端口；协作提交通过时调用 `completeCollaborationRound()`，并在全部活动参与者均为 `APPROVED` 后按各自奖励快照统一发分。家长审核使用家长作为事件 actor，超时审核使用空 actor。积分 writer 在相同 transaction client 内完成动态 Streak、周期状态、双余额、流水、单人或参与者快照以及 Outbox。

## 幂等语义

审核请求必须携带最长 128 字符的 `Idempotency-Key`。服务在获取锁前后各查询一次 `(family_id, idempotency_key)`：

- 同一键指向同一目标时返回既有审核记录。
- 同一键指向另一目标时返回冲突。
- 数据库唯一冲突发生后，仓储重新查询既有记录并执行相同目标判定。

Redis 锁缩小并发窗口，Prisma 的条件更新、attempt 唯一键和家庭幂等唯一键提供最终一致性保护。

## 历史模型

`SubmissionReview` 保存 `targetType`、二选一 attempt 外键、家庭幂等键、决策、`PARENT | TIMEOUT` 来源、原因、可空审核人、审核时间和创建时间。人工审核写入 `PARENT` 与家长 ID，超时审核写入 `TIMEOUT` 与空审核人。

家庭历史接口通过 attempt 反向关联任务和孩子，支持 `child_id`、`task_id`、`result`、`start_date` 和 `end_date` 筛选。日期边界按家庭时区解析，范围上限为 366 天；结果按 `(reviewedAt, id)` 倒序并使用 opaque cursor 稳定分页。目标筛选与 cursor 条件通过 Prisma `AND` 组合，翻页时继续保持孩子和任务约束。

SQL 迁移提供两项核心保护：

- `submission_reviews_target_check` 保证目标类型与单人/协作 attempt 外键严格对应。
- `submission_reviews_rejection_reason_check` 保证拒绝决策具有去除空白后非空的原因。
- `submission_reviews_source_reviewer_check` 保证人工来源具有审核人，并保证超时来源没有审核人。

## HTTP 接口

| 方法与路径 | 用途 |
|---|---|
| `GET /api/v1/family/submission-reviews/pending` | 读取当前家庭待审队列 |
| `GET /api/v1/family/submission-reviews/history` | 按孩子、任务、结果和家庭自然日期筛选审核历史 |
| `POST /api/v1/check-ins/:id/reviews` | 审核单人打卡 |
| `GET /api/v1/check-ins/:id/reviews` | 读取单人打卡审核历史 |
| `POST /api/v1/collaboration-submissions/:id/reviews` | 审核协作提交 |
| `GET /api/v1/collaboration-submissions/:id/reviews` | 读取协作提交审核历史 |

响应使用统一 API 信封和 snake_case 审核字段，成功请求续期当前会话 Cookie。详细字段和错误映射见 `../INTERFACES.md`。

## 当前边界

阶段 6 覆盖家长人工审核、超时自动通过、统一历史、动态 Streak、单人/协作通过后的积分事务、等级派生与权益读取，以及核心属性与竞态测试；阶段 11 将超时批处理接入独立 Worker；任务 14 将家庭待审聚合接入家长页面；任务 15 将孩子今日任务接入本人范围真实分配。

## 验证

任务 6.2 的 6 个聚焦测试文件共 108 项通过，全量单元回归为 114 个文件、829 项。全工作区 TypeScript、ESLint、Prettier、Prisma 契约和生产构建通过。提交 `b77d51b` 已部署为 `dev-20260807-b77d51b-i35`，Web、API、Worker、PostgreSQL 和 Redis 五个容器健康；外部域名真实 Chromium 验证审核截止、历史筛选、弹窗焦点与方向键、Escape、焦点恢复、真实写入冲突、输入保留和权威状态刷新通过。隔离家庭未配置 COS 集成，弹窗键盘验收使用浏览器层只读媒体元数据，审核状态机、历史和冲突请求均调用真实部署 API。
