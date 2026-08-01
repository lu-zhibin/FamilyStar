# 家庭设置

## 领域边界

任务 3.5 提供家庭规则的认证读取与部分更新。两位家长拥有相同管理权限；孩子会话无法读取或修改设置；家庭 ID 仅从 Redis 会话获得。

## 设置结构

| HTTP 字段 | JSONB 字段 | 默认值 | 约束 |
|---|---|---|---|
| `time_zone` | `timeZone` | `Asia/Shanghai` | 有效 IANA 时区 |
| `check_in_deadline` | `checkInDeadline` | `23:59` | 严格 `HH:mm` |
| `makeup_days` | `makeupDays` | `3` | 非负安全整数，0 关闭补打卡 |
| `review_timeout_hours` | `reviewTimeoutHours` | `48` | 非负安全整数，0 保持人工审核 |
| `auto_approve_quota` | `autoApproveQuota` | `0` | 非负安全整数 |
| `streak_multipliers` | `streakMultipliers` | 六档倍率 | 固定 3、7、14、30、60、100 天，倍率为正有限数 |

默认倍率依次为 1.5、2、3、5、8、10。任务 6.4 已将该配置接入单人和协作奖励：按连续家庭自然日命中最高已达档位，并以 `Math.round` 计算整数积分。

## 读写流程

1. Hono 路由读取 `familystar_session` Cookie 并校验 PATCH 的 snake_case 载荷。
2. `FamilySettingsService` 通过 `SessionStore.read()` 验证家长角色并取得家庭 ID。
3. `PrismaFamilySettingsRepository` 只读取 `deletedAt: null` 的家庭。
4. GET 将空对象、缺字段或单字段损坏值与当前默认值合并后返回完整设置。
5. PATCH 合并未提交字段，保存完整 camelCase 规范对象，同时保留 `broadcastEnabled` 等其他 JSONB 字段。
6. 成功响应重新设置当前令牌的 30 天 Cookie Max-Age；Redis 读取同时刷新令牌 TTL。

## 持久化

设置保存在 `Family.settings` JSONB 列。现有列可承载任务 3.5 的全部字段，因此没有新增数据库结构迁移。注册服务继续写入完整默认对象；读取规范化保证通过数据库默认 `{}` 创建的历史或外部记录也能获得完整规则。

## 错误契约

- 缺少有效家长会话返回 `401 UNAUTHORIZED`。
- 家庭不存在或已软删除返回 `404 NOT_FOUND`。
- 空 PATCH、未知字段、非法时区、非法时间、负数、小数或错误 Streak 档位返回 `400 INVALID_REQUEST`。

## 测试边界

服务测试覆盖默认补齐、部分更新、未知字段保留、家长角色、缺失家庭和各类非法规则。仓储测试覆盖活动家庭范围。HTTP 测试覆盖 snake_case 响应、Cookie 续期、部分更新、输入拦截和认证错误映射。
