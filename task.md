# 任务清单：新增“✍️ 句读听打（单句盲听打字与三色 Diff 比对）”与悬浮工具栏防遮挡优化

- [x] 扩展全局状态 (`src/store/useReaderStore.ts`)：新增 `ttsSpeed`、`setTtsSpeed`、`sentenceTranslations`、`saveSentenceTranslation` 并纳入 IndexedDB 持久化 <!-- id: 40 -->
- [x] 升级 Edge TTS 与离线语音变速支持 (`src/utils/edgeTTS.ts` & `src/lib/audioPlayer.ts`)：支持 `audio.playbackRate`、`utterance.rate` 及朗读途中实时变速，实现缩写安全的智能分句 `splitParagraphIntoSentences` <!-- id: 41 -->
- [x] 段落悬浮工具栏新增“🔍 句读”按钮并优化防遮挡定位 (`src/components/VirtualPager.tsx`)：上移至段落右上方 `sm:-top-7 sm:right-2`，确保绝不遮挡第一行右侧英文单词 <!-- id: 42 -->
- [x] 构建内联句读精读台与“✍️ 听打本句”模式 (`src/components/VirtualPager.tsx`)：支持原句盲听模糊遮盖、`[👀 偷看一眼]`、自动播音、快捷键（`Cmd/Ctrl + Enter` 核对、`Cmd/Ctrl + R` 重听）、切句自动重置与连播 <!-- id: 43 -->
- [x] 复用三色精密 Diff 算法与错词入本闭环 (`src/components/VirtualPager.tsx`)：显示本句准确率得分、支持红/黄错漏词点击查词并一键加入生词本，配备 `[🔄 重练本句]` 与 `[⏭ 听打下一句]` 闯关按钮 <!-- id: 44 -->
- [x] 运行 `npm run pages:build` 验证 TypeScript 类型检查与 Cloudflare Pages 边缘静态打包 0 报错 <!-- id: 45 -->
