# 实施方案：🔍 句读（Sentence Reader 逐句精读与多档变速跟读）

## 功能设计概述

为阅读器新增 **🔍 句读（Sentence Reader）** 功能，使其与微软 Edge Ava 神经元语音（`en-US-AvaMultilingualNeural`）、飞行模式离线兜底语音（`window.speechSynthesis`）及移动端防误触交互无缝融合。

---

## 核心模块实施细节

### 1. 全局持久化状态扩展 (`src/store/useReaderStore.ts`)
- **语速持久化状态**：新增 `ttsSpeed: number`（支持 `0.7` 慢速、`0.85` 舒缓、`1.0` 正常，默认值 `1.0`）与 `setTtsSpeed: (speed: number) => void`。
- **单句译文缓存**：新增 `sentenceTranslations: Record<string, string>` 与 `saveSentenceTranslation: (sentenceKey: string, translation: string) => void`，通过 Zustand `partialize` 持久化存入 IndexedDB，支持离线查看已翻译过的单句。

### 2. Edge TTS 与离线语音多档变速支持 (`src/utils/edgeTTS.ts` & `src/lib/audioPlayer.ts`)
- 在调用 Edge Neural TTS 生成并播放 `HTMLAudioElement` 时，自动读取 `ttsSpeed` 并同步设置 `audio.defaultPlaybackRate = ttsSpeed` 与 `audio.playbackRate = ttsSpeed`。
- 在离线模式降级调用 `window.speechSynthesis` 时，同步设置 `utterance.rate = ttsSpeed`。
- 新增 `updateActiveAudioPlaybackRate(speed)` / `updateTTSPlaybackRate(speed)`，支持在朗读途中切换语速下拉框时实时更新正在播放的音频倍速。
- 新增智能英文段落分句函数 `splitParagraphIntoSentences(rawText)`，兼容 `Mr.` / `Mrs.` / `Ms.` / `Dr.` / `Prof.` / `St.` / `e.g.` / `i.e.` / `A.D.` / `B.C.`、人名首字母缩写（如 `E. H. Gombrich`）及句末引号闭合。

### 3. 段落悬浮工具栏入口与内联句读精读台 (`src/components/VirtualPager.tsx`)
- **悬浮操作栏入口**：在每个非图片段落右上角操作栏新增 `🔍 句读` 按钮，具备 `min-w-[36px] min-h-[36px]` 移动端触控热区，并调用 `e.stopPropagation()` 防止冒泡。
- **内联句读精读台 (Sentence Reader Panel)**：
  - **顶部状态栏**：展示 `逐句精读 · 第 X / N 句`、实时朗读状态提示，以及右侧“朗读速度”下拉选择器（`0.7x 慢速` / `0.85x 舒缓` / `1.0x 正常`）。
  - **核心展示区**：以大号衬线字体（`text-lg font-serif leading-relaxed`）醒目展示当前英文单句，内部单词包裹 `<InteractiveWord>`，支持直接在句读面板内点击任意单词查词与看词源。
  - **核心控制栏**：支持 `[▶ 听这一句]`、`[⏮ 上一句]`、`[⏭ 下一句]`、`[🔁 从本句连续听读]`（自动逐句连播并高亮跟随至本段末尾）与 `[⏹ 停止]`。
  - **单句中文按需展开（防剧透）**：提供 `📖 查看本句中文参考` 折叠开关，优先读取 `sentenceTranslations` 本地缓存，未命中且在线时请求 `/api/translate-text` 并自动缓存，离线未缓存时温和提示。
