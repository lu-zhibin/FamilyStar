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

## 家长端管理

家长端奖励池支持创建和编辑名称、说明、图片、价格、类型、总库存、最低等级及日、周、月兑换上限，并可独立上下架。卡片展示库存总量、预占量、已兑换量和实时可用量；删除前要求确认，历史兑换记录继续保留。

奖励写入期间，编辑器、列表操作以及弹窗的 Escape、遮罩和关闭按钮均进入锁定状态。成功写入后重新读取服务端权威列表；`409` 冲突后刷新列表并重新挂载当前编辑器，使库存等不受控输入回填为服务端最新值。

图片复用媒体直传协议，上传完成后把同家庭的 `READY` 图片媒体 ID 写入奖励。移除图片会显式提交 `null`；有限库存允许 `0`，留空映射为无限库存。

## 任务 6.3 验证

提交 `25f4819` 已部署为服务器本地镜像 `dev-20260807-25f4819-i37-web`。Web、API、Worker、PostgreSQL 和 Redis 均为 healthy，开发域名首页与健康接口返回 `200`，上一健康 Web 镜像 `dev-20260807-5dc74af-i36-web` 保留为回滚点。

奖励管理聚焦测试 2 个文件共 51 项通过，全量单元回归为 114 个文件、836 项。Web 类型检查、ESLint、Prettier 和生产构建通过。外部真实 Chromium 验收 2 项通过，覆盖创建、编辑回填、上下架、库存明细、兑换预占、库存模式冲突后的权威回填、软删除、图片上传协议和提交锁定。隔离验收家庭未配置 COS 集成，图片验收使用浏览器路由模拟对象存储握手；奖励页面和奖励写请求运行在真实部署环境。

## 代码

纯输入与定价规则位于 `apps/api/src/rewards/logic.ts`，权限位于 `service.ts`，家庭查询、媒体校验和库存事务位于 `prisma-repository.ts`，HTTP 映射位于 `routes.ts`。家长端奖励管理位于 `apps/web/components/parent-portal.tsx`，请求类型和 payload 构造位于 `apps/web/lib/parent-portal.ts`，真实验收位于 `e2e/reward-management.real.spec.cjs`。
