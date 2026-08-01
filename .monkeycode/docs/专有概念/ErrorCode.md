# ErrorCode

`ErrorCode` 是 FamilyStar 跨应用共享的稳定错误分类契约。HTTP 状态、用户消息和日志上下文可以变化，业务消费者通过错误码执行确定性处理。

## 代码位置

| 方面 | 位置 |
|---|---|
| 常量 | `packages/shared/src/errors.ts` |
| 联合类型 | `packages/shared/src/errors.ts` |
| 公开导出 | `packages/shared/src/index.ts` |

## 当前错误码

| 错误码 | 语义 |
|---|---|
| `INVALID_REQUEST` | 请求格式或输入无效 |
| `UNAUTHORIZED` | 认证缺失或失效 |
| `FORBIDDEN` | 已认证身份缺少权限 |
| `NOT_FOUND` | 资源不存在或对当前家庭不可见 |
| `CONFLICT` | 状态、幂等或并发冲突 |
| `RATE_LIMITED` | 请求超过允许频率 |
| `INTERNAL_ERROR` | 未分类服务端故障 |

## 不变量

1. 每个常量值在 `ERROR_CODES` 中唯一。
2. 公开 API 使用稳定大写蛇形值。
3. 错误码不包含敏感数据、资源 ID 或用户消息。
4. 新增错误码需要更新接口文档和对应错误映射测试。

## 当前状态

任务 1.2 建立错误码契约，任务 1.4 将其接入统一 HTTP 响应，任务 1.5 已验证错误码集合、唯一性、格式以及 404 和未处理异常映射。
