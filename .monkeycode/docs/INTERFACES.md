# FamilyStar 接口文档

## HTTP API

### `GET /api/v1`

返回 API 进程的基本服务信息。API 使用 `/api/v1` 作为统一版本前缀。

响应状态：`200 OK`

```json
{
  "success": true,
  "data": {
    "name": "FamilyStar API",
    "version": "0.1.0"
  },
  "meta": {
    "request_id": "4ff4f32d-4bd8-4a0c-853f-4c6f8cdba73a",
    "timestamp": "2026-07-30T04:57:36.382Z"
  }
}
```

当前端点没有请求体、查询参数或认证要求。未版本化的 `GET /` 返回 `404`。

### `GET /api/v1/health`

返回进程存活状态、服务版本、检查时间和进程运行秒数。该端点无需认证，可供容器和反向代理执行健康检查。

```json
{
  "success": true,
  "data": {
    "name": "FamilyStar API",
    "version": "0.1.0",
    "status": "ok",
    "checked_at": "2026-07-30T04:57:36.384Z",
    "uptime_seconds": 47
  },
  "meta": {
    "request_id": "c054bebb-6190-4dc4-b688-a2a6d1265859",
    "timestamp": "2026-07-30T04:57:36.384Z"
  }
}
```

### 通用 HTTP 契约

- 所有响应包含 `X-Request-Id` 响应头和 `meta.request_id`。
- 调用方可传入 1 至 128 位字母、数字、下划线或连字符组成的 `X-Request-Id`。
- 所有时间采用 ISO 8601 UTC 字符串。
- 未找到资源返回 `404`、`NOT_FOUND` 和统一失败信封。
- 未处理异常返回 `500`、`INTERNAL_ERROR` 和通用消息，服务端日志不输出异常消息或请求数据。

### `POST /api/v1/auth/parent/register`

创建家庭与创建者，并初始化默认设置、5 种家庭任务类型和 20 级配置。请求字段为 `family_name`、`nickname`、`email`、`password` 和可选 `time_zone`。密码至少 12 个字符且不得超过 bcrypt 72 字节边界；无效时区回退为 `Asia/Shanghai`。

成功返回 `201` 和公开家长身份，同时设置 `familystar_session` HttpOnly Cookie。输入无效返回 `400 INVALID_REQUEST`，活动邮箱冲突返回 `409 CONFLICT`。

### `POST /api/v1/auth/parent/login`

使用规范化邮箱和密码登录家长账号。成功返回公开家长身份并设置新的 30 天会话 Cookie；凭据错误返回 `401 UNAUTHORIZED`。响应不包含密码哈希或会话令牌字段。

### `GET /api/v1/auth/session`

读取当前 `familystar_session` Cookie。有效会话返回 `role`、`subject_id`、`family_id` 和 `family_code`，同时刷新 Redis TTL 与 Cookie Max-Age；缺少或失效会话返回 `401 UNAUTHORIZED`。

### `POST /api/v1/auth/child/family`

接收严格的 `{ "family_code": "<6 位数字>" }` 请求，家庭码按字符串处理并保留前导零。成功返回家庭名称、家庭码和活动孩子公开档案；每个孩子只包含 `id`、`nickname`、`grade` 和 `avatar_media_id`。格式错误返回 `400 INVALID_REQUEST`，不可用家庭返回无差异的 `401 UNAUTHORIZED`。

### `POST /api/v1/auth/child/login`

接收 `family_code`、UUID `child_id` 和 `credential`。服务先解析活动家庭，再确认孩子归属并复用 PIN/密码校验、5 次失败锁定和 15 分钟 10 次限流；成功设置孩子 30 天会话 Cookie并返回公开孩子档案。

### `POST /api/v1/auth/parent/invitations`

家庭创建者使用 `familystar_session` Cookie 邀请第二位家长。请求字段为 `email`。成功返回邀请 ID、规范化邮箱、7 天到期时间和 `delivery`。家庭邮件配置为 `VERIFIED` 时，`delivery` 为 `email` 且同事务写入邮件请求 Outbox 事件；其余状态返回 `copy-link` 和可复制 `invitationLink`。缺少会话返回 `401`，共同管理者返回 `403`，家庭已有两位家长或邮箱冲突返回 `409`。

### `POST /api/v1/auth/parent/invitations/accept`

请求字段为 `token`、`nickname` 和 `password`。服务端验证 7 天令牌、邀请状态、家长上限与邮箱唯一性，在单个事务内创建同家庭第二位 `PARENT` 并标记邀请已接受。成功返回 `201`、公开家长身份和新的 HttpOnly 会话 Cookie；未知令牌返回 `404`，过期、已使用、家庭已满或邮箱冲突返回 `409`。

### 孩子档案接口

