# Cursor 分页

## 用途

FamilyStar 的新增集合接口使用不透明 cursor 保持稳定翻页。集合业务数据继续放在响应 `data` 中，分页元数据统一放在 `data.page`，现有顶层 `meta` 继续只保存请求 ID 和响应时间。

## 共享契约

`@familystar/shared` 公开 `CursorPage`：

```typescript
type CursorPage = {
  next_cursor: string | null;
  has_more: boolean;
};
```

集合响应示例：

```json
{
  "success": true,
  "data": {
    "items": [],
    "page": {
      "next_cursor": null,
      "has_more": false
    }
  },
  "meta": {
    "request_id": "request-id",
    "timestamp": "2026-08-05T00:00:00.000Z"
  }
}
```

## API 工具

`apps/api/src/http/cursor.ts` 提供以下内部接口：

| 接口 | 用途 |
|---|---|
| `encodeCursor()` | 将稳定排序值和记录 ID 编码为版本化 Base64URL cursor |
| `decodeCursor()` | 校验并解码不透明 cursor |
| `parseCursorPageQuery()` | 解析可选 `cursor` 和 `limit` 查询参数 |
| `InvalidPaginationError` | 向路由层表示应映射为 `400 INVALID_REQUEST` 的分页输入错误 |

默认页大小为 20，通用最大页大小为 100。领域可传入更小的默认值和上限。`limit` 仅接受十进制正整数；cursor 限制编码长度、排序值长度和 ID 长度，并拒绝未知版本、非规范 Base64URL 和无效载荷。

## 稳定排序

仓储查询应使用与 cursor 相同的复合顺序。时间线类集合通常按业务要求使用 `(created_at, id)`；其他领域可以使用自身稳定排序值和 ID。查询下一页时，排序方向、过滤条件和 cursor 字段必须保持一致。

## 验证

聚焦测试命令：

```bash
pnpm exec vitest run apps/api/src/http/cursor.test.ts
```
