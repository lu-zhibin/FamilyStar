# FamilyStar 开发者指南

## 项目目的

FamilyStar 提供家庭任务打卡、积分成长和奖励兑换能力。Phase 1 的 12 个实施阶段及真实运行缺陷修复任务 13、14、15 已完成，后续迭代继续沿用 `../specs/phase-1-mvp/tasklist.md` 的质量标准。

## 前置条件

- Node.js 20.9 或更高版本。
- pnpm 11.18.0，通过根 `package.json` 的 `packageManager` 固定版本。
- PostgreSQL 16，用于执行迁移和后续数据访问集成测试。
- Redis，用于会话、速率限制、审核锁、调度锁、幂等标记和短期缓存集成测试。

## 安装

```bash
# 恢复锁文件中记录的依赖
pnpm install --frozen-lockfile
```

pnpm 11 默认限制依赖生命周期脚本。仓库在 `pnpm-workspace.yaml` 中仅允许 `esbuild` 和 `unrs-resolver` 执行安装构建脚本，并将 `@napi-rs/wasm-runtime` 固定在兼容 peer dependency 的 1.1.6。

## 常用命令

```bash
# 同时启动 Web 和 API
pnpm dev

# 同时启动 Web、API 和 Worker
pnpm dev:all

# 单独启动 Worker 开发进程
pnpm --filter @familystar/api worker:dev

# 检查全部 TypeScript 工作区
pnpm typecheck

# 执行零警告 ESLint
pnpm lint

# 验证 Prettier 格式
pnpm format:check

# 自动格式化源码和配置
pnpm format

# 构建全部可构建工作区
pnpm build

# 执行排除集成与聚合文件的单元测试
pnpm test:unit

# 执行 Phase 1 HTTP 集成与并发回滚聚合测试
pnpm test:integration

# 执行单元测试并校验 V8 覆盖率阈值
pnpm test:coverage

# 执行 Playwright 双端浏览器 E2E
pnpm test:e2e

# 执行完整 CI 质量链路
pnpm quality

# 查看工作区识别结果
pnpm list --recursive --depth -1

# 验证 Web 视觉 Token 与响应式边界
pnpm --filter @familystar/web verify:design-system

# 验证 API 响应、健康检查、请求 ID、CORS 和日志契约
pnpm --filter @familystar/api verify:api-foundation

# 格式化并验证 Prisma Schema
pnpm db:format
pnpm db:validate

# 生成 Prisma Client
pnpm db:generate

# 验证核心模型与完整迁移历史契约
pnpm verify:data-model

# 将已提交迁移应用到目标数据库
pnpm db:migrate:deploy

# 写入可重复执行的非生产开发种子
pnpm db:seed
```

开发模式默认地址：

| 服务 | 地址 |
|---|---|
| Web | `http://localhost:3000` |
| API | `http://localhost:3001` |
| Worker 健康检查 | `http://localhost:3002/health` |

## 环境变量

复制 `.env.example` 中的非敏感变量到运行环境。API 读取以下变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `3001` | API 监听端口 |
| `WORKER_PORT` | `3002` | Worker 健康检查端口 |
| `WORKER_POLL_INTERVAL_MS` | `5000` | Worker 轮询周期 |
| `WORKER_BATCH_SIZE` | `100` | 单批作业上限 |
| `WORKER_LOCK_TTL_MS` | `300000` | Redis 调度锁 TTL |
| `MEDIA_CLEANUP_AGE_HOURS` | `24` | 未完成媒体上传保留小时数 |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | 公开 Web 基础地址 |
| `API_INTERNAL_URL` | `http://localhost:3001` | Next.js 服务端访问 Hono 的内部地址 |
| `DATABASE_URL` | 本地 PostgreSQL 占位连接串 | Prisma 与 API 使用的 PostgreSQL 连接 URL |
| `REDIS_URL` | `redis://localhost:6379` | API 使用的 Redis 连接 URL，支持 `redis://` 和 `rediss://` |
| `REDIS_KEY_PREFIX` | `familystar` | 当前部署环境的 Redis 键前缀 |
| `CREDENTIAL_VAULT_ACTIVE_KEY_VERSION` | 未配置 | 当前用于包裹新数据密钥的版本标识 |
| `CREDENTIAL_VAULT_MASTER_KEYS` | 未配置 | 版本到 Base64 编码 32 字节主密钥的 JSON 对象 |

环境变量由 Zod 在 API 启动时校验。错误日志仅包含无效字段名。

## 工作区职责

| 路径 | 职责 |
|---|---|
| `apps/web` | 页面、布局和浏览器交互 |
| `apps/api` | HTTP 路由、应用组合和 Node 进程入口 |
| `packages/shared` | 跨工作区公开类型 |
| `modules` | 独立业务模块包 |

## 开发工作流