`GET /api/v1/family/children` 返回当前家长所属家庭的活动孩子。`POST /api/v1/family/children` 创建孩子，`PATCH /api/v1/family/children/:childId` 修改档案或重置凭据，`DELETE /api/v1/family/children/:childId` 执行软删除。管理接口均要求家长会话，并从会话确定家庭边界。

创建字段包含 `nickname`、`credential_type`、`credential`、`gender`，可选 `birthday`、`grade` 和 `avatar_media_id`。PIN 为 4 至 6 位数字；密码至少 6 个字符且含字母；头像必须是同家庭 `READY` 状态且未删除的媒体。

### 家庭内账号切换

`GET /api/v1/auth/switch-targets` 允许当前家长或孩子会话读取同家庭活动孩子的公开档案。`POST /api/v1/auth/child/switch` 接收 `child_id` 和 `credential`，校验所选孩子属于当前会话家庭后设置新的孩子 HttpOnly 会话 Cookie。无效会话或凭据统一返回 `401 UNAUTHORIZED`。

`PATCH /api/v1/auth/child/password` 要求孩子会话和密码模式账号，请求字段为 `current_password` 与 `new_password`。服务校验当前密码、新密码至少 6 位且包含字母，以及 bcrypt 72 字节边界；成功更新哈希、撤销该孩子全部会话并清除当前 Cookie。角色、账号模式或当前凭据不满足要求时返回 `401 UNAUTHORIZED`，新密码格式无效返回 `400 INVALID_REQUEST`。

孩子连续 5 次凭据失败后锁定 15 分钟，锁定响应返回 `401 UNAUTHORIZED` 和 `details.remaining_seconds`。切换请求按家庭与孩子限制为 15 分钟内 10 次，超限返回 `429 RATE_LIMITED` 和 `details.retry_after_seconds`。成功登录清零失败次数与锁定时间。

已认证的邀请、孩子管理和切换目标请求会刷新 Redis 会话 TTL，并重新设置当前 Cookie 的 30 天 Max-Age。孩子凭据变更或档案软删除会递增主体会话 revision，使该孩子全部旧令牌在下次读取时失效。

### 家庭设置接口

`GET /api/v1/family/settings` 返回当前家庭的完整规则设置，`PATCH /api/v1/family/settings` 接受部分更新。两个接口均要求家长会话，两位家长拥有相同权限，家庭边界只取自会话。成功响应刷新当前 Cookie 的 30 天 Max-Age。

公开字段为 `time_zone`、`check_in_deadline`、`makeup_days`、`review_timeout_hours`、`auto_approve_quota` 和 `streak_multipliers`。截止时间必须为 `HH:mm`；三个数值字段必须为非负安全整数；时区必须为有效 IANA 标识；Streak 必须包含 3、7、14、30、60、100 天六档且倍率为正有限数。空更新或非法字段返回 `400 INVALID_REQUEST`。

读取历史 `{}` 或缺字段记录时，服务补齐 `Asia/Shanghai`、`23:59`、3 天、48 小时、额度 0 和默认六档倍率。PATCH 保存完整 camelCase JSONB 形态，并保留未由该接口管理的现有字段。

### 任务类型接口

`GET /api/v1/family/task-types`、`POST /api/v1/family/task-types`、`PATCH /api/v1/family/task-types/:taskTypeId` 和 `DELETE /api/v1/family/task-types/:taskTypeId` 提供家庭任务类型管理。预设副本可覆盖，自定义类型可软删除；预设删除和活动任务引用冲突返回 `409 CONFLICT`。

### 家庭任务接口

`GET /api/v1/family/tasks`、`POST /api/v1/family/tasks` 和 `PATCH /api/v1/family/tasks/:taskId` 提供任务与多孩分配管理。`POST /api/v1/family/tasks/:taskId/activate`、`deactivate` 和 `archive` 执行显式状态转换，归档状态不可恢复。

任务请求包含 `task_type_id`、`name`、`check_type`、`frequency`、`base_points` 和 `assignments`，并可包含提交说明、验收方式和单人/协作模式。分配项可覆盖积分、频率、打卡方式和验收方式；协作模式至少要求两名不同孩子。

### 打卡接口

`POST /api/v1/check-ins` 使用孩子会话提交单人打卡，请求头必须携带最多 128 字符的 `Idempotency-Key`。请求包含 `task_assignment_id`、可选 `check_date` 和 `content`；`content` 可包含最多 10000 字符文字与最多 10 个媒体 UUID。`GET /api/v1/check-ins/:id` 返回同家庭当前孩子可见的打卡及全部提交历史。

