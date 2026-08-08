# FamilyStar 开发记录

## 2026-08-08：完成 PWA 安装入口与 i60 真实验收

- 记录 ID：`FS-PRODUCT-COMPLETION-PWA-I60-001`
- 状态：i60 已部署到 `8098`，PWA/主题真实 HTTPS 验收通过；当前工作树全量质量门禁正在执行
- 提交：`3dc342e`

### 实施与验证

- Web 捕获 `beforeinstallprompt`，提供可访问、可关闭的“安装 FamilyStar”入口，支持安装进行中状态、`userChoice` 和 `appinstalled`。
- i60 构建成功并完成迁移容器、API、Worker、Web 重建；PostgreSQL、Redis、API、Worker、Web 健康依赖链完成。
- `REAL_ACCEPTANCE=1 PLAYWRIGHT_BASE_URL=https://home.wenwuge.vip pnpm exec playwright test e2e/themes-pwa.real.spec.cjs`：2 项通过，覆盖主题选择、manifest、缓存激活和离线回退。
- 正确工作树的完整质量链路已重新启动，包含格式、Lint、类型、Prisma、覆盖率、构建、设计系统、API 基础契约和 Playwright。
- 先前质量命令在 `/workspace` 执行，结果未计入本项目验收；阶段 13.1、13.4 与检查点 14 等待当前工作树结果。

## 2026-08-08：完成第三个产品补全批次质量检查点

- 记录 ID：`FS-PRODUCT-COMPLETION-CHECKPOINT-003`
- 分支：`dev`
- 状态：阶段 11 质量门禁通过
- 回归修复提交：`48d3bd0`

### 验证结果

- 徽章、通知、模块和主题聚焦回归共 31 个文件、223 项通过，覆盖迁移、消费者、Worker、权限、组件和事件重投。
- 完整单元回归 131 个文件、986 项通过；全工作区类型检查、零警告 Lint、全局 Prettier、Prisma Schema、数据模型契约和全部生产构建通过。
- `48d3bd0` 已将邀请仓储测试对齐现行事件字段契约，完整质量链路恢复通过。

## 2026-08-08：完成通知中心、偏好与过期清理

- 记录 ID：`FS-PRODUCT-COMPLETION-NOTIFICATIONS-001`
- 分支：`dev`
- 状态：已部署到 `8098`，API、Worker 与双端 Chromium 验收通过
- 提交：`5bba67c`、`20f16dc`、`0402835`、`2cd9575`、`c669458`

### 实施与验证

- 新增通知与偏好模型、稳定 cursor API、幂等已读、七类事件消费者、每日九十天批量清理，以及双端通知中心与家长偏好界面。
- 通知聚焦 89 项、完整 Web 159 项通过；类型、Lint、格式及 API/Web 生产构建通过。
- `i48-web` 与 `i46-api/worker` 五服务 healthy；真实验收覆盖事件重投、清理边界、分页、跨家庭隔离、角标、已读、偏好、安全跳转和双视口。

## 2026-08-07：完成徽章属性与权限回归

- 记录 ID：`FS-PRODUCT-COMPLETION-BADGE-PROPERTIES-001`
- 分支：`dev`
- 状态：已部署到 `8098` 开发环境，真实 Chromium 与权限边界验收通过
- 测试与修复提交：`3c0ccc2`

### 实施与验证

- 新增五种自动条件阈值属性、事件重投幂等、历史快照稳定、家庭角色隔离和双端组件状态测试；徽章聚焦 9 个文件、115 项通过。
- 数字表单统一限制在 PostgreSQL `Int` 正整数范围，徽章模板、模板单项和手动颁发改用精确 HTTP 方法权限；全工作区类型、Lint 和格式通过。
- `i43-api`、`i43-worker` 和 `i43-web` 已部署，五个服务 healthy；真实徽章闭环六项通过，认证态未定义模板方法稳定返回 `404`。

## 2026-08-07：完成双端徽章管理页面

- 记录 ID：`FS-PRODUCT-COMPLETION-BADGE-PAGES-001`
- 分支：`dev`
- 状态：已部署到 `8098` 开发环境，真实 Chromium 验收通过
- 功能提交：`7891729`

### 实施结果

- 家长端新增徽章管理入口，支持模板创建、编辑、启停、自定义模板受保护删除和手动颁发；写操作锁定重复提交，冲突后刷新服务端权威状态。
- 孩子成就页接入本人徽章墙，区分已获得与未获得状态，使用颁发快照展示历史，并显示自动条件实时进度和手动颁发提示。
- 双端复用统一徽章类型、条件标签、表单映射和进度计算；家长十项导航保持桌面与移动端可访问。

### 验证与部署

- Web 全量回归 16 个文件、143 项通过；Web 类型检查、修改文件零警告 ESLint、Prettier、生产构建和补丁检查通过。
- 服务器本地镜像 `dev-20260807-7891729-i42-web` 已部署；API 与 Worker 保持 i41，五个 Compose 服务全部 healthy，IP 与域名健康接口返回 `200`。
- 真实 Chromium 六项通过，覆盖模板列表、创建编辑、手动颁发、孩子已获得快照、未获得自动进度，以及 1440px 与 390px 无横向溢出。

## 2026-08-07：完成第二个产品补全批次质量检查点

- 记录 ID：`FS-PRODUCT-COMPLETION-CHECKPOINT-002`
- 分支：`dev`
- 状态：阶段 7 质量门禁通过
- 格式基线修复：`a363d9a`

### 验证结果

- 成长记录、任务、审核、奖励、兑换和愿望聚焦回归共 32 个文件、267 项通过，覆盖迁移、事件重投、事务竞态、家庭权限、历史快照、组件状态和弹窗可访问性。
- 完整单元回归 112 个文件、815 项通过；全工作区类型检查、零警告 ESLint、全局 Prettier、Prisma Schema、数据模型契约、生产构建和补丁检查通过。
- Web 类型检查与 Next.js 构建顺序执行，避免并发改写 `.next/types`；全局格式门禁同时修复 README 标题间距和一处真实 E2E 请求排版。

## 2026-08-07：完成任务、审核、奖励与愿望回归保护

- 记录 ID：`FS-PRODUCT-COMPLETION-MANAGEMENT-REGRESSION-001`
- 分支：`dev`
- 状态：已部署到 `8098` 开发环境，真实 Chromium 验收通过
- 功能与测试提交：`41de277`

### 实施结果

- 任务日期范围默认值复用家庭 IANA 时区自然日期，覆盖 UTC 日期与家庭日期不一致的边界。
- 愿望采纳通过家庭范围、活动状态和未删除条件执行原子转换；并发状态竞争返回冲突，并由同一事务回滚已创建奖励。
- 新增家庭自然日期、日期范围默认值、跨家庭愿望采纳和并发采纳回滚测试；历史保护、审核竞态、库存守恒和凭证弹窗可访问性沿用现有分层回归证据。

### 验证与部署

- 聚焦回归 10 个文件、145 项通过；完整单元回归 112 个文件、815 项通过；核心集成回归 5 个文件、23 项通过。
- 全工作区类型检查、零警告 ESLint、本任务文件 Prettier、Prisma 校验、Web/API 生产构建和补丁检查通过。
- 服务器本地镜像 `dev-20260807-41de277-i41-api`、`dev-20260807-41de277-i41-worker` 和 `dev-20260807-41de277-i41-web` 已部署；PostgreSQL、Redis、API、Worker 和 Web 全部 healthy，同源健康接口返回 `200`。
- 真实 Chromium 4 项通过，覆盖任务历史保护、审核冲突刷新、凭证弹窗焦点约束与键盘切换、奖励库存保护和写入锁定。

## 2026-08-07：完成兑换与愿望双端闭环

- 记录 ID：`FS-PRODUCT-COMPLETION-REDEMPTION-WISH-001`
- 分支：`dev`
- 状态：已部署到 `8098` 开发环境，真实 Chromium 验收通过
- 功能提交：`f4e4637`；运行态修复：`3de75de`、`2361f4b`

### 实施结果

- 家长端支持兑换批准、填写原因拒绝并原子退款、确认兑现，以及愿望采纳为正式奖励；写入成功和 `409` 冲突后均刷新服务端权威状态。
- 孩子端展示全部活动愿望的真实槽位占用，支持满额锁定、取消后释放槽位，并统一本地化四种兑换状态与提交锁定。
- 修复 Prisma 事务错误识别对运行时构造器的脆弱依赖，并修复奖励动作路由提取实例方法造成的接收者丢失。

### 验证与部署

- Web 全量回归 15 个文件、130 项通过；API 全量回归 96 个文件、640 项通过；TypeScript、ESLint、Prettier 和 Web 生产构建通过。
- Web 使用 `dev-20260807-f4e4637-i38-web`，API 与 Worker 使用 `dev-20260807-2361f4b-i40-*`；PostgreSQL、Redis、API、Worker 和 Web 全部 healthy，IP、开发域名和健康接口均返回 `200`。
- 真实 Chromium 闭环覆盖批准、兑现、拒绝退款、愿望取消、愿望采纳、槽位锁定和 `409` 权威刷新，最终兑换状态为 `FULFILLED`、`REJECTED`、`APPROVED`。

## 2026-08-06：家庭总览与徽章后端

- 记录 ID：`FS-DASHBOARD-BADGES-001`
- 分支：`dev`
- 状态：已部署到 `8098` 开发环境，真实 API 验收通过
- 依据：`../specs/2026-08-05-product-completion/requirements.md`、`../specs/2026-08-05-product-completion/design.md`

### 实施结果

- 新增家庭总览聚合 API，按家庭 IANA 时区返回逐孩今日任务进度、积分、家庭待办和最多三十条近期动态。
- 新增徽章模板、颁发和进度模型，家庭注册时初始化六个基础模板，并为既有活动家庭幂等回填。
- 家长可管理自定义模板和手动颁发，孩子徽章墙展示已获得状态及条件进度；系统预设和已有颁发记录的模板受到破坏性修改保护。
- Worker 消费积分、等级和协作事件评估自动条件，通过唯一键与事务 Outbox 保证颁发和事件重投幂等。

### 验证与部署

- dashboard、badge、权限和家庭初始化聚焦测试 73 项通过，API 单元回归 577 项通过；API 类型检查、相关 ESLint、Prisma 校验、数据模型验证和生产构建通过。
- 迁移 `20260806090000_add_badge_domain` 成功应用；`i26-api` 与 `i26-worker` 容器 healthy，`i21-web` 保持原版本，IP 与开发域名健康接口均返回 `200`。
- `8098` 真实 Chromium API 验收覆盖六个预设、自动与手动颁发、已颁发模板保护、今日总览统计、动态聚合及跨家庭隔离。

## 2026-08-03：稳定登录标题与移动端家长导航

- 记录 ID：`FS-WEB-RESPONSIVE-STABILITY-001`
- 分支与修复提交：`dev` / `9ef173c`
- 状态：已部署并通过浏览器验收

### 问题与修复

- 登录页右侧内容使用垂直居中，家长与孩子表单高度差会带动欢迎语、主标题和副标题上下移动；登录内容改为顶部对齐，使动态高度只在身份切换控件下方展开。
- 家长端底部导航每项原有 72px 最小宽度，九项在手机视口产生横向滚动；移动断点改为九等分网格，并收紧图标、文字、间距、圆角和激活背景尺寸。
- 统一家庭登录需求与技术设计已补充响应式稳定性验收标准，覆盖 320px 至 767px 导航和身份切换标题锚点。

### 验证结果

- 完整 Vitest 套件 82 个文件、529 项通过；Web TypeScript、零警告 ESLint、Prettier、设计系统检查、生产构建和 `git diff --check` 通过。
- Playwright 11 项完整回归通过；390px 与 1280px 视口切换身份前后标题 y 坐标一致，320px 与 375px 视口的九项家长导航完整可见，导航和页面滚动宽度均等于可见宽度。
- 开发环境真实浏览器验证 390px 标题 y=511.34375、1280px 标题 y=85，两种视口切换前后坐标均保持不变。

## 2026-08-03：部署界面稳定性修复版本

- 记录 ID：`FS-DEPLOY-DEV-011`
- 环境：开发环境，Docker Compose，公开端口 `8098`
- 源分支与提交：`dev` / `9ef173c`

### 发布结果

- 从提交 `9ef173c` 的独立源码归档构建并推送 `dev-20260803-9ef173c-api`、`dev-20260803-9ef173c-worker` 和 `dev-20260803-9ef173c-web`，同时更新 `dev-latest-*`。
- API、Worker 和 Web 镜像 digest 分别为 `sha256:7d87f6a3cab13364dfe993615dfb5f4a3f5c517c9c5c9d74a26db1799150478c`、`sha256:4662509dbd42bf9dcdeefc35f1a04792bfdfc3f2ccac6f496a1b906c175849f7` 和 `sha256:46f98b42de3c1d593046f5bfa23373b44a84b9e63b692c451619d6738c6734fd`。
- 部署前创建 PostgreSQL custom-format 备份 `/home/ubuntu/familystar-backups/dev/pre-9ef173c-20260803.dump`，文件大小 1641704 bytes，权限为 `600`；`pg_restore --list` 校验通过。
- 迁移容器退出码为 0，PostgreSQL、Redis、API、Worker 和 Web 均为 healthy；公网首页返回 HTTP 200，同源健康接口返回 `status: ok`。

### 回滚点

- 上一健康开发版本：`dev-20260803-a832dcc-*`。
- 数据库回滚备份：`/home/ubuntu/familystar-backups/dev/pre-9ef173c-20260803.dump`。

## 2026-08-03：纠正家长端页面顶部留白验收对象

- 记录 ID：`FS-PARENT-HEADER-SPACING-001`
- 分支与修复提交：`dev` / `a832dcc`
- 状态：已部署并通过真实页面验收

### 回归与修复

- 用户明确要求修复所有家长端页面从浏览器页面顶部到 Header 顶边的留白；此前验收错误地测量了 Header 底边到正文首个元素的距离。
- `ParentShell` 的 Header 使用 `sticky top-0`，外层没有顶部 padding，因此目标距离确实为 0px。
- `a832dcc` 为家长端公共外层增加 `pt-7 mobile:pt-5`，将目标距离设置为桌面 28px、手机 20px；家长端正文原有间距保持，误加到孩子端的主内容 padding 同时撤回。

### 验证结果

- 双端壳层组件测试 2 个文件、20 项通过；完整 Vitest 套件 82 个文件、528 项通过；Web TypeScript、零警告 ESLint、Prettier、生产构建和 `git diff --check` 通过。
- 开发环境真实家长会话覆盖九个页面、桌面与手机两种视口，共 18 次检查；页面顶部到 Header 顶边的距离分别为 28px 和 20px。
- 家长端手机总览实测 Header 顶边 y=20、Header 底边 y=85；孩子端公共壳层已恢复原有 0px 主内容 padding。

## 2026-08-03：部署家长端 Header 顶部留白修复版本

- 记录 ID：`FS-DEPLOY-DEV-010`
- 环境：开发环境，Docker Compose，公开端口 `8098`
- 源分支与提交：`dev` / `a832dcc`；Compose 修复提交：`9429059`

### 发布结果

- 从提交 `a832dcc` 的独立源码归档构建并推送 `dev-20260803-a832dcc-api`、`dev-20260803-a832dcc-worker` 和 `dev-20260803-a832dcc-web`，同时更新 `dev-latest-*`。
- API、Worker 和 Web 镜像 digest 分别为 `sha256:1b91314fc0b26d4d6f7f66b2aeab06e4b1726372a8bd6f6bc028d06ad6ca478e`、`sha256:ff9877432108975a9c94a85a3900e69a6c2a33a57d2129090ab21b61144a9207` 和 `sha256:3ac090a0e6f27a4c34448e937d992bfaedf5517b2d224eb43122cfd223e28596`。
- 部署前创建 PostgreSQL custom-format 备份 `/home/ubuntu/familystar-backups/dev/pre-a832dcc-20260803.dump`，文件大小 1596424 bytes，权限为 `600`；`pg_restore --list` 校验通过。
- 首次启动时 Corepack 访问 npm 超时；`9429059` 将迁移命令改为直接执行镜像内 Prisma CLI，消除运行时联网依赖。
- 迁移容器退出码为 0，PostgreSQL、Redis、API、Worker 和 Web 均为 healthy；公网首页返回 HTTP 200，同源健康接口返回 `status: ok`。

### 回滚点

- 上一运行版本：`dev-20260803-2b7b7be-*`，该版本误改孩子端且未修复家长 Header 顶部距离。
- 数据库回滚备份：`/home/ubuntu/familystar-backups/dev/pre-a832dcc-20260803.dump`。

## 2026-08-02：统一家长端与孩子端页面顶部间距

- 记录 ID：`FS-PARENT-SPACING-FIX-001`
- 分支：`dev`
- 状态：初次修复引入家长端顶部留白回归；`224d59f` 恢复家长端，`2b7b7be` 补齐孩子端
- 依据：Phase 1 任务 8.1、9.1、16；PRD §3.1、§3.2、§8.3

### 问题与根因

- 家长端九个页面共用的 `ParentShell` 在主内容容器上设置 `py-7 mobile:py-5`，桌面端和移动端分别形成 28px 与 20px 的额外顶部留白。
- 孩子端 `ChildShell` 的主内容容器曾仅使用 `page-shell`，双端公共页面起始位置因此产生差异。

### 实施与验证结果

