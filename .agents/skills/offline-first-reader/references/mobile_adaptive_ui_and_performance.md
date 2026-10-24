# 移动端自适应控制台、视口适配与性能守恒指南 (Mobile Adaptive UI & Performance Guide)

本参考文档规定了在手机触控窄屏与高频状态变迁（如朗读游标高亮、虚拟键盘弹起）场景下，保障阅读交互**防误触、零挤压错位、视口避让与 60fps 丝滑渲染**的前端实现规范。

---

## 1. 移动端“高频主行 + ⋯ 更多二级展开”控制栏收纳

### 痛点根因
在桌面端，段落工具栏拥有充足的水平宽度（可容纳 6~8 个按钮）。但在 375px 甚至 320px 的移动设备上，若平铺展示所有按钮：
- 极易导致工具栏被迫折行，遮挡正文上方多行文本；
- 或者按钮被水平压缩，破坏推荐的 36px/44px 防误触点击热区。

### 解决方案：二阶自适应分流 (`VirtualPager.tsx`)
1. **主行快捷键（常驻高频操作，≤ 4 个）**：
   - 【🔊 朗读】、【译 翻译】、【🔍 句读】与【⋯ 更多】；
2. **二级折叠行（按需展开低频操作）**：
   - 轻点【⋯ 更多】在下方平滑滑出二级抽屉：【🎧 段落听写】、【🔖 书签】与【📝 随笔】；
3. **触控与热区规范**：
   - 每个操作按钮最小尺寸维持 `min-w-[36px] min-h-[36px]`；
   - 点词查词与工具栏展开事件严格隔离（`e.stopPropagation()`）。

---

## 2. 移动端动态视口高度与软键盘避让 (`100dvh`)

### 痛点根因
在移动端 Safari 或 Chrome 中，当用户聚焦单句听打输入框或生词笔记框时，系统软键盘会突然弹起并占据屏幕下半部分（约 40% 视口高度）。
- 若外层容器使用传统 `100vh`，底部的“校对答案”、“加入生词本”及输入框会被键盘直接顶出视口或遮挡在键盘背后，用户无法看清自己输入的内容；
- 移动端顶栏与底栏的动态伸缩也会导致 `100vh` 产生多余滚动条。

### 规范实现
全屏弹窗与精读工坊外壳统一采用 **动态视口高度（Dynamic Viewport Height, `dvh`）**：

```tsx
<div className="fixed inset-0 z-50 flex flex-col bg-background h-[100dvh] max-h-[100dvh] overflow-hidden">
  {/* 顶部标题栏 (固定) */}
  <header className="flex-shrink-0 h-14 border-b px-4 flex items-center justify-between">
    ...
  </header>

  {/* 中间自适应滚动区 */}
  <main className="flex-1 overflow-y-auto px-4 py-3">
    ...
  </main>

  {/* 底部输入框与操作栏 (固定附着在软键盘顶端，防遮挡) */}
  <footer className="flex-shrink-0 border-t p-3 bg-muted/30 pb-[env(safe-area-inset-bottom,12px)]">
    ...
  </footer>
</div>
```

---

## 3. UI 矢量图标纯净化契约 (SVG Single-Layer Icon)

### 痛点根因
在跨平台开发中，若在按钮内部既放置了 Unicode 符号（如 `▶`, `❚❚`, `🔍`）作为占位符，随后又引入了 Lucide React 矢量图标组件（`<Play />`），在部分 Android 字体或 iOS 字体下会渲染出幽灵般的“双重重叠图标”，严重破坏产品质感。

### 规范契约
- **绝对禁止**在按钮内容中混写 Unicode 几何字符与 SVG 图标；
- 所有交互按钮**强制统一使用 Lucide React 纯 SVG 矢量图标**；
- 按钮若包含文本，严格遵循 `[<Icon className="w-4 h-4 mr-1.5" /> 标签文字]` 格式，保持单层干净渲染。

---

## 4. 朗读高亮 60fps 性能守恒：React.memo 与细粒度 Selector

### 痛点根因
Edge TTS 朗读时，播放游标每秒可能更新 10~20 次（驱动段落或句子的高亮呼吸灯）。如果 VirtualPager 的整页所有段落都重新渲染，低端设备或长章节页面会出现明显的掉帧与输入卡顿。

### 规范实践
1. **行组件原子化与 `React.memo` 浅比较**：
   ```tsx
   export const ParagraphRow = React.memo(
     function ParagraphRow(props: ParagraphRowProps) { ... },
     (prev, next) => {
       // 仅当激活态、翻译内容、书签状态或笔记发生实质改变时才触发重绘
       return (
         prev.isActive === next.isActive &&
         prev.isBookmarked === next.isBookmarked &&
         prev.translation === next.translation &&
         prev.noteCount === next.noteCount &&
         prev.paragraph.id === next.paragraph.id
       );
     }
   );
   ```
2. **Zustand 细粒度原子切片 Selector**：
   - 严禁全局解构：`const { activeParagraphId, ... } = useReaderStore();`（这会导致 Store 任意属性变动引发组件重绘）；
   - 必须使用原子选择器：`const isActive = useReaderStore(s => s.activeParagraphId === paragraph.id);`。
