# API 模块

`apps/api` 包含 FamilyStar REST API 与独立后台 Worker。API 使用 Hono 定义应用并通过 `@hono/node-server` 启动；Worker 复用领域适配器并提供独立健康服务器。

## 关键文件

| 文件 | 目的 |
|---|---|
| `src/app.ts` | Hono 应用和路由定义，可供测试直接导入 |
| `src/config/environment.ts` | Zod 环境 Schema、类型和解析器 |
| `src/http/request-context.ts` | 请求 ID 校验、生成与响应头回写 |
| `src/http/request-logger.ts` | 单行 JSON 请求日志 |
| `src/http/responses.ts` | 成功与失败响应构造器 |
| `src/events/event-bus.ts` | manifest 绑定的 EventBus 与可信 Outbox 发布入口 |
| `src/events/outbox.ts` | 事务 Outbox 端口、分发器和重试策略 |
| `src/events/prisma-outbox.ts` | Prisma transaction、append、claim、确认和重排适配器 |
| `src/events/idempotent-consumer.ts` | 可注入 receipt 的幂等消费者包装器 |
| `src/events/redis-event-receipts.ts` | Redis 幂等 receipt 适配器 |
| `src/infrastructure/credentials/keyring.ts` | 版本化主密钥配置与可用状态 |
| `src/infrastructure/credentials/vault.ts` | AES-256-GCM 信封加密、解密与数据密钥重包裹 |
| `src/infrastructure/credentials/prisma-repository.ts` | 家庭范围密文读取与乐观重包裹更新 |
| `src/infrastructure/credentials/runtime.ts` | API 启动时保险库初始化和进程级访问 |
| `prisma/migrations/20260730100000_add_outbox_events/migration.sql` | Outbox 表、约束与索引增量迁移 |
| `src/family-auth/invitation-service.ts` | 双家长邀请、令牌、邮件降级和接受流程 |
| `src/family-auth/prisma-repository.ts` | 家庭初始化、邀请行锁和第二家长事务适配 |
| `prisma/migrations/20260730120000_harden_parent_invitations/migration.sql` | 待处理邀请唯一索引与状态约束 |
| `src/family-auth/child-service.ts` | 孩子档案、凭据规则、权限和账号切换决策 |
| `src/family-auth/child-repository.ts` | 家庭范围孩子 CRUD、软删除和头像归属适配 |
| `src/family-auth/child-routes.ts` | 孩子档案与家庭内账号切换 HTTP 契约 |
| `src/family-auth/login-rate-limiter.ts` | 家庭与孩子范围的 Redis 登录固定窗口 |
| `src/family-auth/session-store.ts` | 滚动 TTL、单令牌退出、主体 revision 与批量会话撤销 |
| `src/family-settings/service.ts` | 家庭规则默认合并、家长权限和字段校验 |
| `src/family-settings/prisma-repository.ts` | 活动家庭 JSONB 设置读写适配 |
| `src/family-settings/routes.ts` | 家庭设置 GET/PATCH HTTP 契约与 Cookie 续期 |
| `src/check-ins/service.ts` | 单人/协作打卡、日期窗口、幂等与重提状态机 |
| `src/check-ins/prisma-repository.ts` | 家庭范围打卡聚合、attempt 历史和媒体关联事务 |
| `src/check-ins/routes.ts` | 单人/协作提交与查询 HTTP 契约 |
| `src/check-ins/review-service.ts` | 家长待审队列、审核权限、拒绝原因、幂等与 Redis owner-lock 协调 |
| `src/check-ins/review-timeout-service.ts` | 家庭级超时判断、有界单批自动通过和冲突安全跳过 |
| `src/check-ins/review-prisma-repository.ts` | 单人/协作待审与超时候选读取、条件更新和 attempt 级审核历史事务 |
| `src/check-ins/review-routes.ts` | 家庭待审队列、单人/协作审核写入与历史查询 HTTP 契约 |
| `src/points/logic.ts` | 积分方向、双余额、连续自然日 Streak、同日去重、断档停止和整数四舍五入纯规则 |
| `src/points/prisma-writer.ts` | 单人/协作幂等 EARN、Streak 查询、乐观锁重试、奖励快照和 Outbox 事务 |
| `src/levels/logic.ts` | 累计积分等级资格、只升不降当前等级、权益和下级进度纯派生 |
| `src/levels/prisma-repository.ts` | 家庭范围孩子等级、家庭额度和 20 级配置读取 |
| `src/levels/routes.ts` | 孩子本人和家长读取等级的 HTTP 契约 |
| `src/rewards/logic.ts` | 奖励输入、资格、折扣、免审批和愿望进度纯规则 |
| `src/rewards/service.ts` | 家长/孩子权限、输入规范化和兑换请求指纹 |
| `src/rewards/prisma-repository.ts` | 奖励、库存、兑换和愿望的家庭范围事务适配 |
| `src/rewards/routes.ts` | 奖励、兑换与愿望 HTTP 契约 |
| `src/media/service.ts` | COS multipart 生命周期、凭证解密和对象验证 |
| `src/media/cos-client.ts` | 腾讯云 COS V5 签名与 HTTP 客户端 |
| `src/media/prisma-repository.ts` | 媒体资产、上传会话和分片持久化 |
| `src/media/routes.ts` | 上传初始化、分片授权、完成、重试和访问 URL 契约 |
| `src/phase-1-check-in-media.integration.test.ts` | 阶段 5 打卡和媒体 HTTP 集成测试 |
| `prisma/migrations/20260731110000_add_submission_reviews/migration.sql` | 提交审核历史、来源审核人一致性、目标、拒绝原因和幂等保护迁移 |
| `prisma/migrations/20260731120000_add_collaboration_awards/migration.sql` | 协作参与者实得积分、Streak 倍率快照及成对正值约束迁移 |
| `prisma/migrations/20260731130000_add_reward_redemption_wish_guards/migration.sql` | 兑换请求指纹、愿望终态时间、状态一致性与退款唯一保护迁移 |
| `src/phase-1-family-auth.integration.test.ts` | 阶段 3 家庭初始化、邀请、PIN 锁定与会话撤销集成测试 |
| `prisma/migrations/20260730130000_harden_user_role_credentials/migration.sql` | 家长与孩子角色凭据一致性约束 |
| `src/app.test.ts` | 服务信息、健康检查和错误映射测试 |
| `src/config/environment.test.ts` | 环境默认值、合法值、边界和脱敏错误测试 |
| `src/http/responses.test.ts` | 成功与失败响应构造器测试 |
| `src/server.ts` | 校验环境、注册静态业务模块并启动 Node.js 服务 |
| `src/worker.ts` | 校验环境、组合 Worker 运行时并启动健康服务器 |
| `src/worker/runtime.ts` | 组合五类作业、Prisma、Redis、COS 与领域执行器 |
| `src/worker/job-runner.ts` | Redis 锁、数据库 claim、三次退避和结果记录 |
| `src/worker/scheduler.ts` | 周期轮询、失败隔离和健康快照 |
| `src/worker/jobs.ts` | 五类作业定义与 Prisma 批处理仓储 |
| `prisma/migrations/20260731140000_add_worker_job_runs/migration.sql` | Worker 运行记录、唯一防重和状态约束迁移 |
| `scripts/verify-api-foundation.ts` | API 请求基础契约验证 |
| `tsconfig.build.json` | 生成 `dist/` 运行产物 |

