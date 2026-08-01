# 奖励池

## 定位

奖励池是家庭私有的可兑换目录。家长维护奖励，孩子只读取上架且未删除的奖励。

## 规则

- 奖励类型为 `PHYSICAL`、`PRIVILEGE`、`EXPERIENCE` 或 `CUSTOM`。
- 价格为 PostgreSQL `Int` 范围内的正整数。
- 图片只接受同家庭、`READY`、`IMAGE` 且未删除的 `MediaAsset`。
- 资格支持 1 至 20 级门槛，以及正整数的每日、每周和每月兑换上限。
- `stock_total = null` 表示无限库存；有限库存以 `stock_reserved` 和 `stock_consumed` 计算可用量。
- 库存预占使用数据库单条条件更新，保证并发申请不会超卖。
- 存在待审批、待兑现或已预占库存时，有限与无限库存模式保持稳定。

## 接口

读取接口为 `GET /api/v1/rewards` 和 `GET /api/v1/rewards/:id`。家长管理接口为 `POST /api/v1/rewards`、`PATCH /api/v1/rewards/:id` 和 `DELETE /api/v1/rewards/:id`；删除执行软删除并同步下架。

## 代码

纯输入与定价规则位于 `apps/api/src/rewards/logic.ts`，权限位于 `service.ts`，家庭查询、媒体校验和库存事务位于 `prisma-repository.ts`，HTTP 映射位于 `routes.ts`。
