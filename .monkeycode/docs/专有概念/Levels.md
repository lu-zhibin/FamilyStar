# 等级与权益

## 定位

任务 6.5 在 `apps/api/src/levels/` 实现基于累计获得积分的 20 级派生、只升不降同步和当前权益读取。等级与当前可消费余额解耦，家庭可以通过 `LevelConfig` 独立配置每一级阈值和权益。

## 派生规则

- `deriveEligibleLevel()` 在 1 至 20 级配置中选择 `pointsRequired <= pointsEarnedTotal` 的最高等级。
- 当前等级取 `max(User.currentLevel, eligibleLevel)`，保留历史缓存等级并防止回退。
- `deriveLevelView()` 返回当前配置、最高资格等级和下一等级进度；满级时 `next` 为 `null`。
- 进度比例以当前等级和下一等级阈值之间的区间计算，并限制在 `0..1`。

## 事务同步

`PrismaPointsTransactionWriter` 在每次 EARN 中读取家庭等级阈值，使用变化后的累计积分派生等级，并将余额、累计积分、当前等级和用户版本一起条件更新。跨越一个或多个等级时，同一事务追加单个 `levels.level.advanced.v1` Outbox 事件；积分业务键幂等命中时直接返回既有流水，不重复同步快照或发布事件。

升级事件 payload 包含孩子 ID、升级前等级、升级后等级和变化后的累计积分。余额写入、积分流水、业务快照和所有 Outbox 事件共享同一 `Serializable` 事务，任一写入失败均回滚。

## 当前权益

| 字段 | 规则 |
|---|---|
| 兑换折扣 | 读取当前等级 `discount` |
| 等级免审批额度 | 读取当前等级 `autoApproveQuota` |
| 有效免审批额度 | `max(家庭 autoApproveQuota, 等级 autoApproveQuota)` |
| 许愿槽位 | 读取当前等级 `wishSlots` |
| 扩展维度 | 原样返回当前等级 `extraDimensions` JSON |

## 访问边界

- `GET /api/v1/levels/me` 只接受孩子会话，并按会话主体读取本人等级。
- `GET /api/v1/family/children/:childId/level` 只接受家长会话，并将会话家庭 ID 与目标孩子 ID 一起传入仓储。
- Prisma 查询同时限定孩子角色和活动状态，并读取同家庭设置与等级配置。
- 成功响应续期滚动 30 天会话 Cookie；认证、角色和资源错误映射为稳定 HTTP 错误。

## 验证

阶段 6 测试覆盖阈值包含关系、跨多级、满级、缓存等级不回退、权益、家庭额度最大值、下级进度、家庭范围 Prisma 查询、孩子与家长权限、HTTP snake_case 输出、积分事务等级同步、升级事件和事件失败传播。任务 6.6 额外验证 20 个缓存等级与积分增长组合下的等级单调性。全仓 56 个测试文件、345 个测试通过；等级目录 statements 与 lines 为 95.25%、branches 为 89.28%、functions 为 100%。
