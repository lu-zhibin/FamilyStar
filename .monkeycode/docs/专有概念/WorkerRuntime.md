# Worker 运行时

## 目的

阶段 11 将周期工作从 API 请求生命周期拆分为独立 Node.js 进程。Worker 与 API 复用同一 Prisma Schema、Redis 键空间、领域服务和集成适配器，通过独立入口、健康端点和进程信号管理形成可部署单元。

## 作业清单

| 作业 | 运行键 | 职责 |
|---|---|---|
| `task-cycle` | UTC 日期 | 为活动家庭生成当天协作周期 |
| `review-timeout` | 分钟桶 | 批量处理已超过家庭审核时限的提交 |
| `outbox-dispatch` | 5 秒桶 | claim 并发布到期 Outbox 事件 |
| `media-cleanup` | 小时桶 | 清理过期 multipart、对象和媒体记录 |
| `points-reconciliation` | UTC 日期 | 从不可变积分流水重算并报告差异 |

## 可靠性

每个作业先使用 `schedulerLock(jobName, runKey)` 获取带所有者令牌和 TTL 的 Redis 锁，再通过 `WorkerJobRun` 的 `(job_name, run_key)` 唯一约束 claim 数据库运行记录。数据库状态为 `RUNNING`、`SUCCEEDED` 或 `FAILED`，保存尝试次数、时间戳、结果摘要、脱敏错误码和下次重试时间。

单次运行最多尝试三次，退避为 `5s * 2^(attempt - 1)`。进程异常留下的陈旧 `RUNNING` 记录可在锁 TTL 过期后安全重入；已成功的确定性运行键直接跳过。调度循环隔离各作业异常，一个作业失败不会阻断同轮其他作业。

## 健康状态

Worker 在 `WORKER_PORT` 提供 `/health`。调度器尚未启动或所有作业最近一轮正常时返回 `ok`；存在最近失败时返回 `degraded`，响应只包含作业名、状态、时间和稳定错误码。

## 数据修复边界

积分对账读取孩子当前余额、累计获得积分和 `PointsLog` 聚合值，仅输出差异。任何修复都应通过可审计的 `MANUAL` 流水完成。媒体清理将 COS 的对象或 multipart 404 视为幂等成功，并在数据库事务中将上传标记失败、媒体资产软删除。

## 验证

`apps/api/src/worker/` 下的测试覆盖锁竞争、数据库防重、失败退避、安全重入、调度隔离、五类作业、Prisma 作业仓储、健康配置和容器契约。
