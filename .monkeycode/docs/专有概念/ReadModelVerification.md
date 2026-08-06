# 读模型正确性验证

## 范围

产品补全任务 3.6 为积分、打卡历史、家庭总览、统计和排行读模型补充仓储、路由、组件、集成和属性测试。验证覆盖需求 2、3、4.1、4.2、4.4、4.5，以及产品补全设计正确性属性 1 至 4。

## 正确性证据

| 属性 | 自动化证据 |
|---|---|
| 空集合 | 积分仓储保持家庭与孩子查询边界并返回空页；家庭总览、成长统计和孩子排行组件展示真实空态 |
| 家庭时区 | 统计服务覆盖 `America/New_York` 夏令时开始的 23 小时自然日和结束的 25 小时自然日 |
| Cursor 边界 | 积分集成测试验证等时间戳下 `(created_at, id)` 倒序分页无重复、无遗漏；同一 cursor 重放返回相同页面；历史仓储覆盖 SOLO 与 COLLABORATION 双向来源边界 |
| 家庭隔离 | HTTP、服务和状态型仓储组合只使用认证会话中的家庭与孩子身份，跨家庭高时间戳流水无法进入结果 |
| 余额守恒 | 混合 EARN、MANUAL、REDEEM 和 REFUND 属性测试分别验证余额变化量与累计获得变化量；集成测试核对流水连续性、最新流水和积分概览 |
| 稳定排行 | 三种指标与三种周期在多组候选排列下返回相同顺序、competition rank 和当前成员标记 |

## 测试入口

- `apps/api/src/product-completion-read-models.integration.test.ts`：真实 Hono 路由、`PointsReadService`、会话和状态型仓储的纵向组合。
- `apps/api/src/analytics/service.test.ts`：排行矩阵、候选排列不变性和 25 小时时区边界。
- `apps/api/src/points/logic.test.ts`：混合积分流水守恒属性。
- `apps/api/src/points/prisma-repository.test.ts`：家庭与孩子范围内的空集合及稳定排序。
- `apps/api/src/check-ins/history-prisma-repository.test.ts`：跨 SOLO 和 COLLABORATION 来源的 cursor 边界。
- `apps/api/src/check-ins/history-routes.test.ts`：非法不透明 cursor 的统一 `400 INVALID_REQUEST` 映射。
- `apps/web/components/parent-read-models.test.tsx`、`apps/web/components/child-points-rankings.test.tsx`：加载、错误、重试和空排行状态。

## 验证结果

- 任务 3.6 聚焦测试：8 个文件，41 项通过。
- 阶段 4 查询基础、家庭管理、权限和读模型聚焦回归：28 个文件，217 项通过。
- 完整单元回归：107 个文件，775 项通过。
- 全工作区 TypeScript、零警告 ESLint、Prisma Schema 校验和生产构建通过。
- 本任务文件通过 Prettier；全局格式检查仍包含两个并行工作文件，任务提交不改动其内容。
- 本任务只增加测试与文档，运行时、数据库迁移和 `8098` 部署保持不变。
