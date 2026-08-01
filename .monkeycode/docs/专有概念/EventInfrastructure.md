# 事件基础设施

## 定位

任务 2.4 提供进程内 EventBus 和 PostgreSQL Outbox，使独立业务模块通过版本化事件通信，并在事务提交后以 at-least-once 语义可靠分发。Redis receipt 提供快速重复抑制，领域数据库唯一约束继续承担最终幂等保护。

## 事件契约

事件名遵循 `<module>.<entity>.<event>.v<version>`。版本从 1 开始，插件发布声明必须位于自身模块命名空间。

领域事件信封包含：

| 字段 | 含义 |
|---|---|
| `event_id` | UUID 事件唯一标识，也是 Outbox 主键与幂等键来源 |
| `event_name` | 带模块、实体、动作和版本的事件名 |
| `occurred_at` | ISO 8601 UTC 发生时间 |
| `family_id` | UUID 家庭租户边界 |
| `actor_id` | 可空 UUID 操作者，系统与调度事件使用 `null` |
| `correlation_id` | 请求、作业或业务流程关联 ID |
| `payload` | JSON-safe 普通对象 |

`createDomainEvent()` 校验名称、UUID、时间、关联 ID 和 payload，再复制并深度冻结结果。payload 拒绝循环引用、非普通对象、非有限数字和 `undefined` 等 JSONB 不安全值。

## EventBus

应用为每个插件 manifest 创建独立 scope。scope 在发布和订阅前核对声明，发布同时受插件命名空间约束。处理器按订阅顺序串行执行，当前处理器失败时停止本次有序分发并向调用方传播错误。

Outbox Dispatcher 使用单独的可信发布入口重放已经通过共享契约校验并由事务持久化的事件。该入口服务于基础设施组合层，业务插件继续使用 manifest scope。

## 事务 Outbox

`runWithOutbox()` 接收 transaction runner、writer 和业务回调。业务回调返回业务结果与待发布事件，writer 使用同一个 transaction client 逐项 append；业务写入或事件写入任一失败时，Prisma 事务整体回滚。

`OutboxEvent` 保存事件信封、可投递时间、发布时间、尝试次数、错误类型和 Worker 租约。Prisma 仓储在事务中使用 `FOR UPDATE SKIP LOCKED` 选择到期且未发布的记录，原子写入 `locked_at`、`lock_owner` 并增加尝试次数。

成功确认和失败重排均要求事件仍由当前 Worker 持有。更新条数异常时抛出 `OutboxLeaseLostError`，防止过期 Worker 修改已被其他 Worker 接管的记录。

## 重试语义

Dispatcher 一次 claim 有界批次并按顺序发布。成功后写入 `published_at` 并清理租约；失败后保存最长 80 字符的错误类名，清理租约，并按尝试次数计算有上限的指数退避。错误消息和 payload 不进入失败分类字段。

独立 Worker 以 5 秒运行键调用 Outbox 单批分发，并复用通用 Redis 调度锁、数据库运行记录和失败退避。任务 2.7 已通过状态型事务适配器验证提交、append 失败回滚、首次分发失败、退避和后续成功重投；真实 PostgreSQL 并发 claim 纳入阶段 12 运行态验证。

## 幂等消费者

`IdempotentEventConsumer` 使用 `(consumer, event_id)` 构造 Redis 键，并以随机 owner token 执行 `SET EX NX`。已有 receipt 时返回 `duplicate`；首次处理成功时保留 receipt 到 TTL；处理失败时通过 owner 比较 Lua 脚本只释放当前调用持有的 receipt，然后传播原错误以触发 Outbox 重投。

## 验证

单元测试覆盖事件解析和冻结、发布订阅隔离、稳定处理顺序、事务 append、租约 claim 映射、租约丢失、成功确认、失败重排、退避上限、错误脱敏、重复消费和 owner receipt 释放。任务 2.7 进一步组合真实 EventBus、Outbox Dispatcher、Redis receipt 适配器和幂等消费者，验证重投恢复与重复抑制；完成时全仓 22 个测试文件、173 个测试通过。
