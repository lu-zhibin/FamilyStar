# 业务模块

`modules/` 保存 FamilyStar Phase 1 的独立业务插件和应用组合入口。任务 2.5 建立架构骨架，任务、打卡、积分、等级和奖励的领域服务分别由任务 4 至任务 7 实现。

## 工作区

| 包 | 插件名 | 公开能力 | 依赖 |
|---|---|---|---|
| `@familystar/tasks-module` | `tasks` | 任务管理、任务调度 | 无 |
| `@familystar/check-in-module` | `check-in` | 打卡提交、打卡审核 | `tasks` |
| `@familystar/points-module` | `points` | 积分账本、积分余额 | `check-in` |
| `@familystar/levels-module` | `levels` | 等级进度、等级权益 | `points` |
| `@familystar/rewards-module` | `rewards` | 奖励目录、奖励兑换 | `points`、`levels` |

每个包包含独立 `package.json`、严格 TypeScript 配置、`src/manifest.json` 和 `src/index.ts`。模块只依赖 `@familystar/shared`，跨模块关系通过 manifest 依赖和版本化事件表达。

## 静态组合

`@familystar/business-modules` 在编译期直接导入五个插件，并固定以下注册拓扑：

```text
tasks -> check-in -> points -> levels -> rewards
```

`registerBusinessModules()` 按该顺序调用 Registry，`unregisterBusinessModules()` 按反向顺序清理。`initializeBusinessModules()` 创建带核心权限许可清单的 Registry 并完成全部注册，API 在监听端口前调用该入口。

## 事件连接

| 发布方 | 主要发布事件 | 消费方 |
|---|---|---|
| `tasks` | `tasks.task.archived.v1` | `check-in` |
| `check-in` | `check-in.entry.approved.v1` | `points` |
| `points` | `points.balance.changed.v1` | `levels`、`rewards` |
| `levels` | `levels.level.advanced.v1` | `rewards` |
| `rewards` | `rewards.redemption.*.v1` | 后续通知消费者 |

各模块还声明自身领域所需的创建、更新、提交、审核和兑换状态事件。事件处理器与 Outbox 事务写入在对应领域任务中接入。

## 家庭模块控制

进程启动继续按静态清单装载五个插件。产品补全任务 10 在 `@familystar/shared` 增加家庭级核心与可选模块目录，状态保存在 `Family.settings.modules`；安全中间件和 Web Shell 消费同一读取模型，在请求授权和页面可见性层控制可选能力。该设置不执行动态 `import()`，关闭后业务数据保持原状。

## 验证

`modules/src/index.test.ts` 验证以下契约：

- 五个公开 manifest 均合法且不可变。
- 静态列表满足依赖拓扑。
- 每个订阅事件在静态列表中存在发布方。
- 完整初始化、反向清理和部分初始化清理保持 Registry 一致。
- 权限许可缺失时启动注册失败。
- 家庭模块属性测试覆盖核心模块恒启用、依赖闭包、开关数据保留和家庭隔离。

任务 2.7 使用真实静态模块完成 Registry 初始化、EventBus scope 创建、声明事件发布和反向清理集成验证。完成时全仓 22 个测试文件、173 个测试通过；生产构建和从 API workspace 加载 `dist` 入口均通过验证。
