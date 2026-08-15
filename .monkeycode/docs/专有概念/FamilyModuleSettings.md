# 家庭模块设置

## 目录与依赖

`packages/shared/src/family-modules.ts` 是 API 与 Web 的共同目录。核心模块 `authentication`、`family-settings`、`tasks`、`check-in`、`points` 始终启用；可选模块 `levels`、`analytics`、`growth-records`、`rewards`、`badges`、`notifications` 默认启用。

每项声明直接依赖。`analytics` 依赖任务、打卡、积分和等级，`rewards` 依赖积分和等级，`badges` 依赖打卡、积分和等级；服务端要求所有启用模块形成有效依赖闭包。

## 读取与更新

`GET /api/v1/family/modules` 允许家长和孩子读取会话家庭的完整模型。服务将 `Family.settings.modules` 与默认状态合并，核心模块固定返回 `enabled: true`、`configurable: false`，并带上当前 `settingsVersion`。

`PATCH /api/v1/family/modules` 仅接受可选模块的部分布尔状态与读取时版本。家庭创建者拥有修改权限；仓储以 `familyId`、活动状态和 `settingsVersion` 条件更新 JSONB，并将版本加一。缺失依赖、仍有启用依赖方和并发版本变化均返回可分类的 `409 CONFLICT`。

关闭和重新启用只修改家庭设置，业务表和历史记录保持不变。

## 运行边界

插件代码继续在 API 启动时按静态清单注册。家庭模块状态作用于请求授权和页面可见性：安全中间件通过认证会话家庭查询模块状态；家长与孩子 Shell 过滤对应入口，直接访问已关闭页面时展示受限状态。读取失败时核心入口继续可用，可选入口关闭。

## 验证

阶段 10 测试覆盖核心模块恒启用、合法依赖拓扑、启用与关闭冲突、版本竞争、创建者权限、家庭隔离、关停重开数据保留、导航过滤和直接路由保护。`b783b68`、`963dee1` 与 `033c7f2` 对应实现、双端接入和边界强化，真实验收通过。
