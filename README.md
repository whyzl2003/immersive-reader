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
- 🔍 **句读精读台与意群断句主干透视 (Sentence Reader & Chunking)**：
  - **智能分句与多档变速**：支持针对长段落展开内联句读卡片，按句子精准拆分，提供 `0.7x 慢速`、`0.85x 舒缓` 与 `1.0x 正常` 多档变速，支持单句循环或跨句自动连读；
  - **意群斜杠断句与主干透视**：一键开启 `✂️ 意群断句`，在常见从句引导词与长介词短语前动态插入优雅的古铜金 ` / ` 停顿换气标记，自动弱化插入语（斜体半透明），使长难句主谓宾主干一目了然；
  - **单句翻译与金句一键收藏**：支持按需异步获取并持久化缓存单句高保真译文，点击 `⭐ 收藏本句` 一键连同中英语境收录至「📒 我的笔记」；
  - **全键盘极客操控**：支持 `空格` 播放当前句、`← / →` 左右快退快进跳句、`C` 切换意群断句、`D` 唤起盲听听打。
- 🎯 **纯前端双引擎智能跟读打分与逐词发音诊断 (Pronunciation Assessment)**：
  - **零付费 API 双引擎架构**：并行启动浏览器原生 **Web Speech API**（实时语音识别与底层声学置信度采样）与 **Web Audio API**（20fps 实时时域 RMS 能量包络与卡顿停顿检测）；
  - **三维加权科学评分**：综合计算 **准确度 (60%) + 流利度 (25%) + 完整度 (15%)**，输出 0–100 总分、1–5 星级、段位评语、WPM 朗读语速与录音时长；离线或不支持语音识别环境自动无缝启用声学节奏兜底并标明简化提示；
  - **逐词红绿灯发音诊断**：基于 LCS 序列与 Levenshtein 音素相似度为句中每个单词标注 `🟢 地道 (excellent)`、`🟡 尚可 (good)`、`🔴 需加强 (needs_work)`；点击任意单词可重听标准读音，点击黄/红待加强词汇可同时播放标准发音并**一键加入生词本**！
  - **单词级 3.2s 极速评测**：正文点击任意生词唤起查词气泡，顶栏配备 `[🎙️ 跟读打分]`，3.2 秒自动收音评测，支持发音得分展示与自发音回放对比；
  - **回声对比法 (Echo Shadowing Method)**：录音完成后可一键触发 `[🔄 原音+我的对比]`，先由 Ava 朗读原句，结束瞬间无缝接力播放用户跟读录音，声学反差让发音缺陷无所遁形。
- ✍️ **单句盲听听打与三色 Diff 词级比对 (Sentence Dictation)**：
  - **防偷看盲听保护**：开启单句听打自动触发 Ava 发音并模糊隐藏原句正文，支持 `[👀 偷看一眼]` 临时解除遮盖；
  - **LCS 动态规划精密比对**：忽略标点与大小写，实时生成准确率评分与三色 Diff 矩阵（🟢 绿色匹配、🔴 红色拼错、🟡 黄色遗漏）；
  - **错词极速入本闭环**：比对结果中的红/黄色词汇支持直接点击，自动联动离线词库或在线查词补齐释义，一键存入生词本。
- 📱 **移动端精致交互与高帧率渲染优化**：
  - **控制栏智能收纳**：手机端控制栏默认收纳 `✍️ 听打本句` 与 `🔁 连续听读` 进 `⋯ 更多` 抽屉，核心按钮触控热区严格遵循规范；
  - **自适应动态视口**：正文阅读区使用 `dvh` 视口单位自适应屏幕，彻底解决移动端地址栏展开收起引起的视口跳动；
  - **React.memo 单词级防抖订阅**：页面成百上千个 `<InteractiveWord>` 采用 `React.memo` 与细粒度 Zustand 订阅，连续朗读与跟读期间彻底消除全页非必要重渲染。
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

