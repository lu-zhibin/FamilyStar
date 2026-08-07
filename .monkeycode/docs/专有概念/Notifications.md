# 通知中心

## 数据与幂等

`Notification` 保存家庭、接收者、通知类型、标题、内容、业务目标、来源事件、已读时间和创建时间。`(source_event_id, recipient_id)` 唯一键保证同一事件对同一接收者只生成一次；列表按 `created_at DESC, id DESC` 稳定分页。

`NotificationPreference` 按用户唯一保存站内与浏览器总开关、七类通知开关，以及可跨午夜的免打扰起止时间。免打扰约束浏览器投递时间，站内通知仍按偏好类型持久化。

## 事件与清理

通知消费者覆盖审核、积分、升级、兑换、愿望、徽章和邀请生命周期事件。Redis 消费回执和数据库唯一键共同保护重投幂等。

Worker 每日执行 `notification-cleanup`，按创建时间和 ID 稳定选择批次，只删除严格早于九十天的记录，恰好九十天的通知继续保留。

## API 与界面

- `GET /api/v1/notifications`
- `GET /api/v1/notifications/unread-count`
- `PATCH /api/v1/notifications/:id/read`
- `PATCH /api/v1/notifications/read-all`
- `GET /api/v1/notification-preferences`
- `PATCH /api/v1/notification-preferences`

家长与孩子 Shell 展示实时未读角标，并分别进入 `/notifications` 与 `/child/notifications`。双端支持 cursor 加载更多、单条已读和全部已读；家长可编辑通知类型与免打扰偏好。业务跳转只接受本应用单斜杠绝对路径。

## 验证

`i48-web` 与 `i46-api/worker` 已部署到 `8098`。真实验收覆盖事件通知、重投幂等、九十天边界、稳定分页、跨家庭隔离、双端角标与已读、偏好持久化、安全跳转和响应式布局。