- 初次修复提交 `d636aa3` 将家长端主内容容器从 `page-shell py-7 mobile:py-5` 改为纯 `page-shell`，导致九个家长页面贴近顶部边缘。
- 初次验收仅检查 `<main>` 自身和首个内容节点均为 0px，未比较双端完整视觉起始位置，因此得出了错误的一致性结论。
- 纠正提交 `224d59f` 恢复家长端原有响应式顶部页边距，后续提交 `2b7b7be` 为孩子端补齐相同类；双端回归断言均锁定该结构。
- 家长端和孩子端组件测试共 2 个文件、20 项通过；修改文件的零警告 ESLint、Prettier 和 `git diff --check` 通过。
- 根级 `pnpm dev` 启动 Next.js 与 Hono，本地 Next.js 端口 `3000` 通过平台预览代理连通性检查。
- 完整纠正提交 `2b7b7be` 已发布到开发环境并通过双端真实页面验收，部署结果见 `FS-DEPLOY-DEV-009`。

## 2026-08-02：纠正家长端顶部页边距回归

- 记录 ID：`FS-PARENT-SPACING-REGRESSION-001`
- 分支：`dev`
- 修复提交：`224d59f`
- 状态：已部署并通过真实页面验收

### 回归与修复

- `d636aa3` 删除了家长端公共 Shell 原有的 `py-7 mobile:py-5`，使九个家长页面的内容区贴近顶部边缘。
- 用户提供的真实截图显示家长端顶部留白明显小于孩子端；截图分析估算家长端约 10–16px，孩子端约 20–30px。
- `224d59f` 恢复原有响应式顶部页边距，并将组件测试从错误的纯 `page-shell` 断言改为 `page-shell py-7 mobile:py-5`。

### 验证结果

- 完整 Vitest 套件 82 个文件、528 项通过；Web TypeScript、零警告 ESLint、Prettier、生产构建和 `git diff --check` 通过。
- 开发环境真实家长会话覆盖九个页面、桌面与手机两种视口，共 18 次检查；桌面端顶部页边距为 28px，移动端为 20px。
- 真实家长端和孩子端手机截图分别留存，用于核对完整视觉起始位置。

## 2026-08-02：部署家长端顶部页边距纠正版本

- 记录 ID：`FS-DEPLOY-DEV-008`
- 环境：开发环境，Docker Compose，公开端口 `8098`
- 源分支与提交：`dev` / `224d59f`

### 发布结果

- 从提交 `224d59f` 的独立源码归档构建并推送 `dev-20260802-224d59f-api`、`dev-20260802-224d59f-worker` 和 `dev-20260802-224d59f-web`，同时更新 `dev-latest-*`。
- API、Worker 和 Web 镜像 digest 分别为 `sha256:597cf0dc794d97c0c71acade33d3f51486f6c76aa2dcf12deb1825f93f6fbabd`、`sha256:700272afcb49f12ee25e1b8c0abec01db100e8e4b38317566899201a7c08009c` 和 `sha256:69d26a5b2610e0eeaaef9aae02f28b8abe65d17f187879b24045ccb266140843`。
- 部署前创建 PostgreSQL custom-format 备份 `/home/ubuntu/familystar-backups/dev/pre-224d59f-20260802.dump`，文件大小 1264904 bytes，权限为 `600`；`pg_restore --list` 校验通过。
- 12 项 Prisma 迁移均已应用且无待处理迁移；迁移容器退出码为 0，PostgreSQL、Redis、API、Worker 和 Web 均为 healthy。
- 公网首页返回 HTTP 200，同源 `/api/v1/health` 返回 `status: ok`；运行中的 API、Worker 和 Web 均锁定到 `dev-20260802-224d59f-*`。

### 回滚点

- 安全视觉回滚版本：`dev-20260802-e8f5e28-*`；直接前序版本 `dev-20260802-d636aa3-*` 存在顶部留白回归。
- 数据库回滚备份：`/home/ubuntu/familystar-backups/dev/pre-224d59f-20260802.dump`。

## 2026-08-02：部署双端页面顶部间距修复开发版本

- 记录 ID：`FS-DEPLOY-DEV-007`
- 环境：开发环境，Docker Compose，公开端口 `8098`
- 源分支与提交：`dev` / `d636aa3`
- 后续状态：该版本造成家长端顶部留白回归，已由 `FS-DEPLOY-DEV-008` 替换

### 发布结果

- 从提交 `d636aa3` 的独立源码归档构建并推送 `dev-20260802-d636aa3-api`、`dev-20260802-d636aa3-worker` 和 `dev-20260802-d636aa3-web`，同时更新 `dev-latest-*`。
- API、Worker 和 Web 镜像 digest 分别为 `sha256:83e6425da5b0660951f83fc7718c401c6f5f8a8d4769208dea9b01883b0a1c11`、`sha256:adec48e764d4f5593b05273c88369484e7ed3e89c267b387f168c091c202e58f` 和 `sha256:458ff346007c8550752fa0d823d77c5da1a2a0d4698aed99e44427243a8e7121`。
- 部署前创建 PostgreSQL custom-format 备份 `/home/ubuntu/familystar-backups/dev/pre-d636aa3-20260802.dump`，文件大小 1209916 bytes，权限为 `600`；`pg_restore --list` 校验通过。
- 12 项 Prisma 迁移均已应用且无待处理迁移；迁移容器退出码为 0，PostgreSQL、Redis、API、Worker 和 Web 均为 healthy。
- 公网首页返回 HTTP 200，同源 `/api/v1/health` 返回 `status: ok`；运行中的 API、Worker 和 Web 均锁定到 `dev-20260802-d636aa3-*`。

### 初次页面验收与遗漏

- 通过公开同源 API 创建随机隔离家庭、家长和孩子账号，并分别建立真实家长与孩子会话。
- 九个家长页面在 1440 × 900 和 390 × 844 两种视口检查为纯 `page-shell` 和 0px 顶部内边距。
- 该验收标准遗漏孩子端头部内部留白和完整视觉起始位置，0px 结果实际对应家长端贴边回归。

### 回滚点

- 上一健康开发版本：`dev-20260802-e8f5e28-*`。
- 数据库回滚备份：`/home/ubuntu/familystar-backups/dev/pre-d636aa3-20260802.dump`。

## 2026-08-02：修复任务编辑与孩子分配任务可见性

- 记录 ID：`FS-TASK-VISIBILITY-FIX-001`
- 分支：`dev`
- 状态：已提交、通过完整质量门禁并完成开发环境真实数据验收
- 依据：Phase 1 任务 4.2、4.3、8.2、9.2 与新增任务 15；`../specs/decisions.md` §4、§5、§9、§10；PRD §3.1、§3.2、§4.1、§4.5

### 问题与根因

- 家长任务列表的编辑按钮缺少点击事件、编辑状态和 PATCH 请求，后端既有更新能力未被 Web 使用。
- 孩子门户的今日任务区域仍为受限占位，后端缺少按孩子会话限定的任务读取端点；现有 `/family/tasks` 保持家长专用。

### 范围与验收计划

- 接通家长任务编辑表单，回填当前任务字段并通过 `PATCH /api/v1/family/tasks/:taskId` 持久化；成功后使用服务端响应更新列表，失败时保留表单和已有数据。
- 新增孩子本人任务读取端点，家庭和孩子标识完全取自认证会话，查询限定活动任务、有效分配、分配日期范围和当日频率，并返回逐孩覆盖后的积分、频率、打卡方式和验收方式。
- 孩子主页和今日打卡页显示服务端真实任务，分别处理加载、空数组和请求失败状态。
- 补充纯请求构造、TaskService、Prisma 查询、HTTP 契约、RBAC 与 Playwright 回归测试；通过 TypeScript、ESLint、Prettier、单元测试、集成测试、浏览器测试和生产构建。
- 部署到开发环境 `8098` 后，使用真实家庭验证家长修改任务可持久化，且被分配孩子重新登录后可见该任务。

### 实施结果

- 家长任务列表接通编辑弹窗、字段回填和 PATCH 写入；成功后以服务端任务替换列表记录，失败时保留弹窗输入。归档任务保持只读，普通字段编辑保持既有多孩分配不变。
- PATCH 可将空任务说明和提交说明持久化为 `null`，支持显式清空可选文本。
- 新增孩子专用 `GET /api/v1/tasks/me?date=YYYY-MM-DD`；服务使用会话中的家庭与孩子身份限定 Prisma 查询，并按任务状态、分配日期和生效频率过滤，返回逐孩覆盖后的积分、频率、打卡方式和验收方式。
- 孩子主页与今日打卡页接入同一真实任务资源，分别呈现加载、空数据、错误与任务列表状态。

### 验证结果

- 任务、RBAC、Web helper 和双端组件定向测试共 11 个文件、66 项通过；核心 HTTP 闭环集成测试 1 项通过。
- 完整质量门禁通过：82 个测试文件、528 项测试通过，Statements、Branches、Functions 与 Lines 覆盖率门禁通过。
- Playwright 9 项通过，覆盖家长编辑后刷新持久化与孩子主页、今日打卡页任务可见性。
- Prisma Schema 与迁移契约、TypeScript、零警告 ESLint、Prettier、生产构建、设计系统、API 基础检查和 `git diff --check` 通过。
- 实现提交 `e8f5e28` 已发布到开发环境并通过真实双端验收，部署结果见 `FS-DEPLOY-DEV-006`。

## 2026-08-02：部署任务编辑与孩子任务可见性开发版本

- 记录 ID：`FS-DEPLOY-DEV-006`
- 环境：开发环境，Docker Compose，公开端口 `8098`
- 源分支与提交：`dev` / `e8f5e28`

### 发布结果

- 从提交 `e8f5e28` 的独立源码归档构建并推送 `dev-20260802-e8f5e28-api`、`dev-20260802-e8f5e28-worker` 和 `dev-20260802-e8f5e28-web`，同时更新 `dev-latest-*`。
- API、Worker 和 Web 镜像 digest 分别为 `sha256:086ff52f4f7138056cef894c51aa257def87acebe7e3029eb8c6108fce43d940`、`sha256:5f051428b134d8cf980dd7c30dd348d828c21862c2a2ca2510013b55cce044bb` 和 `sha256:f3f65dc1f65f26f48be511c549f352845270af9322c54816af9bf32abfb827c1`。
- 部署前创建 PostgreSQL custom-format 备份 `/home/ubuntu/familystar-backups/dev/pre-e8f5e28-20260802.dump`，文件大小 1178678 bytes，权限为 `600`；`pg_restore --list` 校验通过。
- 12 项 Prisma 迁移均已应用且无待处理迁移；迁移容器退出码为 0，PostgreSQL、Redis、API、Worker 和 Web 均为 healthy。
- 公网首页返回 HTTP 200，同源 `/api/v1/health` 返回 `status: ok`；运行中的 API、Worker 和 Web 均锁定到 `dev-20260802-e8f5e28-*`。

### 部署诊断

- 首次 Compose 切换未显式加载 `/home/ubuntu/familystar-deploy/dev/.env.dev`，迁移容器因数据库认证失败退出。
- 使用 `--env-file /home/ubuntu/familystar-deploy/dev/.env.dev` 重新执行后，命名 volume 中的数据保持完整，迁移和全部服务恢复健康。

### 真实数据验收

- 通过公开同源 API 创建随机隔离家庭、孩子和单人每日任务，并将任务真实分配给该孩子。
- 家长在 `/tasks` 页面编辑任务名称、清空说明、切换为文字打卡并将基础积分改为 23；保存后刷新页面仍显示服务端持久化结果。
- 家长任务 API 确认原 assignment ID、孩子归属和未编辑的提交说明保持不变，空任务说明持久化为 `null`。
- 孩子通过家庭码和 PIN 建立全新会话后，`GET /api/v1/tasks/me` 返回逐孩生效的任务数据，且不包含家庭 ID 或孩子 ID。
- 390 × 844 移动端 Chromium 验证 `/child` 与 `/child/check-ins` 均显示更新后的任务、23 星和文字打卡方式。

### 回滚点

- 上一健康开发版本：`dev-20260802-b16c6fd-*`。
- 数据库回滚备份：`/home/ubuntu/familystar-backups/dev/pre-e8f5e28-20260802.dump`。

## 2026-08-02：补齐家长审核队列与刷新持久化闭环

- 记录 ID：`FS-REVIEW-QUEUE-FIX-001`
- 分支：`dev`
- 状态：已提交并通过开发环境真实数据验收
- 依据：Phase 1 任务 6.1、6.3、8.2、12.2 与新增任务 14；`../specs/decisions.md` §2、§4、§9、§10；PRD §4.1.5、§4.2、§4.5

### 实施结果

- 新增 `GET /api/v1/family/submission-reviews/pending`，聚合单人打卡与协作提交的最新 `PENDING` 状态，并提供任务、孩子、latest attempt 内容、媒体摘要和提交时间；查询限定认证家庭和未删除实体，合并结果稳定排序并限制为 100 条。
- 家长审核页接入真实队列；通过和打回分别调用现有审核写入，打回要求非空原因，幂等键绑定 attempt 与决定。写入成功后重新读取服务端权威队列，写入或刷新失败时保留当前记录并显示错误。
- Playwright 增加测试专用服务端会话服务，使 Next.js 门户守卫经过真实 Cookie 角色校验；业务 API 使用显式契约夹具，孩子打卡聚合继续验证为受限状态。

### 验证结果

- 审核领域与 Web 定向测试通过；完整单元测试 77 个文件、496 项通过；核心 HTTP 闭环集成测试 1 项通过。
- Playwright 8 项通过，覆盖家长与孩子页面、服务端角色守卫、审核权威重拉、重新挂载、稳定幂等键、失败保留及现有核心浏览器状态。
- 全工作区 TypeScript、零警告 ESLint、Prettier、生产构建和 `git diff --check` 通过。
- 审核 Prisma 测试继续覆盖批准后单人积分 writer 与协作周期统一发分调用；积分 writer 测试覆盖 `PointsLog`、余额、累计积分、等级同步和 Outbox 同事务写入。实现提交 `b16c6fd` 已通过开发环境真实数据闭环，部署结果见 `FS-DEPLOY-DEV-005`。

## 2026-08-02：部署家长审核队列开发版本

- 记录 ID：`FS-DEPLOY-DEV-005`
- 环境：开发环境，Docker Compose，公开端口 `8098`
- 源分支与提交：`dev` / `b16c6fd`
- Wiki 提交：`7a456e9`

### 发布结果

- 从提交 `b16c6fd` 的独立源码归档构建并推送 `dev-20260802-b16c6fd-api`、`dev-20260802-b16c6fd-worker` 和 `dev-20260802-b16c6fd-web`，同时更新 `dev-latest-*`。
- API、Worker 和 Web 镜像 digest 分别为 `sha256:1206c42758f9d645943fa8480800853ec2b699ad36ee00728eb155b96aa01dd9`、`sha256:fe6e2e979e1e6c8aa891f656959f6d1202e878384a337a02ffa8cecbe1c7d0ce` 和 `sha256:4c7d8364ba69e7835f9a7d4d7db50a83b53171ef8a4349c34a0312f643426f91`。
- 部署前创建 PostgreSQL custom-format 备份 `/home/ubuntu/familystar-backups/dev/pre-b16c6fd-20260802.dump`，文件大小 904729 bytes，权限为 `600`；`pg_restore --list` 校验通过。
- Prisma 迁移容器成功退出；PostgreSQL、Redis、API、Worker 和 Web 均为 healthy。运行中的 API、Worker 和 Web 均锁定到 `dev-20260802-b16c6fd-*`。
- 公网首页返回 HTTP 200，同源 `/api/v1/health` 返回版本 `0.1.0` 和 `status: ok`。

### 真实数据验收

- 通过公开同源 API 创建新隔离家庭、孩子、单人每日人工审核任务和真实文字打卡；家长待审队列在提交后包含 1 条记录。
- 家长批准后服务端权威队列变为空；重复使用绑定 attempt 与决定的幂等键批准，积分和等级保持不变；重新登录家长账号后队列仍为空。
- 数据库确认打卡状态为 `APPROVED`、发放 30 积分且 streak 倍率为 1；孩子 `points_balance` 与 `points_earned_total` 均为 30，`current_level` 为 2。
- 对应 attempt 仅有 1 条家长审核历史，对应打卡仅有 1 条积分流水；`points.balance.changed.v1` 和 `levels.level.advanced.v1` Outbox 各 1 条且均已发布。

### 回滚点

- 上一健康开发版本：`dev-20260802-a7fd9b1-*`。
- 数据库回滚备份：`/home/ubuntu/familystar-backups/dev/pre-b16c6fd-20260802.dump`。

## 2026-08-02：部署门户会话与真实数据修复开发版本

- 记录 ID：`FS-DEPLOY-DEV-004`
- 环境：开发环境，Docker Compose，公开端口 `8098`
- 源分支与提交：`dev` / `a7fd9b1`
- 实现提交：`a7fd9b1`

### 发布结果

- 从提交 `a7fd9b1` 的独立源码归档构建并推送 `dev-20260802-a7fd9b1-api`、`dev-20260802-a7fd9b1-worker` 和 `dev-20260802-a7fd9b1-web`，`dev-latest-*` 已更新到相同镜像。
- 部署前创建 PostgreSQL custom-format 备份 `/home/ubuntu/familystar-backups/dev/pre-a7fd9b1-20260802.dump`，文件大小 738445 bytes，权限为 `600`；`pg_restore --list` 校验通过。
- Prisma 迁移容器使用新 API 镜像成功退出，退出码为 0；PostgreSQL、Redis、API、Worker 和 Web 均为 healthy。
- API、Worker 和 Web 运行镜像均锁定到 `dev-20260802-a7fd9b1-*`；公网首页返回 HTTP 200，同源 `/api/v1/health` 返回版本 `0.1.0` 和 `status: ok`。

