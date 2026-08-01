# Redis 基础设施

## 目标

任务 2.2 为 FamilyStar 提供统一 Redis 接入层，当前服务于认证会话、登录速率限制、提交审核锁、后台调度锁、EventBus 消费幂等和短期聚合缓存。数据库事务和唯一约束继续承担最终一致性保护。

## 连接模型

API 使用 Redis Node.js Client 6.1.0。`createRedisConnection()` 只创建客户端和错误监听器，调用方通过 `connectRedis()` 显式建立连接，因此当前进程启动和健康检查无需依赖尚未部署的 Redis 实例。

连接参数包括：

| 参数 | 值 |
|---|---|
| 连接 URL | 已校验的 `REDIS_URL` |
| 连接超时 | 5 秒 |
| 离线队列 | 关闭 |
| 重连策略 | 从 100 毫秒开始指数增长，最高 3 秒 |
| 错误日志 | 时间、级别、事件名和错误类型 |

客户端销毁使用 node-redis 6 的 `destroy()`，不发送已废弃的 Redis `QUIT` 命令。

## 键空间

所有键以已校验的 `REDIS_KEY_PREFIX` 开始。用途分区如下：

```text
<prefix>:session:<session-id>
<prefix>:session-revision:<subject-id>
<prefix>:rate-limit:<scope>:<identifier>...
<prefix>:scheduler-lock:<job-name>
<prefix>:review-lock:<target-type>:<target-id>
<prefix>:idempotency:<consumer>:<event-id>
<prefix>:cache:<namespace>:<identifier>
```

动态片段长度为 1 至 256 个字符，并通过 `encodeURIComponent()` 编码。该规则使 `family:1` 与多个独立片段保持不同的键边界。

## 原子操作

| 能力 | Redis 操作 | 一致性语义 |
|---|---|---|
| 会话写入 | `SET key value EX ttl` | 会话始终带过期时间 |
| 会话读取和续期 | `GET`、`EXPIRE` | 校验主体 revision 后滚动 30 天 TTL |
| 主体会话撤销 | revision `GET`、`INCR` | 常数复杂度撤销主体全部旧令牌 |
| 幂等占位 | `SET key 1 EX ttl NX` | 通用首次消费者获得占位 |
| 事件 receipt | `SET key owner EX ttl NX`、owner 比较 Lua | 首次处理保留 receipt，失败处理仅释放自身 receipt |
| 获取锁 | `SET key owner PX ttl NX` | 同一时间仅一个所有者获取锁 |
| 释放锁 | Lua 比较 owner 后 `DEL` | 仅锁所有者可释放 |
| 固定窗口限流 | Lua `INCR`、首次 `EXPIRE`、`TTL` | 计数和窗口初始化组成单次原子执行 |
| JSON 缓存 | `SET EX`、`GET` | 缓存始终带过期时间并验证 JSON |

## 调用边界

`RedisCommandPort` 只公开 `sendCommand()`，使业务服务和测试无需依赖 node-redis 的完整类型。后续模块通过 `createRedisCommandPort()` 适配真实客户端，并由组合根管理连接生命周期。

认证会话使用滚动 30 天 TTL。孩子登录按家庭和孩子限制为 15 分钟内 10 次请求。人工审核与超时自动审核使用目标类型和目标 ID 分区的同一把 10 秒 owner-lock；人工审核在锁内复查家庭幂等记录，超时审核在锁内执行 latest attempt 与 `PENDING` 事务复查。其他锁有效期、幂等窗口和缓存有效期由对应业务任务定义。输入必须是正安全整数，Redis 返回值也会在转换为业务结果前执行结构和整数校验。

## 安全与失败处理

- Redis URL 只从运行环境读取，示例配置使用本地非敏感占位值。
- 错误日志省略连接 URL 和错误消息，避免凭据进入日志。
- 关闭离线队列后，断连期间的命令会快速失败，由业务层决定重试或返回服务错误。
- 锁使用随机且不可预测的所有者令牌；审核服务默认使用随机 UUID，并通过 owner 比较 Lua 安全释放。
- Redis 幂等 receipt 用于快速去重，数据库唯一约束继续提供最终保护。

## 验证

Vitest 使用注入客户端和假命令端口验证连接参数、错误脱敏、键编码、命令顺序、Lua 脚本调用、owner receipt、会话 revision、TTL 续期、登录窗口、审核锁、返回值转换和非法输入。任务 3.6 通过共享有状态命令端口组合真实 `RedisSessionStore` 与 `RedisChildLoginRateLimiter`，任务 6.2 通过人工与超时审核测试验证同一 owner-lock 的获取、竞争和释放。当前环境没有 Redis 服务端，真实运行态集成验证随任务 11 实施。
