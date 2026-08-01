# FamilyStar 项目文档

## 当前状态

- 阶段：Phase 1 Web MVP 的 12 个阶段已完成
- 产品与设计基线：FamilyStar v5
- MVP 开发决策：已确认
- 实施任务：12 个阶段，84 个可执行检查项
- 测试策略：全部测试任务纳入必做范围
- 源码实现：阶段 1 至阶段 12 已完成；核心闭环和自动化质量门禁已通过
- 当前迭代：统一家庭登录的家庭码认证 API、Web 体验、全量质量门禁、开发环境部署和真实浏览器验收已完成
- 最近更新：2026-08-01

## 文档导航

| 文档 | 用途 | 状态 |
|---|---|---|
| `ARCHITECTURE.md` | 当前系统结构、依赖和运行边界 | 已同步至阶段 12 |
| `INTERFACES.md` | 当前 HTTP、类型、数据模型和工作区接口 | 已同步至阶段 12 |
| `DEVELOPER_GUIDE.md` | 环境、命令、工作流和验证方式 | 已同步至阶段 12 |
| `模块/API.md` | Hono API 组合、领域适配器、迁移和验证入口 | 已同步至阶段 7 |
| `模块/Web.md` | 统一登录入口、家长端与孩子端路由、数据降级、组件与响应式交互 | 已同步至统一家庭登录任务 2 |
| `专有概念/Rewards.md` | 奖励池、资格、图片与库存配置 | 已同步至任务 7.1 |
| `专有概念/Redemptions.md` | 兑换预扣、幂等、审批、兑现与退款事务 | 已同步至任务 7.4 |
| `专有概念/Wishes.md` | 愿望槽位、实时进度、取消与采纳 | 已同步至任务 7.5 |
| `专有概念/Levels.md` | 累计积分等级派生、单调同步、进度与权益读取 | 已同步至阶段 6 |
| `专有概念/PointsLedger.md` | Streak、单人/协作发分、幂等流水、乐观锁与余额事件 | 已同步至阶段 6 |
| `专有概念/SubmissionReviews.md` | 单人/协作提交的人工与超时审核、历史、幂等与发分衔接 | 已同步至阶段 6 |
| `专有概念/CheckInsAndMedia.md` | 单人/协作打卡、提交历史和 COS 媒体流程 | 已同步至任务 6.1 |
| `专有概念/Tasks.md` | 任务类型、任务分配、频率和协作周期 | 已同步至任务 4.6 |
| `专有概念/Authentication.md` | 家长与孩子认证、家庭码、家庭初始化、邀请、密码与会话边界 | 已同步至统一家庭登录任务 2.1 |
| `专有概念/FamilySettings.md` | 家庭规则默认值、校验、读写与持久化边界 | 已同步至任务 3.5 |
| `专有概念/CredentialVault.md` | 家庭级信封加密、主密钥配置与重包裹 | 已同步至任务 2.7 |
| `专有概念/SecurityBoundaries.md` | 集中认证、RBAC、家庭隔离、CSRF 与审计 | 已同步至阶段 10 |
| `专有概念/WorkerRuntime.md` | Worker 作业、幂等、锁、重试和健康状态 | 已同步至阶段 11 |
| `专有概念/ContainerRuntime.md` | Docker 构建、Compose 网络、迁移顺序和端口边界 | 已同步至阶段 11 |
| `模块/BusinessModules.md` | 五个业务模块、静态拓扑、事件和开关占位 | 已同步至任务 2.5 |
| `专有概念/EventInfrastructure.md` | EventBus、事件信封、事务 Outbox 和幂等消费 | 已同步至任务 2.7 |
| `专有概念/DataModel.md` | Prisma 核心实体、租户边界和数据库约束 | 已同步至阶段 7 |
| `专有概念/RedisInfrastructure.md` | Redis 连接、键空间、原子操作和运行边界 | 已同步至任务 6.2 |
| `专有概念/PluginRegistry.md` | 静态插件 manifest、依赖、权限和生命周期 | 已同步至任务 2.5 |
| `专有概念/ApiResponse.md` | 统一 API 响应与请求关联契约 | 已同步至任务 1.5 |
| `专有概念/DesignTokens.md` | FamilyStar 视觉 Token 与响应式契约 | 已同步至任务 1.3 |
| `专有概念/ErrorCode.md` | 共享错误码契约和扩展规则 | 已同步至任务 1.5 |
| `../specs/decisions.md` | MVP 产品决策与工程实施约束 | 已确认 |
| `../specs/phase-1-mvp/tasklist.md` | Phase 1 可执行实施任务清单 | 已确认 |
| `DEVELOPMENT_LOG.md` | 实施、调试、测试、部署与决策时间线 | 持续更新 |
| `../../design/familystar_design_v5/DESIGN_HANDOFF.md` | 全端设计交接基线 | v5 |
| `../../design/familystar_design_v5/PRD_Latest.html` | 产品需求基线 | v0.6.4 |