### 真实数据验收

- 通过公开同源 API 创建新的隔离验收家庭和孩子，家长注册返回 201，有效会话读取返回 200，孩子创建返回 201。
- 使用省略可选 `description` 的真实请求创建单人每日任务，接口返回 201，随后任务列表包含该服务端记录。
- 当前家长会话退出返回 200 并清除 Cookie；复用旧 Cookie 读取会话返回 401，确认 Redis 单令牌撤销生效。
- 验收创建的家庭、孩子和任务保留在开发数据库中，便于后续审核、积分、等级与奖励闭环回归。

### 回滚点

- 上一健康开发版本：`dev-20260801-64df198-*`。
- 数据库回滚备份：`/home/ubuntu/familystar-backups/dev/pre-a7fd9b1-20260802.dump`。

## 2026-08-01：修复家长端创建任务默认请求 400

- 记录 ID：`FS-TASK-CREATE-FIX-001`
- 分支：`dev`
- 依据：Phase 1 任务 4、任务 13；用户真实运行反馈

### 调试证据与根因

- 家长任务表单将“任务说明”定义为可选输入，留空时 `FormData` 返回空字符串。
- 前端原请求固定携带 `description: ""`；API Schema 接受缺省 `description` 或去除首尾空白后至少一个字符的值，因此请求在进入任务服务前返回 `400 INVALID_REQUEST`。
- API 路由成功测试省略该字段，原家长组件测试仅验证静态页面结构，未覆盖表单生成的真实请求体。

### 修复与验证结果

- 新增 `buildSoloTaskDraft()` 集中生成单人每日任务请求；空白说明从请求省略，有效说明去除首尾空白后保留。
- 新增两项请求体回归测试，覆盖空白说明和有效说明；任务链路定向测试 4 个文件、28 项通过。
- 完整单元测试 77 个文件、490 项通过；全工作区 TypeScript、零警告 ESLint、Prettier 和生产构建通过。
- 本次修复已通过提交 `a7fd9b1` 发布到开发环境 `8098`，运行结果见 `FS-DEPLOY-DEV-004`。

## 2026-08-01：移除认证门户演示数据与伪成功回退

- 记录 ID：`FS-WEB-DATA-FIX-001`
- 分支：`dev`
- 依据：用户真实运行反馈；统一家庭登录任务 6

### 范围与实施结果

- 家长和孩子门户资源统一使用加载、实时、空数据和错误四种状态；空数组保持有效空状态，缺少必需字段的响应进入错误状态。
- 移除门户中的预置人物、任务、积分、等级、奖励、兑换、愿望和排行数据，以及 Shell 中的预置家庭和账号身份。
- 写请求以服务端响应作为成功依据；失败时保留已加载的真实数据并显示错误，不生成浏览器临时业务记录。
- 缺少聚合读取接口的总览、审核、统计、流水、排行、徽章和记录区域显示明确受限空态；任务读取接口接入后再开放孩子打卡入口。
- 孩子身份通过等级接口的当前用户 ID 与真实账号切换目标关联，等级加载完成前显示门户加载边界。

### 验证结果

- 全部 Web 测试 8 个文件、48 项通过；完整单元测试 77 个文件、488 项通过。
- 全工作区 TypeScript、零警告 ESLint、Prettier、补丁空白检查和生产构建通过。
- 源码搜索确认认证门户无预置人物与 demo 业务常量；登录表单保留“家庭名称”占位示例，仅用于输入提示。

## 2026-08-01：修复双端退出与服务端会话边界

- 记录 ID：`FS-AUTH-FIX-001`
- 分支：`dev`
- 依据：统一家庭登录需求 5、6；用户真实运行反馈

### 范围与验收

- 为当前会话提供显式退出 API，撤销 Redis 会话令牌并清除 HttpOnly Cookie。
- 家长端和孩子端提供可访问的退出入口，成功后清理浏览器身份缓存并返回统一登录页。
- 家长与孩子门户在服务端读取有效会话并校验角色；Cookie 缺失、会话失效和角色不符时执行安全跳转。
- 运行认证、门户、类型、Lint 和构建定向验证，并在完成后记录结果。

### 实施与验证结果

- 新增 `POST /api/v1/auth/logout`，安全中间件要求任意有效家庭会话并执行同源写请求保护；成功删除当前 Redis 令牌并将 Cookie 立即过期。
- 家长与孩子动态路由在 Next.js 服务端调用内部会话接口，业务页面仅在角色匹配时渲染；失效会话返回统一入口，其他有效角色进入对应门户。
- 双端顶栏新增可访问退出按钮，成功后清理三个浏览器身份提示；失败时保留当前页面并显示错误状态。
- 定向认证与门户测试 6 个文件、41 项通过；完整单元测试 76 个文件、484 项通过。
- 全部工作区 TypeScript、定向零警告 ESLint、Prettier 和生产构建通过；门户路由构建结果为动态服务端渲染。

## 2026-08-01：部署 6 位数字家庭码开发版本

- 记录 ID：`FS-DEPLOY-DEV-003`
- 环境：开发环境，Docker Compose，公开端口 `8098`
- 源分支与提交：`dev` / `64df198`
- 实现提交：`38481cf`

### 发布结果

- 构建并推送 `dev-20260801-64df198-api`、`dev-20260801-64df198-worker` 和 `dev-20260801-64df198-web`，`dev-latest-*` 已指向当前版本。
- 部署前创建 PostgreSQL custom-format 备份 `/home/ubuntu/familystar-data/backups/dev/postgres/familystar-dev-pre-64df198.dump`，文件大小 285534 bytes，权限为 `600`。
- Prisma 成功应用 `20260801130000_migrate_family_codes_to_six_digits`，迁移总数为 12；迁移前 3 个家庭码均为 10 位，迁移后全部为唯一 6 位数字。
- PostgreSQL、Redis、API、Worker 和 Web 均为 healthy，迁移容器退出码为 0；公开同源健康接口返回版本 `0.1.0` 和 `status: ok`。

### 验证结果

- 完整 `pnpm quality` 通过：80 个测试文件、502 项测试，以及格式、零警告 Lint、类型、Prisma、数据模型、覆盖率、构建、设计系统、API 契约和 7 项 Playwright 检查。
- Chromium 真实链路通过家长注册、6 位数字家庭码展示、HTTP 页面复制反馈和孩子档案创建。
- 独立孩子会话通过 6 位家庭码查询、头像选择和 PIN 登录进入 `/child`；家长注册进入 `/dashboard`，孩子链路在 390 × 844 移动端视口通过。
- 验收创建的家庭和孩子保留在开发数据库中，便于后续回归追踪。

### 回滚点

- 上一健康开发版本：`dev-20260801-d1c0bff-*`。
- 数据库回滚备份：`familystar-dev-pre-64df198.dump`。

## 2026-08-01：部署统一家庭登录开发版本

- 记录 ID：`FS-DEPLOY-DEV-002`
- 环境：开发环境，Docker Compose，公开端口 `8098`
- 源分支与提交：`dev` / `d1c0bff`

### 发布结果

- 构建并推送 `dev-20260801-d1c0bff-api`、`dev-20260801-d1c0bff-worker` 和 `dev-20260801-d1c0bff-web`，`dev-latest-*` 已指向当前版本。
- 部署前创建 PostgreSQL custom-format 备份 `/home/ubuntu/familystar-data/backups/dev/postgres/familystar-dev-pre-a125d34.dump`，文件大小 225780 bytes，权限为 `600`。
- Prisma 成功应用 `20260801000000_add_family_codes`，迁移总数为 11；所有家庭均已生成家庭码，数据库唯一约束验证通过。
- PostgreSQL、Redis、API、Worker 和 Web 均为 healthy，迁移容器退出码为 0，当前无待应用迁移。

### 运行态验收

- 公网 `http://119.29.111.248:8098` 可访问，同源 `/api/v1/health` 返回 HTTP 200、版本 `0.1.0` 和 `status: ok`。
- Chromium 真实链路通过家长注册、自动进入家长端、家庭成员页读取 10 位家庭码、HTTP 页面复制成功反馈和孩子档案创建。
- 独立孩子会话通过家庭码查询、头像选择和 PIN 登录进入孩子端；家长与孩子已有会话访问根路径时均按角色自动跳转。
- 孩子链路在 390 × 844 移动端视口通过。验收创建的测试家庭保留在开发数据库中，便于后续回归追踪。
- 完整 `pnpm quality` 通过：80 个测试文件、502 项测试，以及格式、零警告 Lint、类型、Prisma、数据模型、覆盖率、构建、设计系统、API 契约和 7 项 Playwright 检查。

### 回滚点

- 上一统一登录版本：`dev-20260801-a125d34-*`。
- Phase 1 原开发基线：`dev-20260801-80bd819-*`。

## 2026-08-01：完成统一家庭登录 Web 任务 2

- 记录 ID：`FS-UNIFIED-LOGIN-2`
- 分支：`dev`
- 依据：`../specs/2026-08-01-unified-family-login/requirements.md` 需求 1、2、4.5、5；`design.md` Web 组件与测试策略

### 实施结果

- 将根路径视觉基础页替换为统一家庭登录入口，提供家长登录、创建家庭和孩子两步登录流程。
- 孩子流程支持 10 位家庭码规范化、家庭公开档案选择、4 至 6 位 PIN 提交和空孩子档案引导。
- 页面启动时读取有效服务端会话并按角色跳转；会话网络异常保留登录能力并显示状态消息。
- 补充 Tab 与 Tabpanel 关联、表单标签、状态消息、可见焦点和移动端布局，登录成功使用历史替换进入角色门户。
- 新增同源认证请求、统一响应信封、锁定限流倒计时和中文错误映射测试。
- 家庭成员页从受保护会话读取当前家庭码，提供孩子登录用途说明、复制操作以及独立的加载和失败状态。

### 验证结果

- 统一登录定向测试：2 个文件、13 项通过。
- 全部 Web 测试：6 个文件、39 项通过。
- Web TypeScript、定向零警告 ESLint、Prettier、生产构建和设计系统验证通过。
- 全量 `pnpm quality` 通过：80 个测试文件、500 项测试，Statements/Lines 80.69%、Branches 78.18%、Functions 90.06%。
- 全仓格式、Lint、类型、Prisma Schema 与数据模型契约、生产构建、设计系统、API 基础契约和 7 项 Playwright 场景全部通过。

### 后续工作

- 统一登录开发镜像和桌面、移动端运行态验收已由 `FS-DEPLOY-DEV-002` 完成。

## 2026-08-01：首次部署 Phase 1 开发容器

- 记录 ID：`FS-DEPLOY-DEV-001`
- 环境：开发环境，Docker Compose，公开端口 `8098`
- 源分支与提交：`dev` / `80bd819`

### 发布结果

- 将 Phase 1 基线提交并推送到远端 `dev`，使用腾讯云单仓库和组件标签发布 Web、API 与 Worker 镜像。
- 首次镜像 `dev-20260801-c7bdd4e-*` 完成构建和推送；运行验证发现 Next.js rewrite 在构建阶段回退到 `localhost:3001`。
- 提交 `80bd819` 在 Docker 构建阶段固定内部 API 地址 `http://api:3001`，发布修复镜像 `dev-20260801-80bd819-*`。
- PostgreSQL 16、Redis 7、迁移、API、Worker 和 Web 按健康依赖顺序启动；10 个 Prisma 迁移成功，开发种子执行成功。
- `dev-latest-api`、`dev-latest-worker` 和 `dev-latest-web` 已指向当前健康镜像，上一版 `c7bdd4e` 保留为回滚点。

### 镜像摘要

- API：`sha256:c8f0d3c43ba693f04b93136adaec71a4f6ee899de664df687ab763febbd1a18e`
- Worker：`sha256:d101a1861fed0142ce981a173e2f3b9f559df1c5e5feae65af191fd47e791adf`
- Web：`sha256:37462c56b432fd0153eb238f880c58ec06b5a5cacc4457da88af78d74ee5dadc`

### 验证与备份

- 五个常驻容器均为 healthy，迁移容器成功退出，Worker 健康端点返回 `status: ok`。
- 服务器本地与公网 `8098` 首页返回 HTTP 200，同源 `/api/v1/health` 返回 HTTP 200 和 `status: ok`。
- 首个 PostgreSQL custom-format 备份保存到 `/home/ubuntu/familystar-data/backups/dev/postgres/familystar-dev-20260801-80bd819.dump`，文件权限为 `600`，保留策略为 60 天。
- 正式域名 `home.wenwuge.vip` 当前尚无 DNS 解析结果，生产部署等待域名解析和开发环境验收。

## 2026-08-01：完成阶段 12 核心闭环与自动化质量门禁

- 记录 ID：`FS-DEV-012`
- 阶段：Phase 1，阶段 12（任务 12.1-12.6）
- 依据：`../specs/decisions.md` §1-§10；PRD §4、§7.1、§8

### 实施结果

- 新增确定性、事务化、可重复执行的非生产开发种子，覆盖两个家庭、双家长、多孩子、五类任务、单人和协作任务、20 级配置、奖励库存与愿望。
- 新增真实 Hono 应用组合的核心 HTTP 闭环，串联注册建家、孩子会话、任务、媒体上传、单人和协作打卡、审核、Streak、发分、升级、兑换兑现及拒绝退款。
- 新增并发与失败回滚聚合套件，覆盖重复打卡、重复调度、Outbox 重投、余额冲突、重复兑换和退款、最后库存竞争及跨家庭访问。
- 新增 7 项 Playwright 场景，覆盖家长端 9 页、孩子端 6 页、双角色门禁、核心表单、PIN 锁定、COS multipart、审核、等级、库存兑换和退款状态。
- 根级质量脚本分离单元、集成、浏览器 E2E 与 Prisma 契约验证，并由 `pnpm quality` 串联完整门禁。

### 验证结果

- 单元测试：73 个测试文件、452 项测试通过。
- 集成与聚合测试：5 个测试文件、23 项测试通过。
- 完整覆盖率：78 个测试文件、475 项测试通过；statements/lines 80.59%、branches 78.11%、functions 90.19%。
- Playwright：7 项测试通过，完整 `pnpm quality` 按 CI 顺序一次通过。
- Prisma Schema、迁移历史、类型检查、零警告 Lint、Prettier、生产构建、设计系统和 API 基础契约全部通过。

### 已知边界

开发服务器已完成真实 Docker 镜像、PostgreSQL 16、Redis 7、Prisma 迁移、开发种子和服务健康验证。SMTP 与 COS 继续由家长端后台配置；高竞争并发和外部服务连接仍需后续运行态验收。

### 预览状态

- 受管后台终端 `term_1785561217724_21` 同时运行 Next.js Web 与 Hono API。
- 本地 `/`、`/dashboard` 和 `/child` 均返回 HTTP 200，同源 `/api/v1/health` 返回 HTTP 200 和 `status: ok`。
- 公网首页、孩子端和同源健康接口均返回 HTTP 200，预览连接探针未返回 `mcai-preview-error`。
- 最终预览地址为 `https://3000-a9c18acafb19a352.monkeycode-ai.online`。
- Next.js 14 开发模式继续提示 `experimental.allowedHosts` 未识别，页面编译和平台域名访问正常。

## 2026-07-31：完成阶段 11 Worker 与 Docker 双环境

- 记录 ID：`FS-DEV-011`
- 阶段：Phase 1，阶段 11（任务 11.1-11.5）
- 依据：`../specs/decisions.md` §2、§4、§6、§7、§9、§10、§12；PRD §4.1.3、§4.1.5、§6.1-§6.4、§7.1、§8.2-§8.4

### 实施结果

- 新增独立 Worker 入口和健康服务器，注册任务周期生成、审核超时、Outbox 分发、媒体清理和积分对账五类作业。
- 统一实现 Redis owner lock、确定性运行键、`WorkerJobRun` 数据库防重、三次指数退避、脱敏失败记录和陈旧运行安全重入。
- 扩展 COS 中止 multipart 与对象删除能力；过期媒体清理保持幂等，积分对账仅报告流水差异。
- 新增 Web、API 和 Worker 多阶段 Docker targets，使用锁文件、BuildKit pnpm 缓存、非 root 用户和独立健康检查。
- 新增开发与生产 Compose，组合 PostgreSQL 16、Redis、迁移、API、Worker 和 Web；仅 Web 分别公开 8098 与 8099，生产要求显式仓库和不可变镜像标签。

### 验证结果

- 全仓测试：75 个测试文件、462 个测试通过。
- 覆盖率门禁通过，statements/lines 79.09%、branches 77.36%、functions 89.53%，Worker statements/lines 91.5%。
- 全仓 typecheck、零警告 Lint、Prettier、生产构建、Prisma validate、Prisma Client 生成、数据模型契约、设计系统和 API 基础契约通过。
- 容器静态契约覆盖多阶段目标、锁文件安装、非 root 用户、健康检查、唯一公开端口、内部网络、迁移启动顺序和生产镜像变量。

### 已知边界

