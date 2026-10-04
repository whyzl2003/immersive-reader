# 实施方案：Shadcn UI 引入与“极简羊皮纸”风格定制

## 1. 基础架构
- **框架**：Next.js 16 (App Router, TypeScript)
- **样式方案**：Tailwind CSS v4
- **组件规范**：Shadcn UI (基于 Radix UI，Neutral 基色，CSS 变量控制)

## 2. 已安装的核心组件
- **交互与容器**：
  - [button.tsx](file:///Users/whyzl2003163.com/desktop/reader/components/ui/button.tsx)
  - [card.tsx](file:///Users/whyzl2003163.com/desktop/reader/components/ui/card.tsx)
  - [tabs.tsx](file:///Users/whyzl2003163.com/desktop/reader/components/ui/tabs.tsx)
  - [scroll-area.tsx](file:///Users/whyzl2003163.com/desktop/reader/components/ui/scroll-area.tsx)
- **浮层与反馈**：
  - [popover.tsx](file:///Users/whyzl2003163.com/desktop/reader/components/ui/popover.tsx)
  - [dialog.tsx](file:///Users/whyzl2003163.com/desktop/reader/components/ui/dialog.tsx)
  - [sonner.tsx](file:///Users/whyzl2003163.com/desktop/reader/components/ui/sonner.tsx) / [toast.tsx](file:///Users/whyzl2003163.com/desktop/reader/components/ui/toast.tsx)
- **数据录入**：
  - [input.tsx](file:///Users/whyzl2003163.com/desktop/reader/components/ui/input.tsx)
  - [textarea.tsx](file:///Users/whyzl2003163.com/desktop/reader/components/ui/textarea.tsx)

## 3. “极简羊皮纸”主题调色体系（[globals.css](file:///Users/whyzl2003163.com/desktop/reader/app/globals.css)）
- **浅色模式（羊皮纸经典暖白）**：
  - 背景色（Background）：`#fdf6e3`（柔和低刺激）
  - 前景文本（Foreground）：`#2d261e`（低对比深炭灰褐色，替代刺眼纯黑）
  - 卡片表面（Card）：`#f7ebd0`（略深的微暖沉淀色）
  - 弹窗浮层（Popover）：`#fff9ed`（通透干净但保留暖意）
  - 主色强调（Primary）：`#8c4a16` / `#b85d19`（古典暖皮革/琥珀棕）
  - 边框细节（Border）：`#e3d2b9`（柔润纸边色）
- **深色模式（深夜墨石护眼调）**：
  - 背景色（Background）：`#131518`（沉稳暗黑灰，非死黑）
  - 前景文本（Foreground）：`#e2ded6`（柔和灰乳白）
  - 卡片表面（Card）：`#1c1f24`
  - 弹窗浮层（Popover）：`#1f232a`
  - 主色强调（Primary）：`#d97736`（暗夜暖金琥珀）
  - 边框细节（Border）：`#2e343e`

## 4. 全局 Toast 容器挂载（[layout.tsx](file:///Users/whyzl2003163.com/desktop/reader/app/layout.tsx)）
- 在 `app/layout.tsx` 挂载 `<Toaster position="top-right" richColors />`，已配置双向导入兼容。
