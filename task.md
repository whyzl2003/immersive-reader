# 任务清单：🔍 句读（Sentence Reader 精读台）2.0 终极满配升级

- [x] 🎙️ 原声跟读对比 (`src/components/VirtualPager.tsx`)：实现纯前端 `MediaRecorder` 跟读录音、`Blob URL` 自动释放、`[▶️ 听我的发音]` 与 `[🔄 原音+我的对比]` 回声对比法无缝接力连播 <!-- id: 46 -->
- [x] ✂️ 意群斜杠断句与主干透视 (`src/lib/tokenizer.tsx` & `src/components/VirtualPager.tsx`)：实现 `renderChunkedSentence`，支持古铜金 ` / ` 意群停顿标记、插入语 `opacity-65 italic` 弱化透视，并 100% 保留 `<InteractiveWord>` 查词词源能力 <!-- id: 47 -->
- [x] ⭐ 金句一键收藏 (`src/components/VirtualPager.tsx`)：右上角新增 `[⭐ 收藏本句]` / `[🌟 已收藏]`，调用 `addNote` 将英文原句、单句中文译文与 `【✨ 句读金句收藏】` 标签绑定 `bookId`/`bookTitle`/`paragraphIndex` 存入“📒 我的笔记” <!-- id: 48 -->
- [x] ⌨️ 全键盘极客操控心流 (`src/components/VirtualPager.tsx`)：支持 `Space` 重听/停止、`←/→` 切换上下句、`D` 开启聚焦听打本句、`C` 切换意群断句，并添加底部快捷键提示 <!-- id: 49 -->
- [x] 运行 `npm run pages:build` 验证 TypeScript 类型检查与 Cloudflare Pages 边缘静态打包 0 报错 <!-- id: 50 -->