当前 Agent 环境缺少 Docker CLI，无法执行真实镜像构建和 `docker compose config`。本地 PostgreSQL 16 未运行，`prisma migrate deploy` 连接 `localhost:5432` 返回 `P1001`。Prisma Schema、迁移 SQL、构建产物和容器契约均已静态验证，真实容器和迁移运行态纳入具备 Docker 的 CI 或部署节点验证。

### 阶段 11 预览验证

- 重启受管终端 `term_1785504399181_18`，同时运行 Next.js Web 与 Hono API。
- 本地 `/`、`/dashboard` 和 `/child` 均返回 HTTP 200，同源 `/api/v1/health` 返回 HTTP 200 和 `status: ok`。
- 未认证家庭设置请求返回 HTTP 401，恶意 Origin 的家庭任务写请求返回 HTTP 403。
- 公网首页、孩子端和同源健康接口均返回 HTTP 200，预览连接探针未返回 `mcai-preview-error`。
- Next.js 14 开发模式继续提示 `experimental.allowedHosts` 未识别，页面编译和平台域名访问正常。

### 后续工作

阶段 12 完成开发种子、核心业务闭环、浏览器 E2E、并发失败回滚场景和自动化质量脚本。

## 2026-07-31：完成阶段 10 家庭边界、权限与审计强化

- 记录 ID：`FS-DEV-010`
- 阶段：Phase 1，阶段 10（任务 10.1-10.6）
- 依据：`../specs/decisions.md` §5、§6、§9、§10、§12、§13；PRD §2.3、§2.4、§6.7、§8.2、§8.4

### 实施结果

- 建立集中 Hono 安全中间件，从服务端会话注入家庭、主体和角色上下文，并按端点执行 Parent、Child 和已认证成员权限矩阵。
- 对 Header、Query 和 JSON 中的客户端家庭 ID 执行一致性检查；补强邀请目标家庭、任务类型更新、协作周期、积分接收者、愿望孩子和凭证读取的活动家庭、角色和软删除条件。
- 为已认证关键写请求记录操作者、家庭、动作、实体、业务键、请求 ID、UTC 时间和成功或失败结果；审计 metadata 使用固定允许列表。
- 增加精确来源写请求保护、Fetch Metadata 跨站拦截和严格 Zod 输入；保留按环境切换的 HttpOnly、SameSite 与 Secure Cookie。
- 接入家庭邮件和 COS 配置读取、创建者维护、删除及验证端口；共同管理者仅可读取脱敏状态，公开响应不返回凭证明文、密文或加密元数据。

### 验证结果

- 全仓测试：70 个测试文件、434 个测试通过。
- 覆盖率：statements/lines 78.49%、branches 76.89%、functions 89.57%。
- 全仓 typecheck、零警告 Lint、Prettier、生产构建、Prisma validate、Prisma Client 生成、数据模型契约、设计系统和 API 基础契约通过。
- 安全回归覆盖无会话、角色越权、伪造家庭 ID、跨站写入、审计脱敏、软删除隔离、跨家庭任务类型和双家长凭证权限。

### 已知边界

当前运行组合未注入邮件或 COS 外部连接 `IntegrationVerifier`，连接测试端点返回安全的 `503`。真实 PostgreSQL、Redis 和外部集成运行态由阶段 11 Docker 环境组合验证。

### 后续工作

阶段 11 配置后台 Worker、分布式锁、可重复 Docker 构建与开发/生产 Compose 环境。

### 阶段 10 预览验证

- 受管后台终端：`term_1785498390502_17`，同时运行 Next.js Web 与 Hono API。
- 本地 `/`、`/dashboard` 和 `/child` 均返回 HTTP 200，同源 `/api/v1/health` 返回 HTTP 200 和 `status: ok`。
- 未认证 `GET /api/v1/family/settings` 返回 HTTP 401；恶意 Origin 的 `POST /api/v1/family/tasks` 返回 HTTP 403。
- 公网预览 `/` 和 `/child` 返回 HTTP 200，公网同源健康检查正常，平台连接探针未返回 `mcai-preview-error`。
- Next.js 14 开发启动继续报告 `experimental.allowedHosts` 未识别警告，服务启动、页面编译和平台域名访问正常。

## 2026-07-31：完成阶段 9 孩子端六页面

- 记录 ID：`FS-DEV-009`
- 阶段：Phase 1，阶段 9（任务 9.1-9.6）
- 依据：`../specs/decisions.md` §1、§2、§4-§6、§9；PRD §3.2、§4、§7.1、§8.3

### 实施结果

- 建立孩子端六路由、身份提示、账号切换、五项固定底部导航、年龄友好控件和 FamilyStar 动画反馈。
- 完成主页、今日打卡、成就、奖励商店、我的记录与我的信息页面，展示个人与协作任务、等级权益、奖励资格、折扣、兑换、愿望和成长时间线。
- 实时读取等级、奖励、兑换、愿望与切换目标；缺少读取接口的任务聚合、积分流水、排行、徽章和成长记录显示明确演示或受限状态。
- 打卡和兑换写入使用客户端幂等键，兑换和愿望结果按当前孩子过滤；可访问反馈覆盖加载、空数据、并发冲突、认证倒计时、上传限制和业务拒绝。
- 新增孩子本人密码修改 API，校验当前密码与新密码规则，更新后撤销全部孩子会话并清除当前 Cookie。

### 验证结果

- 全仓测试：65 个测试文件、420 个测试通过。
- 覆盖率：statements/lines 79.51%、branches 78.76%、functions 90.9%。
- 全仓 typecheck、零警告 Lint、Prettier、生产构建、Prisma validate、Prisma Client 生成、数据模型契约、设计系统和差异空白检查通过。
- Next.js 构建确认 `/child` 静态入口和 `/child/[section]` 动态白名单入口生成成功。

### 已知边界

今日任务、本人摘要、积分流水、家庭排行、徽章与成长记录聚合读取接口由后续核心闭环任务接入。媒体表单当前执行客户端数量与大小校验，真实 COS 上传依赖家庭配置和任务聚合数据。

### 后续工作

阶段 10 强化家庭边界、角色权限与关键操作审计；阶段 12 补充浏览器 E2E 和真实聚合接口闭环。

### 阶段 9 预览验证

- 受管后台终端：`term_1785490362853_16`，同时运行 Next.js Web 与 Hono API。
- `/child`、`/child/check-ins`、`/child/achievements`、`/child/rewards`、`/child/records` 和 `/child/profile` 均返回 HTTP 200。
- Web 同源 `/api/v1/health` 返回 HTTP 200 和 `status: ok`。
- 公网预览 `/child` 返回 HTTP 200，平台预览连接探针未返回 `mcai-preview-error`。
- 首次验证时，运行中的 `next dev` 因此前生产构建替换共享 `.next` 产物而缺失 SWC vendor chunk；通过受管终端重启开发服务后恢复。

## 2026-07-31：完成阶段 8 家长端九页面

- 记录 ID：`FS-DEV-008`
- 阶段：Phase 1，阶段 8（任务 8.1-8.6）
- 依据：`../specs/decisions.md` §1-§9、§13；PRD §3.1、§4、§7.1、§8.3

### 实施结果

- 建立家长端公共顶栏、身份守卫、固定底部九 Tab 导航和 768px 响应式布局。
- 完成家庭总览、任务、审核、奖励、等级、数据、记录、成员和设置九个独立路由。
- 任务、奖励、兑换、孩子与家庭规则采用 API-first 数据和写入交互；未登录环境提供明确的演示数据状态。
- 缺少聚合接口的总览、审核、统计和成长记录使用显式演示或受限状态；通知、PWA、动态加载与集成配置入口显示“即将推出”。
- 新增九路由组件渲染、共享导航、权限判断、核心表单状态和频率格式测试。

### 验证结果

- 全仓测试：63 个测试文件、406 个测试通过。
- 覆盖率：statements/lines 79.52%、branches 78.82%、functions 90.87%。
- 全仓 typecheck、零警告 Lint、Prettier、Next.js 生产构建、Prisma validate、数据模型契约和设计系统验证通过。
- Prisma validate 使用非敏感占位 `DATABASE_URL` 进行静态 Schema 校验。

### 后续工作

阶段 9 实现孩子端六个响应式页面；阶段 12 补充浏览器 E2E 和真实聚合接口闭环。

### 阶段 8 预览验证

- 受管后台终端：`term_1785487570613_15`，同时运行 Next.js Web 与 Hono API。
- `/dashboard`、`/tasks`、`/reviews`、`/rewards`、`/levels`、`/stats`、`/records`、`/family` 和 `/settings` 均返回 HTTP 200。
- Web 同源 `/api/v1/health` 返回 HTTP 200 和 `status: ok`。
- 平台预览连接探针未返回 `mcai-preview-error`，预览代理连接正常。

## 记录规范

每条记录包含时间、阶段、事件、依据、产物、验证结果和后续工作。任务实现后补充关联分支、commit、测试命令、镜像版本、部署结果和回滚点。

## 2026-07-30：MVP 开发决策基线确认

- 记录 ID：`FS-DOC-001`
- 阶段：Phase 1 开发准备
- 事件：斌哥确认 8 项 MVP 开发决策
- 产品与设计基线：FamilyStar v5
- 基线代码提交：`2ecdf1d`
- 本地决策原文：`../specs/decisions.md`

### 已确认范围

1. 奖励兑换采用申请时预扣，拒绝后退款。
2. 当前余额与累计获得积分存入 `User`，并通过乐观锁和积分流水保证一致性。
3. 五种预设任务类型在家庭创建时从全局模板复制到家庭私有数据。
4. 协作任务使用周期、参与者快照和孩子独立提交状态。
5. 孩子 PIN 使用 bcrypt，连续错误 5 次后锁定 15 分钟。
6. 图片、视频和语音使用统一媒体结构；原始记录采用 Cloudflare R2，已由 `FS-DEC-002` 更新为腾讯云 COS。
7. MVP 完成 EventBus、PluginRegistry 骨架和模块解耦，动态加载进入 Phase 2。
8. 通知系统和 PWA 进入 MVP 后续阶段。

### 工程补充

- 余额、兑换、库存、退款和积分流水采用事务、幂等键与数据库唯一约束。
- 协作周期保存参与者和奖励积分快照。
- PIN 重置与密码修改会撤销孩子现有会话。
- 媒体资源使用持久化对象标识、上传状态、校验和与业务关联。
- 跨模块可靠事件使用 Outbox，消费者按事件 ID 幂等处理。
- 所有业务数据按家庭隔离，关键写操作保留审计信息。

### 验证

- v5 PRD 和设计交接文档已经完整复核。
- `decisions.md` 已通过 Markdown 空白与格式检查。
- 本记录未包含密码、私钥、令牌或其他凭据。

### 后续工作

根据已确认决策生成 Phase 1 实施任务清单，并从平台骨架、数据库模型、EventBus、PluginRegistry 和 Outbox 开始实施。

## 2026-07-30：Phase 1 实施计划确认

- 记录 ID：`FS-PLAN-001`
- 阶段：Phase 1 开发准备
- 事件：完成实施任务拆分，斌哥确认任务范围完整并要求执行全部测试
- 计划文件：`../specs/phase-1-mvp/tasklist.md`
- 计划规模：12 个阶段，83 个可执行检查项

### 阶段范围

1. 全栈项目骨架与共享工程基础。
2. PostgreSQL、Prisma、Redis 与插件内核。
3. 家庭、双家长、孩子账号与认证会话。
4. 任务类型、任务分配与周期调度。
5. 单人/协作打卡与腾讯云 COS 媒体流程。
6. 审核超时、积分账本、Streak 与等级。
7. 奖励池、库存、兑换与愿望闭环。
8. 家长端 9 个响应式页面。
9. 孩子端 6 个响应式页面。
10. 家庭边界、角色权限与关键操作审计。
11. 后台任务与 Docker 双环境可重复构建。
12. 核心闭环集成与自动化质量门禁。

### 测试策略

- 单元测试、集成测试、属性测试、组件测试和 Playwright E2E 全部纳入必做范围。
- 检查点分布在项目基础、任务打卡、积分奖励、权限安全和最终闭环阶段。
- 每项任务引用 `decisions.md` 和 PRD 的对应章节。

### 验证

- 任务清单仅包含可由 coding agent 完成的实现、配置和自动化测试工作。
- 所有任务均使用复选框，层级不超过两级。
- 测试任务均位于对应实现阶段内，顶级阶段未标记为可选。
- Markdown 格式检查通过。

### 后续工作

从任务 1.1 开始搭建 TypeScript Monorepo，并在任务启动前创建对应开发记录。

## 2026-07-30：对象存储切换为腾讯云 COS

- 记录 ID：`FS-DEC-002`
- 阶段：Phase 1 开发准备
- 事件：斌哥确认 FamilyStar 使用腾讯云对象存储 COS
- 影响范围：MVP 决策 §6、实施任务 5 和 12、媒体上传测试、Wiki 技术基线

### 决策内容

- 图片、视频、语音、头像、奖励图片和徽章图标统一存储到腾讯云 COS。
- v5 PRD 中 Cloudflare R2 / S3 的描述由本决策覆盖。
- COS Bucket 使用私有读写权限。
- 客户端通过后端授权获取短期上传凭证或预签名请求。
- 原始方案通过项目环境变量提供 Bucket、Region、访问域名和服务端凭据，已由 `FS-DEC-004` 更新为家庭后台配置与数据库加密存储。

### 验证

- 当前决策文档、实施任务清单、本地开发记录和 GitHub Wiki 使用同一对象存储口径。
- v5 设计包保持原始内容，用于保留产品与设计基线历史。
- 文档未记录 COS 真实凭据。

### 后续工作

媒体模块使用每个家庭在管理后台保存并验证的 COS 配置，具体规则见 `FS-DEC-004`。

## 2026-07-30：开发阶段使用 IP 加端口访问

- 记录 ID：`FS-DEC-003`
- 阶段：Phase 1 开发准备
- 事件：斌哥确认项目域名待定，开发阶段使用服务器 IP 和端口访问
- 开发地址：`http://119.29.111.248:8098`
- 影响范围：公开基础地址、反向代理、CORS、Cookie、Docker Compose 和自动化测试配置

### 决策内容

- 浏览器通过开发前端的 `8098` 端口访问项目。
- 前端使用同源 `/api` 反向代理访问 Hono API。
- API、Worker、PostgreSQL 和 Redis 通过 Docker 内部网络通信。
- 生产容器保留 `8099` 端口，正式域名和 HTTPS 配置后续确认。

### 安全与配置

- 公开基础地址、允许来源和 Cookie 安全选项按环境变量配置。
- HTTP 开发环境会话 Cookie 使用 `HttpOnly`、`SameSite=Lax` 和 `Secure=false`。
- HTTPS 生产环境会话 Cookie 使用 `Secure=true`。
- 文档和代码不写入生产域名占位猜测。

### 后续工作

任务 1.4 实现同源反向代理和公开基础地址配置；任务 11.4 固化双环境 Docker 网络与端口映射。

## 2026-07-30：家庭后台管理邮件与 COS 凭证

- 记录 ID：`FS-DEC-004`
- 阶段：Phase 1 开发准备
- 事件：斌哥确认每个家庭独立配置邮件服务和腾讯云 COS，凭证加密存入数据库
- 权限：家庭创建者管理凭证，共同管理者仅查看配置状态
- 影响范围：数据模型、认证授权、家庭设置页、邀请流程、媒体上传、加密与审计测试

### 决策内容

- 邮件和 COS 配置按 `(family_id, integration_type)` 隔离。
- SMTP 密码或授权码、COS SecretId 和 SecretKey 使用 AES-256-GCM 信封加密。
- 每条记录使用独立数据密钥，数据密钥由服务器主密钥包裹。
- 主密钥只存在于服务器环境变量中，记录包含密钥版本以支持轮换。
- 后台接口仅返回配置状态、掩码标识和验证结果。
- 家庭创建者可新增、修改、测试、轮换和删除凭证。
- 共同管理者只能查看配置状态和最近验证结果。

### 降级行为

- 邮件配置缺失时提供可复制的家庭邀请链接。
- COS 配置缺失时关闭媒体上传入口，文字和勾选打卡继续可用。

### 验证要求

- 增加凭证加密往返、篡改检测、跨家庭隔离、响应脱敏和双家长权限测试。
- 邮件测试仅发送到家庭创建者地址。
- COS 测试仅操作家庭专属探测目录，并清理测试对象。
- 任何日志、文档和 API 响应均不记录真实凭证。

### 计划调整

实施计划保持 12 个阶段，检查项由 83 个调整为 84 个，新增任务 2.6“家庭级凭证保险库”。

## 2026-07-30：启动任务 1.1 全栈项目骨架

- 记录 ID：`FS-DEV-001`
- 阶段：Phase 1，任务 1.1
- 分支：`dev`
- 事件：初始化 TypeScript Monorepo、Next.js 14 App Router、Hono REST API、共享类型和业务模块工作区
- 依据：`../specs/decisions.md` §9；PRD §6.1、§6.2、§6.5；`../specs/phase-1-mvp/tasklist.md` 1.1

### 实施范围

- 建立 pnpm workspace 与根级工程命令。
- 创建 Next.js 14 App Router 前端入口。
- 创建运行于 Node.js 的 Hono API 入口。
- 创建共享类型包和业务模块工作区入口。
- 保持任务 1.2、1.4 和 1.5 的严格工程配置、反向代理和专项测试边界。

### 验收标准

- workspace 能正确识别前端、API、共享类型和业务模块包。
- 前端与 API 均可完成 TypeScript 编译和生产构建。
- 根级命令可以统一执行工作区构建与类型检查。
- 实现不包含凭据、服务器私钥或未确认的生产域名。