1. 从 `dev` 分支实施当前 tasklist 检查项。
2. 在 `.monkeycode/docs/DEVELOPMENT_LOG.md` 登记任务范围和验证计划。
3. 完成当前任务范围内的代码与测试。
4. 执行相关类型检查、构建和测试。
5. 验证通过后更新 tasklist、项目文档和 GitHub Wiki。
6. 当前阶段验收完成后，将 `dev` 合并到 `main`。

## 添加工作区

应用放入 `apps/<name>`，共享库放入 `packages/<name>`，业务模块放入 `modules/<name>`。每个工作区通过独立 `package.json` 声明包名、脚本和依赖，内部依赖使用 `workspace:*`。

新增公开类型时，从包的 `src/index.ts` 导出，并在所有消费工作区运行 `pnpm typecheck`。业务模块之间通过后续任务定义的公开契约和事件通信。

## 构建产物

| 工作区 | 产物 |
|---|---|
| `apps/web` | `.next/` |
| `apps/api` | `dist/` |
| `packages/shared` | `dist/` 和 TypeScript 声明文件 |
| `modules` 与五个模块包 | 各自的 `dist/` 和 TypeScript 声明文件 |

这些目录由 `.gitignore` 排除。源代码和 `pnpm-lock.yaml` 需要纳入版本控制。

## 测试状态

任务 1.5 使用 Vitest 3.2.4 建立正式测试套件。任务 15 实现完成时完整 Vitest 套件共有 82 个测试文件和 528 项测试。测试覆盖基础设施、认证、任务编辑、孩子本人任务读取、任务打卡、媒体审核、家庭待审队列、积分等级、奖励库存、兑换状态机、愿望闭环、双端组件、安全边界、Worker 作业、容器静态契约、核心 HTTP 闭环及并发失败回滚。

`pnpm test:coverage` 使用 V8 检查核心源码，认证、家庭设置、任务、打卡、媒体、积分、等级、奖励、凭证、安全中间件和 Worker 均纳入统计，四项门禁均为 70%。阶段 12 最终验证中 statements 与 lines 为 80.59%、branches 为 78.11%、functions 为 90.19%。覆盖率产物位于 `coverage/unit/`，该目录不进入版本控制。

任务 15 已通过完整 Vitest 套件、核心 HTTP 闭环集成测试、覆盖率门禁、格式检查、零警告 Lint、全工作区类型检查、Prisma 契约、生产构建和 9 项 Playwright E2E。

产品补全阶段 11 的最新质量基线为聚焦回归 31 个文件、223 项和完整单元回归 131 个文件、986 项通过。全工作区类型检查、零警告 Lint、全局 Prettier、Prisma Schema、数据模型契约和全部生产构建均通过；`48d3bd0` 已对齐邀请仓储现行事件字段契约。

产品补全阶段 12 由 `23e7ed4`、`4cececb`、`d175b2e`、`f4a1b31` 和 `8158e08` 完成应用壳、容器 public 装配、IndexedDB v2、离线恢复与边界强化。最终 `i56-web` 的真实 Chromium 验证全部通过。

Playwright 通过全局 `@playwright/test` 与 Chromium 运行。根级 `playwright.config.cjs` 同时启动测试专用会话服务和临时 Next.js 服务，使服务端门户守卫经过真实 Cookie 与角色重定向路径；浏览器业务请求继续由每项测试的显式 API 契约夹具承接。九页家长巡检具有 120 秒独立预算，其余用例使用 60 秒预算。运行中的 `next dev` 与 `next build` 共享 `.next`，执行完整质量链路前应停止预览服务，门禁完成后再重启预览。

## Worker 开发

- Worker 入口为 `apps/api/src/worker.ts`，组合代码位于 `apps/api/src/worker/`。
- `pnpm --filter @familystar/api worker:start` 启动已构建进程；本地完整开发使用 `pnpm dev:all`。
- 新作业需要稳定名称、确定性运行键、有界批量和 JSON-safe 结果摘要，并通过 `WorkerJobRunner` 复用锁、运行记录和退避机制。
- 对账类作业默认只报告差异；修复通过现有审计型领域写入完成。
- 聚焦验证命令为 `pnpm exec vitest run apps/api/src/worker`。

## Docker 双环境

开发环境使用 `.env.compose.example` 准备变量，并由 `compose.dev.yml` 本地构建 Web、API 和 Worker。唯一公开入口为 `http://localhost:8098`。

生产环境使用 `compose.prod.yml`，要求提供单一镜像仓库、不可变基础标签、公开地址、数据库密码和凭证保险库配置。Compose 分别追加 `-web`、`-api` 和 `-worker` 标签后缀；唯一公开入口为 `0.0.0.0:8099`，API、Worker、PostgreSQL 和 Redis 仅通过内部网络通信。