## 当前接口

`GET /api/v1` 返回服务名称和版本，`GET /api/v1/health` 返回进程健康状态。业务端点提供认证、家庭设置、家长任务管理、孩子本人任务读取、单人/协作打卡、媒体、家庭待审队列、审核、等级、奖励、兑换和愿望。孩子任务端点只允许孩子会话读取指定日期内本人有效分配；待审队列仅允许家长读取当前家庭最多 100 条 `PENDING` 记录；奖励路由按家长与孩子角色限制管理和可见范围，兑换路由覆盖申请、列表、批准、兑现与拒绝，愿望路由覆盖创建、取消与采纳。全部端点使用统一响应信封。

API 在启动监听前校验基础环境、初始化凭证保险库并注册五个静态插件。组合根创建共享的 `PrismaPointsTransactionWriter`，注入打卡、审核和奖励仓储，使 EARN、REDEEM 与 REFUND 共用乐观锁、幂等流水、Outbox 和 `Serializable` 事务。Worker 独立组合审核超时、协作调度、Outbox、媒体清理和积分对账周期。

## 验证

使用根级 `pnpm test` 执行测试，使用 `pnpm test:coverage` 校验核心源码覆盖率门禁。任务 15 实现完成时完整 Vitest 套件共有 82 个测试文件和 528 项测试，Playwright 浏览器回归为 9 项。真实 PostgreSQL、Redis 与 COS 运行态纳入阶段 12 验证。