`POST /api/v1/collaboration-rounds/:roundId/submissions` 提交当前孩子在协作周期中的独立结果，同样要求幂等键。`GET /api/v1/collaboration-rounds/:roundId/submissions` 返回当前家庭周期的参与者提交进度。自动验收提交直接进入 `APPROVED`，人工验收进入 `PENDING`；`REJECTED` 记录可重提，并在 attempt 中保留旧审核快照。

### 提交审核接口

`POST /api/v1/check-ins/:id/reviews` 和 `POST /api/v1/collaboration-submissions/:id/reviews` 由家长审核单人或协作提交。两个接口要求有效家长 Cookie 和最长 128 字符的 `Idempotency-Key`，请求体严格包含 `status: "APPROVED" | "REJECTED"` 与可选 `reason`；reason 最长 2000 字符，拒绝时必须包含非空原因。

`GET /api/v1/check-ins/:id/reviews` 和 `GET /api/v1/collaboration-submissions/:id/reviews` 由家长读取本家庭目标的审核历史，结果按 `reviewed_at` 升序返回。审核对象包含 `id`、`target_type`、`target_id`、`attempt_id`、`status`、`source`、`reason`、`reviewer_id` 和 `reviewed_at`。人工记录的 `source` 为 `PARENT` 且包含 reviewer，超时记录的 `source` 为 `TIMEOUT` 且 `reviewer_id` 为 `null`。

成功审核返回 `200` 并续期会话 Cookie。缺少有效会话返回 `401 UNAUTHORIZED`，孩子会话返回 `403 FORBIDDEN`，非法请求返回 `400 INVALID_REQUEST`，审核写入中的不可见目标返回 `404 NOT_FOUND`，锁竞争、状态竞争或幂等键冲突返回 `409 CONFLICT`。同一家庭、同一幂等键和同一目标的重试返回既有审核记录；历史查询对无记录目标返回空数组。

### 等级接口

`GET /api/v1/levels/me` 要求孩子会话并返回当前孩子基于累计获得积分的等级视图。`GET /api/v1/family/children/:childId/level` 要求家长会话，并只读取会话家庭内的活动孩子。成功响应续期会话 Cookie；缺少会话、角色错误和目标不可见分别返回 `401 UNAUTHORIZED`、`403 FORBIDDEN` 和 `404 NOT_FOUND`。

等级响应包含 `points_earned_total`、`eligible_level`、`current_level`、当前配置、当前权益和可空的下一等级进度。权益包含兑换折扣、等级免审批额度、家庭与等级额度最大值、许愿槽位和扩展维度；下一等级包含门槛、剩余积分与 `0..1` 进度比例。

### 奖励、兑换与愿望接口

`GET /api/v1/rewards` 和 `GET /api/v1/rewards/:id` 允许家长读取本家庭全部活动奖励，孩子只读取上架奖励。`POST /api/v1/rewards`、`PATCH /api/v1/rewards/:id` 和 `DELETE /api/v1/rewards/:id` 要求家长会话，管理名称、图片、整数价格、类型、库存、等级门槛、日周月频次和上下架状态。

`POST /api/v1/rewards/:id/redemptions` 要求孩子会话和最长 128 字符的 `Idempotency-Key`。服务按当前等级折扣计算实付，以家庭和等级额度最大值判断自动审批，并在同一 `Serializable` 事务内完成资格与频次检查、有限库存预占、余额预扣、兑换、积分流水和 Outbox。`GET /api/v1/redemptions` 对孩子限定本人，对家长返回本家庭记录。

`POST /api/v1/redemptions/:id/approve`、`fulfill` 和 `reject` 要求家长会话。拒绝请求严格包含 1 至 2000 字符的 `reason`；退款只恢复当前余额并释放预占库存，兑现将预占转为消耗。

`GET /api/v1/wishes` 对孩子限定本人，对家长返回本家庭愿望。`POST /api/v1/wishes` 和 `POST /api/v1/wishes/:id/cancel` 要求孩子会话并受当前等级愿望槽位限制；`POST /api/v1/wishes/:id/adopt` 要求家长会话，在同一事务内按愿望标题、描述、目标积分创建奖励并标记采纳。

### 媒体接口

`POST /api/v1/media/uploads` 初始化家庭 COS multipart 上传，请求头必须携带 `Idempotency-Key`，请求体包含类型、MIME、SHA-256、字节数和可选时长。`POST /api/v1/media/uploads/:id/parts/:partNumber/authorize` 获取短期分片上传 URL，`PUT` 同一路径确认 ETag、SHA-256 与分片大小。

`POST /api/v1/media/uploads/:id/complete` 由服务端完成 multipart 并从 COS 读取对象进行 MIME、文件签名、大小和 SHA-256 校验；请求体为空对象，客户端不能提供对象字节。`POST /api/v1/media/uploads/:id/retry` 恢复失败会话，`GET /api/v1/media/:id/access-url` 为同家庭 `READY` 媒体生成短期私有读 URL。

