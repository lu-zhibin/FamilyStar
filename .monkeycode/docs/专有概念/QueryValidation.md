# 查询筛选校验

## 用途

FamilyStar 的新增历史、统计和排行接口通过统一工具解释家庭自然日与可选筛选条件。实现位于 `apps/api/src/http/query-validation.ts`，路由和服务可以复用相同的日期边界、范围限制、枚举白名单及 UUID 规则。

## 家庭自然日

家庭自然日由家庭配置的 IANA 时区决定。`familyCalendarDate()` 将一个绝对时间转换成该时区的 `YYYY-MM-DD` 日期；`familyDayBounds()` 将日期转换成 UTC 查询边界：

- `startAt` 包含该日期当地时间的零点。
- `endAtExclusive` 排除次日当地时间的零点。
- 夏令时切换日按当地日历计算，因此 UTC 区间可能为 23、24 或 25 小时。

数据库时间条件应使用 `createdAt >= startAt AND createdAt < endAtExclusive`，从而避免相邻日期重复或遗漏记录。

## 日期范围

`parseFamilyDateRange()` 接受包含首尾两天的日历日期范围，返回 UTC 起点、排他的 UTC 终点和自然日数量。默认最大范围为 366 天，领域接口可以传入更小的 `maxDays`。

日期必须是有效的 `YYYY-MM-DD` 值，起始日期必须早于或等于结束日期。日期数量按日历日期计算，避免夏令时造成小时差异后影响自然日计数。

## 可选筛选

| 接口 | 行为 |
|---|---|
| `parseUuidFilter()` | 接受可选 RFC 4122 UUID，将有效值规范化为小写 |
| `parseEnumFilter()` | 接受可选字符串，并要求值存在于调用方提供的只读白名单中 |
| `InvalidQueryFilterError` | 表示应由路由层映射为 `400 INVALID_REQUEST` 的查询输入错误 |

家庭 ID 继续从认证会话获取，不能作为普通查询筛选参数接收。

## 验证

聚焦测试覆盖跨时区日期、夏令时起止日、包含式日期范围、最大跨度、非法日期、UUID 和枚举。属性样本验证 UTC、整点偏移、半小时和四十五分钟偏移及夏令时区域的全年自然日边界，并覆盖 1、7、31、366 天范围上限：

```bash
pnpm exec vitest run apps/api/src/http/query-validation.test.ts
```
