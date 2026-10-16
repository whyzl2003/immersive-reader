# Offline-First Reader Skill 使用指南 (Skill User Guide)

> 💡 本 Skill 是基于 Antigravity 规范构建的工作区级/全局级专业工程技能，封装了开发“离线优先、海量存储、多端云漫游、微软神经元发声管道与纯前端富文本解析”应用的完整最佳实践。

---

## 1. Skill 的位置与结构

本技能存放在项目的工作区配置目录中：
```text
.agents/skills/offline-first-reader/
├── SKILL.md                          # 核心执行手册与触发规则 (Agent 读取的主入口)
├── README.md                         # [本文件] 开发者/用户专属使用指引
└── references/                       # 渐进式展开的四大硬核工程手册
    ├── offline_storage_idb.md        # 1. IndexedDB 存储与 Zustand 持久化
    ├── cloud_sync_and_lww.md         # 2. 四合一云端双向同步与 LWW 仲裁
    ├── edge_tts_pipeline.md          # 3. 微软 Edge Neural TTS 发声管道
    └── epub_parser_guide.md          # 4. 纯前端 EPUB 解析与图片离线化
```

---

## 2. 如何激活与调用本 Skill？

### 方式一：显式精准召唤 (推荐)
在与 AI（如 Antigravity / Claude / Cursor 等支持 Agent 架构的助手）对话时，直接在 Prompt 中指名调用：

> **Prompt 示例**：
> - *“请使用 `offline-first-reader` 技能，帮我用 React 和 TypeScript 搭建一个离线优先的英文播客听写应用。”*
> - *“参考 `offline-first-reader` 中的 Edge TTS 发声管道，为我的项目接入微软 Ava 神经元语音。”*
> - *“请依据 `offline-first-reader` 技能里的设计，帮我实现基于 Supabase 的多端阅读进度 LWW 仲裁同步。”*

### 方式二：自然语义自适应激活
即使您没有显式提及技能名称，只要您的需求命中以下关键词，Antigravity 也会自动在后台激活本 Skill：
- 关键词：`离线阅读器`、`IndexedDB存储`、`微信读书漫游`、`Edge TTS`、`Ava神经元发音`、`EPUB纯前端解析`、`防复活队列`、`LWW时间戳`。

---

## 3. 四大核心模块的“按需抽取”实战

您不仅可以用它从零开发完整阅读器，更可以像“乐高积木”一样单独抽取某一个硬核模块：

### 模块 A：单独借用“微软 Edge 高保真神经元朗读管道”
- **何时使用**：您的应用需要高品质英文/中文朗读，不想使用机械的原生 Web Speech，也不想购买昂贵的商业云 TTS。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/edge_tts_pipeline.md`，帮我编写一个独立的 `edgeTTS.ts` 模块。需要包含 Sec-MS-GEC 前端防刷算法、短句切片和管道并发预加载。”*

### 模块 B：单独借用“四合一无冲突云端漫游方案”
- **何时使用**：您在开发待办事项、记账、笔记或阅读器，需要支持跨设备（电脑/手机）同步，且不能发生“已删数据复活”和“旧进度覆盖新进度”。
- **调用 Prompt**：
  > *“请依据 `offline-first-reader` 中的 `cloud_sync_and_lww.md`，为我的 Supabase 项目设计阅读进度 LWW 仲裁逻辑与本地墓碑删除队列。”*

### 模块 C：单独借用“突破 5MB 限制的 IndexedDB 本地海量存储”
- **何时使用**：应用需要离线存储数百兆大文件、富文本或离线字典，LocalStorage 频繁报错配额溢出。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/offline_storage_idb.md`，使用 Zustand + idb-keyval 帮我重构全局状态，实现大体积数据的离线持久化。”*