### 家庭集成配置接口

`GET /api/v1/family/integrations/:type` 允许本家庭两位家长读取 `email` 或 `cos` 的配置状态、非敏感配置、凭证已配置标识、最近验证时间和脱敏结果码。

`PUT`、`DELETE /api/v1/family/integrations/:type` 与 `POST /api/v1/family/integrations/:type/test` 仅允许家庭创建者调用。邮件配置严格校验 SMTP Host、Port、TLS 模式、发件人和可选替换凭证；COS 配置严格校验 Bucket、Region、访问域名和可选替换凭证。更新省略凭证时保留既有密文，新建配置必须提供凭证。

响应不包含 SMTP 密码、授权码、COS SecretId、COS SecretKey、凭证密文、nonce、认证标签或包裹数据密钥。连接测试通过 `IntegrationVerifier` 端口执行，运行组合未注入 verifier 时返回 `503`。

### 通用安全契约

- 受保护路由从服务端会话生成 `authSession`，客户端字段无法覆盖 `familyId` 或角色。
- Parent 与 Child 路由由集中权限矩阵预先检查；无会话返回 `401`，角色越权和家庭 ID 冲突返回 `403`。
- 写请求若携带 `Origin`，其 origin 必须精确等于 `PUBLIC_BASE_URL`；`Sec-Fetch-Site: cross-site` 始终拒绝。
- `X-Family-Id`、`family_id` 和 `familyId` 可用于家庭一致性确认；值与会话家庭冲突时拒绝请求。
- 已认证写请求生成 `AuditLog`，只记录方法、路径、状态、操作者、家庭、实体、业务键、请求 ID、结果和 UTC 时间。

## Web 路由

### `/`

Next.js App Router 首页提供统一家庭登录入口。页面先读取服务端有效会话并按角色进入 `/dashboard` 或 `/child`；未认证用户可在家长登录、创建家庭和孩子家庭码两步登录之间切换。页面使用 FamilyStar Design Tokens、Lucide SVG、可见键盘焦点和 320px 至 2560px 响应式布局。

### 家长端与孩子端

家长端使用 `/dashboard`、`/tasks`、`/reviews`、`/rewards`、`/levels`、`/stats`、`/records`、`/family` 和 `/settings`。孩子端使用 `/child`、`/child/check-ins`、`/child/achievements`、`/child/rewards`、`/child/records` 和 `/child/profile`。两个动态路由均限制为固定白名单，未知 section 返回 Next.js 404。

孩子端五项底部导航将“我的记录”归入“我的”激活状态。浏览器角色守卫阻止已知家长角色进入孩子端；后端写接口继续以 HttpOnly 会话角色和本人范围作为授权边界。

## 共享类型

### `ServiceInfo`

```typescript
type ServiceInfo = {
  name: string;
  version: string;
};
```

Web 首页和 API 根端点共同使用该类型。

### `MediaType`

```typescript
type MediaType = 'image' | 'video' | 'audio';
```

### `MediaAttachment`

```typescript
type MediaAttachment = {
  id: string;
  type: MediaType;
  url: string;
  thumbnail_url?: string;
  duration?: number;
  size_bytes: number;
  width?: number;
  height?: number;
  created_at: string;
};
```

该媒体契约来自已确认 MVP 决策 §6。数据库媒体模型、COS multipart 上传、服务端校验和签名 URL 已由任务 5 实现。

### `ErrorCode`

`ERROR_CODES` 提供以下稳定值：

| 错误码 | 用途 |
|---|---|
| `INVALID_REQUEST` | 请求输入无效 |
| `UNAUTHORIZED` | 缺少有效认证 |
| `FORBIDDEN` | 当前身份无操作权限 |
| `NOT_FOUND` | 资源不存在或不可见 |
| `CONFLICT` | 状态或并发冲突 |
| `RATE_LIMITED` | 请求超过速率限制 |
| `INTERNAL_ERROR` | 未归类服务端故障 |

这些代码已接入统一 HTTP 响应模型。任务 1.5 已验证 `NOT_FOUND` 与 `INTERNAL_ERROR` 的状态码、错误码、安全消息和请求 ID 映射。

## 环境配置接口

