# 任务清单：3D 记忆闪卡与我的笔记视图组件化重构

- [x] 完善 Zustand 数据层：在 `src/store/useReaderStore.ts` 中新增 `vocabularyList` 与 `notesList`，配置 `persist` 中间件实现 localStorage 本地持久化与刷新不丢失 <!-- id: 50 -->
- [x] 重构“📒 我的笔记”视图 (NotesView.tsx)：订阅 `notesList`，渲染卡片流与时间戳/引用原文，复刻修复后的无乱码 Markdown 导出逻辑（Blob 下载） <!-- id: 51 -->
- [x] 重构“🎴 3D 记忆闪卡”视图 (FlashcardsView.tsx)：纯 Tailwind CSS 任意值语法实现 3D 翻转（`[perspective:1000px]`、`[transform-style:preserve-3d]`、`[backface-visibility:hidden]`、`rotateY(180deg)`），正面单词音标/背面释义语境 <!-- id: 52 -->
- [x] 同步构建“📓 我的生词本”视图 (VocabularyView.tsx)：支持生词检索、词根徽章查看、一键音频朗读与生词本 Markdown 导出 <!-- id: 53 -->
- [x] 视图组装与链路贯通：在 `app/page.tsx` 完整挂载四大核心视图，InteractiveWord 收藏按钮直通 Zustand，全量构建静态验证通过 <!-- id: 54 -->