迁移服务等待 PostgreSQL 和 Redis 健康后执行 `prisma migrate deploy`；API 与 Worker 等待迁移成功，Web 再等待 API 健康。容器运行细节见 `专有概念/ContainerRuntime.md`。

Web 运行镜像必须同时包含 `.next/standalone`、`.next/static` 和 `apps/web/public`。最后一项承载 `sw.js`、`sw-policy.js`、`sw-runtime.js` 与 PWA 图标；容器契约测试锁定该复制边界。

## 家长认证开发

- 认证代码位于 `apps/api/src/family-auth/`，通过小型仓储、密码和会话端口隔离 PostgreSQL、bcrypt 与 Redis I/O。
- `bcryptjs` 使用 3.0.2，家长密码 cost 固定为 12；新增凭据入口同时验证字符下限和 72 字节上限。
- 注册默认值集中在 `constants.ts`，其任务类型和等级阈值来自 v5 PRD。
- API 进程启动时创建 Prisma Client 和惰性 Redis 命令端口，首次认证请求才建立外部连接。
- 邀请服务复用 Redis 家长会话，将邀请写入和邮件请求事件放入同一 Prisma 事务。
- `20260730120000_harden_parent_invitations` 为家庭待处理邀请增加大小写不敏感唯一索引和状态一致性约束。
- 邮件配置为 `VERIFIED` 时排队 Outbox 副作用；独立 Worker 的 Outbox 作业负责周期投递。
- 孩子档案由独立领域服务和 Prisma 适配器管理，所有查询与写入同时限定 `familyId`、`CHILD` 和活动状态。
- 孩子 PIN 为 4 至 6 位数字，密码至少 6 位且含字母；两种凭据均校验 bcrypt 72 字节边界并使用 cost 12 哈希。
- 账号切换接受家长或孩子会话作为家庭上下文，通过孩子凭据后创建角色为 `child` 的新会话。
- 孩子认证状态使用 `failedLoginAttempts`、`lockedUntil` 和 `version` 执行乐观更新；第 5 次连续失败锁定 15 分钟，成功登录清零。
- `RedisChildLoginRateLimiter` 使用家庭与孩子范围的 10 次/15 分钟固定窗口，HTTP 响应分别暴露锁定和限流剩余秒数。
- `RedisSessionStore` 为每个主体维护 revision；有效读取续期 30 天，凭据变更和软删除通过递增 revision 撤销旧会话。
- 聚焦验证命令为 `pnpm exec vitest run apps/api/src/family-auth`。

## 统一家庭登录开发

- 根路径控制器位于 `apps/web/components/auth-landing.tsx`，认证请求与错误映射位于 `apps/web/lib/auth.ts`。
- 浏览器只请求同源 `/api/v1`；已有会话、家长登录注册、家庭码查询和孩子登录均使用统一响应信封。
- 家庭码在浏览器和服务端始终按字符串处理；输入使用数字键盘提示，服务端执行严格 6 位数字校验并保留前导零。
- `20260801130000_migrate_family_codes_to_six_digits` 在事务和独占表锁内为历史家庭换码，家庭数量超过 100 万时终止迁移；数据库字段、CHECK 和唯一索引提供最终格式与冲突保护。
- 登录成功使用 `router.replace()` 进入角色门户，避免浏览器返回到登录入口；本地角色信息仅用于现有门户显示，API 授权继续以 HttpOnly 会话为准。
- 家长和孩子门户页面在服务端调用 `/api/v1/auth/session` 校验有效会话与角色，失效会话在业务组件渲染前返回统一入口，角色不匹配时进入对应门户。
- 双端退出使用 `POST /api/v1/auth/logout` 删除当前 Redis 令牌和 Cookie，成功后清理 `familystar_role`、`familystar_family_code` 与 `familystar_child_id`。
- 门户 API 资源通过 `apps/web/lib/api-resource.ts` 区分 `loading`、`live`、`empty` 和 `error`；空数组是有效空状态，缺少必需响应字段进入错误状态。
- 门户写操作仅使用服务端成功响应更新数据；请求失败保留当前真实数据并呈现错误。缺少读取接口的业务区域保持受限空态。
- 家长端单人任务请求由 `buildSoloTaskDraft()` 集中构造。可选文本字段先去除首尾空白，空值从 JSON 请求中省略，避免与 API 的 optional non-empty Schema 产生契约漂移。
- 聚焦验证命令为 `pnpm exec vitest run apps/web/components/auth-landing.test.tsx apps/web/lib/auth.test.ts apps/api/src/family-auth`。
- 阶段 3 集成测试位于 `apps/api/src/phase-1-family-auth.integration.test.ts`，使用 copy-on-write 数据库状态和共享内存 Redis 命令端口组合真实领域服务。

## 家庭设置开发

