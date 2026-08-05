# 家庭资料读模型

## 领域边界

产品补全任务 2.1 提供家庭资料、活动家长和邀请摘要的认证读写接口。家庭范围仅取自活动家长会话，响应提供创建者权限，供共同家长界面展示受限操作的只读状态。

## HTTP 接口

| 方法与路径 | 用途 | 权限 |
|---|---|---|
| `GET /api/v1/family/profile` | 返回家庭名称、时区、活动家长、邀请摘要和当前操作者权限 | 活动家长 |
| `PATCH /api/v1/family/profile` | 部分更新家庭名称或 IANA 时区 | 名称仅创建者；时区允许两位家长 |
| `GET /api/v1/family/parents` | 返回活动家长、邀请状态和邀请管理权限 | 活动家长 |

成功响应续期 `familystar_session` Cookie。PATCH 仅接受 `name` 和 `time_zone`，拒绝空对象、未知字段、空名称、超过 120 字符的名称和非法 IANA 时区。

## 返回模型

家庭资料包含：

- `id`、`name` 和 `time_zone`。
- `parents`：家长 ID、昵称、邮箱、`is_creator` 和加入时间。
- `invitations`：邀请 ID、邮箱、`pending` 或 `expired` 展示状态、到期时间和创建时间。
- `permissions`：`can_update_name` 与 `can_manage_invitations`。

家长列表接口复用相同的家长、邀请和权限模型。邀请查询仅选择公开摘要字段，令牌哈希和接受人内部字段不会进入读模型。

## 持久化与权限

`PrismaFamilySettingsRepository` 使用会话家庭 ID 查询未软删除家庭，并在同一查询中读取未软删除的 `PARENT` 用户和数据库状态为 `PENDING` 的邀请。邀请展示状态按服务端当前时间与 `expiresAt` 比较，已到期记录返回 `expired`。

家庭名称保存在 `Family.name`，时区继续保存在 `Family.settings.timeZone`。时区更新合并原 JSONB 内容，保留家庭播报和其他规则字段。更新条件始终包含家庭 ID 与 `deletedAt: null`。

服务通过 `Family.createdById` 计算权限。共同家长可读取完整资料并更新时区；共同家长提交名称更新返回 `403 FORBIDDEN`。缺失家长会话返回 `401 UNAUTHORIZED`，家庭不存在或已软删除返回 `404 NOT_FOUND`，非法输入返回 `400 INVALID_REQUEST`。

## 验证

服务、仓储和 HTTP 测试覆盖创建者与共同家长权限、IANA 时区、JSONB 字段保留、活动家长筛选、邀请过期映射、敏感字段排除、Cookie 续期和错误契约。安全策略测试确认家庭路由要求家长角色，家庭 ID 始终由会话提供。

```bash
pnpm vitest run apps/api/src/family-settings/service.test.ts apps/api/src/family-settings/prisma-repository.test.ts apps/api/src/family-settings/routes.test.ts apps/api/src/security/access-policy.test.ts apps/api/src/security/middleware.test.ts
pnpm --filter @familystar/api typecheck
pnpm test:unit
```

本次验证结果为聚焦测试 64 项通过，完整单元测试 654 项通过。