| 变量 | 类型 | 默认值 | 约束 |
|---|---|---|---|
| `NODE_ENV` | enum | `development` | `development`、`test`、`production` |
| `PORT` | integer | `3001` | 1 至 65535 |
| `WORKER_PORT` | integer | `3002` | 1 至 65535 |
| `WORKER_POLL_INTERVAL_MS` | integer | `5000` | 正安全整数 |
| `WORKER_BATCH_SIZE` | integer | `100` | 正安全整数 |
| `WORKER_LOCK_TTL_MS` | integer | `300000` | 正安全整数且大于轮询周期 |
| `MEDIA_CLEANUP_AGE_HOURS` | integer | `24` | 正安全整数 |
| `PUBLIC_BASE_URL` | URL | `http://localhost:3000` | 有效绝对 URL |
| `API_INTERNAL_URL` | URL | `http://localhost:3001` | Web 服务端 rewrite 使用的 HTTP(S) 地址，不得包含凭据 |
| `DATABASE_URL` | PostgreSQL URL | 本地开发占位连接串 | `postgresql://` 或 `postgres://` 绝对 URL |
| `REDIS_URL` | Redis URL | `redis://localhost:6379` | `redis://` 或 `rediss://` 绝对 URL |
| `REDIS_KEY_PREFIX` | string | `familystar` | 1 至 63 位小写字母、数字、下划线或连字符，首位为字母或数字 |
| `CREDENTIAL_VAULT_ACTIVE_KEY_VERSION` | string | 未配置 | 活动主密钥版本，1 至 40 位安全标识 |
| `CREDENTIAL_VAULT_MASTER_KEYS` | JSON string | 未配置 | 版本到 32 字节 Base64 主密钥的对象映射 |

API 在监听端口前解析配置。无效字段会触发 `Invalid environment variables: <fields>` 启动错误，错误信息不包含环境变量值。

## 数据模型接口

Prisma 6.19.2 使用 PostgreSQL datasource，生成 29 个模型。主要聚合如下：

| 聚合 | 模型 |
|---|---|
| 家庭与身份 | `Family`、`User`、`Invitation` |
| 任务 | `TaskTypeTemplate`、`TaskType`、`Task`、`TaskAssignment` |
| 打卡、协作与审核 | `CheckIn`、`CheckInSubmissionAttempt`、`CollaborationRound`、`CollaborationRoundParticipant`、`CollaborationSubmission`、`CollaborationSubmissionAttempt`、`SubmissionReview` |
| 媒体 | `MediaAsset`、`MediaUploadSession`、`MediaUploadPart`、`CheckInMedia`、`CollaborationSubmissionMedia` |
| 成长与奖励 | `PointsLog`、`LevelConfig`、`LevelReward`、`Reward`、`Redemption`、`Wish` |
| 审计 | `AuditLog` |
| 可靠事件 | `OutboxEvent` |
| 家庭集成 | `FamilyIntegrationSetting` |
| 后台作业 | `WorkerJobRun` |

业务表通过 UUID `family_id` 建立家庭边界。积分流水唯一键为 `(type, business_type, business_id, user_id)`，兑换幂等键在家庭内唯一，兑换退款另以部分唯一索引保证每个兑换最多一条 REFUND，协作周期和参与者分别以 `(task_id, round_number)` 与 `(round_id, child_id)` 保证幂等。

迁移历史额外提供余额、库存、等级、日期、邀请状态、Outbox 租约、事件名、凭证密文字段长度、审核目标一致性、拒绝原因、协作奖励快照和 Worker 状态一致性 CHECK 约束，并通过索引支持活动邮箱、家庭待处理邀请、审核幂等、业务唯一性、Outbox 到期 claim 与 Worker 重试扫描。完整说明见 `专有概念/DataModel.md`。

## Worker 运行时接口

`apps/api/src/worker/` 提供以下内部契约：

| 契约 | 用途 |
|---|---|
| `WorkerScheduler` | 按固定轮询周期执行全部作业、隔离失败并提供健康快照 |
| `WorkerJobRunner` | 组合 Redis 调度锁、数据库 claim、执行、退避和结果持久化 |
| `WorkerJobRunRepository` | 按 `(jobName, runKey)` claim、完成或失败作业运行 |
| `PrismaWorkerJobRunRepository` | 将运行状态和安全重入规则适配到 `WorkerJobRun` |
| `WorkerJobsRepository` | 提供活动家庭、过期媒体和积分对账数据访问 |
| `createWorkerJobs()` | 注册任务周期、审核超时、Outbox、媒体清理和积分对账作业 |
| `createWorkerRuntime()` | 组合 Prisma、Redis、领域执行器和 COS 适配器 |

每个 `WorkerJob` 提供稳定名称、确定性 `runKey(now)` 和 `execute(now)`。失败记录只保存稳定错误码，结果保存 JSON-safe 计数摘要。详细语义见 `专有概念/WorkerRuntime.md`。

## 凭证保险库接口

`apps/api/src/infrastructure/credentials/` 提供以下内部契约：