- 领域代码位于 `apps/api/src/family-settings/`，服务通过 `SessionStore` 与小型 Prisma 仓储端口隔离认证和数据库 I/O。
- HTTP 使用 snake_case，JSONB 使用 camelCase；新增字段时同步更新类型、规范化逻辑、路由映射和默认设置。
- GET 必须为历史空对象和缺字段记录补齐默认值；PATCH 使用部分输入并保存完整规范设置，同时保留其他家庭 JSON 字段。
- 时区使用 IANA 标识；截止时间使用严格 `HH:mm`；天数、小时和额度使用非负安全整数；Streak 天数固定为 3、7、14、30、60、100。
- 聚焦验证命令为 `pnpm exec vitest run apps/api/src/family-settings`。

## 家庭模块开发

- 共享目录位于 `packages/shared/src/family-modules.ts`；核心模块、可选模块、默认状态和依赖必须在同一拓扑中维护。
- API 通过 `Family.settings.modules` 保存可选状态并以 `settingsVersion` 保护更新。PATCH 仅接受可选模块，创建者权限和依赖冲突由领域服务验证。
- 新增受模块控制的 API 时，在 `apps/api/src/security/access-policy.ts` 登记可选模块键；中间件只使用已认证会话的家庭读取状态。
- Web 的路由映射位于 `apps/web/lib/family-modules.ts`。读取失败时核心入口保持可用，可选入口进入关闭状态；设置成功后发布同页更新事件。
- 聚焦验证命令为 `pnpm exec vitest run packages/shared/src/family-modules.test.ts apps/api/src/family-settings apps/api/src/security apps/web/lib/family-modules.test.ts apps/web/components/portal-shells.test.tsx apps/web/components/parent-portal.test.tsx`。

## 孩子主题开发

- 共享主题目录位于 `packages/shared/src/themes.ts`；每个主题定义稳定键、最低等级和 5 个受控 CSS Token。
- API 领域位于 `apps/api/src/themes/`。读取和写入始终限定会话家庭、孩子主体、`CHILD` 角色与活动状态，保存时再次校验最低等级。
- 数据库迁移为 `User.selectedTheme` 提供 `starlight` 默认值及键格式 CHECK；新增主题时保持键长度不超过 40。
- Web 只通过 `trustedThemeTokens()` 应用与共享目录完全匹配的 Token，孩子 Shell 监听选择事件并更新根容器 CSS variables。
- 聚焦验证命令为 `pnpm exec vitest run packages/shared/src/themes.test.ts apps/api/src/themes apps/web/lib/themes.test.ts apps/web/components/child-portal.test.tsx apps/web/components/portal-shells.test.tsx`。

## 任务领域开发

- 领域代码位于 `apps/api/src/tasks/`，任务类型、任务、分配、频率和协作调度均通过小型端口隔离 Prisma 与 HTTP。
- HTTP 使用 snake_case，领域和 JSONB 频率使用 camelCase；频率新增变体时同步更新判别联合、路由映射、规范化和表驱动测试。
- Task 与 TaskAssignment 在同一 Prisma 事务中写入；替换分配使用软删除和唯一键 upsert，支持恢复历史分配。
- 家长编辑普通任务字段时省略 assignments 并保留既有分配；可选说明使用 `null` 表达显式清空。
- `GET /api/v1/tasks/me` 从孩子会话获取家庭和主体边界，按请求自然日期过滤活动 assignment、日期范围和生效频率，并应用逐孩覆盖。
- 协作调度按家庭自然日期生成参与者与奖励积分快照，数据库唯一键负责并发下的最终幂等保护。
- 聚焦验证命令为 `pnpm exec vitest run apps/api/src/tasks`。
- Web 任务创建、编辑和孩子任务读取回归验证命令为 `pnpm exec vitest run apps/web/lib/parent-portal.test.ts apps/web/components/parent-portal.test.tsx apps/web/lib/child-portal.test.ts apps/web/components/child-portal.test.tsx apps/api/src/tasks/routes.test.ts apps/api/src/tasks/task-service.test.ts apps/api/src/tasks/prisma-task-repository.test.ts apps/api/src/security/middleware.test.ts`。

## 打卡与媒体开发

- `apps/api/src/check-ins/` 管理单人和协作提交；HTTP、领域服务与 Prisma 仓储通过 `CheckInOperations` 和 `CheckInRepository` 分层。
- `apps/api/src/media/` 管理 COS multipart 上传、对象校验和私有读 URL；永久凭证仅在单次服务请求中通过 `CredentialVault` 解密。
- 单人提交允许当前日期或补打窗口内的过去日期；当天超过家庭截止时间后拒绝提交，过去日期按家庭自然日计算补打窗口。
- `CHECKBOX`、`TEXT`、`PHOTO`、`VIDEO` 和 `MIXED` 使用统一内容校验；最多 9 张图片、1 个视频、视频最长 180 秒且不超过 100MB。
- 上传完成接口只接受空对象，服务端从 COS 读取对象并校验 MIME、魔数、字节数和 SHA-256；客户端对象字节不进入 API 请求。
- 聚焦验证命令为 `pnpm exec vitest run apps/api/src/check-ins apps/api/src/media apps/api/src/phase-1-check-in-media.integration.test.ts`。