### 计划验证

- 执行 workspace 依赖解析。
- 执行根级类型检查和构建。
- 检查 `dev` 分支工作树，确认任务边界与产物完整。

### 完成结果

- 建立 5 个 pnpm workspace：根项目、Web、API、共享类型和业务模块聚合入口。
- Next.js 14.2.35 App Router 已包含根布局、首页元数据和共享类型消费示例。
- Hono 4.12.32 已将应用实例与 Node.js 启动入口分离，默认监听 `3001`。
- 共享包导出 `MediaType`、`MediaAttachment` 和 `ServiceInfo`。
- pnpm 11 通过 `allowBuilds` 显式允许 `esbuild` 安装脚本。

### 验证结果

- `pnpm list --recursive --depth -1`：通过，识别 5 个工作区项目。
- `pnpm typecheck`：通过，共享包、API 和 Web 均无 TypeScript 错误。
- `pnpm build`：通过，共享包和 API 完成 TypeScript 构建，Web 完成静态页面生产构建。
- 本地运行验证：Web `3000` 返回 FamilyStar 页面，API `3001` 返回服务信息 JSON。
- 平台预览代理连接验证：通过。
- Next.js 14 对平台要求的 `experimental.allowedHosts` 输出未识别配置警告；构建和运行结果正常，后续升级框架时复核原生配置支持。

### 后续工作

任务 1.2 配置根级 TypeScript strict 基线、ESLint、Prettier、环境变量校验、统一错误码和 `/api/v1` 路由前缀。

## 2026-07-30：启动任务 1.2 工程质量与 API 基线

- 记录 ID：`FS-DEV-002`
- 阶段：Phase 1，任务 1.2
- 分支：`dev`
- 事件：配置 TypeScript strict、ESLint、Prettier、环境变量校验、统一错误码和 `/api/v1` 路由前缀
- 依据：`../specs/decisions.md` §9；PRD §6.7、§8.4；`../specs/phase-1-mvp/tasklist.md` 1.2

### 实施范围

- 建立根级严格 TypeScript 编译基线并由全部 TypeScript 工作区继承。
- 配置根级 ESLint 与 Prettier 命令和忽略边界。
- 为 API 建立类型安全、启动时失败的环境变量解析器。
- 在共享包定义稳定错误码契约。
- 将当前 API 路由迁移到 `/api/v1`。
- 保持任务 1.4 的统一响应模型、健康检查、日志和请求关联 ID 边界。

### 验收标准

- `pnpm lint` 以零警告通过。
- `pnpm format:check`、`pnpm typecheck` 和 `pnpm build` 通过。
- 合法环境变量能够解析，默认值稳定，非法端口和 URL 会阻止启动。
- 服务信息端点通过 `GET /api/v1` 访问。
- 共享错误码可由 Web、API 和后续业务模块复用。

### 计划验证

- 执行环境解析器的正常、默认和错误输入验证。
- 执行 API 版本前缀请求验证。
- 执行根级格式、静态检查、严格类型检查和生产构建。

### 完成结果

- 全部 TypeScript 工作区继承根级严格编译基线。
- 根级 ESLint 以零警告为门禁，Web 使用独立 Next.js App Router 规则。
- Prettier 统一格式化源码、配置和基础 Markdown，设计包与项目文档保持独立格式边界。
- API 使用 Zod 校验 `NODE_ENV`、`PORT` 和 `PUBLIC_BASE_URL`，错误仅暴露无效字段名。
- API 服务信息迁移到 `GET /api/v1`，旧根路径返回 `404`。
- 共享包新增 7 个稳定错误码和 `ErrorCode` 联合类型。
- pnpm 供应链脚本白名单增加 TypeScript ESLint 依赖链所需的 `unrs-resolver`。

### 调试记录

- 症状：首次 ESLint 执行提示业务模块目录没有匹配源码，Next Pages Router 规则无法定位目录。
- 根因：`modules` 当前仅包含 JSON 与 Markdown；Next ESLint override 从不同工作目录执行时根路径解释不同。
- 修复：lint 范围收窄到实际源码目录，Next 规则下沉到 `apps/web/.eslintrc.cjs`，App Router 关闭 Pages Router 专属链接规则。
- 症状：后台 API 在依赖同步期间热重启，短暂报告缺少 `zod`。
- 根因：watch 进程在 pnpm 完成新依赖链接前响应源码变化。
- 修复：依赖同步完成后通过后台终端管理器重启服务，并重新验证运行请求。

### 验证结果

- `pnpm peers check`：通过，无 peer dependency 问题。
- `pnpm format:check`：通过。
- `pnpm lint`：通过，零警告。
- `pnpm typecheck`：通过。
- `pnpm build`：通过，最终生产构建无警告。
- 环境解析验证：默认值、自定义合法值、端口下限、端口上限、非数字端口和非法 URL 均符合预期。
- 错误码验证：值唯一且包含内部错误兜底码。
- API 运行验证：`GET /api/v1` 返回 `200`，`GET /` 返回 `404`。
- Web 运行验证：`GET /` 返回 `200`，平台预览地址保持可访问。

### 后续工作

任务 1.3 配置 Tailwind CSS、FamilyStar Design Tokens、Fredoka/Nunito 字体、Lucide 图标和 768px 响应式断点。

## 2026-07-30：完成任务 1.3 Web 视觉工程基础

- 记录 ID：`FS-DEV-003`
- 阶段：Phase 1，任务 1.3
- 分支：`dev`
- 事件：配置 Tailwind CSS、FamilyStar Design Tokens、Fredoka/Nunito 字体、Lucide 图标和响应式断点
- 依据：`../specs/decisions.md` §10；设计交接 §3；PRD §6.1、§6.2、§8.3；`../specs/phase-1-mvp/tasklist.md` 1.3

### 实施范围

- 为 Next.js Web 工作区接入 Tailwind CSS 3、PostCSS 和 Autoprefixer。
- 将设计交接中的颜色、圆角、阴影、字号与容器规则映射为 CSS 变量和 Tailwind theme。
- 通过 `next/font/google` 建立 Fredoka 展示字体和 Nunito 正文字体变量。
- 引入 Lucide React 并以具名导入验证图标打包。
- 建立 mobile、tablet、desktop 语义断点和 1200px 内容容器。
- 用最小首页展示验证视觉基础，保留业务页面迁移任务边界。

### 完成结果

- 新增 `tailwind.config.cjs`、`postcss.config.cjs` 和 `app/globals.css`。
- FamilyStar theme 覆盖 16 个颜色、5 个圆角、4 个阴影和 9 级字号 Token。
- 响应式边界固定为 mobile `<768px`、tablet `768px-1024px`、desktop `>1024px`。
- Fredoka 与 Nunito 由 Next.js 构建为自托管 WOFF2 资源。
- 首页使用 Tailwind utilities、FamilyStar Tokens 和 Lucide SVG 完成响应式视觉基础展示。
- 新增 `verify:design-system` 脚本固定核心配置契约。

### 调试记录

- 症状：首次 `pnpm peers check` 报告 `@napi-rs/wasm-runtime 1.2.0` 需要 `@emnapi 2.0 alpha`。
- 根因：ESLint 的 `unrs-resolver` 可选 WASM 绑定接受 `@napi-rs/wasm-runtime ^1.1.4`，解析到 1.2.0 后与绑定包固定的 `@emnapi 1.10.0` 产生 peer 冲突。
- 修复：在 pnpm workspace 使用 override 固定兼容范围内的 `@napi-rs/wasm-runtime 1.1.6`。
- 回归：`pnpm peers check` 返回无 peer dependency 问题。
- 症状：生产构建通过后，持续运行的 Next.js 开发预览返回 `500` 和 `__webpack_modules__[moduleId] is not a function`。
- 根因：`next build` 与 `next dev` 同时使用 `apps/web/.next`，生产构建替换了开发服务器正在读取的 Webpack 产物。
- 修复：使用后台终端管理器重启 Web 与 API 开发服务。
- 回归：本地 Web、API 和平台预览重新返回最新页面与服务信息。

### 验证结果

- `pnpm --filter @familystar/web verify:design-system`：通过。
- `pnpm peers check`：通过。
- `pnpm format:check`：通过。
- `pnpm lint`：通过，零警告。
- `pnpm typecheck`：通过。
- `pnpm build`：通过，Web 首页静态生成，字体与 Tailwind CSS 正常产出。
- 本地 Web 请求：返回最新视觉基础页面和 Lucide SVG。
- 平台预览代理：连接正常并返回最新页面。

### 后续工作

任务 1.4 建立同源 `/api` 反向代理、Hono 健康检查、结构化日志、请求关联 ID 和统一响应模型。

## 2026-07-30：启动任务 1.4 API 请求基础设施

- 记录 ID：`FS-DEV-004`
- 阶段：Phase 1，任务 1.4
- 分支：`dev`
- 事件：建立同源 API 代理、健康检查、结构化日志、请求关联 ID 和统一响应模型
- 依据：`../specs/decisions.md` §9、§12；PRD §6.2、§6.7、§8.1；`../specs/phase-1-mvp/tasklist.md` 1.4

### 实施范围

- 通过 Next.js rewrite 将浏览器同源 `/api` 请求转发至内部 Hono 服务。
- 为 Hono 请求建立可信长度和字符集约束的 `X-Request-Id`，并回写响应头。
- 使用统一成功与失败信封返回业务数据、稳定错误码、请求 ID 和服务端 UTC 时间。
- 增加健康检查、404 和未处理异常映射。
- 输出不含请求体、查询值和凭据的 JSON 请求日志。
- 增加任务 1.4 API 契约验证脚本，正式单元测试套件保留在任务 1.5。

### 验收标准

- Web 入口可以通过同源 `/api/v1` 和 `/api/v1/health` 访问内部 API。
- 每个 API 响应包含 `X-Request-Id`，有效调用方 ID 可贯穿响应和日志。
- 成功、404 和内部错误均符合共享响应契约。
- 健康检查返回服务状态、版本和 UTC 时间。
- 请求日志为单行 JSON，并记录方法、路径、状态、耗时和请求 ID。
- 格式、Lint、严格类型检查、构建、契约验证和平台预览全部通过。

### 计划验证

- 直接调用 Hono 应用验证服务信息、健康检查、请求 ID、404 和响应信封。
- 启动 Web 与 API 后验证本地同源代理和内部 API。
- 执行根级格式、静态检查、严格类型检查和生产构建。
- 重启开发服务后验证平台预览入口及同源健康检查。

### 完成结果

- Next.js 增加由 `API_INTERNAL_URL` 驱动的 `/api/:path*` 同源 rewrite，默认连接 `http://localhost:3001`。
- Hono 增加 `GET /api/v1/health`，返回状态、服务版本、检查时间和进程运行秒数。
- 共享包增加成功、失败、元数据和健康检查 TypeScript 契约。
- API 对调用方请求 ID 执行长度与字符集校验，无效值由服务端 UUID 替换。
- API 成功、404 和未处理异常使用统一信封，并在响应头与 `meta` 回传请求 ID。
- 请求完成后输出不含请求体、查询值和凭据的单行 JSON 日志。
- Hono CORS 精确允许 `PUBLIC_BASE_URL`，同源浏览器访问通过 Next.js 转发。

### 调试记录

- 症状：共享包源码新增响应类型后，API 类型检查仍读取旧 `dist/index.d.ts`。
- 根因：共享包 `exports.types` 指向构建产物，递归类型检查不会预先重建声明文件。
- 修复：类型入口改为 `src/index.ts`，运行时入口继续使用 `dist/index.js`。
- 回归：全工作区严格类型检查与生产构建通过。
- 平台专用 dummy 连接探测路径在 15 秒内未返回；真实首页和同源健康检查均返回 `200`，服务链路验证通过。

### 验证结果

- `pnpm --filter @familystar/api verify:api-foundation`：通过，覆盖服务信息、健康检查、CORS、请求 ID、404、信封和日志字段。
- `pnpm peers check`：通过。
- `pnpm format:check`：通过。
- `pnpm lint`：通过，零警告。
- `pnpm typecheck`：通过。
- `pnpm build`：通过，共享包、API 和 Web 生产构建成功。
- 本地 `GET http://localhost:3000/api/v1`：通过同源 rewrite 返回 `200`。
- 本地及平台 `GET /api/v1/health`：返回统一健康信封和请求 ID。
- 平台预览：https://3000-a9c18acafb19a352.monkeycode-ai.online
- 受管后台终端：`term_1785387404833_4`。

### 后续工作

任务 1.5 编写共享类型、配置校验、API 错误映射和健康检查单元测试。

## 2026-07-30：启动任务 1.5 单元测试基础

- 记录 ID：`FS-DEV-005`
- 阶段：Phase 1，任务 1.5
- 分支：`dev`
- 事件：建立共享类型、配置校验、API 错误映射和健康检查单元测试
- 依据：`../specs/decisions.md` §9、§10；PRD §6.5、§8.4；`../specs/phase-1-mvp/tasklist.md` 1.5

### 实施范围

- 引入 Vitest 3.2.4 和 V8 覆盖率提供器，建立根级单元测试命令和 Node 测试环境。
- 为共享错误码和 API TypeScript 契约编写运行时与类型断言。
- 覆盖环境配置默认值、合法自定义值、端口边界和脱敏错误信息。
- 覆盖成功与失败响应构造器的固定字段和可选详情。
- 通过 Hono 应用内存请求覆盖服务信息、健康检查、404 与未处理异常映射。
- 保持测试与源码同目录，并排除进程启动和已有契约脚本等非单元边界。

### 验收标准

- 根级 `pnpm test` 能一次执行全部单元测试并稳定退出。
- 类型断言可以证明统一响应判别联合和健康状态字段契约。
- 配置测试覆盖端口 1 与 65535，并拒绝越界、非整数、非法枚举和非法 URL。
- 404 与未处理异常分别映射为稳定 `NOT_FOUND` 和 `INTERNAL_ERROR` 响应。
- 健康检查返回统一成功信封、有效 UTC 时间和非负整数运行秒数。
- V8 覆盖率报告覆盖任务 1.5 目标源码，核心指标达到 PRD 的 70% 基线。

### 计划验证

- 先运行聚焦测试并修复所有失败。
- 执行根级测试与 V8 覆盖率检查。
- 执行 peer dependency、格式、Lint、严格类型检查和生产构建。
- 核对任务清单、本地项目文档和 GitHub Wiki。

### 完成结果

- 根级接入 Vitest 3.2.4 与 `@vitest/coverage-v8` 3.2.4，新增 `test` 和 `test:coverage` 命令。
- `vitest.config.ts` 使用 Node 环境发现 apps 与 packages 内的同目录测试。
- 共享包测试覆盖 7 个错误码、唯一性、命名格式、公共运行时导出、响应判别联合、健康类型和媒体可选字段。
- 环境测试覆盖默认配置、自定义配置、端口上下界、4 类非法端口、非法运行环境、非法 URL 和错误值脱敏。
- 响应构造器测试覆盖成功信封、无详情失败信封和显式安全详情。
- Hono 应用测试覆盖服务信息、健康检查、404 与未处理异常，并验证内部异常消息不进入响应或错误日志。

### 验证结果

- `pnpm test`：通过，5 个测试文件、23 个测试全部成功。
- `pnpm test:coverage`：通过，任务 1.5 目标源码 statements、branches、functions、lines 均为 100%。
- `pnpm peers check`：通过。
- `pnpm format:check`：通过。
- `pnpm lint`：通过，零警告。
- `pnpm typecheck`：通过。
- `pnpm build`：通过，共享包、API 和 Web 生产构建成功。
- 本地与平台同源健康检查：通过，请求 ID 正常贯穿。
- 平台预览：https://3000-a9c18acafb19a352.monkeycode-ai.online
- 受管后台终端：`term_1785393812277_5`。

### 后续工作

任务 1.6 执行阶段 1 检查点，复核全部测试与工程基础。

## 2026-07-30：完成任务 1.6 阶段 1 检查点

- 记录 ID：`FS-DEV-006`
- 阶段：Phase 1，任务 1.6
- 分支：`dev`
- 事件：复核阶段 1 全部工程、测试、构建和运行门禁
- 依据：MVP 开发决策 §10；PRD §7.1、§8.4；Phase 1 实施计划 1.6

### 检查范围

- Vitest 单元测试与 V8 覆盖率阈值。
- Web 视觉系统与 API 请求基础契约。
- peer dependency、Prettier、ESLint 和 TypeScript strict。
- 共享包、API 与 Web 生产构建。
- 本地与平台同源健康检查及请求 ID 贯穿。

### 验证结果

- `pnpm test:coverage`：通过，5 个测试文件、23 个测试全部成功，目标源码四项覆盖率均为 100%。
- `pnpm --filter @familystar/web verify:design-system`：通过。
- `pnpm --filter @familystar/api verify:api-foundation`：通过。
- `pnpm peers check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`：全部通过。
- `pnpm build`：通过，共享包、API 和 Web 生产构建成功。
- 本地与平台同源健康检查：通过，请求 ID 正常贯穿。
- 平台预览：https://3000-a9c18acafb19a352.monkeycode-ai.online
- 受管后台终端：`term_1785394253408_6`。

### 检查点结论

阶段 1 的 1.1 至 1.6 全部完成，当前没有待澄清问题。下一项为任务 2.1，配置 Prisma、PostgreSQL 16 和核心数据模型迁移。

