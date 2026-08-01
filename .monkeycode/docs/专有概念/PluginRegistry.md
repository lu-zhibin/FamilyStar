# PluginRegistry

## 定位

`PluginRegistry` 是 FamilyStar Phase 1 的静态插件内核。它在应用启动时按编译期清单顺序注册插件，验证公开契约、依赖和权限，并为任务、打卡、积分、等级与奖励模块提供隔离边界。

实现位于 `packages/shared/src/plugins.ts`，通过 `@familystar/shared` 公开。API、Worker 和业务模块可共享该契约，无需依赖彼此的内部实现。

## Manifest 契约

每个插件声明以下字段：

| 字段 | 说明 |
|---|---|
| `name` | 小写插件标识，允许数字和连字符，最长 63 位 |
| `version` | 语义版本，支持 prerelease 和 build metadata |
| `capabilities` | 插件向平台公开的稳定能力名称 |
| `dependencies` | 必须先完成注册的插件名称 |
| `permissions` | 插件请求的核心平台权限 |
| `subscribes` | 插件订阅的版本化事件名称 |
| `publishes` | 插件发布的版本化事件名称 |

能力、依赖、权限和事件声明均禁止重复。插件不能依赖自身。事件名必须符合 `<module>.<entity>.<event>.v<version>`，例如 `tasks.task.completed.v1`。

校验成功后，Registry 保存 manifest 与全部数组字段的冻结快照，调用方后续修改原始对象不会改变注册记录。

## 生命周期

插件实现 `register(context)` 和 `unregister(context)` 两个生命周期回调。Registry 为所有插件传入同一个平台上下文，其具体服务能力由应用组合层定义。

注册流程：

1. 校验 manifest。
2. 拒绝同名插件。
3. 根据核心许可清单校验权限。
4. 确认全部依赖已注册。
5. 执行插件 `register()` 回调。
6. 回调成功后写入注册表。

卸载流程先确认插件存在且没有已注册依赖方，再执行 `unregister()` 回调。回调成功后删除注册记录。注册回调失败时不新增记录，卸载回调失败时保留原记录。

## 错误分类

| 错误码 | 条件 |
|---|---|
| `INVALID_MANIFEST` | manifest 结构、值、事件名或版本非法 |
| `DUPLICATE_PLUGIN` | 同名插件已注册 |
| `MISSING_DEPENDENCY` | 依赖插件尚未注册 |
| `PERMISSION_DENIED` | 请求权限不在核心许可清单 |
| `DEPENDENCY_IN_USE` | 其他已注册插件仍依赖目标插件 |
| `PLUGIN_NOT_FOUND` | 卸载未注册插件 |

`PluginRegistryError` 同时提供稳定 `code` 和 `pluginName`，调用方可据此分类处理。

## Phase 1 边界

- 插件由应用中的编译期静态清单按顺序注册。
- 跨插件协作使用公开能力契约和后续 EventBus，不直接导入其他插件内部文件。
- `unregister()` 服务于测试和应用关闭流程。
- 动态 `import()`、运行时安装、热加载、热卸载和版本解析属于 Phase 2。
- `@familystar/business-modules` 按 `tasks → check-in → points → levels → rewards` 注册五个独立 workspace 插件。
- 设置模块开关当前公开只读启用占位；运行时装载由编译期清单唯一决定。

## 验证

`packages/shared/src/plugins.test.ts` 覆盖 Registry 内核，`modules/src/index.test.ts` 覆盖五个真实 manifest、静态依赖拓扑、事件连接、权限失败、完整与部分生命周期清理和开关占位。任务 2.7 使用真实静态模块注册结果创建 EventBus scope 并验证声明事件流转；完成时全仓 22 个测试文件、173 个测试通过。
