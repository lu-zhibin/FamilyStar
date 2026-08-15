# 家庭管理页面

## 页面边界

`/family` 将孩子档案、家庭码、家庭资料、活动家长和待处理邀请集中在同一管理页面。页面仅使用认证会话确定家庭范围，客户端请求不提交家庭 ID。

家庭资料和家长列表由 `GET /api/v1/family/profile` 提供。孩子档案继续使用独立的孩子管理接口，页面在任一资源失败时保留其他资源的可用状态。

## 家庭资料

家庭资料表单展示名称和 IANA 时区。创建者可提交名称与时区；共同家长的名称字段为只读状态，提交 payload 仅包含时区。服务端仍执行最终权限校验。

更新使用 `PATCH /api/v1/family/profile`。成功后页面直接采用响应中的权威资料重新挂载表单，避免保留服务端规范化之前的输入。提交期间按钮锁定；请求失败时保留表单内容并显示错误信息。

## 家长与邀请

页面列出活动家长的昵称、邮箱和创建者身份，并展示邀请邮箱、有效期及 `pending` 或 `expired` 状态。

家庭创建者可执行以下操作：

- 通过 `POST /api/v1/auth/parent/invitations` 创建共同家长邀请。
- 通过 `POST /api/v1/family/invitations/:id/resend` 轮换待处理邀请。
- 通过 `DELETE /api/v1/family/invitations/:id` 撤销待处理邀请。

复制链接交付模式会在当前页面显示最新邀请链接。重发会替换此前展示的链接。撤销前显示确认对话框，说明现有链接将立即失效。

共同家长可查看活动家长和邀请摘要。页面以权限说明替代邀请表单及操作按钮。

## 状态一致性

邀请创建、重发和撤销成功后，页面重新读取家庭资料，以服务端邀请状态为准。写入成功且刷新失败时，页面明确提示用户刷新确认。所有写操作共享提交锁，防止重复提交和相互覆盖。

家庭资料、家长邀请和孩子管理分别保留 loading、error、empty 或 live 状态。一个区域的读取失败不会用演示数据填充其他区域。

邀请仓储在插入记录时显式写入服务端 `created_at` 和 `updated_at`，冲突刷新同时轮换令牌、到期时间和更新时间。该约束避免数据库必填时间戳依赖隐式默认值，并由 SQL 契约测试覆盖。

## 验证

组件测试覆盖创建者可编辑字段、共同家长名称只读状态和时区编辑能力。浏览器测试覆盖资料更新 payload、邀请创建、链接轮换、撤销确认、服务端权威刷新及共同家长操作隐藏。API 服务测试显式验证资料读取只使用认证会话中的家庭 ID。

```bash
pnpm exec vitest run apps/web/lib/parent-portal.test.ts apps/web/components/parent-portal.test.tsx apps/api/src/family-settings/service.test.ts
pnpm --filter @familystar/web typecheck
pnpm --filter @familystar/api typecheck
NODE_PATH=/usr/local/lib/node_modules playwright test e2e/family-portals.spec.cjs --grep "family profile|co-parent family"
NODE_PATH=/usr/local/lib/node_modules REAL_ACCEPTANCE=1 PLAYWRIGHT_BASE_URL=https://home.wenwuge.vip playwright test e2e/family-management.real.spec.cjs
```

聚焦 API 测试共 22 项通过，Web、API 类型检查和格式检查通过。开发环境使用 `dev-20260805-87611b7-i21-web`、`dev-20260805-87611b7-i23-api` 和 `dev-20260805-87611b7-i23-worker`，全部容器健康；真实 Chromium 验收 1 项通过。后端回滚点为 `i22-api` 和 `i22-worker`。
