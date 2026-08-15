# 奖励兑换

## 状态机

```text
PENDING -> APPROVED -> FULFILLED
PENDING -> REJECTED
```

免审批兑换从申请直接进入 `APPROVED`。`FULFILLED` 与 `REJECTED` 是终态。

## 申请事务

孩子通过 `POST /api/v1/rewards/:id/redemptions` 提交家庭级 `Idempotency-Key`。SHA-256 request fingerprint 绑定孩子和奖励；相同键与相同 fingerprint 返回既有记录，相同键绑定其他请求返回冲突。

同一 `Serializable` 事务完成资格、频次、余额和库存检查，有限库存预占，REDEEM 余额预扣，兑换记录、PointsLog 与 Outbox 写入。实付积分为 `max(1, round(listed_points_cost * level_discount))`，免审批额度为家庭额度与等级额度的最大值。

## 审批、兑现与退款

- 家长批准 `PENDING` 后进入 `APPROVED`。
- 家长兑现 `APPROVED` 后进入 `FULFILLED`，有限库存从预占转为消耗。
- 家长拒绝 `PENDING` 时要求原因，REFUND 只恢复当前余额并释放预占。
- REDEEM 和 REFUND 均不改变 `points_earned_total`。
- PointsLog 业务唯一键和退款部分唯一索引共同保证幂等。

## 双端交互

孩子端把四种状态显示为待审批、待兑现、已兑现和已拒绝退款，兑换请求写入期间锁定提交并在成功后关闭弹窗。家长端可批准待审批兑换、确认兑现或填写原因拒绝并退款；成功写入后刷新服务端权威列表，状态冲突返回 `409` 时同步刷新并保留明确反馈。

批准与兑现路由直接调用 `RewardOperations` 实例方法，保持方法接收者和服务依赖。路由回归测试覆盖两种动作的接收者绑定，防止把实例方法提取为裸函数后丢失 `this`。

## 事件

兑换发布 requested、approved、rejected 和 fulfilled 四类版本化事件；每次余额变化同时发布 `points.balance.changed.v1`。

## 任务 6.4 验证

Web 全量回归 15 个文件、130 项通过，API 全量回归 96 个文件、640 项通过。真实 Chromium 验收覆盖批准、兑现、拒绝退款、四种本地化状态、重复提交锁定及 `409` 后权威刷新；最终三笔兑换分别处于 `FULFILLED`、`REJECTED` 和 `APPROVED`。