| 契约 | 用途 |
|---|---|
| `createMasterKeyring()` | 将可选服务器配置解析为 available 或 unavailable 状态 |
| `CredentialVault.encrypt()` | 为家庭集成凭证生成独立数据密钥和完整信封密文 |
| `CredentialVault.decrypt()` | 按记录保存的历史版本解包数据密钥并认证解密凭证 |
| `CredentialVault.rewrapDataKey()` | 使用当前活动主密钥重新包裹数据密钥，保留凭证密文 |
| `initializeCredentialVault()`、`getCredentialVault()` | 在 API 启动时保留已校验的进程级保险库实例 |
| `PrismaCredentialVaultRepository` | 按家庭和集成类型读取密文字段，并以旧版本保护重包裹更新 |
| `IntegrationSettingsService` | 执行双家长读取、创建者维护、凭证加解密和验证权限 |
| `PrismaIntegrationSettingsRepository` | 按活动家庭读取与写入配置、密文及脱敏验证结果 |
| `IntegrationVerifier` | 隔离单次邮件或 COS 外部连接验证 |

稳定错误分类包括 `VAULT_UNAVAILABLE`、`INVALID_INPUT`、`UNKNOWN_KEY_VERSION` 和 `AUTHENTICATION_FAILED`。错误消息不包含密钥、凭证、密文或底层 OpenSSL 错误。

## Redis 基础设施接口

`apps/api/src/infrastructure/redis/` 提供以下内部 TypeScript 契约：

| 契约 | 用途 |
|---|---|
| `createRedisConnection()` | 使用已校验 URL 创建带错误监听和重连策略的 node-redis 客户端 |
| `connectRedis()`、`disconnectRedis()` | 按客户端连接状态建立或销毁连接 |
| `createRedisKeyspace()` | 创建 session、rate-limit、scheduler-lock、review-lock、idempotency 和 cache 隔离键 |
| `RedisCommandPort` | 通过单一 `sendCommand()` 接口隔离 node-redis 与领域调用方 |
| `writeSession()`、`readSession()`、`deleteSession()` | 管理带 TTL 的不透明会话值 |
| `consumeRateLimit()` | 原子消费固定窗口限额并返回是否允许、已消费量、剩余量和重试秒数 |
| `acquireLock()`、`releaseLock()` | 使用所有者令牌和毫秒 TTL 管理调度锁 |
| `claimIdempotency()` | 使用带秒级 TTL 的原子占位标记首次消费 |
| `claimIdempotencyReceipt()`、`releaseIdempotencyReceipt()` | 使用 owner token 获取和安全释放事件 receipt |
| `setJsonCache()`、`getJsonCache()` | 管理带 TTL 的 JSON 短期缓存 |

所有 TTL 和限额必须为正安全整数。业务任务负责选择具体 TTL、构造家庭或实体标识，并在数据库唯一约束或事务中保留最终一致性保护。

## 家长认证接口

`apps/api/src/family-auth/` 的内部契约包括 `FamilyAuthService`、`FamilyInvitationService`、`ChildAccountService`、对应仓储端口、`PasswordHasher`、`SessionStore`、Prisma 适配器和 `RedisSessionStore`。HTTP 层负责 Schema 校验、稳定错误映射和 Cookie 读写；家庭初始化、邀请、孩子档案和账号切换决策位于领域服务与仓储。

## 家庭设置接口

`apps/api/src/family-settings/` 公开内部 `FamilySettingsOperations` 与 `FamilySettingsRepository` 端口。`FamilySettingsService` 负责家长会话、默认合并和规则校验，`PrismaFamilySettingsRepository` 仅操作活动家庭的 `Family.settings` JSONB，HTTP 路由负责 snake_case 映射和 Cookie 续期。

## 任务领域接口

`apps/api/src/tasks/` 公开 `TaskTypeOperations`、`TaskOperations`、`TaskFrequency`、`TaskRepository` 和 `CollaborationSchedulerRepository`。Prisma 适配器在事务内校验任务类型和活动孩子的家庭归属，原子创建任务及分配，并通过 upsert 恢复历史软删除分配。`CollaborationScheduler` 生成不可变参与者与奖励快照，重复日期调度读取既有周期。

## 打卡、审核与媒体领域接口

`apps/api/src/check-ins/` 公开 `CheckInOperations`、`CheckInRepository`、`SubmissionReviewOperations`、`SubmissionReviewRepository`、`SubmissionReviewTimeoutBatch` 与 `SubmissionReviewTimeoutRepository`。打卡服务负责孩子会话、日期窗口、五种内容规则、幂等和提交状态机；人工审核服务负责家长会话、拒绝原因、目标锁与幂等协调；超时审核服务负责单批候选、家庭设置到期判断、确定性幂等键和安全跳过；Prisma 审核仓储负责条件状态更新、latest attempt 复查和 attempt 级历史事务。`apps/api/src/media/` 公开 `MediaOperations`、`MediaRepository` 与 `CosClientPort`，服务负责家庭凭证按请求解密、上传状态转换和对象验证，COS 客户端负责签名及 HTTP I/O。