## GitHub Wiki 映射

| 本地文档 | Wiki 页面 |
|---|---|
| `INDEX.md` | `Home.md`、`_Sidebar.md` |
| `ARCHITECTURE.md` | `Architecture.md` |
| `INTERFACES.md` | `Interfaces.md` |
| `DEVELOPER_GUIDE.md` | `Developer-Guide.md` |
| `专有概念/ApiResponse.md` | `API-Response.md` |
| `专有概念/ErrorCode.md` | `Error-Codes.md` |
| `专有概念/DesignTokens.md` | `Design-Tokens.md` |
| `专有概念/DataModel.md` | `Data-Model.md` |
| `专有概念/RedisInfrastructure.md` | `Redis-Infrastructure.md` |
| `专有概念/PluginRegistry.md` | `Plugin-Registry.md` |
| `专有概念/EventInfrastructure.md` | `Event-Infrastructure.md` |
| `专有概念/CredentialVault.md` | `Credential-Vault.md` |
| `专有概念/SecurityBoundaries.md` | `Security-Boundaries.md` |
| `专有概念/WorkerRuntime.md` | `Worker-Runtime.md` |
| `专有概念/ContainerRuntime.md` | `Container-Runtime.md` |
| `专有概念/Authentication.md` | `Authentication.md` |
| `专有概念/FamilySettings.md` | `Family-Settings.md` |
| `专有概念/Tasks.md` | `Tasks.md` |
| `专有概念/CheckInsAndMedia.md` | `Check-Ins-and-Media.md` |
| `专有概念/SubmissionReviews.md` | `Submission-Reviews.md` |
| `专有概念/PointsLedger.md` | `Points-Ledger.md` |
| `专有概念/Levels.md` | `Levels.md` |
| `专有概念/Rewards.md` | `Rewards.md` |
| `专有概念/Redemptions.md` | `Redemptions.md` |
| `专有概念/Wishes.md` | `Wishes.md` |
| `模块/BusinessModules.md` | `Business-Modules.md` |
| `模块/Web.md` | `Web-Parent-Portal.md` |
| `../specs/decisions.md` | `MVP-Development-Decisions.md` |
| `../specs/phase-1-mvp/tasklist.md` | `Phase-1-Implementation-Plan.md` |
| `DEVELOPMENT_LOG.md` | `Development-Log.md` |

## 记录节奏

1. 开发任务开始前登记范围、依据、验收标准、分支和测试计划。
2. 决策确认、范围变化或调试方向变化后立即记录。
3. 每个可独立验证的里程碑完成后记录实现、测试和遗留项。
4. 开发或生产部署通过健康检查后记录 commit、镜像、环境、证据和回滚点。
5. 每个任务及工作会话结束时核对本地文档、Wiki 页面和两边导航。

## 安全规则

文档仅保存可公开的工程信息。密码、私钥、令牌和其他凭据不得写入本地文档或 GitHub Wiki。
