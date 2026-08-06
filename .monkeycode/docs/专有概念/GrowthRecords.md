# 成长记录数据模型

## 范围

产品补全任务 5.1 建立成长记录持久化基础，任务 5.2 接入家长时间线读取和手动记录 CRUD。当前范围包含 Prisma 模型、顺序 SQL 迁移、家庭边界、自动来源幂等、软删除、媒体顺序、稳定分页、筛选、手动笔记与里程碑写入，以及 READY 媒体关联。审核通过事件消费者与双端页面由任务 5.3 和 5.4 接入。

## 模型

`GrowthRecord` 保存一条独立历史快照：

- `familyId`、`childId`：家庭租户和记录主体边界。
- `taskId`：可选任务关联，用于家庭时间线按任务筛选。
- `type`：`CHECK_IN`、`NOTE` 或 `MILESTONE`。
- `title`、`contentText`、`occurredOn`：历史展示内容和家庭自然日期。
- `sourceType`、`sourceId`：可选自动来源对；同一家庭内组合唯一。
- `pointsEarned`：可选非负积分展示快照。
- `createdById`：可选手动创建者。
- `deletedAt`：软删除时间。

`GrowthRecordMedia` 将成长记录关联到既有 `MediaAsset`，保存稳定 `sortOrder`。同一记录不能重复关联同一媒体，同一展示位置只能关联一个媒体。

## 数据库保护

- `growth_records_source_pair_check` 要求来源类型和来源 ID 同时为空或同时有值。
- `growth_records_points_earned_check` 限制积分快照为非负整数。
- `growth_records_family_id_source_type_source_id_key` 吸收自动事件重复投递。
- 家庭、孩子、任务、类型和日期索引支持稳定时间线筛选与 cursor 分页。
- 媒体排序 CHECK 和唯一索引保护展示顺序。
- 外键对家庭、孩子、任务、创建者、成长记录和媒体资产执行引用保护。

## 历史独立性

成长记录直接保存标题、正文、发生日期和积分，媒体通过独立业务关联引用原始 COS 对象。任务后续编辑、停用或归档不会改写这些展示字段。任务 5.3 的消费者将在记录创建事务中写入完整快照并复用来源唯一键。

## 家长 API

- `GET /api/v1/family/growth-records`：按 `(occurredOn, id)` 倒序稳定分页，支持 `child_id`、`task_id`、`type`、`start_date` 和 `end_date` 筛选。
- `POST /api/v1/family/growth-records`：创建 `NOTE` 或 `MILESTONE`，保存关联孩子、可选任务、标题、正文、家庭自然日期和最多十个媒体 ID。
- `PATCH /api/v1/family/growth-records/:recordId`：部分更新手动记录；未提交的关联字段保持原值，媒体 ID 数组存在时按请求顺序整体替换关联。
- `DELETE /api/v1/family/growth-records/:recordId`：软删除手动记录。

所有操作从家长会话取得家庭边界。`CHECK_IN` 或具有自动来源键的记录保持只读，由任务 5.3 的消费者维护。

## 引用校验

- 新建记录时，家长和孩子必须属于当前家庭且处于活动状态。
- 可选任务必须属于当前家庭且未软删除。
- 媒体 ID 必须唯一，并全部属于当前家庭、处于 `READY` 状态且未软删除。
- 更新只校验本次发生变更的孩子、任务或媒体引用；单纯编辑历史标题和正文不重新要求原任务仍处于活动状态。
- 查询和写入均排除已软删除记录，跨家庭或不可见资源映射为家庭范围内的 `404 NOT_FOUND`。

## 验证

2026-08-06 任务 5.1 和 5.2 已通过以下验证：

```bash
pnpm db:format
DATABASE_URL='postgresql://familystar:familystar@127.0.0.1:5432/familystar' pnpm db:validate
pnpm db:generate
pnpm verify:data-model
pnpm exec vitest run apps/api/scripts/data-model-contract.test.ts apps/api/src/badges/prisma-repository.test.ts
pnpm typecheck
pnpm lint
pnpm exec vitest run apps/api/src
```

任务 5.2 的仓储、服务和路由聚焦回归共 3 个文件、14 项测试通过；权限联合回归共 45 项通过。API 全量回归共 97 个文件、632 项通过，全工作区类型检查、Lint、Prisma Schema、迁移契约和任务文件格式检查通过。
