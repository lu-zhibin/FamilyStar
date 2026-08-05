# FamilyStar 产品功能补全需求

## Introduction

本需求用于补全 FamilyStar 当前 Web 产品中的受限页面、缺失管理操作和后续增强能力。实施范围覆盖 Phase 1 核心闭环收口、Phase 2 数据与互动能力、Phase 3 成长记录基础能力，以及开发与生产环境发布验收。

## Glossary

- **家庭总览**：家长查看全部活动孩子今日任务进度、待办和近期动态的页面。
- **成长记录**：由任务打卡、媒体和学习笔记组成的家庭或孩子时间线。
- **积分流水**：记录积分来源、变化值、变化前后余额和业务关联的不可变记录。
- **排行**：当前家庭活动孩子在指定时间范围和指标下的有序列表。
- **徽章模板**：定义徽章名称、类别、图标、触发条件和状态的家庭级规则。
- **通知**：由业务事件产生并投递给指定家庭成员的站内消息。
- **模块开关**：控制家庭界面中可选业务模块可见性和可用性的家庭设置。
- **主题**：孩子选择并持久化的界面视觉配置。

## Requirements

### Requirement 1：Phase 1 状态对账

**User Story:** AS 项目维护者, I want 实施清单反映真实运行状态, so that 后续计划和验收具有一致基线。

#### Acceptance Criteria

1. WHEN 已完成能力通过代码、测试和运行验收确认，项目文档 SHALL 将对应任务标记为完成。
2. WHEN 页面仍包含受限空态或无行为控件，项目文档 SHALL 将对应能力登记为待实施任务。
3. WHEN 专项任务清单与总任务清单状态冲突，项目文档 SHALL 以最新可验证结果统一两处状态。

### Requirement 2：家庭总览

**User Story:** AS 家长, I want 查看全部孩子今日进度和家庭待办, so that 我可以快速决定需要处理的事项。

#### Acceptance Criteria

1. WHEN 家长进入家庭总览，系统 SHALL 按家庭时区展示每名活动孩子的今日任务总数、已完成数、待审核数和今日所得积分。
2. WHEN 家庭存在待审核提交、待审批兑换或待兑现兑换，系统 SHALL 展示可跳转到对应处理页面的待办摘要。
3. WHEN 家庭产生打卡、审核、积分、升级、兑换、愿望、徽章或成员事件，系统 SHALL 按服务端时间倒序展示近期家庭动态。
4. IF 总览读取失败，系统 SHALL 展示可重试错误状态并保持导航可用。

### Requirement 3：积分、统计与排行

**User Story:** AS 家庭成员, I want 查看真实积分与成长统计, so that 家庭能够理解持续行动的结果。

#### Acceptance Criteria

1. WHEN 孩子查看积分信息，系统 SHALL 展示当前余额、累计获得积分和稳定分页的积分流水。
2. WHEN 家长查看数据面板，系统 SHALL 支持按孩子、任务和日期范围查看打卡率、积分趋势、任务表现和等级分布。
3. WHEN 家庭成员查看排行，系统 SHALL 支持当前余额、累计获得积分和等级三种指标，以及周、月和总榜范围。
4. IF 家庭只有一名活动孩子，系统 SHALL 返回单成员排行结果。
5. WHEN 统计或排行返回成员数据，系统 SHALL 将成员限制在当前认证家庭。

### Requirement 4：历史打卡与成长记录

**User Story:** AS 家庭成员, I want 回看历史打卡和媒体, so that 成长过程可以持续沉淀。

#### Acceptance Criteria

1. WHEN 孩子进入我的记录，系统 SHALL 展示当前孩子的历史单人和协作提交、审核结果、积分和 READY 媒体。
2. WHEN 家长进入成长记录，系统 SHALL 支持按孩子、任务、类型和日期范围筛选家庭时间线。
3. WHEN 家长创建学习笔记，系统 SHALL 保存标题、正文、发生日期、关联孩子和可选 READY 媒体。
4. WHEN 历史媒体需要展示，系统 SHALL 通过家庭范围校验后的批量短期访问地址提供内容。
5. IF 历史集合为空，系统 SHALL 展示真实空状态。

### Requirement 5：家庭与成员管理

**User Story:** AS 家长, I want 完整管理家庭资料、孩子和共同管理者, so that 家庭账号保持准确可用。

#### Acceptance Criteria

1. WHEN 家长查看家庭成员页，系统 SHALL 展示家庭名称、时区、活动家长、待处理邀请和活动孩子。
2. WHEN 家长编辑孩子档案，系统 SHALL 支持昵称、性别、生日、年级、头像、凭据模式和凭据重置。
3. WHEN 家长停用孩子档案，系统 SHALL 在确认后撤销该孩子会话并保留历史业务记录。
4. WHEN 创建者管理共同家长邀请，系统 SHALL 支持创建、重发和撤销未完成邀请。
5. WHEN 共同管理者查看受限操作，系统 SHALL 展示只读状态。

### Requirement 6：完整任务管理

**User Story:** AS 家长, I want 管理任务类型、状态和逐孩配置, so that 家庭任务可以随成长需求调整。

#### Acceptance Criteria

1. WHEN 家长管理任务类型，系统 SHALL 支持家庭自定义类型创建、编辑、排序和受保护删除。
2. WHEN 家长创建或编辑任务，系统 SHALL 支持提交指南、任务模式、参与孩子及逐孩积分、频率、打卡方式和验收方式覆盖。
3. WHEN 家长操作活动任务，系统 SHALL 支持启用、停用和归档并展示服务端权威状态。
4. IF 任务存在历史周期或提交，系统 SHALL 保留历史记录并按领域规则限制不安全修改。
5. WHEN 家庭时区跨越 UTC 日期边界，任务表单 SHALL 使用家庭自然日期。

