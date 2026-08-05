# 家长邀请管理

## 领域边界

产品补全任务 2.2 在现有第二家长邀请流程上增加重发和撤销。两个操作仅允许家庭创建者执行，家庭与操作者身份只取自活动家长会话。

## HTTP 接口

| 方法与路径 | 用途 | 成功结果 |
|---|---|---|
| `POST /api/v1/family/invitations/:id/resend` | 轮换待处理邀请令牌并延长有效期 | 邀请摘要与 `email` 或 `copy-link` 交付方式 |
| `DELETE /api/v1/family/invitations/:id` | 将未完成邀请转换为终态 | `status: expired` |

路径参数必须是 UUID。成功响应续期当前 `familystar_session` Cookie。缺少家长会话返回 `401 UNAUTHORIZED`，共同家长操作返回 `403 FORBIDDEN`，已到期或已接受邀请的重发以及已接受邀请的撤销返回 `409 CONFLICT`。

## 重发事务

1. 服务生成新的 32 字节随机令牌，数据库仅接收 SHA-256 哈希。
2. Prisma 仓储锁定活动家庭并验证 `Family.createdById`。
3. 仓储按会话家庭 ID 与邀请 ID 锁定记录，仅接受尚未到期的 `PENDING` 状态。
4. 更新令牌哈希、创建者、服务端更新时间和七天后的到期时间，使旧链接立即失效。
5. 家庭邮件集成状态为 `VERIFIED` 时，新的 `family.invitation.email-requested.v1` 事件与邀请更新在同一事务写入 Outbox。
6. 邮件未配置时，响应仅向当前创建者返回包含新明文令牌的复制链接。

## 撤销终态

撤销复用 `InvitationStatus.EXPIRED` 作为不可接受终态，无需数据库迁移。仓储在家庭锁和邀请锁内执行状态转换。重复撤销已为 `EXPIRED` 的同一邀请返回相同成功结果，不产生额外写入；`ACCEPTED` 状态保持不可变并返回冲突。

邀请读取与修改条件同时包含会话家庭 ID，跨家庭 ID 无法命中记录。API、事件和文档均不会返回令牌哈希。

## 验证

服务测试覆盖令牌轮换、七天有效期、邮件 Outbox 和撤销输入；Prisma 测试覆盖创建者锁、待处理状态更新与终态幂等；HTTP 测试覆盖 UUID 校验、Cookie 续期和公开响应。内存事务集成仓储实现同一契约，保证 Outbox 与状态变更回滚一致。

```bash
pnpm vitest run apps/api/src/family-auth/invitation-service.test.ts apps/api/src/family-auth/prisma-repository.test.ts apps/api/src/family-auth/routes.test.ts apps/api/src/security/access-policy.test.ts apps/api/src/phase-1-family-auth.integration.test.ts
pnpm --filter @familystar/api typecheck
pnpm test:unit
```

本次验证结果为聚焦与集成测试 56 项通过，完整单元测试 660 项通过。
