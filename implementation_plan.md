# 实施方案：🔍 句读（Sentence Reader 精读台）2.0 终极满配升级

## 功能设计概述

在 **🔍 句读（Sentence Reader）** 既有逐句精读、多档变速跟读与单句盲听听打三色 Diff 的基础上，一次性集成 **【🎙️ 原声跟读对比】**、**【✂️ 意群断句与主干透视】**、**【⭐ 金句一键收藏】** 与 **【⌨️ 全键盘极客操控】** 四大核心能力。

---

## 核心模块实施细节

### 1. 🎙️ 原声跟读对比（Echo Shadowing 录音与连播，`src/components/VirtualPager.tsx`）
- **纯前端录音采集**：通过 `navigator.mediaDevices.getUserMedia({ audio: true })` 与 `MediaRecorder` 实现单句跟读录音；录音期间按钮切换为红色呼吸态 `[⏹ 结束录音 (录音中...)]`。
- **生命周期内存管理**：录音停止后组装为本地 `Blob URL` 存入组件状态，并在切换上下句（`handleStepSentence`）、收起句读面板（`handleToggleSentenceReader`）、翻页或组件卸载时自动调用 `URL.revokeObjectURL` 清理释放内存。
- **双模式回放与回声对比法（Echo Method）**：
  - `[▶️ 听我的发音]`：单独回放用户录制的跟读音频。
  - `[🔄 原音+我的对比]`：先调用 Ava 神经元语音（按当前设定语速）朗读原句，在 `onEnd` 回调触发瞬间无缝接力播放用户刚刚录下的跟读音频。
- **容错提示**：若设备无麦克风或拒绝权限，温和提示 `"未能获取麦克风权限，请检查浏览器设置"`。

### 2. ✂️ 意群斜杠断句与主干透视（Chunking & Core Highlight，`src/lib/tokenizer.tsx` & `src/components/VirtualPager.tsx`）
- **顶部状态栏开关**：在语速下拉框旁新增 `[✂️ 意群断句]` 切换按钮（激活时高亮）。
- **意群停顿标记**：在常见从句引导词（`that`, `which`, `who`, `where`, `when`, `because`, `although`, `so that`, `if`, `as`, `while` 等）、长介词短语边界前，以及句中逗号、分号、冒号、破折号后动态插入柔和的古铜金斜杠标记 ` / `（`text-amber-600/80 dark:text-amber-400/85 font-sans font-bold mx-1.5 select-none`）。
- **插入语弱化（主干透视）**：自动识别句中成对破折号（`– ... –` / `— ... —`）及双逗号之间的短插入语（如 `, even standing on tiptoes,`、`, too,`），将其包裹为 `opacity-65 italic`，使主谓宾主干一目了然。
- **100% 保留查词与词源**：`renderChunkedSentence` 内部对所有英文单词依然包裹 `<InteractiveWord>`，确保点击任意单词查词与看词源功能 100% 正常可用。

### 3. ⭐ 金句一键收藏（打通“📒 我的笔记”，`src/components/VirtualPager.tsx`）
- 在句读面板右上角新增 `[⭐ 收藏本句]` 按钮（已收藏时高亮显示为 `[🌟 已收藏]`）。
- 点击后调用 `useReaderStore` 的 `addNote` 方法，将该英文单句作为引用的原文语境（`context`），若已展开或缓存了该单句的中文译文，则将中文译文连同 `【✨ 句读金句收藏】` 标签一起存入笔记正文，并绑定当前 `bookId`、`bookTitle` 与 `paragraphIndex`，无缝衔接“📒 我的笔记”原文跳转与 Obsidian Markdown 导出。

### 4. ⌨️ 全键盘极客操控心流（Keyboard Shortcuts，`src/components/VirtualPager.tsx`）
- 当句读面板处于展开状态且当前焦点不在 `<input>` / `<textarea>` / `<select>` 内时，全局监听快捷键：
  - `Space`（空格键）：阻止默认页面滚动，直接触发 `[▶ 听这一句]`（若正在播放则停止）。
  - `ArrowLeft` / `ArrowRight`（左右方向键）：触发 `[⏮ 上一句]` / `[⏭ 下一句]`。
  - `KeyD`（D 键）：一键开启并自动聚焦 `[✍️ 听打本句]` 输入框。
  - `KeyC`（C 键）：一键切换 `[✂️ 意群断句]` 开关。
- 在句读面板底部展示快捷键指引：`⌨️ 快捷键：空格 重听本句 · ←/→ 切换上下句 · D 听打本句 · C 意群断句`。