## PWA 与离线打卡开发

- PWA 入口位于 `apps/web/app/manifest.ts`、`apps/web/app/offline/route.ts` 和 `apps/web/public/sw*.js`。缓存版本变化时更新 `PWA_CACHE_VERSION`，激活阶段只清理 `familystar-pwa-` 前缀旧缓存。
- 请求分类保持公开缓存边界：API、认证、私有、跨源、授权与写请求 bypass；导航 network-first；`/_next/static/` cache-first；其余公开静态资源 stale-while-revalidate。缓存请求省略凭据，缓存响应排除私有指令、Cookie、重定向和跨源结果。
- 离线仓储位于 `apps/web/lib/offline-check-in-repository.ts`。Schema 变更需要递增数据库版本并同步 object store、索引、旧记录隔离和 IndexedDB 测试。
- 普通 TICK/TEXT 请求保存原始打卡幂等键并按创建顺序恢复。队首 conflict 或 business-failed 会阻塞后续记录，用户可显式重试或删除；网络与 5xx 使用有界退避，401/403 等待重新认证。
- PHOTO/VIDEO/MIXED 保存本地 Blob，单图上限 25MB、单视频上限 100MB、全部草稿最多 10 个文件与 200MB。用户确认后才开始上传，并复用每文件上传键和整次打卡键。
- owner 由已验证孩子 session 派生并保存为 `{ familyId, childId }`。离线启动可读取本地 owner 展示其草稿，自动重放需要在线 session 再授权；父级、畸形和 v1 无 owner 数据不会进入当前队列。
- 聚焦验证命令为 `pnpm exec vitest run apps/web/app/manifest.test.ts apps/web/app/offline/route.test.ts apps/web/components/service-worker-registration.test.ts apps/web/lib/pwa-cache-policy.test.ts apps/web/lib/pwa-cache-runtime.test.ts apps/web/lib/check-in-submission.test.ts apps/web/lib/offline-check-in-repository.test.ts apps/web/lib/offline-owner-scope.test.ts apps/web/lib/offline-check-in-runner.test.ts apps/web/components/offline-check-in-status.test.tsx apps/web/components/child-portal.test.tsx apps/api/src/worker/container-contract.test.ts`。

## 提交审核开发

- 审核代码位于 `apps/api/src/check-ins/review-types.ts`、`review-service.ts`、`review-timeout-service.ts`、`review-prisma-repository.ts` 和 `review-routes.ts`。
- `GET /api/v1/family/submission-reviews/pending` 合并本家庭单人和协作 `PENDING` 聚合，返回任务、孩子、latest attempt 内容、媒体摘要和提交时间，并以稳定顺序限制为 100 条。
- HTTP 和领域层要求家长会话；拒绝原因去除首尾空白后必须非空，请求 reason 上限为 2000 字符。
- 所有审核写入要求 `Idempotency-Key`；同一家庭和目标的重试返回既有结果，跨目标复用同一键返回冲突。
- `keys.reviewLock()` 构造目标级 Redis 键，服务通过 10 秒 owner-lock 串行化同一提交的审核，并在锁内复查幂等记录。
- Prisma 仓储在一个事务中条件更新 `PENDING` 聚合并创建关联最新 attempt 的 `SubmissionReview`；数据库唯一约束处理最终竞争。
- `SubmissionReviewTimeoutService.runBatch()` 每次只读取一个有界候选批次，按家庭设置和最新 attempt 提交时间判断到期，并使用 `timeout:<targetType>:<attemptId>` 作为确定性幂等键。
- 超时审核与家长审核复用目标锁；自动事务再次核对最新 attempt 和 `PENDING`，冲突与重复执行返回安全跳过。独立 Worker 按分钟运行键周期调用单批执行器。
- 家长 Web 审核请求使用 `review:<attemptId>:<decision>` 稳定幂等键；写入成功后重新读取权威队列，失败时保留当前记录。
- 聚焦验证命令为 `pnpm exec vitest run apps/api/src/check-ins/review-service.test.ts apps/api/src/check-ins/review-prisma-repository.test.ts apps/api/src/check-ins/review-timeout-service.test.ts apps/api/src/check-ins/review-routes.test.ts`。

## 积分事务开发