### Requirement 7：完整审核体验

**User Story:** AS 家长, I want 查看审核期限和历史, so that 审核处理可追溯。

#### Acceptance Criteria

1. WHEN 家长查看待审提交，系统 SHALL 展示实际审核截止时间和超时状态。
2. WHEN 家长查看审核历史，系统 SHALL 支持按孩子、任务、结果和日期范围筛选。
3. WHEN 家长使用键盘操作凭证弹窗，系统 SHALL 支持焦点约束、Escape 关闭和前后凭证切换。
4. IF 审核写入发生冲突，系统 SHALL 保留当前记录并刷新服务端权威状态。

### Requirement 8：完整奖励、兑换与愿望管理

**User Story:** AS 家庭成员, I want 完整管理奖励和愿望状态, so that 积分兑换闭环清晰可靠。

#### Acceptance Criteria

1. WHEN 家长管理奖励，系统 SHALL 支持图片、价格、等级门槛、频次、库存、上下架、编辑和受保护删除。
2. WHEN 家长处理兑换，系统 SHALL 支持批准、拒绝、兑现和退款后的本地化状态展示。
3. WHEN 家长采纳愿望，系统 SHALL 将愿望转换为家庭奖励并更新双方列表。
4. WHEN 孩子拥有多个愿望槽，系统 SHALL 展示全部活动愿望并支持取消。
5. WHEN 写操作成功，系统 SHALL 关闭或锁定对应弹窗以防止重复提交。

### Requirement 9：徽章系统

**User Story:** AS 家庭成员, I want 使用多维度徽章认可成长, so that 等级之外的努力也能被看见。

#### Acceptance Criteria

1. WHEN 家长管理徽章模板，系统 SHALL 支持系统预设和家庭自定义模板的创建、编辑、停用和受保护删除。
2. WHEN 业务事件满足启用模板条件，系统 SHALL 幂等地为符合条件的孩子颁发徽章。
3. WHEN 家长执行手动颁发，系统 SHALL 保存颁发人、孩子、模板、原因和时间。
4. WHEN 孩子查看徽章墙，系统 SHALL 展示已获得徽章、可见未获得徽章和条件进度。
5. IF 模板已有颁发记录，系统 SHALL 保留模板历史快照并拒绝破坏性修改。

### Requirement 10：通知中心与偏好

**User Story:** AS 家庭成员, I want 接收可控的业务通知, so that 重要状态变化可以及时处理。

#### Acceptance Criteria

1. WHEN 核心业务事件发布，通知消费者 SHALL 为对应接收者幂等创建站内通知。
2. WHEN 用户打开通知中心，系统 SHALL 展示未读数量、稳定分页列表和业务目标链接。
3. WHEN 用户读取通知，系统 SHALL 支持单条已读和全部已读。
4. WHEN 家长保存通知偏好，系统 SHALL 支持站内总开关、浏览器通知总开关、类型开关和免打扰时间段。
5. WHEN 通知超过九十天，Worker SHALL 批量清理过期通知。

### Requirement 11：PWA 与离线体验

**User Story:** AS 家庭成员, I want 安装应用并在短时离线时继续使用基础能力, so that 日常打卡受到网络波动的影响更小。

#### Acceptance Criteria

1. WHEN 浏览器支持 PWA，Web 应用 SHALL 提供有效 manifest、图标和可安装入口。
2. WHEN 已访问页面处于离线状态，Service Worker SHALL 提供应用壳和明确离线反馈。
3. WHEN TICK 或 TEXT 打卡在离线状态提交，Web 应用 SHALL 将请求保存到当前设备队列并在恢复网络后按原幂等键重放。
4. WHEN 媒体打卡处于离线状态，Web 应用 SHALL 保留本地草稿并在恢复网络后请求用户确认上传。
5. IF 离线重放产生业务冲突，Web 应用 SHALL 展示服务端权威状态并保留可审计失败结果。

### Requirement 12：模块开关与主题

**User Story:** AS 家庭成员, I want 控制可选模块并选择已解锁主题, so that 产品界面符合家庭使用方式。

#### Acceptance Criteria

1. WHEN 创建者修改可选模块状态，系统 SHALL 持久化家庭模块配置并验证依赖关系。
2. WHILE 模块处于关闭状态，Web 应用 SHALL 从导航隐藏对应入口并拒绝该家庭调用对应可选接口。
3. WHEN 孩子达到主题解锁条件，系统 SHALL 将主题列入可选集合。
4. WHEN 孩子选择已解锁主题，系统 SHALL 持久化选择并在后续会话应用对应 Design Tokens。
5. IF 主题未解锁，系统 SHALL 保留当前主题并返回业务错误。

### Requirement 13：质量、部署与生产发布

**User Story:** AS 项目维护者, I want 通过完整验证后发布产品, so that 开发和生产环境具有可追溯回滚点。

#### Acceptance Criteria

1. WHEN 每个实施阶段完成，项目 SHALL 通过聚焦测试、完整测试、类型检查、Lint、格式、Prisma 验证和生产构建。
2. WHEN数据库结构变化，部署流程 SHALL 在迁移前创建并验证 PostgreSQL 备份。
3. WHEN开发镜像部署到端口 8098，系统 SHALL 通过容器健康、API 健康和真实双端浏览器验收。
4. WHEN开发阶段验收通过，项目 SHALL 将 dev 提交推送并合并到 main。
5. WHEN生产镜像部署到端口 8099，系统 SHALL 通过域名、健康接口、关键角色登录和核心只读链路验收。
6. WHEN新版本验收完成，部署记录 SHALL 保存源码提交、镜像标签和上一健康回滚点。
