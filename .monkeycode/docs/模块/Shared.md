# Shared 模块

`packages/shared` 是 Web、API 和后续 Worker 与业务模块共享的 TypeScript 契约包。

## 关键文件

| 文件 | 目的 |
|---|---|
| `src/index.ts` | 公开类型出口 |
| `src/errors.ts` | 统一错误码常量和联合类型 |
| `src/errors.test.ts` | 错误码集合、唯一性和格式测试 |
| `src/plugins.ts` | 插件 manifest、错误分类、校验器和静态注册表 |
| `src/plugins.test.ts` | 插件校验、依赖、权限和生命周期一致性测试 |
| `src/events.ts` | 事件名、JSON-safe payload 和不可变领域事件信封 |
| `src/events.test.ts` | 事件解析、载荷校验、UUID、时间和冻结快照测试 |
| `src/index.test.ts` | 公共导出、响应类型、健康类型、媒体类型和插件类型测试 |
| `tsconfig.build.json` | 生成 JavaScript、声明文件和 Source Map |
| `package.json` | 定义 `@familystar/shared` 导出 |

## 当前公开类型

- `ServiceInfo`：服务名称和版本。
- `MediaType`：图片、视频和音频联合类型。
- `MediaAttachment`：跨端媒体展示契约。
- `ERROR_CODES`：稳定错误码值。
- `ErrorCode`：由错误码常量派生的联合类型。
- `ApiResponseMeta`：请求 ID 和服务端 UTC 时间。
- `ApiSuccessResponse<T>`、`ApiErrorResponse`、`ApiResponse<T>`：统一 HTTP 信封。
- `HealthInfo`：API 健康检查数据。
- `PluginManifest`：插件名称、版本、能力、依赖、权限和事件声明。
- `Plugin<TContext>`：接收平台上下文的注册与卸载生命周期。
- `PluginRegistry<TContext>`：静态注册、查询、依赖保护和安全卸载。
- `PLUGIN_REGISTRY_ERROR_CODES`、`PluginRegistryError`：稳定插件错误分类。
- `EventName`、`EventNameParts`：版本化事件名与解析结果。
- `JsonValue`、`EventPayload`：可写入 JSONB 的事件数据契约。
- `DomainEvent`、`DomainEventInput`：家庭范围版本化事件信封。
- `createDomainEvent()`、`isEventName()`、`parseEventName()`：事件创建与名称校验运行时契约。

消费方通过 `workspace:*` 声明依赖。包的 TypeScript 类型入口直接指向 `src/index.ts`，保证编辑期读取最新契约；运行时导入继续使用构建后的 `dist/index.js`。插件内核仅维护注册状态并执行调用方提供的生命周期，不产生网络或存储副作用。

共享类型测试结合运行时断言与 Vitest `expectTypeOf`，同时验证 JavaScript 公共导出和 TypeScript 判别联合。插件测试使用同步与异步假生命周期覆盖成功、拒绝和失败回滚路径。