- 积分代码位于 `apps/api/src/points/`；`logic.ts` 保持纯计算，`prisma-writer.ts` 负责可重放事务与持久化。
- 所有积分整数同时校验 JavaScript 安全整数和 PostgreSQL `Int` 上限；EARN delta 必须为正，任何变化后的当前余额必须非负。
- `calculateStreakAward()` 将当前奖励日期纳入活动日，使用 `Set` 对家庭自然日去重并逐日向前计算，遇到断档即停止；从家庭固定六档中选择已达到的最高档并使用 `Math.round` 计算实得积分。
- 单人打卡积分业务键固定为 `(EARN, check_in, checkInId, childId)`，协作周期积分业务键固定为 `(EARN, collaboration_round, roundId, childId)`；新增积分来源时先定义稳定业务键和幂等重放语义。
- Streak 查询同时读取该孩子截至奖励日的已通过单人打卡日期和已完成协作周期结束日期；单人将结果快照到 `CheckIn`，协作将结果快照到活动 `CollaborationRoundParticipant`。
- 协作审核或 AUTO 提交通过后调用 `completeCollaborationRound()`；该方法仅在全部活动参与者提交均为 `APPROVED` 时完成周期，并按每人的 `rewardPointsSnapshot` 发分。
- 乐观锁更新必须同时限定用户 ID、家庭 ID、版本和活动状态，并递增 `version`；完整业务事务最多尝试 3 次。
- P2002 恢复只包围 `PointsLog.create()`；必须等待事务回滚后再使用主 Prisma client 查询既有流水，防止 PostgreSQL 失败事务继续查询。
- 状态更新、积分余额、流水、聚合快照和 Outbox 必须使用同一 transaction client。`PrismaPointsTransactionWriter` 通过业务回调保持该边界。
- 聚焦验证命令为 `pnpm exec vitest run apps/api/src/points apps/api/src/check-ins/prisma-repository.test.ts apps/api/src/check-ins/review-prisma-repository.test.ts`。

## 等级领域开发

- 等级代码位于 `apps/api/src/levels/`；`logic.ts` 负责纯派生，服务负责会话角色，Prisma 仓储负责家庭范围读取，路由负责 snake_case 输出和 Cookie 续期。
- 资格等级仅使用 `pointsEarnedTotal` 和家庭 `LevelConfig.pointsRequired`；当前等级取缓存等级与资格等级的最大值并限制在 1 至 20。
- EARN 积分事务同步 `currentLevel`，跨级时在同一事务追加 `levels.level.advanced.v1`；幂等积分命中不会重复发出升级事件。
- 有效免审批额度取家庭设置与当前等级配置的最大值；折扣、许愿槽位和扩展维度直接读取当前等级配置。
- 聚焦验证命令为 `pnpm exec vitest run apps/api/src/levels apps/api/src/points/prisma-writer.test.ts`。

## 奖励领域开发

- 奖励代码位于 `apps/api/src/rewards/`；纯规则、服务、Prisma 仓储和 Hono 路由保持分层，HTTP 使用 snake_case。
- 家长管理本家庭奖励，孩子只读取上架奖励；图片必须引用本家庭 READY IMAGE 媒体。
- 兑换请求要求家庭级 `Idempotency-Key`，fingerprint 固定绑定孩子和奖励；相同请求返回既有兑换，键复用到不同请求返回冲突。
- 有限库存使用数据库单条条件更新预占；待审批或待兑现兑换存在时，有限与无限库存模式保持稳定。
- REDEEM 与 REFUND 复用积分 writer 的乐观锁和最多 3 次事务重试；两者只改变当前余额，累计获得积分保持不变。
- 愿望槽位从当前等级权益读取，余额进度实时计算；取消和采纳均为终态转换。
- 聚焦验证命令为 `pnpm exec vitest run apps/api/src/rewards apps/api/src/points/redemption-writer.test.ts`。

任务 1.6 检查点复跑单元测试、Web 视觉契约、API 基础契约、peer dependency、格式、Lint、严格类型检查、生产构建和同源健康检查，全部通过。

## 数据库开发

