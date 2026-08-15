# 路由访问策略

## 用途

FamilyStar 在 `apps/api/src/security/access-policy.ts` 集中声明受保护 API 的 HTTP 方法、路径、角色和可选模块。安全中间件先解析策略，再从 HttpOnly Cookie 读取可信会话并执行角色、家庭和模块校验。

## 默认边界

以下端点使用显式公开白名单：

- API 服务信息与健康检查。
- 家长注册和登录。
- 家长邀请接受。
- 孩子家庭查询和登录。

其他 `/api/v1` 路径至少要求有效家庭会话。新增端点即使尚未加入精确角色规则，也会落入 `authenticated` 安全兜底；领域端点仍需在策略表中登记 `parent`、`child` 或 `authenticated` 角色。

## 家庭权威性

会话中的 `familyId` 是请求家庭范围的唯一权威来源。`X-Family-Id`、查询参数和 JSON 顶层的 `family_id` 或 `familyId` 仅用于一致性校验；任一客户端值与会话家庭冲突都会返回 `403 FORBIDDEN`。

## 可选模块

`apps/api/src/security/module-access.ts` 定义模块键和 `FamilyModuleStatusPort`。端口只接收安全中间件已验证的会话家庭与策略中的模块键，客户端字段无法改变查询家庭。

当前策略预留以下可选模块：

| 模块键 | 领域 |
|---|---|
| `analytics` | 家庭统计与排行 |
| `growth-records` | 历史打卡与成长记录 |
| `levels` | 等级视图 |
| `rewards` | 奖励、兑换与愿望 |
| `badges` | 徽章模板、颁发与徽章墙 |
| `notifications` | 通知中心与偏好 |

模块端口未注入时保持现有能力可用。生产模块设置适配器接入后，关闭的模块返回 `403 MODULE_DISABLED`，业务数据保持原状。

## 验证

属性样本验证任意未登记版本化路径都要求认证，并对 Header、查询参数和 JSON 家庭标识的组合执行会话家庭权威性测试。规划端点使用表驱动断言固定角色和模块归属。

```bash
pnpm exec vitest run apps/api/src/security/access-policy.test.ts apps/api/src/security/middleware.test.ts packages/shared/src/errors.test.ts
```

Vitest 将 `@familystar/shared` 直接映射到源码入口，确保 API 测试使用当前共享契约。
