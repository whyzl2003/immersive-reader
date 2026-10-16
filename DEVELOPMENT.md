# 沉浸式多端双语阅读器 (Immersive Reader)
## 全景系统架构与开发者指南 (System Architecture & Developer Guide)

> **版本**：v2.3.0 (真·全功能飞行模式与离线词形还原引擎版)  
> **最后更新时间**：2026-10-14  
> **核心定位**：基于“离线优先 (Offline-First)”理念打造的跨端双语深度阅读器，集成私人海量书架、四合一云端双向静默漫游、微软 Edge Neural 高保真神经元听书引擎、真·全功能飞行模式与艾宾浩斯智能复习体系。

---

## 目录
1. [项目全景与设计哲学](#1-项目全景与设计哲学)
2. [系统整体架构与数据流](#2-系统整体架构与数据流)
3. [技术栈选型一览](#3-技术栈选型一览)
4. [项目目录与模块索引](#4-项目目录与模块索引)
5. [数据存储模型规范 (IndexedDB vs Supabase)](#5-数据存储模型规范-indexeddb-vs-supabase)
6. [八大核心工程系统硬核解析](#6-八大核心工程系统硬核解析)
   - [6.1 离线优先与四合一云端漫游引擎](#61-离线优先与四合一云端漫游引擎)
   - [6.2 微软 Edge Neural TTS 高保真语音管道](#62-微软-edge-neural-tts-高保真语音管道)
   - [6.3 纯前端 EPUB / TXT 极速流式解析器](#63-纯前端-epub--txt-极速流式解析器)
   - [6.4 移动端沉浸式排版与防误触触控系统](#64-移动端沉浸式排版与防误触触控系统)
   - [6.5 虚拟分页视口联动与“指哪打哪”精准定位系统](#65-虚拟分页视口联动与指哪打哪精准定位系统)
   - [6.6 真·全功能飞行模式与 PWA 离线外壳 (Service Worker)](#66-真全功能飞行模式与-pwa-离线外壳-service-worker)
   - [6.7 内置离线核心词典与英文词形还原（Lemmatization）引擎](#67-内置离线核心词典与英文词形还原lemmatization引擎)
   - [6.8 长段落分片并发翻译与候机室双预载架构](#68-长段落分片并发翻译与候机室双预载架构)
7. [本地开发、构建与边缘部署手册](#7-本地开发构建与边缘部署手册)
8. [关键踩坑经验与隐形设计契约 (Gotchas)](#8-关键踩坑经验与隐形设计契约-gotchas)
9. [未来升级路线图 (Roadmap)](#9-未来升级路线图-roadmap)

---

## 1. 项目全景与设计哲学

传统 Web 阅读器往往受限于浏览器的 `localStorage` 容量限制（约 5MB），且在弱网或多端切换时极易发生进度丢失、声音机械呆板或书籍无法跨端阅读。本项目通过一系列工程重构确立了三大核心原则：

1. **绝对离线优先 (Offline-First)**：
   所有书籍内容、阅读进度、读书笔记与生词卡片，第一优先级永远完整沉淀在设备本地 `IndexedDB`。断网状态下依然秒开、丝滑翻页、自由查词记笔记。
2. **跨端无感漫游 (Seamless Roaming)**：
   用户只需绑定邮箱即可与 Supabase 云端自动对齐。Mac 端导入书籍，iPad 与手机打开书架即见即读；无论在哪个设备翻页，最新阅读进度自动仲裁同步。
3. **顶流听觉与视觉沉浸感**：
   采用复古羊皮纸配色体系；接入微软 Edge 顶流神经元自然女声（`en-US-AvaMultilingualNeural`），具备呼吸感、抑扬顿挫的连读起伏，并辅以分句管道预加载实现长文本零停顿听书。

---

## 2. 系统整体架构与数据流

```mermaid
flowchart TD
    subgraph UI_Layer["前端展现与交互层 (Client UI)"]
        VP["VirtualPager (虚拟分页/段落排版)"]
        IW["InteractiveWord (点词查词/发音/加生词)"]
        BD["BookshelfDrawer (平行书架/书籍导入)"]
        VV["VocabularyView (生词本/熟练度管理)"]
        FV["FlashcardsView (艾宾浩斯记忆闪卡)"]
        ND["NotesDrawer (读书笔记管理)"]
        SM["SyncEmailModal (四合一云端同步控制台)"]
    end

    subgraph State_Storage["本地存储与核心状态层 (Offline Storage)"]
        Store["Zustand Global Store (useReaderStore)"]
        IDB[("IndexedDB (idb-keyval 持久化层)")
            - bookshelf (整本书籍)
            - vocabulary (生词本)
            - readingProgress (进度及时间戳)
            - notes (读书随笔)
            - deletedQueues (防复活追踪队列)]
    end

    subgraph Service_Engine["专用引擎与工具模块"]
        EPUB["epubParser (JSZip + XML 纯前端解析)"]
        TTS["edgeTTS (WebSocket 直连微软 Edge Neural)"]
        NATIVE_TTS["Web Speech API (原生自适应兜底)"]
        AP["audioPlayer (双轨调度 / 管道缓冲 / 全局互斥打断)"]
    end

    subgraph Cloud_Infrastructure["云端与边缘基础设施 (Cloud & Edge)"]
        CF_ACCESS["Cloudflare Access / Zero Trust (白名单 OTP 验证码门禁)"]
        CF_EDGE["Cloudflare Pages (全球边缘部署)"]
        CF_AI["Cloudflare Workers AI (AI 翻译 / 单词解析)"]
        SB[("Supabase 数据库 (PostgreSQL)")
            - user_books (云端书架)
            - reading_progress (进度仲裁)
            - vocabulary (生词本)
            - notes (读书笔记)]
    end

    %% 连接关系
    CF_ACCESS --> CF_EDGE
    CF_EDGE --> UI_Layer
    VP <--> Store
    IW <--> Store
    BD <--> Store
    VV <--> Store
    FV <--> Store
    ND <--> Store
    SM <--> Store

    Store <--> IDB
    BD --> EPUB
    VP --> AP
    AP --> TTS
    AP --> NATIVE_TTS

    Store <== "双向静默对齐 (REST/PostgREST)" ==> SB
    VP <== "AI 词句翻译" ==> CF_AI
    UI_Layer --> CF_EDGE
```

---

## 3. 技术栈选型一览

| 模块类别 | 选型技术 | 核心考量与优势 |
| :--- | :--- | :--- |
| **基础框架** | **Next.js 16 (App Router) + React 19** | 现代组件化架构，SSR/SSG/ISR 灵活适配，极速 Turbopack 构建 |
| **类型保障** | **TypeScript 5 (Strict Mode)** | 0 报错严格检查，数据模型跨组件严格自洽 |
| **样式与排版** | **Tailwind CSS + Tailwind Typography** | 原子化响应式设计，轻量优雅的羊皮纸仿真质感排版 |
| **本地持久化** | **Zustand + idb-keyval (IndexedDB)** | 打破 LocalStorage 5MB 限制，轻松支持数百兆大型 EPUB 与离线数据 |
| **云端后端** | **Supabase (PostgreSQL + PostgREST)** | 免运维、高可用、天然支持复合主键 UPSERT 与行级安全校验 |
| **高保真语音** | **Microsoft Edge Neural TTS (Ava 音色)** | 直连微软 ReadAloud WebSocket，24kHz 高品质 MP3，超越机械发音 |
| **边缘部署** | **Cloudflare Pages (`@cloudflare/next-on-pages`)** | 全球 Anycast 边缘网络，超快 TTFB，免服务器运维成本 |
| **前端解压** | **JSZip** | 浏览器纯前端直接解包 EPUB，图片瞬时转码 Base64 持久化 |

---

## 4. 项目目录与模块索引

```text
reader/
├── app/                              # Next.js App Router 路由与接口
│   ├── api/
│   │   ├── analyze-word/route.ts     # Cloudflare AI 单词词根、词缀及深度拆解接口
│   │   ├── translate/route.ts        # 词句轻量翻译接口 (Edge Runtime)
│   │   └── translate-text/route.ts   # 整段深度翻译接口
│   ├── globals.css                   # 全局样式、羊皮纸主题变量与自定义滚动条
│   ├── layout.tsx                    # 根布局与元数据配置
│   └── page.tsx                      # 主入口：导航控制、心跳保活、三主视图切换
│
├── src/
│   ├── components/                   # 核心交互组件
│   │   ├── BookshelfDrawer.tsx       # 平行书架抽屉（导入、书籍切换、级联删除）
│   │   ├── FlashcardsView.tsx        # 艾宾浩斯记忆闪卡视图（翻卡/熟练度打分）
│   │   ├── InteractiveWord.tsx       # 可交互单词组件（查词、气泡弹窗、事件冒泡阻断）
│   │   ├── NotesDrawer.tsx           # 读书笔记抽屉（段落随笔查看、跳转与删除）
│   │   ├── SyncEmailModal.tsx        # 四合一云端同步弹窗（书籍/笔记/生词/进度事务）
│   │   ├── VirtualPager.tsx          # 核心阅读分页器（虚拟渲染、内联翻译、移动端唤出工具栏）
│   │   └── VocabularyView.tsx        # 生词本视图（检索、熟练度分组、批量发音）
│   │
│   ├── data/
│   │   └── initialBook.ts            # 默认预装书籍数据（《世界小史》全量段落）
│   │
│   ├── lib/
│   │   ├── audioPlayer.ts            # 全局统一发音调度中枢（Edge TTS 与 Native 双轨自适应）
│   │   └── supabaseClient.ts         # Supabase 客户端单例与环境检测
│   │
│   ├── store/
│   │   └── useReaderStore.ts         # 核心全局状态（IndexedDB 持久化 + 云端双向同步业务逻辑）
│   │
│   └── utils/
│       ├── edgeTTS.ts                # 微软 Edge Neural TTS 协议封装（Sec-MS-GEC/分句切片/预加载）
│       └── epubParser.ts             # 纯前端 EPUB 解析引擎（解压、提取正文与图片内嵌）
│
├── DEVELOPMENT.md                    # [本文件] 全景系统架构与开发者指南
├── task.md                           # 任务追踪记录清单
└── wrangler.toml                     # Cloudflare Pages 部署配置文件
```

---

## 5. 数据存储模型规范 (IndexedDB vs Supabase)

### 5.1 本地 IndexedDB 结构 (`useReaderStore`)
通过 `idb-keyval` 将整个 Zustand store 完整保存在本地数据库中：

```typescript
interface BookItem {
  id: string;               // 跨设备确定性唯一 ID (Deterministic Book ID，基于书名小写与 Unicode 标点清洗)
  title: string;            // 书名
  paragraphs: string[];     // 正文段落数组（含清洗后的纯文本或 <img> 标签）
  addTime: number;          // 添加时间戳 (毫秒)
  fileType: string;         // 文件格式 ("epub" | "txt" | "built-in")
  synced?: boolean;         // 是否已同步至云端标记
  toc?: TocItem[];          // 结构化章节目录列表 (可选)
}

interface TocItem {
  id: string;               // 目录项标识
  title: string;            // 章节标题
  startIndex: number;       // 该章节首个正文段落的全局绝对索引
  paragraphsCount: number;  // 该章节包含的段落总数
}

interface ReadingProgressItem {
  position: number;         // 当前正在阅读的段落绝对索引 index
  updatedAt: number;        // 本地更新时间戳 (毫秒)，用于 LWW 仲裁
}

interface VocabItem {
  word: string;             // 单词键 (小写)
  phonetic?: string;        // 音标
  translation: string;      // 中文释义
  context?: string;         // 首次标记时的原句语境
  familiarity: number;      // 艾宾浩斯熟练度 (0~3)
  nextReviewDate: number;   // 下次复习时间戳
  addedDate: number;        // 添加时间戳
  synced?: boolean;         // 云端同步标记
}

interface NoteItem {
  id: string;               // 笔记唯一 ID
  bookId: string;           // 关联书籍 ID
  bookTitle: string;        // 关联书名
  paragraphIndex: number;   // 关联段落索引
  context: string;          // 笔记所在段落文本
  note: string;             // 用户填写的读书笔记随笔
  createdAt: number;        // 创建时间戳
  synced?: boolean;         // 云端同步标记
}

// 离线段落翻译持久化缓存结构
type ParagraphTranslationsMap = Record<string, Record<number, string>>; // [bookId]: { [paragraphIndex]: "中文译文" }

// 离线重点生词持久化缓存结构
type OfflineWordCacheMap = Record<string, string>; // [lowercase_word]: "中文释义"
```

### 5.2 Supabase 云端表模型与复合主键设计
为支持多用户数据隔离与原子幂等操作，云端表统一使用 `(user_email, ...)` 构成复合主键：

| 表名 | 关键字段 | 复合主键 / 唯一约束 | 同步仲裁规则 |
| :--- | :--- | :--- | :--- |
| **`user_books`** | `user_email`, `book_id`, `title`, `paragraphs` (jsonb), `file_type` | `(user_email, book_id)` | 本地导入即推，拉取缺失书籍静默注入本地，标记 `synced: true` |
| **`reading_progress`** | `user_email`, `book_id`, `progress` (int), `updated_at` (timestamptz) | `(user_email, book_id)` | **Last-Write-Wins (LWW)**：以最新时间戳判定谁胜出 |
| **`vocabulary`** | `user_email`, `word`, `translation`, `familiarity`, `context`, `next_review_date` | `(user_email, word)` | 双向合并去重；删除借助本地 `deletedWordsQueue` 防对端复活 |
| **`notes`** | `user_email`, `book_id`, `paragraph_index`, `context`, `note`, `book_title` | `(user_email, book_id, paragraph_index)` | 覆盖式 UPSERT；删除借助 `deletedNotesQueue` 防对端复活 |

---

## 6. 八大核心工程系统硬核解析

### 6.1 离线优先与四合一云端漫游引擎

跨端数据同步最难处理的是**离线产生的数据修改**与**对端已删除数据的死灰复燃**。

#### A. 阅读进度仲裁：Last-Write-Wins (LWW)
1. 翻页时本地状态立即变更，防抖 500ms 记录 `readingProgress[bookId] = { position, updatedAt: Date.now() }`；
2. 防抖 2000ms 异步向云端上报携带 `updated_at: new Date().toISOString()`；
3. 应用初始化或切换书籍时，拉取云端记录。若云端 `updated_at > 本地 updatedAt`，判定云端为最新进度，自动跳转并 Toast 提示用户；反之若本地较新，则反推本地进度上云。

#### B. 防复活追踪队列 (`deletedQueues`)
- 若直接同步，设备 A 删除了单词 "ephemeral"，设备 B 本地还有该词，同步时又会被拉回。
- **解法**：本地设立 `deletedWordsQueue: string[]` 与 `deletedBooksQueue: string[]`。
  - 本地删除时，除了从界面移除，立即将 ID 入队；
  - 同步时，先向云端批量发指令 `delete().in('word', deletedWordsQueue)`；
  - 随后拉取云端剩余词条时，显式过滤掉该队列中的词条，确保删除彻底生效，之后清空队列。

#### C. 存量书籍全量补推机制 (Auto Push Existing Books)
- 历史导入的书籍如果未上云（`!book.synced`），在用户登录或点击同步时，自动遍历书架，将未同步的整本 paragraphs 文本数组全量 UPSERT 至 `user_books` 表，实现全量上云闭环。

#### D. 跨设备确定性唯一 ID (Deterministic Book ID) 与存量平滑迁移
- **设计痛点**：若在导入时使用时间戳或随机数生成 `book_${Date.now()}`，当用户在多台设备（Mac、iPhone）为了绕过大文件网络传输限制而分别本地手动导入同一本书时，会生成不同的 `book_id`，导致云端进度、生词本与笔记无法跨设备对齐。
- **确定性哈希算法 (`generateDeterministicBookId`)**：
  - 清除所有空白符、标点符号（`\p{P}`）与特殊符号（`\p{S}`），保留字母与数字（支持 Unicode 多语言），生成跨端绝对一致的小写字符串（例如：*"A Little History of the World"* $\rightarrow$ `alittlehistoryoftheworld`）；
  - 兜底防御空串回退至 `"untitled"`，并规避与系统默认典藏书 ID 冲突。
- **历史存量无感继承**：
  在 `importBookToShelf` 时，若检测到本地书架已存在旧同名但带有随机 ID 的书籍，自动继承并迁移其历史阅读进度、生词本关联以及读书笔记中的 `bookId`，并从本地物理合并删除冗余旧条目。

---

### 6.2 微软 Edge Neural TTS 高保真语音管道

#### A. 纯前端 Sec-MS-GEC 防刷校验算法
微软 Edge 官方接口（`wss://speech.platform.bing.com/...`）在 2024 年强制加入了基于时间戳的防刷哈希。在纯前端无 Node 的环境下，`edgeTTS.ts` 实现了纯 Web Crypto 算法：
$$\text{Ticks} = (\text{UnixTime} + 11644473600) \times 10^7 \quad (\text{向下对齐 300 秒})$$
$$\text{Sec-MS-GEC} = \text{SHA256}(\text{Ticks} + \text{TRUSTED\_CLIENT\_TOKEN}).\text{toUpperCase}()$$

#### B. 长段落“分句切片 + 管道缓冲预加载”架构
长段落单次发送 SSML 会超出微软 WebSocket 缓冲区导致卡死断流。
- **智能分句**：若字符数 $\le 100$，单次直发；若超长，正则匹配 `[.!?;\n]` 安全拆分为短句列表（每个分片 20~80 字符）。
- **管道预加载 (Pipeline Prefetch)**：
  - 播第 1 句的同时，后台异步并发请求第 2 句并缓存其 MP3 Blob；
  - 第 1 句播放完毕瞬间，第 2 句无缝接力播放，同时后台开始请求第 3 句；
  - **实现整段朗读零停顿连读，首句响应提速至 200~400ms 极速秒开**。
- **会话隔离与全局打断**：
  引入 `currentSessionId` 与 `activeWebSockets` 集合。只要用户点击停止方块或切段，递增会话 ID 并瞬间 `ws.close()`，旧音频 `pause()` 销毁，绝对不串音。
- **双轨无缝降级**：
  配置 6 秒熔断。若在极端弱网或受限浏览器环境下 Edge TTS 握手失败，自动无感降级到 `window.speechSynthesis`，永不卡死失声。

---

### 6.3 纯前端 EPUB / TXT 极速流式解析器

- **TXT 解析**：按换行符 `\r?\n` 智能归拢清洗，过滤空白多余字符，分割为段落数组；
- **EPUB 解析与高保真解构 (`epubParser.ts`)**：
  1. 使用 `JSZip` 在浏览器内存中解压 `container.xml`，定位 `content.opf`；
  2. 解析 OPF 中的 `<manifest>` 与 `<spine>`，获取正确的章节阅读顺序；
  3. 将章节内嵌的所有图片（PNG/JPG/SVG）抽取并转码为 `data:image/...;base64`，直接回填至 HTML 的 `<img>` 标签中；
  4. 使用 `DOMParser` 解析 XML，去除多余内联脚本与危险标签，最终产出符合虚拟分页器渲染的纯净段落流。
- **结构化目录树 (TOC) 精准对齐算法**：
  - **双源解析**：同时兼容 EPUB 2 的 `toc.ncx`（NAVPOINT）与 EPUB 3 的 `nav.xhtml`（`<nav epub:type="toc">`）；
  - **路径规范化 (Path Normalization)**：针对 Spine 与 TOC 间相对路径差异（如 `OEBPS/Text/ch1.xhtml` vs `Text/ch1.xhtml`），采用后缀一致性比对剥离前缀干扰；
  - **锚点与文件级二级映射**：
    - 一级：分离 `targetFilePath` 与 `targetAnchor`。正文遍历匹配到目标 ID 锚点时，立即绑定当前全局段落索引 `globalIndex`；
    - 二级：无锚点或锚点丢失时，兜底映射至该 XHTML 文件的首个有效正文段落；
  - **剔除无效占位节点**：严格过滤纯空白段落、隐藏占位标签及首尾换行，杜绝数组索引漂移 (Off-by-One)。

---

### 6.4 移动端沉浸式排版与防误触触控系统

移动端（iPhone / iPad）屏幕较窄，手指点击面积大。
- **36px 防误触点击热区**：工具栏内所有图标按钮（发音、翻译、听写、书签、随笔）设置 `min-w-[36px] min-h-[36px]`，按钮间距加大至 `gap-2.5`；
- **纯净沉浸：轻触唤出交互**：
  - 移动端默认隐藏工具栏（`hidden sm:flex` 不占垂直高度），正文呈现纯净羊皮纸排版；
  - 轻触某段落后，工具栏平滑展开于段落正上方外侧，杜绝遮挡首行单词；
  - 翻页或切书时自动收起；
- **事件冒泡拦截**：
  - 单词点击查词 (`InteractiveWord`) 以及工具栏内部各按钮严格执行 `e.stopPropagation()`，杜绝查词与操作时意外触发段落折叠。

---

### 6.5 虚拟分页视口联动与“指哪打哪”精准定位系统

在虚拟分页架构中，目录跳转若仅粗暴翻页，会导致目标段落埋没在页面中间或底部，且翻页默认的 `scrollTo(top: 0)` 会让用户误以为停留在上一章结尾。

- **全局定向定位追踪 (`targetParagraphIndex`)**：
  - 在 `useReaderStore` 中维护 `targetParagraphIndex: number | null`；
  - 调用 `goToChapter(startIndex, title)` 或 `goToParagraphIndex(index)` 时，不仅计算目标页码 `Math.floor(startIndex / pageSize)`，同时设置 `targetParagraphIndex = startIndex` 与精确章节标题。
- **DOM 视口平滑置顶与呼吸光晕**：
  - `VirtualPager` 监听 `targetParagraphIndex`。一旦翻页渲染完成，通过 `paragraphRefs.current.get(targetIndex)` 找到目标段落 DOM；
  - 触发 `el.scrollIntoView({ behavior: "smooth", block: "start" })` 将目标章节第一段平滑对齐至视口顶端；
  - 为目标段落叠加 2.2 秒的柔和呼吸光晕（`ring-2 ring-primary/40 bg-primary/10 rounded-md`），让读者第一眼清晰识别章节起点；
  - 彻底支持同页内多章节的精确页内滚动切换（如第 1 章与第 2 章同在第 11 页）。
- **翻页章节判定倒查算法重构**：
  - 原算法按页首段落倒查，导致页首残留上一章末尾时整页标题被倒退判定；
  - 重构为：**优先检测当前页内新开启的章节（`item.startIndex >= pageStart && item.startIndex <= pageEnd`）**，确保标题与目录高亮精准同步。

---

### 6.6 真·全功能飞行模式与 PWA 离线外壳 (Service Worker)

飞行或断网环境下，常规单页应用极易因无法拉取 JS/CSS 静态 Chunk 出现白屏死锁。
- **PWA Service Worker 离线外壳 (`public/sw.js` & `manifest.json`)**：
  - 在客户端通过 `ServiceWorkerRegister` 注册轻量级 Service Worker；
  - 核心静态资源采用 **Cache-First (缓存优先)** 策略，后台异步检查更新（Stale-While-Revalidate）；
  - 即使完全切断网络或从 iPad 桌面图标冷启动，主外壳与交互框架 0 毫秒秒开。
- **离线网络状态感知与徽章提示**：
  - 全局监听 `window.addEventListener("online" | "offline")`；
  - 离线时在顶栏展示温和徽章：`✈️ 离线模式`；
  - 离线点击未预载段落或单词时，提供明确离线提示，杜绝用户误以为应用卡死。

---

### 6.7 内置离线核心词典与英文词形还原（Lemmatization）引擎

在断网飞行状态下，若查词依赖远程 API，会导致查词失败或界面卡死在“正在查询词源...”。
- **切断离线网络死锁 (`InteractiveWord.tsx`)**：
  - 检测到 `!navigator.onLine` 时，严格短路拦截网络请求，严禁调用 `/api/analyze-word`；
  - 直接在本地词根表 `ROOTS_DICTIONARY` 同步查找，未命中立即将 `isFetchingRoots` 置为 `false`，彻底消灭转圈死锁。
- **内置核心词库 (`src/data/offlineDict.ts`)**：
  - 内置近 500 个高频基础核心词及《世界小史》专用生词库，提供紧凑精准的中文释义；
- **智能词形还原（Lemmatization）**：
  - 读者点击原著中的单词往往带有各种屈折变形（如 `cradled`, `stories`, `relaxing`, `went` 等）；
  - 引擎实现完整形态学还原管线：
    1. 不规则动词映射表（`went -> go`, `was -> be`, `had -> have`, `came -> come` 等）；
    2. 复数与三单后缀还原（`-s`, `-es`, `ies -> y`, `ves -> f/fe`）；
    3. 过去式与分词后缀还原（`-ed`, `-d`, `ied -> y`, 双写辅音还原）；
    4. 进行时与动名词还原（`-ing`, 去除不发音 `e`, 双写还原）；
    5. 副词与形容词后缀还原（`-ly`, `ily -> y`）；
  - 结合四级分层查词流水线：`localTranslationCache -> vocabularyList -> offlineWordCache -> lookupOfflineWord -> 在线接口`，实现离线点击任意变形词 0 延迟秒出释义。

---

### 6.8 长段落分片并发翻译与候机室双预载架构

- **上游接口长度防御与智能分片 (`src/app/api/translate-text/route.ts`)**：
  - 原著长段落单次字符往往接近 1000 字，极易突破第三方上游接口限制或被边缘网关拦截；
  - 接口引入正规表达式分句边界切片（`/(?<=[.!?])\s+/`），将长段落切分为小于 250 字符的语义短句块；
  - 全面升级为 `POST` + `application/x-www-form-urlencoded` 请求体通信；
  - 通过 `Promise.all` 并发翻译各子句，并在末尾保序拼接，实现毫秒级超长段落翻译。
- **候机室“段落译文 + 重点生词”双预载 (`OfflinePreloadButton.tsx`)**：
  - 登机前一键点击预载，系统在后台对当前页及后续 30 个段落执行静默双向抓取；
  - 自动过滤 HTML 标签与常用高频停用词（Stop Words），提取段落重点词汇并发拉取释义；
  - 译文与词汇释义批量存入 IndexedDB（`paragraphTranslations` 与 `offlineWordCache`），支持机舱飞行模式下完全离线阅读与查词。

---

## 7. 本地开发、构建与边缘部署手册

### 7.1 环境准备
- Node.js 18+ / 20+
- 推荐使用 npm 或 pnpm

### 7.2 环境变量配置 (`.env.local`)
```ini
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 7.3 开发常用指令
```bash
# 启动本地热重载开发服务器
npm run dev

# 严格类型检查 (提交前必测，要求 0 报错)
npx tsc --noEmit

# Cloudflare Pages 边缘编译打包
npm run pages:build

# 一键部署至 Cloudflare Pages 生产环境
npx wrangler pages deploy .vercel/output/static --project-name="immersive-reader-pages"
```

---

## 8. 关键踩坑经验与隐形设计契约 (Gotchas)

在项目迭代过程中总结出的关键避坑准则，后续开发者请严格遵循：

1. **移动端音频手势策略 (User Gesture Policy)**：
   - iOS Safari 严苛要求音频播放必须由直接的用户点击同步触发。
   - 若在异步请求（超过 1~2 秒）后再调用 `audio.play()` 或 `speechSynthesis.speak()`，会被系统判定失去手势静音。
   - **对策**：Edge TTS 必须在用户点击的当前栈中快速响应；首句尽量简短；超时从 2.5 秒放宽至 6 秒；如主动取消不得误调原生降级。
2. **Markdown 符号清洗的“等长空格替换”**：
   - 朗读与高亮对齐时，清洗 Markdown 符号（如 `* # _ [ ]`）必须将其替换为**等长空格**（`" "`），而**不能直接删除**！
   - 直接删除会导致字符长度偏移，破坏单词高亮游标定位。
3. **Cloudflare Pages 边缘运行时限制**：
   - API 路由如果采用 `export const runtime = "edge"`，不得引用 Node 原生模块（如 `fs`, `path`, `crypto`）；
   - 前端加密与哈希统一使用标准的 `window.crypto.subtle`。
4. **Supabase PostgREST 复合唯一键冲突**：
   - 执行 `upsert` 时，必须显式指定 `onConflict: 'user_email,book_id'`（或对应复合主键字段），否则 PostgREST 会退化为 insert 从而引发 409 键冲突。
5. **虚拟分页目录跳转与页内段落偏移 (Off-by-One)**：
   - 目录条目的 `startIndex` 落在某个页面区间 `[page * size, (page + 1) * size - 1]` 内时，若仅切换页码而不滚动对齐，页面顶部会呈现上一章遗留的末尾段落；
   - 翻页计算章节标题时，绝不能单纯倒查首段（`page * size`），必须优先检测本页内是否有新章节起始点；
   - 跳转时必须携带精确的 `targetParagraphIndex`，并在 DOM 挂载后通过 `scrollIntoView(block: 'start')` 实现绝对对齐。
6. **多设备大文件手动导入与 Book ID 确定性**：
   - 绝不可使用随机数或时间戳作为书籍 ID，否则多端离线分别手动导入同一本书时将导致进度、生词与笔记分裂；
   - 统一采用小写、剔除所有空白与标点符号的确定性哈希 ID。

---

## 9. 未来升级路线图 (Roadmap)

- [ ] **AI 伴读与智能答疑**：选中文中任意长难句，一键唤出 AI 语法结构拆解与文化背景透视；
- [ ] **多声部与多语种音色切换**：支持用户在设置中自定义 Edge TTS 发音人（如 Andrew 男声、Guy 英音等）；
- [x] **本地图书目录树 (Table of Contents)**：解析 EPUB 的 `toc.ncx` / `nav.xhtml`，提供侧边抽屉目录无缝跳转、毫秒级精准对齐与呼吸灯提示；
- [ ] **EPUB 字体与间距个性化**：支持用户自定义羊皮纸底色、衬线/无衬线字体及行高缩放。

---
*本项目由用户与 Antigravity AI 结对编程驱动，持续精进打磨。*
