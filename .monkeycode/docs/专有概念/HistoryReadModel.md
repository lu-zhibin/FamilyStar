# 打卡历史读模型

## 领域边界

打卡历史读模型聚合单人提交 attempt 和协作提交 attempt，保留提交时的孩子、任务、业务日期、媒体 ID、审核记录和积分快照。查询始终从会话取得家庭范围；孩子端固定读取会话主体，家长端支持孩子、任务、提交类型和家庭日期范围筛选。

## HTTP 接口

- `GET /api/v1/check-ins/me/history`：孩子读取本人单人和协作历史。
- `GET /api/v1/family/check-ins/history`：家长读取家庭时间线。
- `POST /api/v1/media/access-urls`：为最多 50 个同家庭 `READY` 且未软删除媒体批量签发短期访问地址。

历史响应使用 `submission_type` 区分 `SOLO` 与 `COLLABORATION`，协作项附带轮次快照。审核结果来自关联 `SubmissionReview`，因此审核后的状态与 `review.decision` 保持一致；积分只挂在聚合最新 attempt 上，避免重复展示。

## 日期与分页

家长日期筛选按家庭 IANA 时区解析日历范围，再按业务日期筛选：单人使用 `CheckIn.checkDate`，协作使用轮次 `endDate`。提交时间用于时间线倒序和 cursor 排序，支持补打记录按原业务日期归档，同时保留真实提交时间。

排序键为 `submitted_at DESC`、来源优先级 `SOLO`、attempt ID，跨单人和协作查询使用带来源前缀的不透明 cursor。仓储读取 `limit + 1` 条后合并，服务返回 `data.page.next_cursor` 和 `has_more`。

## 媒体安全

历史媒体只返回同家庭、`READY`、`deleted_at IS NULL` 的元数据，并按 attempt 中保存的 `mediaIds` 顺序映射。批量访问地址接口限制 1 至 50 个唯一 UUID；任一资源缺失、跨家庭、状态不为 `READY` 或已软删除时整批返回 `404 NOT_FOUND`。URL 签发复用同一家庭 COS connection，过期时间固定为 900 秒。

## 验证

```bash
pnpm exec vitest run apps/api/src/check-ins/*.test.ts apps/api/src/media/*.test.ts apps/api/src/security/*.test.ts apps/api/src/app.test.ts
pnpm --filter @familystar/api typecheck
pnpm exec eslint apps/api/src/check-ins/history-*.ts apps/api/src/media/access-*.ts apps/api/src/app.ts apps/api/src/security/access-policy.ts apps/api/src/server.ts --max-warnings 0
pnpm exec prettier --check apps/api/src/check-ins/history-*.ts apps/api/src/media/access-*.ts apps/api/src/app.ts apps/api/src/security/access-policy.ts apps/api/src/server.ts
```

聚焦回归共 141 项通过，包含历史仓储、服务、路由、媒体批量仓储与服务、审核和安全策略测试。

## 开发环境验收

2026-08-06 已将 API 和 Worker 切换到 `dev-20260806-25db468-i25`，Web 继续使用 `dev-20260805-87611b7-i21-web`。API、Worker、Web、PostgreSQL 和 Redis 容器均为 healthy，`http://119.29.111.248:8098/api/v1/health` 与 `https://home.wenwuge.vip/api/v1/health` 均返回 `200`。

真实 Chromium 验收通过 1 项，覆盖隔离家庭创建、单人补打与审核、协作双方提交与审核、孩子分页 cursor、家长业务日期筛选、跨家庭历史隔离，以及批量媒体访问的整批缺失和重复输入边界。
