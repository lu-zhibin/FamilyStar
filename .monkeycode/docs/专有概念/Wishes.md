# 愿望

## 定位

愿望是孩子设定的积分目标。当前余额实时形成进度，愿望本身不冻结或扣减积分。

## 规则

- 标题为 1 至 120 字符，目标积分为 PostgreSQL `Int` 范围内的正整数。
- ACTIVE 愿望数量受孩子当前等级 `wishSlots` 限制。
- 进度包含 `points`、`remaining` 和 `ratio`，读取时使用孩子实时 `points_balance` 计算。
- 孩子可将本人 ACTIVE 愿望转换为 `CANCELLED` 并记录 `cancelled_at`。
- 家长可将本家庭 ACTIVE 愿望转换为 `ADOPTED`，按愿望标题、描述与目标积分创建奖励并记录 `adopted_reward_id` 和 `adopted_at`。
- 取消和采纳均在 `Serializable` 事务中完成，终态转换支持并发冲突重试。

## 接口

`GET /api/v1/wishes` 对孩子限定本人，对家长返回本家庭愿望。孩子使用 `POST /api/v1/wishes` 创建、使用 `POST /api/v1/wishes/:id/cancel` 取消；家长使用 `POST /api/v1/wishes/:id/adopt` 采纳。

## 双端交互

孩子端按全部 `ACTIVE` 愿望计算真实槽位占用，槽位满时锁定新建入口，并支持取消本人愿望后立即释放槽位。创建与取消期间锁定重复提交，成功后关闭弹窗并刷新服务端结果。

家长许愿墙只展示 `ACTIVE` 愿望。采纳弹窗把愿望转换为正式奖励，成功后同时刷新愿望墙与奖励池；并发状态冲突返回 `409` 时同步刷新两份权威列表。

## 任务 6.4 验证

真实 Chromium 验收确认愿望槽位占用与满额锁定、孩子取消后槽位释放、家长采纳后许愿墙进入空状态，并确认同名愿望作为新奖励继续出现在奖励池。