- Prisma Schema 位于 `apps/api/prisma/schema.prisma`。
- 初始迁移位于 `apps/api/prisma/migrations/20260730000000_initial_core_models/`。
- Outbox 增量迁移位于 `apps/api/prisma/migrations/20260730100000_add_outbox_events/`。
- 凭证保险库增量迁移位于 `apps/api/prisma/migrations/20260730110000_add_family_credential_vault/`。
- 双家长邀请保护迁移位于 `apps/api/prisma/migrations/20260730120000_harden_parent_invitations/`。
- 用户角色凭据保护迁移位于 `apps/api/prisma/migrations/20260730130000_harden_user_role_credentials/`。
- 打卡重提与媒体上传迁移位于 `apps/api/prisma/migrations/20260731100000_add_checkin_attempts_and_media_uploads/`。
- 提交审核历史迁移位于 `apps/api/prisma/migrations/20260731110000_add_submission_reviews/`，包含人工/超时来源及来源与审核人一致性约束。
- 协作奖励快照迁移位于 `apps/api/prisma/migrations/20260731120000_add_collaboration_awards/`，追加 `points_earned`、`streak_multiplier` 及成对正值约束。
- 奖励兑换与愿望保护迁移位于 `apps/api/prisma/migrations/20260731130000_add_reward_redemption_wish_guards/`，追加请求指纹、愿望终态时间、状态一致性约束、频次索引和退款唯一索引。
- 家庭模块设置迁移位于 `apps/api/prisma/migrations/20260808100000_add_family_module_settings/`，补齐模块 JSON 并增加非负 `settings_version` 乐观锁。
- 孩子主题迁移位于 `apps/api/prisma/migrations/20260808110000_add_user_selected_theme/`，增加默认主题和键格式约束。
- Prisma Client 在 API 生产构建前自动生成。
- `pnpm verify:data-model` 按目录顺序读取迁移历史，并检查核心模型、家庭边界、业务唯一键、Outbox 约束和关键索引。
- 修改 datamodel 后先执行 `pnpm db:format`、`pnpm db:validate` 和 `pnpm db:generate`，再生成并审查 SQL 迁移。
- `pnpm db:migrate:deploy` 需要目标环境显式提供有效 `DATABASE_URL`。
- `pnpm db:seed` 仅用于非生产环境，使用固定 UUID 创建两组完整家庭场景；重复执行保留运行态积分、库存计数和业务历史。

## API 请求基础

- 浏览器统一请求 `/api/v1/...`，Next.js rewrite 使用 `API_INTERNAL_URL` 转发至内部 Hono 服务。
- API 通过成功或失败信封返回数据，并在 `meta` 中携带请求 ID 和 UTC 时间。
- 调用方提供的安全 `X-Request-Id` 可用于跨服务关联；其余输入由服务端 UUID 替换。
- API 请求日志为单行 JSON，记录 `event`、`request_id`、方法、路径、状态和耗时。
- `GET /api/v1/health` 用于运行态健康验证。

Next.js 14 的 `next dev` 与 `next build` 共用 `apps/web/.next`。开发服务器运行期间执行生产构建后，需要通过受管后台终端重启 `pnpm dev`，再继续预览验证。

## Redis 开发

- `apps/api/src/infrastructure/redis/client.ts` 创建 node-redis 客户端并管理连接生命周期。
- `keys.ts` 是所有 Redis 键的唯一构造入口；业务代码通过用途和实体标识生成键，审核服务使用 `review-lock:<target-type>:<target-id>` 分区。
- `primitives.ts` 提供可注入的命令端口及会话、限流、锁、幂等和缓存基础操作。
- 客户端默认关闭离线队列，连接不可用时命令快速失败；重连延迟最高为 3 秒。
- Redis 错误日志只记录事件和错误类型，不记录 URL、错误消息或凭据。
- 单元测试使用假命令端口验证原子命令；任务 11 在 Docker Redis 运行态补充集成验证。

## 插件开发

- 从 `@familystar/shared` 导入 `Plugin`、`PluginManifest` 和 `PluginRegistry`，业务模块无需引用 API 内部路径。
- 插件名使用小写字母、数字和连字符；事件名使用 `<module>.<entity>.<event>.v<version>`。
- 应用组合层创建 Registry 并传入核心许可清单和共享上下文，再按依赖拓扑顺序注册静态插件清单。
- 生命周期回调只完成插件自身的初始化与清理；跨插件通信使用 manifest 绑定的 EventBus scope。
- 应用关闭与测试清理按注册顺序的反向顺序调用 `unregister()`。
- 动态导入和运行时热插拔保留至 Phase 2。
- 每个业务模块使用独立 workspace package，在 `src/manifest.json` 声明能力、依赖、权限和事件，并仅通过 `src/index.ts` 公开 manifest 与插件。
- `@familystar/business-modules` 是应用组合入口；新增依赖时同步调整静态列表顺序，并确保每个依赖先于使用方。
- 进程启动仍注册完整静态插件清单；家庭模块设置负责 API 授权和 Web 可见性，不改变运行时插件装载。

## 事件与 Outbox 开发

- 从 `@familystar/shared` 使用 `createDomainEvent()` 创建事件，名称遵循 `<module>.<entity>.<event>.v<version>`，payload 只包含 JSON-safe 数据。
- 插件必须在 manifest 中声明发布和订阅事件；发布事件同时使用插件自身命名空间。
- 业务服务通过 `runWithOutbox()` 返回业务结果与事件列表，确保 mutation 和 append 共用 Prisma transaction client。
- Outbox Worker 使用 `OutboxDispatcher` 执行单批投递，并按 5 秒运行键进入通用调度循环。
- 领域处理器通过 `IdempotentEventConsumer` 包装；Redis receipt 提供快速去重，数据库唯一约束提供最终保护。
- 单元测试可注入 transaction runner、repository、publisher、clock、owner token factory 和 Redis command port。
- `apps/api/src/phase-1-infrastructure.integration.test.ts` 使用状态型内存 I/O 适配器组合真实 Registry、EventBus、Dispatcher、幂等消费者、凭证保险库和 Prisma 仓储；真实 PostgreSQL 与 Redis 并发运行态纳入阶段 12 验证。

