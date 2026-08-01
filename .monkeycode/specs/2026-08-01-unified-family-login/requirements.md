# 统一家庭登录入口需求

## Introduction

FamilyStar 根路径提供家长与孩子共用的身份入口。家长使用邮箱和密码登录或创建家庭；孩子使用家庭码选择本人头像并输入 PIN。有效会话访问根路径时直接进入对应角色门户。

## Glossary

- **统一登录页**：FamilyStar 根路径 `/` 的家长与孩子身份入口。
- **家庭码**：系统为每个家庭分配的 10 位大写字母和数字唯一标识。
- **家长门户**：根路径为 `/dashboard` 的家庭管理页面集合。
- **孩子门户**：根路径为 `/child` 的孩子个人页面集合。
- **有效会话**：Redis 中存在且主体 revision 匹配的 30 天滚动会话。

## Requirements

### Requirement 1：统一身份入口

**User Story:** AS 家庭成员, I want 在同一页面选择身份, so that 我可以进入与身份匹配的登录流程。

#### Acceptance Criteria

1. WHEN 未认证用户访问 `/`, 统一登录页 SHALL 展示家长入口和孩子入口。
2. WHEN 用户切换身份, 统一登录页 SHALL 在当前页面展示所选身份的表单。
3. WHILE 视口宽度处于 320px 至 2560px, 统一登录页 SHALL 保持表单、文本和操作按钮完整可用。
4. WHEN 用户使用键盘浏览, 统一登录页 SHALL 提供可见焦点、表单标签和状态消息。

### Requirement 2：家长登录与注册

**User Story:** AS 家长, I want 登录已有账号或创建家庭, so that 我可以管理家庭成长计划。

#### Acceptance Criteria

1. WHEN 家长提交有效邮箱和密码, 系统 SHALL 创建家长会话并进入 `/dashboard`。
2. WHEN 家长选择创建家庭, 统一登录页 SHALL 收集家庭名称、家长昵称、邮箱和符合策略的密码。
3. WHEN 家长提交有效注册信息, 系统 SHALL 原子创建家庭和创建者账号并进入 `/dashboard`。
4. IF 家长提交信息校验失败, 统一登录页 SHALL 在当前表单显示可理解的错误消息。

### Requirement 3：家庭码

**User Story:** AS 家长, I want 获得稳定的家庭码, so that 孩子可以从共享设备找到所属家庭。

#### Acceptance Criteria

1. WHEN 系统创建家庭, 系统 SHALL 分配一个全局唯一的 10 位家庭码。
2. WHILE 家庭处于活动状态, 系统 SHALL 保持家庭码稳定。
3. WHEN 家长访问家庭成员页, 家长门户 SHALL 展示当前家庭码和孩子登录用途说明。
4. IF 家庭码格式无效或家庭不可用, 系统 SHALL 返回统一的家庭查找失败响应。

### Requirement 4：孩子登录

**User Story:** AS 孩子, I want 使用家庭码、头像和 PIN 登录, so that 我可以进入自己的成长空间。

#### Acceptance Criteria

1. WHEN 孩子提交有效家庭码, 系统 SHALL 返回该家庭的名称和活动孩子公开档案。
2. WHEN 孩子选择档案并提交有效 PIN, 系统 SHALL 创建孩子会话并进入 `/child`。
3. IF 孩子提交无效家庭码、档案或 PIN, 系统 SHALL 返回不包含凭据细节的认证失败响应。
4. WHEN 孩子连续提交失败凭据, 系统 SHALL 复用每孩子 5 次失败锁定 15 分钟和 15 分钟 10 次限流策略。
5. WHILE 孩子列表为空, 统一登录页 SHALL 引导家长先创建孩子档案。

### Requirement 5：已有会话

**User Story:** AS 已认证家庭成员, I want 再次访问首页时继续当前会话, so that 我可以减少重复登录。

#### Acceptance Criteria

1. WHEN 有效家长会话访问 `/`, 系统 SHALL 进入 `/dashboard`。
2. WHEN 有效孩子会话访问 `/`, 系统 SHALL 进入 `/child`。
3. IF 会话缺失或失效, 系统 SHALL 展示统一登录页。
4. WHEN 系统识别有效会话, 系统 SHALL 刷新会话有效期。

### Requirement 6：安全与隐私

**User Story:** AS 家庭成员, I want 登录流程保护家庭身份和凭据, so that 家庭数据保持隔离。

#### Acceptance Criteria

1. WHEN 系统返回孩子登录候选, 系统 SHALL 仅返回昵称、头像引用、年级和孩子标识。
2. WHEN 系统创建认证会话, 系统 SHALL 使用 HttpOnly、SameSite=Lax 和 30 天 Max-Age Cookie。
3. WHILE 生产环境使用 HTTPS, 系统 SHALL 为会话 Cookie 启用 Secure 属性。
4. IF 登录失败, 系统 SHALL 避免返回密码哈希、PIN 哈希、会话令牌和 Redis 键。
