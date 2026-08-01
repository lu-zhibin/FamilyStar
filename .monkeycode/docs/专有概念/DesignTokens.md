# FamilyStar Design Tokens

FamilyStar Design Tokens 是孩子端与家长端共享的视觉契约。所有值均根据 v5 设计交接独立实现，页面通过 CSS 变量和 Tailwind theme 使用同一来源。

## 代码位置

| 方面 | 位置 |
|---|---|
| CSS 变量与基础样式 | `apps/web/app/globals.css` |
| Tailwind theme | `apps/web/tailwind.config.cjs` |
| 字体变量 | `apps/web/app/layout.tsx` |
| 配置契约校验 | `apps/web/scripts/verify-design-system.cjs` |

## Token 组

- 颜色：奶油、沙色、木色、叶绿、暖黄、橙色、珊瑚色、天空蓝、粉色、红色和棕色语义组。
- 圆角：16px 标准卡片与按钮、18px 大按钮、20px 大卡片与胶囊。
- 阴影：标准暖色、大卡片暖色、橙色按钮和按下状态。
- 字号：12、13、14、15、16、18、20、24、28px 九级阶梯。
- 字体：Fredoka 用于品牌与展示标题，Nunito 用于正文和控件。

## 响应式契约

| 区间 | 宽度 | 基础布局 |
|---|---|---|
| mobile | 小于 768px | 单列、16px 页面留白 |
| tablet | 768px 至 1024px | 双列能力、20px 页面留白 |
| desktop | 大于 1024px | 多列能力、最大 1200px 容器 |

页面支持 320px 至 2560px 宽度。具体页面网格和导航行为由家长端与孩子端页面任务实现。

## 使用约束

1. 页面和组件优先使用 Tailwind 语义 Token，避免散落原始色值。
2. CSS 变量负责跨 Tailwind 与原生 CSS 共享的值。
3. 新增或修改 Token 时同步更新配置校验和本页。
4. Lucide 装饰图标使用 `aria-hidden`，传达语义的图标提供可访问名称。
