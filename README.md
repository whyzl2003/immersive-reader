# 沉浸式多端双语深度阅读器 (Immersive Reader)

> 📚 一款专为英语原著阅读者与语言学习者打造的离线优先、全端云漫游、搭载微软 Edge Neural 高保真神经元听书引擎的现代化 Web 阅读应用。

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-Deployed-orange?style=flat&logo=cloudflare)](https://immersive-reader-pages.pages.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Database-emerald?style=flat&logo=supabase)](https://supabase.com/)

---

## 🌟 核心特性 (Key Features)

- 📖 **海量平行书架 (无容量上限)**：
  - 基于 IndexedDB 彻底打破 LocalStorage 5MB 的存储壁垒；
  - 纯前端解压解析 EPUB 与 TXT，内嵌插图 Base64 本地持久化，断网环境下毫秒级秒开。
- 📑 **结构化章节目录与“指哪打哪”精准定位**：
  - 侧边抽屉一键展开目录树（兼容 EPUB 2/3 原生目录与自定义书签分栏）；
  - 目录跳转携带绝对段落锚点，视口自动平滑置顶对齐目标章节首段，辅以 2.2 秒呼吸光晕提示，彻底支持同页内多章节精确切换。
- ☁️ **四合一云端双向静默漫游**：
  - 接入 Supabase，实现类似“微信读书”的跨设备无感同步：**Mac 导入，手机/iPad 开屏即读**；
  - 搭载**跨端确定性 Book ID (`Deterministic ID`)**，超大原著文件即使多端离线分别手动导入，阅读进度、生词与笔记仍可 100% 自动对齐；
  - 涵盖**云端书架 (user_books)**、**阅读进度 (reading_progress)**、**生词本 (vocabulary)**、**读书笔记 (notes)**；
  - 采用 **Last-Write-Wins (LWW) 时间戳仲裁**、**删除队列防复活**与**存量书籍自动补推**机制。
- 🎧 **微软 Edge Neural 顶流神经元朗读**：
  - 纯前端 WebSocket 直连微软 Edge ReadAloud 接口，计算 `Sec-MS-GEC` 防刷校验；
  - 默认搭载顶级自然女声 `en-US-AvaMultilingualNeural`，逼真呼吸停顿与语调起伏；
  - 独创**短句切片 + 管道缓冲预加载**架构，长段落零延迟秒开且连贯无缝朗读，支持 6 秒熔断与原生语音无感降级。
- 📜 **纯净羊皮纸沉浸美学与移动端触控优化**：
  - 手机端默认隐藏工具栏，轻触段落按需呼出，杜绝遮挡正文单词；
  - 36px 防误触点击热区与严格的事件冒泡阻断。
- 🧠 **双语深度助读与艾宾浩斯复习**：
  - 单词点击即时发音与释义气泡、长段落智能分片内联翻译；
  - 读书随笔标记、艾宾浩斯记忆遗忘曲线智能闪卡。
- ✈️ **真·全功能飞行模式 (PWA 离线外壳 + 双预载 + 内置离线词典)**：
  - **PWA 离线外壳**：集成 Service Worker 静态资源离线缓存，断网绝不白屏，支持手机/iPad 添加到主屏幕独立运行；
  - **段落译文持久化**：翻译结果持久沉淀于本地 IndexedDB，即使在机舱断网刷新重开，点击“译”字依然 0 延迟秒开；
  - **候机室一键双预载**：登机前一键预拉后续 30 段整段译文与段落重点生词，静默写入本地缓存库；
  - **内置核心词库与词形还原引擎**：内置 500+ 高频基础词与《世界小史》核心词典，支持复数、过去式、进行时、副词及不规则动词智能还原；离线点击单词秒显释义，切断词源网络请求死锁，杜绝无限转圈。

---

## 🚀 线上体验与部署

- 🌐 **生产环境在线访问**：[https://immersive-reader-pages.pages.dev](https://immersive-reader-pages.pages.dev)

---

## 🛠️ 快速上手 (Quick Start)

### 1. 克隆并安装依赖
```bash
git clone <repo-url>
cd reader
npm install
```

### 2. 配置环境变量 (`.env.local`)
```ini
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. 本地启动开发
```bash
npm run dev
```
打开浏览器访问 [http://localhost:3000](http://localhost:3000)。

### 4. 边缘打包与发布
```bash
# 严格类型检查
npx tsc --noEmit

# Cloudflare Pages 边缘打包
npm run pages:build

# 发布到 Cloudflare Pages
npx wrangler pages deploy .vercel/output/static --project-name="immersive-reader-pages"
```

---

## 📖 文档导航中心 (Documentation)

- 📘 [**用户操作与使用说明书 (USER_GUIDE.md)**](./USER_GUIDE.md)：涵盖开箱即读、云端漫游、Ava 真人听书、听写盲打与移动端触控秘籍；
- 🛠️ [**系统全景架构与开发者指南 (DEVELOPMENT.md)**](./DEVELOPMENT.md)：深入底层数据流图、表结构字典、Edge TTS 协议实现细节与避坑契约。

---
*Crafted with passion for readers.*