## Web 视觉基础

- `apps/web/tailwind.config.cjs` 将 FamilyStar 色彩、圆角、阴影、字号、字体和响应式边界公开为 Tailwind theme。
- `apps/web/app/globals.css` 保存同源 CSS 变量、基础页面背景、焦点样式和减少动效偏好。
- 孩子主题在 `.child-theme-shell` 根容器覆盖背景、表面、主色、辅色和文字 5 个变量；应用前必须通过共享目录值匹配校验。
- `next/font/google` 自托管 Fredoka 与 Nunito，Tailwind 使用 `font-display` 和 `font-sans` 消费字体变量。
- Lucide 图标使用 `lucide-react` 具名导入；装饰图标保持 `aria-hidden`，有语义图标提供可访问名称。
- 页面容器最大宽度为 1200px，手机区间使用 16px 横向留白，其余区间使用 20px。

## 孩子端开发

- 孩子端入口位于 `apps/web/app/child/`，六个 section 由 `apps/web/lib/child-portal.ts` 的固定白名单映射。
- `ChildShell` 提供身份提示、账号切换、通知入口、模块过滤、主题应用和五项底部导航；记录页沿用“我的”激活状态。
- `ChildPortal` 对等级、奖励、兑换、愿望、切换目标和今日任务使用同源 API。缺少聚合读取接口的区域显示受限空态。
- 当前孩子由等级接口的 `user_id` 与真实切换目标关联；兑换和愿望响应按该 ID 过滤本人记录。主页与今日打卡页使用浏览器本地自然日期读取 `/tasks/me`，完整打卡提交表单后续接入。
- 兑换写请求生成作用域幂等键，成功后使用服务端记录更新视图；失败时保留已加载数据并显示错误。
- 密码模式通过 `PATCH /api/v1/auth/child/password` 修改密码，成功后撤销该孩子全部会话并要求重新认证。
- 聚焦验证命令为 `pnpm exec vitest run apps/web/lib/api-resource.test.ts apps/web/lib/child-portal.test.ts apps/web/components/child-portal.test.tsx apps/api/src/family-auth/child-service.test.ts apps/api/src/family-auth/child-routes.test.ts apps/api/src/tasks/routes.test.ts apps/api/src/tasks/task-service.test.ts apps/api/src/tasks/prisma-task-repository.test.ts apps/api/src/security/middleware.test.ts`。

## TypeScript 基线

全部 TypeScript 工作区继承根 `tsconfig.base.json`。基线启用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`、`noFallthroughCasesInSwitch` 和 `useUnknownInCatchVariables`。工作区配置仅定义运行目标、模块系统和构建输出差异。

## 安全约束

- `.env` 和 `.env.*` 默认不进入版本控制，`.env.example` 允许提交占位配置。
- 源码、日志和文档均不得保存密码、私钥、令牌或家庭集成凭据。
- 客户端不能覆盖认证上下文中的家庭边界。
- 新增受保护路由时同步更新 `apps/api/src/security/middleware.ts` 的角色矩阵，并覆盖无会话、错误角色和家庭 ID 冲突测试。
- 写接口只允许精确 `PUBLIC_BASE_URL` 浏览器来源；测试应覆盖恶意 Origin 与 `Sec-Fetch-Site: cross-site`。
- 审计 metadata 使用显式允许列表，严禁保存请求体、Cookie、认证头、凭证明文或完整签名 URL。
- 家庭集成读取允许两位家长，新增、更新、测试和删除只允许 `Family.createdById` 对应的活动家长。
- 主密钥只通过服务器运行环境提供，仓库中的 `.env.example` 仅描述变量形态。
- 每条家庭集成记录使用独立数据密钥和 nonce，认证关联数据固定家庭、类型与记录边界。
- 主密钥轮换保留历史版本用于解包，并通过重包裹将记录逐步迁移到活动版本。
- 外部连接测试通过 `IntegrationVerifier` 注入；邮件与 COS 的运行态 verifier 和真实数据库验证随阶段 11 Docker 环境组合。
- 阶段 10 聚焦验证命令为 `pnpm exec vitest run apps/api/src/security apps/api/src/infrastructure/credentials apps/api/src/tasks/prisma-task-repository.test.ts apps/api/src/family-auth/prisma-repository.test.ts`。
