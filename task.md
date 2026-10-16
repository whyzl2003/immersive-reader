# 任务清单：新增“🔍 句读（Sentence Reader 逐句精读与多档变速跟读）”

- [x] 扩展全局状态 (`src/store/useReaderStore.ts`)：新增 `ttsSpeed`、`setTtsSpeed`、`sentenceTranslations`、`saveSentenceTranslation` 并纳入 IndexedDB 持久化 <!-- id: 40 -->
- [x] 升级 Edge TTS 与离线语音变速支持 (`src/utils/edgeTTS.ts` & `src/lib/audioPlayer.ts`)：支持 `audio.playbackRate`、`utterance.rate` 及朗读途中实时变速，实现缩写安全的智能分句 `splitParagraphIntoSentences` <!-- id: 41 -->
- [x] 段落悬浮工具栏新增“🔍 句读”按钮 (`src/components/VirtualPager.tsx`)：遵循移动端 `min-w-[36px] min-h-[36px]` 热区规范与 `e.stopPropagation()` 防冒泡 <!-- id: 42 -->
- [x] 构建内联句读精读台面板 (`src/components/VirtualPager.tsx`)：支持逐句导航、`<InteractiveWord>` 查词词源、单句/连续跟读、多档变速切换及防剧透单句中文参考缓存 <!-- id: 43 -->
- [x] 运行 `npm run pages:build` 验证 TypeScript 类型检查与 Cloudflare Pages 边缘静态打包 0 报错 <!-- id: 44 -->
