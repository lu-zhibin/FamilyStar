# 孩子主题

## 主题目录

`packages/shared/src/themes.ts` 定义固定目录和默认键 `starlight`。目录按等级开放：`starlight` 为 Lv.1，`ocean` 为 Lv.3，`forest` 为 Lv.5，`sunset` 为 Lv.8。每个主题只包含背景、表面、主色、辅色和文字 5 个 CSS Token。

## 服务端权威

`GET /api/v1/themes` 仅允许孩子会话，按 `User.currentLevel` 派生每项 `unlocked`，并返回 `User.selectedTheme` 和唯一选中项。`PATCH /api/v1/themes/selection` 校验固定目录和等级后保存选择；锁定主题返回当前等级与要求等级，已有选择保持不变。

`PrismaThemeRepository` 的读取同时限定会话家庭、孩子 ID、`CHILD` 角色和活动状态。写入使用同样边界，并增加 `currentLevel >= minimumLevel` 条件，防止读取与选择之间升级状态变化造成越权。`User.selectedTheme` 默认 `starlight`，数据库 CHECK 限定小写主题键格式。

## Web 应用

孩子资料页展示完整目录、解锁状态和当前选择。Web 只接受主题键存在于共享目录且全部 Token 与目录值一致的响应；通过校验后，`ChildShell` 在 `.child-theme-shell` 根容器设置 CSS variables 和 `data-theme`。选择成功发布页内事件，当前门户即时更新。

## 验证

阶段 10 测试覆盖等级到解锁集合的映射、唯一选中项、未知和锁定主题、选择持久化、家庭与孩子隔离、受控 Token、防重复提交和 Shell 即时应用。`890f1e6`、`963dee1` 与 `033c7f2` 对应 API、Web 和边界强化，真实验收通过。