## 2026-07-30：启动任务 2.1 PostgreSQL 核心数据模型

- 记录 ID：`FS-DEV-007`
- 阶段：Phase 1，任务 2.1
- 分支：`dev`
- 事件：配置 Prisma 与 PostgreSQL 16，建立核心数据模型和初始迁移
- 依据：MVP 开发决策 §1-§6、§9；PRD §5.1-§5.3；Phase 1 实施计划 2.1

### 实施范围

- 接入 Prisma 6.19.2、PostgreSQL datasource、客户端生成与迁移命令。
- 建立家庭、用户、邀请、任务类型模板、家庭任务类型、任务分配、单人及协作打卡模型。
- 建立媒体资产与业务关联、积分流水、等级配置、奖励、兑换、愿望和审计模型。
- 为家庭隔离、幂等、唯一业务键、乐观锁和软删除查询建立数据库索引与约束。
- 生成可审查的 PostgreSQL 16 初始迁移，并验证 Prisma Schema 与 SQL 迁移一致性。

### 决策收敛

- 任务类型采用全局模板复制到家庭私有记录的方案。
- 积分流水采用 `earn`、`redeem`、`refund`、`manual`，保存变更前后余额及业务唯一键。
- 兑换采用家庭范围客户端幂等键和预扣状态机，不建立单奖励免审批阈值。
- 媒体使用独立 `MediaAsset` 与显式业务关联，数据库保存对象键并由服务端生成访问 URL。
- 业务表携带 `family_id`，可变聚合根使用 `deleted_at` 软删除字段。

### 计划验证

- 执行 Prisma format、validate、generate 和迁移差异检查。
- 执行模型契约测试，验证核心表、外键、唯一约束、检查约束和索引。
- 执行根级测试、覆盖率、格式、Lint、严格类型检查和生产构建。
- 同步任务清单、本地项目文档和 GitHub Wiki。

### 完成结果

- API 接入 Prisma ORM/Client 6.19.2，并为 Prisma 安装脚本增加 pnpm 显式许可。
- PostgreSQL datamodel 建立 21 个核心模型、18 个枚举、UUID 主键、UTC 时间、家庭租户字段、软删除字段、关系、索引和业务唯一键。
- 初始 SQL 迁移补充余额守恒、积分方向、库存容量、等级区间、日期范围与非负数值 CHECK 约束。
- 初始迁移使用部分唯一索引约束活跃邮箱和同一任务分配日期的活跃打卡。
- 新增 `db:format`、`db:validate`、`db:generate`、`db:migrate:deploy`、`db:migrate:dev` 和 `verify:data-model` 命令。
- `DATABASE_URL` 纳入 Zod 环境校验；修正协议匹配规则后，显式 PostgreSQL URL 与默认值均通过测试。
- 新增数据模型契约模块、命令行检查和 3 个单元测试，覆盖成功路径、家庭边界缺失与迁移保护缺失。

### 验证结果

- Prisma `format`、`validate`、`generate`：通过，Schema 有效并成功生成 6.19.2 Client。
- `pnpm verify:data-model`：通过，核心模型与初始迁移契约有效。
- `pnpm test:coverage`：通过，6 个测试文件、27 个测试全部成功，目标源码四项覆盖率均为 100%。
- `pnpm peers check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`：全部通过。
- `pnpm build`：通过，共享包、API 和 Web 生产构建成功，API 构建自动生成 Prisma Client。
- Web 视觉与 API 基础契约回归：通过。
- 本地与平台同源健康检查：通过。
- 平台预览：https://3000-a9c18acafb19a352.monkeycode-ai.online
- 受管后台终端：`term_1785396198173_7`。

### 已知验证边界

当前 Agent 环境没有 PostgreSQL 服务端或 Docker。初始迁移已通过 Prisma datamodel、SQL 内容和契约测试验证，真实 PostgreSQL 16 应用验证随任务 11 的 Docker 数据库环境执行。

### 后续工作

任务 2.2 配置 Redis 客户端，用于会话、速率限制、调度锁、幂等消费标记和短期缓存。

## 2026-07-30：完成任务 2.2 Redis 基础设施

- 记录 ID：`FS-DEV-008`
- 阶段：Phase 1，任务 2.2
- 分支：`dev`
- 事件：配置 Redis 客户端、隔离键空间和原子基础操作
- 依据：MVP 开发决策 §4、§5、§9；PRD §6.1、§6.2、§8.1、§8.2；Phase 1 实施计划 2.2

### 实施范围

- 接入兼容 Node.js 20 的 Redis Node.js Client 6.1.0。
- 增加 `REDIS_URL` 和 `REDIS_KEY_PREFIX` 环境校验与非敏感开发默认值。
- 建立带连接超时、指数重连、离线队列关闭和脱敏错误日志的惰性客户端工厂。
- 建立会话、速率限制、调度锁、幂等消费和短期缓存用途的隔离键空间。
- 建立可注入命令端口及对应原子命令基础操作。

### 完成结果

- Redis 动态键片段统一编码并限制长度，部署键前缀限制为安全字符集。
- 会话与 JSON 缓存强制携带 TTL，缓存读取校验返回类型和 JSON 结构。
- 固定窗口限流通过 Lua 原子完成计数、首次过期设置和剩余 TTL 读取。
- 调度锁通过 `SET PX NX` 获取，并通过比较所有者令牌的 Lua 脚本安全释放。
- 幂等消费标记通过 `SET EX NX` 原子声明首次处理权。
- node-redis 通过最小 `RedisCommandPort` 适配，单元测试无需真实 Redis 进程。

### 验证结果

- `pnpm test:coverage`：通过，9 个测试文件、55 个测试全部成功，statements、branches、functions 和 lines 均为 100%。
- `pnpm peers check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`：全部通过。
- `pnpm build`：通过，共享包、API 和 Web 生产构建成功。
- API 基础、Web 设计系统和 Prisma 数据模型契约回归：通过。
- Prisma Schema 使用公开本地占位 `DATABASE_URL` 校验通过。
- 本地与平台同源健康检查：通过，均返回 `status: ok`。
- 平台预览：https://3000-a9c18acafb19a352.monkeycode-ai.online
- 受管后台终端：`term_1785397957241_8`。

### 调试记录

- node-redis 6 的泛型工厂返回类型需要绑定到实际实例化函数，避免宽泛 `ReturnType<typeof createClient>` 与严格可选属性规则冲突。
- `next build` 与 Web 类型检查并行访问 `.next/types` 时产生瞬时缺文件；生产构建完成后串行复跑类型检查通过。

### 已知验证边界

当前 Agent 环境没有 Redis 服务端或 Docker。客户端配置、错误路径、命令形态和 Lua 调用已由单元测试验证，真实 Redis 连接与并发运行态验证随任务 11 的 Docker 环境执行。

### 后续工作

任务 2.3 实现静态 PluginRegistry、manifest 契约、依赖与权限校验以及插件生命周期。

## 2026-07-30：启动任务 2.3 PluginRegistry 骨架

- 记录 ID：`FS-DEV-009`
- 阶段：Phase 1，任务 2.3
- 分支：`dev`
- 事件：实现静态 PluginRegistry、manifest 契约、依赖与权限校验和注册生命周期
- 依据：MVP 开发决策 §7；PRD §6.3；Phase 1 实施计划 2.3

### 实施范围

- 在共享包中定义可供 API 和独立业务模块共同使用的插件契约。
- 校验插件名称、语义版本、公开能力、依赖、权限和版本化事件声明。
- 按静态注册顺序验证依赖，并按核心平台许可清单验证插件权限。
- 实现注册、查询、列举和卸载生命周期，保持失败操作前后的注册表状态一致。
- 阻止卸载仍被其他已注册插件依赖的插件。

### 验收标准

- 合法插件可注册并接收共享上下文，manifest 以不可变快照保存。
- 重复插件、缺失依赖、未授权权限和非法 manifest 返回稳定分类错误。
- 注册回调失败时不产生注册记录，卸载回调失败时保留原注册记录。
- 注册表可按注册顺序列出 manifest，并可安全卸载无依赖插件。

### 计划验证

- 编写 manifest、注册、依赖、权限、失败回滚和卸载保护单元测试。
- 执行全量测试与覆盖率、peer dependency、格式、Lint、严格类型检查和生产构建。
- 回归 API、Web、数据模型与 Redis 基础契约，并同步本地文档和 GitHub Wiki。

### 完成结果

- 在 `@familystar/shared` 中公开 `PluginManifest`、`Plugin<TContext>`、`PluginRegistry<TContext>` 和稳定错误分类。
- manifest 校验覆盖插件名、完整语义版本、声明格式、数组唯一性、自依赖和版本化事件名。
- 注册表按静态顺序保存冻结 manifest 快照，校验核心权限许可清单和已注册依赖。
- 注册回调成功后才新增记录，卸载回调成功后才删除记录，生命周期失败保持原状态。
- 卸载流程阻止移除仍被已注册插件依赖的插件。

### 验证结果

- `pnpm test:coverage`：通过，10 个测试文件、76 个测试全部成功，statements、branches、functions 和 lines 均为 100%。
- `pnpm peers check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`：全部通过。
- `pnpm build`：通过，共享包、API 和 Web 生产构建成功。
- `pnpm --filter @familystar/api verify:api-foundation`：通过。
- `pnpm --filter @familystar/web verify:design-system`：通过。
- `pnpm verify:data-model`：通过。
- Prisma Schema 使用公开本地占位 `DATABASE_URL` 校验通过。
- 本地与平台同源健康检查：通过，均返回 `status: ok`。
- 平台预览：https://3000-a9c18acafb19a352.monkeycode-ai.online
- 受管后台终端：`term_1785404565383_9`。

### 已知边界

- 当前 Registry 使用编译期静态清单，具体业务插件由任务 2.5 实现。
- EventBus、版本化载荷、Outbox 和幂等消费者由任务 2.4 实现。
- `unregister()` 当前服务于测试和应用关闭；动态加载和热卸载属于 Phase 2。

### 后续工作

任务 2.4 实现命名空间 EventBus、版本化事件载荷、Outbox 事务写入与分发和幂等消费者。

## 2026-07-30：启动任务 2.4 EventBus 与 Outbox

- 记录 ID：`FS-DEV-010`
- 阶段：Phase 1，任务 2.4
- 分支：`dev`
- 事件：实现命名空间 EventBus、版本化事件信封、Outbox 事务写入、单批分发和幂等消费
- 依据：MVP 开发决策 §7、§9；PRD §6.3、§8.5；Phase 1 实施计划 2.4

### 实施范围

- 抽取共享事件名和领域事件信封契约，统一 PluginRegistry 与 EventBus 校验规则。
- EventBus 通过插件 manifest 隔离发布与订阅命名空间，按稳定订阅顺序等待异步处理器。
- 新增家庭范围 Outbox 表、租约字段、重试状态、查询索引和数据库保护约束。
- 提供业务写入与 Outbox append 共用事务的窄端口和 Prisma 适配器。
- 实现单批 Outbox claim、发布、成功确认、失败退避重投和错误分类。
- 实现基于 `(consumer, event_id)` 的 Redis 快速幂等租约，失败时按所有者令牌安全释放。

### 验收标准

- 事件信封包含 `event_id`、`occurred_at`、`family_id`、`actor_id` 和 `correlation_id`，payload 可安全写入 JSONB。
- 插件只能发布 manifest 声明且属于自身命名空间的事件，只能订阅 manifest 声明的事件。
- Outbox 与业务 mutation 在同一事务回调内写入，分发器只处理事务提交后的记录。
- 分发失败记录脱敏错误分类并按有界退避重新调度，成功记录发布时间。
- 重复事件由消费者快速跳过，处理失败释放当前所有者租约，领域唯一约束继续承担最终幂等。

### 计划验证

- 编写事件契约、EventBus、事务写入、分发重试、Prisma Outbox 和 Redis 幂等消费者单元测试。
- 扩展 Prisma 数据模型和完整迁移历史契约验证。
- 执行覆盖率、peer dependency、格式、Lint、严格类型检查、Prisma 校验和生产构建。
- 同步任务清单、本地项目文档、GitHub Wiki 和平台预览验证。

### 完成结果

- `@familystar/shared` 公开版本化事件名、JSON-safe payload 和深度冻结领域事件信封，PluginRegistry 复用同一名称校验并限制发布命名空间。
- EventBus 为每个插件创建 manifest 绑定 scope，按稳定顺序等待异步处理器，并提供可信 Outbox 重放入口。
- 新增 `OutboxEvent` Prisma 模型和增量迁移，包含家庭与操作者关系、JSONB payload、可投递时间、尝试次数、Worker 租约、发布状态、保护约束和 claim 索引。
- `runWithOutbox()`、`PrismaTransactionRunner` 和 `PrismaOutboxWriter` 保证业务 mutation 与事件 append 使用同一事务回调。
- Prisma 仓储使用 `FOR UPDATE SKIP LOCKED` 原子 claim；Dispatcher 在成功时确认发布，在失败时保存脱敏错误类型并执行有上限的指数退避。
- 幂等消费者使用 `(consumer, event_id)` Redis receipt 快速跳过重复事件，并以 owner token 安全释放失败处理的 receipt。
- 数据模型合同改为读取按目录排序的完整迁移历史。

### 验证结果

- `pnpm test:coverage`：通过，16 个测试文件、128 个测试全部成功，statements、branches、functions 和 lines 均为 100%。
- `pnpm peers check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`：全部通过。
- `pnpm build`：通过，共享包、API 和 Web 生产构建成功。
- `pnpm db:validate`、`pnpm verify:data-model`：通过，Prisma Schema 与完整迁移历史契约有效。
- 本地与平台同源健康检查：通过，均返回 `success: true` 和 `status: ok`。
- 平台预览：https://3000-a9c18acafb19a352.monkeycode-ai.online
- 受管后台终端：`term_1785406928290_10`。

### 已知验证边界

- 当前 Agent 环境没有 PostgreSQL、Redis 或 Docker，真实并发 claim、Redis receipt 和跨进程重投由任务 2.7 与任务 11 验证。
- Outbox Worker 进程与轮询生命周期由任务 11.1 组合；任务 2.4 提供可注入的基础设施端口和适配器。

### 后续工作

任务 2.5 建立任务、打卡、积分、等级和奖励插件骨架及静态注册顺序。

## 2026-07-30：完成任务 2.5 静态业务模块组合

- 记录 ID：`FS-DEV-011`
- 阶段：Phase 1，任务 2.5
- 分支：`dev`
- 事件：建立五个独立业务模块、编译期静态清单、API 启动注册和设置模块开关占位
- 依据：MVP 开发决策 §7、§8；PRD §6.3、§7.1；Phase 1 实施计划 2.5

### 实施范围

- 为任务、打卡、积分、等级和奖励建立独立 workspace package、manifest、严格 TypeScript 边界和生产构建入口。
- 声明模块公开能力、依赖、核心权限、版本化发布事件和订阅事件。
- 在聚合包中固定依赖安全的静态清单，提供统一注册、反向清理和初始化入口。
- 在 API 监听端口前完成静态模块注册，使非法 manifest、权限或依赖阻止进程启动。
- 提供始终启用、只读且标记为后续能力的设置模块开关元数据。

### 完成结果

- 新增 `@familystar/tasks-module`、`@familystar/check-in-module`、`@familystar/points-module`、`@familystar/levels-module` 和 `@familystar/rewards-module`。
- `@familystar/business-modules` 按 `tasks → check-in → points → levels → rewards` 注册，并按反向顺序清理。
- 静态清单中的订阅事件均有声明发布方；模块源码只消费共享插件契约和公开 package 入口。
- API `src/server.ts` 在创建 Hono 应用前等待 `initializeBusinessModules()`。
- Vitest 使用精确 workspace source alias 覆盖模块源码，生产 package `exports` 继续使用独立 `dist`。

### 验证结果

- `pnpm test:coverage`：通过，17 个测试文件、135 个测试全部成功，statements、branches、functions 和 lines 均为 100%。
- `pnpm peers check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`：全部通过。
- `pnpm build`：通过，共享包、五个模块包、模块聚合包、API 和 Web 生产构建成功。
- `pnpm db:validate`、`pnpm verify:data-model`：通过，Prisma Schema 与迁移历史契约有效。
- `pnpm --filter @familystar/api verify:api-foundation`：通过。
- 从 API workspace 加载生产模块入口成功，Registry 顺序为 `tasks,check-in,points,levels,rewards`。
- 本地与平台同源健康检查：通过，均返回 `success: true` 和 `status: ok`。
- 平台预览：https://3000-a9c18acafb19a352.monkeycode-ai.online
- 受管后台终端：`term_1785411887521_11`。

### 已知边界

- 当前模块生命周期仅建立静态架构边界，领域服务、事件处理器和数据库访问由任务 4 至任务 7 实现。
- 设置页 UI 在任务 8.5 实现，Phase 1 开关元数据不改变运行时装载状态。
- 动态导入、运行时启停和热卸载进入 Phase 2。

### 后续工作

任务 2.6 实现家庭级凭证保险库。

## 2026-07-30：启动任务 2.6 家庭级凭证保险库

- 记录 ID：`FS-DEV-012`
- 阶段：Phase 1，任务 2.6
- 分支：`dev`
- 事件：实现家庭级 AES-256-GCM 信封加密、主密钥版本和数据密钥重包裹
- 依据：MVP 开发决策 §13；PRD §4.9、§8.2；Phase 1 实施计划 2.6

### 实施范围

