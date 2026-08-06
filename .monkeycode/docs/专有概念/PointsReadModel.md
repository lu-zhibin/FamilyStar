# 积分读模型

## 领域边界

积分读模型提供孩子本人概览、孩子本人分页流水和家长逐孩概览。所有查询从认证会话取得家庭 ID；孩子 ID 仅来自孩子会话主体或家长路径参数，并始终与活动孩子、角色和家庭范围共同校验。

## HTTP 接口

- `GET /api/v1/points/me`：孩子读取本人当前余额和累计获得积分。
- `GET /api/v1/points/me/logs?cursor=&limit=`：孩子读取本人不可变积分流水。
- `GET /api/v1/family/children/:childId/points`：家长读取当前家庭内活动孩子积分概览。

概览返回 `child_id`、`points_balance` 和 `points_earned_total`。流水保留积分类型、业务类型、业务 ID、变化值、变化前后余额、变化后累计获得积分、备注和创建时间，便于调用方追溯业务来源并核对余额变化。

## 稳定分页

流水使用 `created_at DESC, id DESC` 作为稳定排序键。仓储读取 `limit + 1` 条记录，服务按可见页最后一条记录生成不透明 cursor，并在 `data.page` 返回 `next_cursor` 和 `has_more`。

cursor 内的时间必须是规范 UTC ISO 8601 字符串，ID 必须是 UUID。路径孩子 ID、cursor 和 limit 的非法输入统一返回 `400 INVALID_REQUEST`。

## 一致性与权限

概览直接读取 `User.pointsBalance` 和 `User.pointsEarnedTotal`。流水读取 `PointsLog` 的不可变余额快照和业务关联。写侧继续由积分事务在同一数据库事务中维护用户双余额、流水和业务状态守恒。

孩子只能读取会话主体；家长只能读取会话家庭内活动孩子。缺失会话、角色错误和范围内不可见目标分别映射为 `401 UNAUTHORIZED`、`403 FORBIDDEN` 和 `404 NOT_FOUND`。

## 验证

```bash
pnpm exec vitest run apps/api/src/points apps/api/src/security/access-policy.test.ts apps/api/src/security/middleware.test.ts apps/api/src/app.test.ts
pnpm --filter @familystar/api typecheck
pnpm exec eslint apps/api/src/points apps/api/src/security/access-policy.ts apps/api/src/security/access-policy.test.ts apps/api/src/app.ts apps/api/src/server.ts --max-warnings 0
pnpm exec prettier --check apps/api/src/points apps/api/src/security/access-policy.ts apps/api/src/security/access-policy.test.ts apps/api/src/app.ts apps/api/src/server.ts
```

聚焦回归共 93 项通过。Prisma 仓储测试覆盖活动孩子家庭范围、稳定复合 cursor、`limit + 1` 和完整流水字段选择；服务与路由测试覆盖角色、空集合、分页边界、无效输入、Cookie 续期和统一错误映射。

## 开发环境验收

2026-08-06 已将 API 和 Worker 切换到 `dev-20260806-57c5aa2-i24`，Web 继续使用 `dev-20260805-87611b7-i21-web`。API、Worker、Web、PostgreSQL 和 Redis 容器均为 healthy，开发 IP 与 `https://home.wenwuge.vip/api/v1/health` 均返回 `200`。

真实 Chromium 验收通过 1 项，覆盖家长读取当前家庭孩子概览、孩子读取本人概览、孩子读取空分页流水，以及家长读取其他家庭孩子时返回范围内 `404`。