### 模块 D：单独借用“纯前端 EPUB 解析与图片 Base64 永久保存”
- **何时使用**：不想在后端部署臃肿的 Python/Node 解析服务，希望用户在浏览器选定 `.epub` 后纯前端瞬时秒开，且图片离线不丢。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/epub_parser_guide.md`，用 JSZip 和 DOMParser 编写一个纯前端 EPUB 解析函数，并将所有插图转为 Base64 存入段落。”*

---

## 4. 跨项目与跨机器复用指南

如果您开启了一个全新的代码仓库（例如新建了一个 `podcast-learner` 项目），如何把这个 Skill 搬过去？

### 步骤（只需 10 秒）：
1. 复制当前项目下的整个技能目录：
   ```bash
   cp -r /path/to/reader/.agents/skills/offline-first-reader /path/to/new-project/.agents/skills/
   ```
2. **全局化配置（可选）**：
   如果您希望您电脑上所有的项目都能随时随地默认使用这个技能，可以将它复制到 Antigravity 全局配置目录：
   ```bash
   cp -r .agents/skills/offline-first-reader ~/.gemini/config/skills/
   ```
   复制后，无论在哪个文件夹里开发，只要打开命令行或 IDE，该 Skill 永久生效！

---

## 5. 验收清单与避坑法则

使用本 Skill 构建应用时，务必按照 `SKILL.md` 末尾的验收清单进行回归测试：
1. **移动端手势限制**：音频播放必须靠近用户手势，超时设置推荐 6 秒；
2. **文本等长空格清洗**：Markdown 符号清除必须使用等长空格替换，不可直接截短，否则破坏查词定位；
3. **复合唯一键 onConflict**：Supabase `upsert` 必须显式声明复合主键字段（如 `onConflict: 'user_email,book_id'`）。

---

## 6. 本 Skill 可以开发什么样的项目？(经典实战案例库)

本技能的底层本质是：**“大容量富文本/富媒体离线存储 + 云端无冲突多端漫游 + 播音级神经元流式音频 + 交互式深度语言学习”**。凡是契合该模型的产品，均可借助本 Skill 在极短时间内高质量交付：

### 案例 1：👶 儿童互动有声绘本 (Interactive Picture Books for Kids)
- **核心痛点**：绘本插图文件大、依赖网络会导致孩子翻页卡顿哭闹，普通机器音生硬缺少童趣。
- **如何赋能**：
  - **全彩手绘插图离线化**：利用 `epubParser` 提取插画转 Base64 永久保存在 `IndexedDB`，飞机上或车后座断网也能高清秒开；
  - **童话播音级音色**：Edge TTS 切换为微软特有的纯真小女孩音色 `en-US-AnaNeural` 或讲故事叔叔音色 `en-US-BrianNeural`；
  - **卡拉OK视听伴读**：朗读时段落琥珀色呼吸灯跟随，点击画面中的动物单词发音并弹出生词卡通卡片。

### 案例 2：🎧 播客与 TED 演讲精听精读学习器 (Podcast & Speech Dictation Learner)
- **核心痛点**：外语精听训练需要反复重听长难句并逐词盲打听写，传统工具功能分散且无法离线。
- **如何赋能**：
  - **听写纠错引擎 (Dictation)**：借用本 Skill 中的盲听输入、逐词红绿字符级比对与纠错标色算法；
  - **长音频零停顿管道**：利用“短句切片 + 管道并发预加载”实现长演讲段落无缝连读；
  - **多端同步听力笔记**：在地铁手机上盲打听写的错题集，回家在电脑上自动对齐并复习。

### 案例 3：📑 学术文献与科研论文双语工作台 (Academic Paper Bilingual Workbench)
- **核心痛点**：ArXiv / 英文期刊长篇大论，生词专业门槛高，PDF 格式在移动端排版糟糕。
- **如何赋能**：
  - **无上限海量文献库**：几十篇甚至上百篇博士论文离线保存在本地，随时搜索提取；
  - **段落内联专业翻译**：长难段落一键原位展开双语对照，再次轻触折叠；
  - **论文伴读朗读**：科研人员眼睛疲劳时，一键开启高质量神经元语音朗读论文摘要与正文；
  - **深度批注回跳**：随手记录批判性思考，点击笔记秒级回跳到论文对应段落。

### 案例 4：☕ 外语新闻与 RSS 晨读随身听 (Daily Foreign News & Audio Digest)
- **核心痛点**：订阅的《经济学人》、《华尔街日报》长文在早高峰地铁弱网下经常打不开。
- **如何赋能**：
  - **睡前云端推送，早起离线阅读**：电脑端导入今日期刊，手机端开屏即读；
  - **通勤听读一体**：戴上降噪耳机，Ava 自然拟真音色伴随晨间通勤，遇生词点词即查并收录至艾宾浩斯闪卡；
  - **进度分秒不差**：下地铁后在办公室电脑打开网页，自动对齐到刚才在地铁上听到的最新段落。

### 案例 5：🎬 影视对白与剧本台词背诵神器 (Movie Script & Dialogue Master)
- **核心痛点**：通过看美剧/英剧剧本学地道俚语与口语连读，缺乏好用的段落反复精听与台词遮挡工具。
- **如何赋能**：
  - **剧本角色分句**：按角色对白拆分为精美交互卡片；
  - **遮挡台词盲测**：利用听写练习模块把台词隐藏，听原声盲打或口语跟读；
  - **俚语生词卡片**：一键收录电影特色短语，按照艾宾浩斯曲线定期推送复习。

### 案例 6：⚖️ 私人离线法律法规与医典口袋速查库 (Pocket Law & Medical Reference)
- **核心痛点**：法条、判例汇编、临床医学指南文字量高达数千万字，在法庭或无信号手术室急需快速检索。
- **如何赋能**：
  - **突破存储极限**：整套民法典或临床手册离线装入本地 `IndexedDB`，极速毫秒级本地全文检索；
  - **多端标记书签与判例批注**：电脑上整理的重点条款法理随笔，开庭现场在手机上实时漫游调取。