- 建立家庭邮件与 COS 配置的 Prisma 模型、家庭唯一约束和增量迁移。
- 从可选服务器环境配置解析版本化 256 位主密钥，并公开稳定的保险库可用状态。
- 每条记录生成独立数据密钥，分别加密凭证载荷和包裹数据密钥。
- 使用家庭、集成类型和记录 ID 作为认证关联数据，阻止密文跨记录替换。
- 支持仅更新包裹密钥及版本的主密钥轮换，不改写凭证密文。
- 提供 Prisma 重包裹持久化适配器和乐观版本保护。

### 验收标准

- 邮件和 COS 记录在家庭内各自唯一，密文、nonce、认证标签和密钥版本具备数据库保护约束。
- 配置缺失或无效时保险库报告不可用，凭证读写稳定失败且不暴露配置值。
- 加密往返、篡改、未知版本、关联数据隔离、独立数据密钥和重包裹均有单元测试。
- Prisma Schema、完整迁移历史、格式、Lint、类型检查、测试、覆盖率和生产构建全部通过。

### 完成结果

- 新增 `FamilyIntegrationSetting`、`IntegrationType` 和 `IntegrationStatus`，家庭内邮件与 COS 配置各自唯一。
- 增量迁移保存非敏感 JSONB 配置、两层 GCM 密文、nonce、认证标签、主密钥版本、验证状态和操作者关系。
- 主密钥 keyring 严格校验版本、规范 Base64 和 32 字节长度，并区分缺失与无效配置状态。
- 每次凭证加密生成独立 32 字节数据密钥，两层加密使用独立 12 字节 nonce 和 16 字节认证标签。
- 家庭、集成类型和记录 UUID 进入两层 GCM 认证关联数据，跨边界替换会触发统一认证失败。
- 重包裹仅生成新的包裹数据密钥、nonce、认证标签和版本；Prisma 更新以旧版本执行乐观冲突保护。
- API 在监听端口前初始化保险库，keyring 不可用时保留安全降级状态。

### 验证结果

- 聚焦测试：6 个测试文件、48 个测试全部通过。
- `pnpm test:coverage`：21 个测试文件、167 个测试全部通过；statements 与 lines 为 98.76%、branches 为 98.81%、functions 为 100%。
- `pnpm peers check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`：全部通过。
- `pnpm db:validate`、`pnpm verify:data-model`：通过，Schema、增量迁移和保护约束有效。
- `pnpm --filter @familystar/api verify:api-foundation`、`pnpm --filter @familystar/web verify:design-system`：回归通过。
- `pnpm build`：共享包、五个模块包、模块聚合、API 和 Web 生产构建成功。

### 预览验证

- 后台终端 `term_1785411887521_11` 持续运行 `pnpm --dir /workspace dev`，Web 与 API 分别监听 3000 和 3001。
- API 直连 `http://127.0.0.1:3001/api/v1/health` 与 Web 同源代理 `http://127.0.0.1:3000/api/v1/health` 均返回 `status: ok`。
- 平台预览 `https://3000-a9c18acafb19a352.monkeycode-ai.online/api/v1/health` 返回 `status: ok`，预览代理连接检测通过。

### 已知验证边界

当前 Agent 环境没有 PostgreSQL、Redis 或 Docker。任务 2.6 已通过 Prisma Client 生成、迁移合同和可注入 Prisma 适配器测试；真实 PostgreSQL 加密往返与并发重包裹验证纳入任务 2.7 和任务 11。

### 后续工作

任务 2.7 编写 PluginRegistry、EventBus、Outbox 重投、消费者幂等和凭证加密往返集成测试。

## 2026-07-30：启动任务 2.7 基础设施集成测试

- 记录 ID：`FS-DEV-013`
- 阶段：Phase 1，任务 2.7
- 分支：`dev`
- 事件：验证 PluginRegistry、EventBus、Outbox 重投、消费者幂等和凭证加密的跨组件协作
- 依据：MVP 开发决策 §7、§9、§13；PRD §6.3、§8.2、§8.4；Phase 1 实施计划 2.7

### 实施范围

- 使用真实静态业务模块 manifest、PluginRegistry 和 EventBus scope 验证注册顺序、事件声明与处理链。
- 组合事务 Outbox、仓储端口和 Dispatcher，验证提交后发布、失败退避及后续重投。
- 组合 Redis receipt 适配器与幂等消费者，验证重复抑制和处理失败后的安全释放。
- 组合凭证保险库与 Prisma 仓储映射，验证家庭范围加密记录的持久化往返和主密钥重包裹。

### 验收标准

- 集成测试覆盖正常流程、重复投递、失败回滚、重投恢复和家庭/记录加密边界。
- 测试使用跨组件真实实现，仅在 PostgreSQL、Redis 和 Prisma I/O 边界使用可控内存适配器。
- 聚焦测试、全仓覆盖率、格式、Lint、严格类型检查、Prisma 契约和生产构建全部通过。

### 已知环境边界

当前 Agent 环境没有 PostgreSQL、Redis 或 Docker。任务 2.7 验证进程内完整协作链；真实服务连接、并发租约和容器运行态继续由任务 11 验证。

### 完成结果

- 新增单文件跨组件集成套件，使用状态型内存事务、Redis 命令和 Prisma delegate 适配器承接 I/O 边界。
- 真实静态业务模块完成 Registry 初始化，并通过 manifest 绑定的 EventBus scope 发布和消费声明事件。
- 真实 `runWithOutbox()` 与 `OutboxDispatcher` 完成事务提交、append 失败回滚、首次投递失败、退避和后续成功重投验证。
- 真实 `RedisEventReceiptStore` 与 `IdempotentEventConsumer` 完成重复投递抑制和处理失败后的 owner receipt 释放验证。
- 真实 `CredentialVault` 与 `PrismaCredentialVaultRepository` 完成 BYTEA 映射、家庭范围读取、关联数据认证和 v1 到 v2 数据密钥重包裹验证。

### 验证结果

- 聚焦集成测试：1 个测试文件、6 个测试全部通过。
- `pnpm test:coverage`：22 个测试文件、173 个测试全部通过；statements 与 lines 为 98.76%、branches 为 98.83%、functions 为 100%。
- `pnpm peers check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`：全部通过。
- `pnpm db:validate`、`pnpm verify:data-model`、API 基础和 Web 视觉契约：全部通过。
- `pnpm build`：共享包、五个模块包、模块聚合、API 和 Web 生产构建成功。

### 预览验证

- 生产构建后重启受管开发服务，后台终端 `term_1785419918692_12` 持续运行，Web 与 API 分别监听 3000 和 3001。
- API 直连与 Web 同源 `/api/v1/health` 均返回 `status: ok`。
- 平台预览 `https://3000-a9c18acafb19a352.monkeycode-ai.online/api/v1/health` 返回 `status: ok`，预览代理连接检测通过。

### 后续工作

任务 3.1 实现家长邮箱注册登录，并在单个事务中初始化家庭、创建者、默认设置、家庭任务类型和等级配置。

## 2026-07-30：任务 3.1 家长认证与家庭初始化启动

### 范围与依据

- 任务：Phase 1 任务 3.1。
- 依据：`decisions.md` §3、§5、§9、§14，PRD §2.2、§2.4、§4.1.1、§4.3。
- 分支：`dev`。
- 范围：家长邮箱注册登录、bcrypt cost 12、浏览器 IANA 时区回退、原子家庭初始化、5 种家庭任务类型、20 级配置和滚动 30 天会话创建。

### 验收与验证计划

- 注册事务完整创建家庭、创建者、默认设置、任务类型和等级配置。
- 重复邮箱、短密码、bcrypt 72 字节边界、无效时区和错误登录返回稳定结果。
- 登录与注册创建 HttpOnly、SameSite=Lax 会话 Cookie。
- 执行聚焦测试、格式、Lint、严格类型检查、Prisma 校验、数据模型契约和 API 构建。

### 完成结果

- 新增 `family-auth` 领域服务、Prisma 仓储、Redis 会话存储和 Hono 家长注册登录路由。
- 注册在单个 Prisma 事务中创建家庭、创建者、5 种家庭任务类型和 20 级配置，并保存浏览器 IANA 时区或 `Asia/Shanghai` 回退值。
- 家长密码使用 bcrypt cost 12，校验至少 12 个字符和 bcrypt 72 字节边界。
- 注册与登录创建 30 天不透明 Redis 会话，并设置 HttpOnly、SameSite=Lax Cookie；生产环境自动启用 Secure。
- API 组合根使用惰性 PostgreSQL/Redis 连接，健康检查保持进程级探针。

### 验证结果

- 聚焦认证测试：4 个测试文件、12 个测试全部通过。
- 全仓测试：26 个测试文件、185 个测试全部通过。
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck` 和 `git diff --check` 全部通过。
- Prisma Schema、完整迁移契约和 API 生产构建全部通过。

## 2026-07-30：完成任务 3.2 双家长邀请

- 记录 ID：`FS-DEV-015`
- 阶段：Phase 1，任务 3.2
- 分支：`dev`
- 依据：MVP 开发决策 §9、§13；PRD §2.2、§2.4、§4.7、§5.1

### 完成结果

- 新增创建者邀请与公开接受接口，邀请令牌有效 7 天，数据库只保存 SHA-256 哈希。
- 家庭行锁串行化创建者校验、两位活跃家长上限和邀请接受；第二位家长以同家庭 `PARENT` 身份加入。
- 同家庭规范化邮箱待处理邀请保持唯一，重复请求复用邀请记录并轮换令牌。
- 家庭邮件配置为 `VERIFIED` 时，邀请与邮件请求 Outbox 事件同事务提交；其余状态返回可复制邀请链接。
- 接受邀请复用家长 bcrypt cost 12 密码策略，并在数据库提交后创建新的 30 天会话 Cookie。
- 新增邀请部分唯一索引和状态一致性 CHECK，并纳入数据模型契约验证。

### 验证结果

- 聚焦认证测试：5 个测试文件、21 个测试全部通过。
- 全仓测试和覆盖率：27 个测试文件、194 个测试全部通过；statements 与 lines 为 98.77%、branches 为 98.83%、functions 为 100%。
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck` 和 `git diff --check` 全部通过。
- Prisma Schema、完整迁移契约和 API 生产构建全部通过。

### 后续工作

任务 3.3 实现孩子档案 CRUD、头像选择、PIN/密码模式和家庭内账号切换。

## 2026-07-30：完成任务 3.3 孩子档案与账号切换

- 记录 ID：`FS-DEV-016`
- 阶段：Phase 1，任务 3.3
- 分支：`dev`
- 依据：MVP 开发决策 §5、§9、§14；PRD §2.2、§4.7、§5.2

### 完成结果

- 新增家长会话保护的孩子档案列表、创建、修改和软删除接口，所有仓储操作固定家庭、孩子角色与活动状态。
- 支持昵称、性别、生日、年级和头像媒体；头像只接受同家庭 `READY` 且未删除的媒体。
- PIN 模式校验 4 至 6 位纯数字，密码模式校验至少 6 个字符且含字母，两者均使用 bcrypt cost 12 并保护 72 字节边界。
- 新增家庭切换目标和孩子切换接口，家长或孩子会话可在同家庭内选择孩子，通过凭据后替换为孩子会话 Cookie。
- Redis 会话载荷扩展为 `parent | child`，邀请服务同步增加家长角色校验。
- 新增用户角色凭据一致性与孩子 bcrypt cost 12 CHECK，并纳入完整迁移历史契约验证。

### 验证结果

- 聚焦认证测试：8 个测试文件、34 个测试全部通过。
- 全仓测试和覆盖率：30 个测试文件、207 个测试全部通过；statements 与 lines 为 90.27%、branches 为 87.14%、functions 为 94.06%。
- `family-auth` statements 与 lines 为 81.18%，认证源码已纳入 V8 门禁。
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`git diff --check`、Prisma Schema、迁移契约和 API 生产构建全部通过。

### 后续工作

任务 3.4 实现孩子失败锁定、登录限流、滚动会话和凭据变更后的会话撤销。

## 2026-07-30：完成任务 3.4 认证锁定与滚动会话

- 记录 ID：`FS-DEV-017`
- 阶段：Phase 1，任务 3.4
- 分支：`dev`
- 依据：MVP 开发决策 §5、§9、§14；PRD §2.2、§8.2

### 完成结果

- 孩子连续 5 次凭据失败后锁定 15 分钟，响应提供剩余秒数，成功验证清零失败状态。
- 认证状态通过家庭范围、活动孩子与 `User.version` 乐观条件更新，避免并发失败计数丢失。
- 孩子切换按家庭与孩子执行 10 次/15 分钟 Redis 固定窗口，超限响应提供重试秒数。
- 家长和孩子有效会话读取滚动 Redis 30 天 TTL，已认证路由同步续期浏览器 Cookie。
- Redis 主体 revision 支持常数复杂度批量撤销；孩子凭据变更或软删除后旧会话失效。

### 验证结果

- 聚焦认证与 Redis 测试：12 个测试文件、71 个测试全部通过。
- 全仓测试和覆盖率：31 个测试文件、215 个测试全部通过；statements 与 lines 为 90.73%、branches 为 87.25%、functions 为 94.44%。
- `family-auth` statements 与 lines 为 82.86%。
- 格式、零警告 Lint、严格类型检查、Prisma Schema、迁移契约和 API 生产构建全部通过。

### 后续工作

任务 3.5 实现家庭时区、打卡截止、补打卡、审核、免审批额度和 Streak 倍率设置服务。

## 2026-07-30：完成任务 3.5 家庭规则设置服务

- 记录 ID：`FS-DEV-018`
- 阶段：Phase 1，任务 3.5
- 分支：`dev`
- 依据：MVP 开发决策 §2、§5、§9、§14；PRD §3.1、§4.1.4、§4.1.5、§4.2

### 完成结果

- 新增家长会话保护的 `GET /api/v1/family/settings` 与 `PATCH /api/v1/family/settings`，两位家长同权且家庭边界只来自会话。
- 实现 IANA 时区、严格 `HH:mm` 截止时间、非负安全整数设置和固定六档 Streak 倍率校验。
- 读取时为 `{}`、缺字段或损坏字段补齐默认值；部分更新保存完整规范 JSONB，并保留播报开关等无关字段。
- 新增 Prisma 仓储与 API 生产组合，继续复用 `Family.settings` JSONB，无需数据库结构迁移。
- 家庭设置成功响应复用滚动 30 天会话并续期 Cookie。

### 验证结果

- 聚焦家庭设置测试：3 个测试文件、10 个测试全部通过。
- 全仓测试和覆盖率：34 个测试文件、225 个测试全部通过；statements 与 lines 为 90.39%、branches 为 86.13%、functions 为 94.67%。
- `family-settings` statements 与 lines 为 86.85%。
- 格式、零警告 Lint、严格类型检查、Prisma Schema、迁移契约、差异空白检查和 API 生产构建全部通过。

### 后续工作

任务 3.6 验证家庭初始化原子性、双家长邀请、PIN 锁定和会话撤销的阶段集成路径。

## 2026-07-30：完成任务 3.6 阶段 3 认证集成测试

- 记录 ID：`FS-DEV-019`
- 阶段：Phase 1，任务 3.6
- 分支：`dev`
- 依据：MVP 开发决策 §3、§5、§9、§14；PRD §2.2、§2.4、§8.2

### 完成结果

- 新增阶段 3 跨服务集成测试，组合真实家长认证、双家长邀请、孩子账号、Redis 会话和固定窗口限流服务。
- 使用 copy-on-write 数据库状态验证家庭默认等级写入失败时，家庭、创建者、5 种任务类型和等级配置整体回滚。
- 验证已配置邮件的第二家长邀请与 Outbox 邮件事件原子提交，并可在同家庭接受第二位家长。
- 验证连续 5 次错误 PIN 通过乐观版本持久化失败状态，并锁定当前孩子 15 分钟。
- 验证孩子凭据变更递增主体 revision，使旧会话失效，同时允许新凭据创建并读取新会话。

### 验证结果

- 阶段 3 聚焦集成测试：1 个测试文件、4 个测试全部通过。
- 全仓测试和覆盖率：35 个测试文件、229 个测试全部通过；statements 与 lines 为 90.39%、branches 为 87.01%、functions 为 94.67%。
- `family-auth` statements 与 lines 为 82.86%。
- 格式、零警告 Lint、严格类型检查、Prisma Schema、迁移契约、差异空白检查和全工作区生产构建全部通过。
- 生产构建后通过受管终端 `term_1785435289194_13` 重启 Web 与 API；本地首页返回 200，本地及平台预览同源 `/api/v1/health` 均返回 `status: ok`。
- 平台预览地址为 `https://3000-a9c18acafb19a352.monkeycode-ai.online`，预览代理连接检测通过。

### 运行边界

当前集成测试验证领域服务与端口之间的状态协作。真实 PostgreSQL 行锁、CHECK 约束、Redis 服务端和 Docker 并发运行态由任务 11 验证。

### 后续工作

 阶段 4 从任务 4.1 开始，实现家庭任务类型列表、预设覆盖、自定义类型 CRUD 和关联删除保护。

## 2026-07-31：开始阶段 4 任务与周期调度