## 积分领域接口

`apps/api/src/points/` 提供以下内部契约：

| 契约 | 用途 |
|---|---|
| `calculatePointsChange()` | 校验数据库整数范围、变动方向和非负余额，计算余额与累计获得积分 |
| `calculateStreakAward()` | 按奖励日期、活动自然日和家庭六档配置计算连续天数、倍率及四舍五入后的积分 |
| `PointsAwardPort.earnCheckIn()` | 按单人打卡业务键执行 EARN 幂等发放 |
| `PointsAwardPort.completeCollaborationRound()` | 全部活动参与者通过后原子完成周期，并按参与者快照逐人幂等发放 |
| `PointsTransactionWriter.run()` | 在可重放的同一事务回调中组合业务状态和积分写入 |
| `PrismaPointsTransactionWriter` | 写入双余额、版本、PointsLog、单人/协作奖励快照和 Outbox，并处理乐观锁、序列化与 P2002 竞态 |
| `PointsTransactionConflictError` | 三次版本竞争后的 `CONFLICT` 可重试错误 |

单人打卡 EARN 使用 `businessType = check_in`、`businessId = checkInId`；协作周期 EARN 使用 `businessType = collaboration_round`、`businessId = roundId`，两者均将 `userId` 纳入唯一业务键。每次余额变化写入 `points.balance.changed.v1`；协作周期完成另写 `check-in.collaboration.completed.v1`，payload 包含 `round_id` 与活动参与者数量。

## 等级领域接口

`apps/api/src/levels/` 提供以下内部契约：

| 契约 | 用途 |
|---|---|
| `deriveEligibleLevel()` | 从家庭等级阈值和累计积分派生最高资格等级 |
| `deriveLevelView()` | 组合只升不降当前等级、权益与下一等级进度 |
| `LevelService.getMe()` | 校验孩子会话并读取本人等级 |
| `LevelService.getChild()` | 校验家长会话并读取同家庭活动孩子等级 |
| `PrismaLevelRepository` | 一次家庭范围查询读取用户累计积分、缓存等级、家庭额度与等级配置 |

积分事务在 EARN 后同步 `User.currentLevel`。跨越一个或多个阈值时写入单个 `levels.level.advanced.v1` Outbox 事件，payload 保存升级前等级、升级后等级和累计积分。

## 奖励领域接口

`apps/api/src/rewards/` 公开 `RewardOperations`、`RewardRepository`、`RewardRecord`、`RedemptionRecord` 和 `WishRecord`。`RewardService` 负责会话角色、输入规范化和兑换 request fingerprint；`PrismaRewardRepository` 负责家庭范围查询、奖励与愿望事务、库存原子变化和兑换状态机；`PrismaPointsTransactionWriter` 在共享 transaction client 上提供 REDEEM 与 REFUND 幂等流水。

兑换申请发布 `rewards.redemption.requested.v1`，自动或人工批准发布 `rewards.redemption.approved.v1`，拒绝和兑现分别发布 `rewards.redemption.rejected.v1` 与 `rewards.redemption.fulfilled.v1`。每次余额变化同时发布 `points.balance.changed.v1`。

## 工作区接口

| 包名 | 位置 | 公开能力 |
|---|---|---|
| `@familystar/web` | `apps/web` | Next.js Web 应用 |
| `@familystar/api` | `apps/api` | Hono API 应用和 Node 进程 |
| `@familystar/shared` | `packages/shared` | 跨端 TypeScript 类型与插件内核契约 |
| `@familystar/business-modules` | `modules` | 业务模块聚合入口 |
| `@familystar/tasks-module` | `modules/tasks` | 任务能力与任务事件 manifest |
| `@familystar/check-in-module` | `modules/check-in` | 打卡能力与打卡事件 manifest |
| `@familystar/points-module` | `modules/points` | 积分能力与余额事件 manifest |
| `@familystar/levels-module` | `modules/levels` | 等级能力与升级事件 manifest |
| `@familystar/rewards-module` | `modules/rewards` | 奖励能力与兑换事件 manifest |

## 插件内核接口

`@familystar/shared` 公开 `PluginManifest`、`Plugin<TContext>`、`PluginRegistry<TContext>`、`PluginRegistryOptions<TContext>`、`PluginRegistryError` 和 `PLUGIN_REGISTRY_ERROR_CODES`。

