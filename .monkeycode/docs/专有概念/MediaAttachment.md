# MediaAttachment

`MediaAttachment` 是 FamilyStar 跨端使用的媒体展示契约，用于统一图片、视频和音频的基本元数据。

## 代码位置

| 方面 | 位置 |
|---|---|
| 类型定义 | `packages/shared/src/index.ts` |
| 公开包 | `@familystar/shared` |
| 决策依据 | `../../specs/decisions.md` §6 |

## 结构

媒体必须包含唯一标识、媒体类型、访问 URL、字节大小和创建时间。缩略图、时长、宽度和高度按媒体类型选填。

数据库使用持久化 `object_key`，`GET /api/v1/media/:id/access-url` 在验证家庭所有权和 `READY` 状态后生成短期签名 URL。

## 当前状态

任务 5 已完成 `MediaAsset` 持久化、家庭所有权校验、腾讯云 COS multipart 上传、服务端对象校验和打卡业务关联。当前打卡内容支持图片和视频；音频类型保留在共享展示契约中，上传服务拒绝音频。