- 记录 ID：`FS-DEV-020`
- 阶段：Phase 1，阶段 4（任务 4.1-4.6）
- 分支：`dev`
- 依据：MVP 开发决策 §3、§4、§9；PRD §4.1.1-§4.1.7、§4.5
- 范围：家庭任务类型、任务 CRUD 与状态、孩子分配覆盖、频率计算、家庭时区截止和补打卡窗口、协作周期与调度幂等。
- 4.1 验收标准：家长可读取和维护家庭类型；预设副本支持覆盖；自定义类型支持创建、修改和软删除；预设类型和有关联活动任务的类型返回冲突并保留数据。
- 计划验证：先执行任务类型服务、仓储和路由测试，再执行阶段四聚焦测试、全仓测试、类型检查、Lint、格式、Prisma 校验和生产构建。

### 完成结果

- 完成家庭任务类型列表、预设覆盖、自定义类型 CRUD、默认验收方式和活动任务引用删除保护。
- 完成任务创建、编辑、启用、停用和不可恢复归档，支持提交说明、五种打卡方式、两种验收方式、基础积分和单人/协作模式。
- 完成多孩子分配及逐孩积分、频率、打卡方式、验收方式和日期范围覆盖；协作任务强制至少两名不同孩子。
- 完成每日、每周 N 次、指定星期和日期范围频率计算，按家庭时区生成 UTC 截止时间并计算补打卡窗口。
- 完成协作周期、参与者与奖励积分快照生成；日期派生周期编号、数据库唯一约束和冲突后读取共同保证幂等。
- API 组合根已接入任务类型和任务路由；调度 Prisma 适配器已就绪，任务 11 的 Worker 将负责周期作业启动和分布式锁。

### 验证结果

- 阶段 4 聚焦测试：5 个测试文件、16 个测试全部通过。
- 全仓测试和覆盖率：40 个测试文件、245 个测试全部通过；statements 与 lines 为 79.39%、branches 为 81.79%、functions 为 92.98%。
- 格式、零警告 Lint、严格类型检查、Prisma Schema、迁移契约、差异空白检查和全工作区生产构建全部通过。

### 后续工作

阶段 5 从任务 5.1 开始，实现单人/协作打卡与腾讯云 COS 媒体流程。

## 2026-07-31：完成阶段 5 打卡与腾讯云 COS 媒体流程

- 记录 ID：`FS-DEV-021`
- 阶段：Phase 1，阶段 5（任务 5.1-5.6）
- 分支：`dev`
- 依据：MVP 开发决策 §2、§4、§6、§9、§13；PRD §4.1、§4.5、§6.2、§8.2

### 完成结果

- 完成五种打卡内容校验、单人提交、家庭日期窗口、AUTO/MANUAL 状态和家庭范围幂等。
- 完成 `REJECTED` 重提，并以不可变 attempt 保存每次内容、媒体顺序和前次审核快照。
- 完成协作参与者独立提交、最新状态读取和已通过参与者状态保护。
- 完成家庭 COS 凭证请求内解密、V5 签名、multipart 初始化、分片授权与确认、完成、失败恢复和私有读 URL。
- 完成声明阶段视频时长校验，以及服务端 COS 对象读取、MIME、文件签名、大小、SHA-256、`READY` 状态和家庭所有权校验。
- 新增打卡 attempt、媒体上传会话和分片模型及 `20260731100000_add_checkin_attempts_and_media_uploads` 迁移。

### 验证结果

- 阶段 5 聚焦测试覆盖打卡服务、内容规则、媒体服务、COS 客户端和 HTTP 集成路径。
- 全仓覆盖率测试：45 个测试文件、270 个测试全部通过；statements 与 lines 为 78.08%、branches 为 79.87%、functions 为 91.41%。
- Prisma Schema 与迁移历史契约通过；格式、零警告 Lint、严格类型检查、差异空白检查和全工作区生产构建全部通过。

### 运行边界

当前测试使用状态型内存 I/O 适配器验证领域和 HTTP 协作。真实 PostgreSQL 事务竞争、Redis 服务端、Docker 和腾讯云 COS 运行态由任务 11 与任务 12 验证。

### 后续工作

阶段 6 从任务 6.1 开始，实现家长审核、超时自动通过、积分账本、Streak 与等级。

## 2026-07-31：开始阶段 6 审核、积分、Streak 与等级

- 记录 ID：`FS-DEV-022`
- 阶段：Phase 1，阶段 6（任务 6.1-6.6）
- 分支：`dev`
- 依据：MVP 开发决策 §2、§4、§9；PRD §4.1.5、§4.2、§4.3、§4.5
- 范围：家长审核与历史、审核超时、积分账本与乐观锁、Streak 倍率、协作统一发分、等级派生与权益读取。
- 6.1 验收标准：家长可通过或填写原因打回单人及协作提交；审核历史可追溯；Redis owner-lock、条件更新和数据库幂等键共同处理并发审核。
- 计划验证：依次执行审核领域单元与 HTTP 测试、Prisma Schema 与迁移契约检查，再执行阶段 6 聚焦测试和全仓质量门禁。

### 任务 6.1 完成里程碑

- 完成单人打卡与协作提交的家长通过、带原因打回及按审核时间升序的历史查询。
- 完成家庭级审核幂等、目标级 10 秒 Redis owner-lock、锁内幂等复查、Prisma 事务条件更新和唯一冲突收敛。
- 新增 `SubmissionReview`，将审核记录绑定到单人或协作的具体 attempt，并保存决策、原因、审核人和审核时间。
- 新增 `20260731110000_add_submission_reviews` 迁移，以目标一致性和拒绝原因 CHECK、attempt 唯一键及家庭幂等键保护审核历史。
- API 组合根已接入四个审核路由；审核写入和历史读取均要求有效家长会话。

### 任务 6.1 验证结果

- 全仓测试：48 个测试文件、283 个测试全部通过。
- 严格类型检查、全工作区生产构建、零警告 Lint、格式检查、Prisma validate 和 data-model contract 全部通过。
- 下一任务为 6.2 审核超时自动通过；任务 6.2 至 6.6 的实现保持后续范围。

### 任务 6.2 完成里程碑

- 新增有界 `SubmissionReviewTimeoutService.runBatch()`，按每条候选所属家庭的审核超时设置和最新 attempt 提交时间执行自动通过；设置为 0 时跳过。
- 单人和协作候选复用家长审核的目标级 10 秒 Redis owner-lock，并以目标类型和 attempt ID 生成确定性超时幂等键。
- Prisma 自动审核事务再次核对 latest attempt，只条件更新 `PENDING` 聚合；家长抢先审核、重提、锁竞争、重复执行和唯一冲突均安全跳过。
- `SubmissionReview` 增加 `PARENT | TIMEOUT` 来源，超时记录使用空 reviewer；SQL CHECK 保护来源与 reviewer 一致性。
- API 组合根已创建可复用单批执行器，周期 Worker 生命周期保留给任务 11.1，积分写入保留给任务 6.3。

### 任务 6.2 验证结果

- 审核聚焦测试：4 个测试文件、24 个测试全部通过。
- 全仓测试：49 个测试文件、295 个测试全部通过。
- 严格类型检查、全工作区生产构建、零警告 Lint、格式检查、Prisma validate、data-model contract 和差异空白检查全部通过。
- 当前环境没有 PostgreSQL 与 Redis 服务端，真实运行态竞争验证保留给任务 11。

### 任务 6.3 完成里程碑

- 新增纯积分变化规则，覆盖 EARN、REDEEM、REFUND、MANUAL 的方向、双余额、非负余额和 PostgreSQL 整数边界。
- 新增 `PrismaPointsTransactionWriter`，以 `(EARN, check_in, checkInId, childId)` 业务键幂等写入 `PointsLog`，同步更新当前余额、累计获得积分、用户版本和 CheckIn 积分快照。
- 用户余额更新同时限定 ID、家庭、版本和活动状态；完整业务事务最多尝试 3 次，持续竞争产生可重试 `CONFLICT`。
- `PointsLog.create()` 的 P2002 在事务回滚后通过主 Prisma client 确认既有流水，再安全重放状态回调。
- 单人 AUTO 提交、家长 `APPROVED` 和超时 `APPROVED` 已接入共享积分事务；`REJECTED` 和协作审核不发放任务 6.3 积分。
- 状态、审核历史、双余额、积分流水、CheckIn 快照和 `points.balance.changed.v1` Outbox 共享同一 transaction client，事件失败触发整体回滚。
- 基础积分使用 assignment 自定义值优先于 task 基础值；当前 Streak 倍率固定为 1，动态倍率保留给任务 6.4。

### 任务 6.3 验证结果

- 积分与审核聚焦测试：4 个测试文件、21 个测试全部通过。
- 全仓测试和覆盖率：52 个测试文件、308 个测试全部通过；statements 与 lines 为 78.84%、branches 为 80.31%、functions 为 91.8%。
- 积分目录 statements 与 lines 为 97.16%、branches 为 86.2%、functions 为 100%。
- Prisma Client 生成、全工作区严格类型检查、生产构建、零警告 Lint、格式检查、Prisma validate、data-model contract 和差异空白检查全部通过。
- 当前环境没有 PostgreSQL 与 Redis 服务端，真实数据库竞争和 CHECK 运行态验证保留给任务 11。

### 任务 6.4 完成里程碑

- `calculateStreakAward()` 按奖励日期和家庭固定六档配置计算连续自然日；当前日期自动计入、同日活动去重、遇断档停止，并以 `Math.round` 生成整数积分。
- Streak 活动日期同时来自截至奖励日的已通过单人打卡和已完成协作周期；单人 AUTO、家长 `APPROVED` 与超时 `APPROVED` 均改为动态倍率发分。
- 协作 AUTO、家长审核和超时审核在每次通过后尝试完成周期；只有全部活动参与者提交均为 `APPROVED` 时，才条件更新周期为 `COMPLETED`。
- 协作周期完成、`check-in.collaboration.completed.v1` Outbox、逐参与者 EARN、双余额、`points.balance.changed.v1` Outbox 和奖励快照均位于同一 `Serializable` 事务。
- 每个活动参与者按 `rewardPointsSnapshot` 计算实得积分，并以 `(EARN, collaboration_round, roundId, childId)` 业务键幂等写入；实得积分和倍率保存到参与者 `pointsEarned`、`streakMultiplier`。
- 新增 `20260731120000_add_collaboration_awards` 迁移，为协作参与者增加实得积分与倍率字段，并以 CHECK 约束两列同时为空或同时为正。

### 任务 6.4 验证结果

- 全仓测试和覆盖率：52 个测试文件、318 个测试全部通过；statements 与 lines 为 79.39%、branches 为 80.5%、functions 为 92%。
- 积分目录 statements 与 lines 为 96.53%、branches 为 86.02%、functions 为 100%。
- 全工作区严格类型检查、零警告 Lint、格式检查、生产构建、Prisma validate、data-model contract 和差异空白检查全部通过。
- 当前环境没有 PostgreSQL 与 Redis 服务端，真实数据库竞争和 CHECK 运行态验证保留给任务 11。

### 任务 6.5 完成里程碑

- 新增等级纯派生规则，使用累计获得积分和家庭 `LevelConfig` 计算最高资格等级，并以缓存等级与资格等级最大值保证只升不降。
- 新增孩子本人和家长家庭范围等级读取服务，返回当前配置、下一等级进度、兑换折扣、等级免审批额度、有效额度、许愿槽位和扩展维度。
- 新增 `GET /api/v1/levels/me` 与 `GET /api/v1/family/children/:childId/level`，接入会话角色校验、家庭隔离、snake_case 输出和 Cookie 续期。
- EARN 积分事务使用变化后的累计积分同步 `User.currentLevel`；跨越一个或多个阈值时同事务追加单个 `levels.level.advanced.v1` Outbox 事件。
- 覆盖率配置已纳入 `apps/api/src/levels/**/*.ts`。

### 任务 6.5 验证结果

- 等级与积分聚焦测试：5 个测试文件、26 个测试全部通过。
- 全仓测试和覆盖率：56 个测试文件、335 个测试全部通过；statements 与 lines 为 80.13%、branches 为 81.04%、functions 为 92.41%。
- 等级目录 statements 与 lines 为 95.25%、branches 为 89.28%、functions 为 100%。
- Prisma Client 生成、全工作区严格类型检查、生产构建、零警告 Lint、格式检查、Prisma validate、data-model contract 和差异空白检查全部通过。

### 任务 6.6 与阶段 6 完成里程碑

- 新增确定性属性与竞态测试，覆盖并发审核仅一个请求进入仓储、1 至 72 小时超时精确边界及边界前 1ms、25 个重复积分业务键和 0 至 2 次乐观冲突后成功。
- 新增 1 至 120 天 Streak 档位、250 组 EARN 双余额不变量，以及 20 个缓存等级与积分增长组合的等级单调性验证。
- 属性测试发现审核服务在 `try/finally` 内直接返回仓储 Promise 时会提前释放 Redis owner-lock；服务改为等待仓储写入完成后释放锁，使锁覆盖完整审核事务。

### 任务 6.6 与阶段 6 验证结果

- 属性与竞态聚焦测试：5 个测试文件、45 个测试全部通过，且无未处理 Promise 拒绝。
- 全仓测试和覆盖率：56 个测试文件、345 个测试全部通过；statements 与 lines 为 80.13%、branches 为 81.04%、functions 为 92.41%。
- 积分目录 statements 与 lines 为 96.81%、branches 为 86.45%、functions 为 100%；等级目录 statements 与 lines 为 95.25%、branches 为 89.28%、functions 为 100%。
- Prisma Client 生成、全工作区严格类型检查、生产构建、零警告 Lint、格式检查、Prisma validate、data-model contract 和差异空白检查全部通过。
- 阶段 6 的任务 6.1 至 6.6 全部完成；下一阶段为奖励池、库存、兑换与愿望闭环。

### 阶段 6 预览验证

- 受管后台终端 `term_1785467411145_14` 持续运行 `pnpm --dir /workspace dev`，Web 与 API 分别监听 3000 和 3001。
- 本地首页返回 200；API 直连和 Web 同源 `/api/v1/health` 均返回 `status: ok`。
- 平台预览地址 `https://3000-a9c18acafb19a352.monkeycode-ai.online` 可访问，预览连接探针未返回代理错误标记。

## 2026-07-31：开始阶段 7 奖励、兑换与愿望闭环

- 记录 ID：`FS-DEV-023`
- 阶段：Phase 1，阶段 7（任务 7.1-7.6）
- 分支：`dev`
- 依据：MVP 开发决策 §1、§2、§9；PRD §4.3、§4.4、§5.2
- 范围：奖励 CRUD、上下架、图片与资格、折扣和免审批、库存预占、幂等兑换预扣、审批兑现退款、愿望槽位与采纳。
- 原子性基线：兑换申请在同一 `Serializable` 事务内校验资格与库存、预占库存、创建兑换、预扣余额、写入积分流水和 Outbox；拒绝退款只恢复当前余额并释放预占库存。
- 计划验证：逐项执行纯逻辑、服务、Prisma 仓储、HTTP 与积分 writer 聚焦测试，再执行全仓覆盖率、类型、Lint、格式、构建、Prisma 和迁移契约门禁。

### 任务 7.1-7.5 实现结果

- 新增 `src/rewards/` 领域模块，完成奖励 CRUD、上下架、家庭 READY IMAGE 关联、整数价格、四类奖励、等级门槛、日周月频次与库存配置。
- 兑换按当前等级折扣四舍五入计算实付，并以家庭额度与等级额度最大值判断自动审批；申请使用家庭级幂等键和孩子/奖励 request fingerprint。
- `PrismaPointsTransactionWriter` 新增 REDEEM 与 REFUND，复用用户版本乐观锁、最多 3 次 `Serializable` 重试、PointsLog 和余额变化 Outbox；两类变动只更新当前余额。
- 兑换状态机覆盖待审批、已批准待兑现、已兑现和拒绝退款；有限库存申请时原子预占，兑现转为消耗，拒绝释放预占。
- 愿望按当前等级权益限制 ACTIVE 槽位，响应实时计算余额进度；孩子可取消，家长可在同一事务内采纳为奖励。

### 阶段 7 审查与修复

- 审查发现库存预占使用旧计数快照会让有剩余库存的并发申请产生伪冲突，改为带可用量谓词的数据库单条条件更新；最后一件库存竞争统一返回售罄冲突。
- 审查发现有限与无限库存模式在未完成兑换期间切换会失去预占归属，更新奖励时新增待审批、待兑现和现有预占检查。
- 迁移在添加愿望状态约束前按历史 `updated_at` 回填取消与采纳时间，并增加每个兑换最多一次 REFUND 的部分唯一索引。

### 任务 7.6 与阶段 7 验证结果

- 奖励领域聚焦测试：4 个测试文件、43 个测试全部通过。
- 全仓测试和覆盖率：61 个测试文件、393 个测试全部通过；statements 与 lines 为 79.52%、branches 为 78.82%、functions 为 90.87%。
- 全工作区严格类型检查、零警告 Lint、格式检查、生产构建、Prisma validate、Prisma Client 生成、data-model contract 和差异空白检查全部通过。
- 阶段 7 的任务 7.1 至 7.6 全部完成；下一阶段为家长端 9 个响应式页面。

### 阶段 7 预览验证

- 受管后台终端 `term_1785467411145_14` 持续运行 `pnpm --dir /workspace dev`，Web 与 API 分别监听 3000 和 3001。
- 本地首页返回 200；API 直连和 Web 同源 `/api/v1/health` 均返回 `status: ok`。
- 平台预览地址 `https://3000-a9c18acafb19a352.monkeycode-ai.online` 返回 200，预览连接探针未返回代理错误标记。