```typescript
type PluginManifest = Readonly<{
  name: string;
  version: string;
  capabilities: readonly string[];
  dependencies: readonly string[];
  permissions: readonly string[];
  subscribes: readonly string[];
  publishes: readonly string[];
}>;

type Plugin<TContext> = Readonly<{
  manifest: PluginManifest;
  register(context: TContext): void | Promise<void>;
  unregister(context: TContext): void | Promise<void>;
}>;
```

`PluginRegistry.register()` 校验 manifest、重复名称、权限许可清单和依赖顺序，再调用插件生命周期。`unregister()` 阻止破坏已注册依赖链，并在回调成功后删除记录。`has()`、`get()` 和 `list()` 提供只读查询；`list()` 保留静态注册顺序。

事件声明必须符合 `<module>.<entity>.<event>.v<version>`，发布声明必须使用插件自身命名空间。

## 业务模块组合接口

`@familystar/business-modules` 公开以下组合契约：

| 契约 | 用途 |
|---|---|
| `STATIC_BUSINESS_MODULES` | 按依赖拓扑保存五个编译期插件引用 |
| `BUSINESS_MODULE_PERMISSIONS` | API 组合根授予静态模块的核心权限许可清单 |
| `registerBusinessModules()` | 按静态顺序注册全部模块 |
| `unregisterBusinessModules()` | 按反向顺序清理已注册模块，并兼容部分初始化状态 |
| `initializeBusinessModules()` | 创建 Registry 并完成全部静态注册 |
| `MODULE_TOGGLE_PLACEHOLDERS` | 提供设置页后续使用的只读启用占位元数据 |

API 的 `src/server.ts` 在创建 Hono 应用和监听端口前等待 `initializeBusinessModules()`。任一静态注册错误会中止启动。

## 事件基础设施接口

`@familystar/shared` 公开 `EventName`、`EventPayload`、`DomainEvent`、`DomainEventInput`、`createDomainEvent()`、`isEventName()` 和 `parseEventName()`。事件信封包含事件 ID、名称、发生时间、家庭 ID、可空操作者 ID、关联 ID和 JSON-safe payload，并在创建后形成深度冻结快照。

`apps/api/src/events/` 提供以下内部端口与适配器：

| 契约 | 用途 |
|---|---|
| `EventBus.createScope()` | 按插件 manifest 创建受限发布与订阅 scope |
| `EventBus.createOutboxPublisher()` | 为可信 Outbox 分发器重放已持久化事件 |
| `runWithOutbox()` | 在单个 transaction runner 回调中执行业务工作并 append 事件 |
| `PrismaTransactionRunner`、`PrismaOutboxWriter` | 将事务端口和事件写入适配到 Prisma |
| `PrismaOutboxRepository` | 原子 claim、成功确认和失败重排 Outbox 记录 |
| `OutboxDispatcher` | 单批发布、错误分类和有界指数退避 |
| `IdempotentEventConsumer` | 按消费者与事件 ID 跳过重复投递并处理失败释放 |
| `RedisEventReceiptStore` | 将幂等 receipt 适配到隔离 Redis 键空间 |

Outbox 提供 at-least-once 投递。任务 2.7 已通过状态型内存 I/O 适配器验证真实 Dispatcher、EventBus、Redis receipt 和凭证仓储的跨组件协作；阶段 11 已将 Dispatcher 接入独立 Worker；阶段 12 聚合套件覆盖重复投递和消费者幂等。

## Web 同源代理

Next.js 将浏览器发往 `/api/:path*` 的请求转发至 `${API_INTERNAL_URL}/api/:path*`。`API_INTERNAL_URL` 仅由 Web 服务端配置使用，浏览器始终请求当前 Web 来源。

## 后续接口边界

当前家庭接口已覆盖家长、邀请、孩子账号、认证保护、家庭设置、任务、打卡、媒体、家长审核、等级、奖励、兑换和愿望。审核超时由内部单批执行器处理并由独立 Worker 周期调用；动态 Streak、统一发分、等级同步和兑换预扣退款已作为内部事务能力接入。

## 契约验证

`pnpm test:unit` 验证共享响应契约、Hono 请求基础、基础设施、插件与事件组合及全部领域服务。`pnpm test:integration` 运行 5 个 Phase 1 集成文件和 23 项核心闭环、并发回滚测试。`pnpm test:e2e` 运行 7 项 Playwright 浏览器测试，覆盖双端 15 个路由及关键交互。阶段 12 最终覆盖率运行共有 78 个测试文件、475 项测试通过。

## 开发种子接口

`pnpm db:seed` 运行 `apps/api/prisma/seed.ts`，在单个 Prisma 事务中按固定 UUID upsert 两个家庭及其双家长、多孩子、五类任务、单人和协作任务、20 级配置、奖励库存和愿望。重复执行会刷新定义性字段并保留积分、库存运行计数和历史数据；生产环境直接拒绝执行。
