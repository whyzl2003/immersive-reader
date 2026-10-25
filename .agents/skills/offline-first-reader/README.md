# Offline-First Reader Skill 使用指南 (Skill User Guide)

> 💡 本 Skill 是基于 Antigravity 规范构建的专业全栈工程技能，封装了“绝对离线优先、海量本地存储、多端云漫游、微软神经元发声管道、句读意群断句、本地双擎口语打分、听打三色Diff与形态学词形还原”的完整最佳实践。

---

## 1. Skill 的位置与结构

本技能存放在项目的工作区配置目录中：
```text
.agents/skills/offline-first-reader/
├── SKILL.md                                     # 核心执行手册与触发规则 (Agent 读取的主入口)
├── README.md                                    # [本文件] 开发者/用户专属使用指引
└── references/                                  # 细分硬核工程参考手册
    ├── offline_storage_idb.md                   # 1. IndexedDB 存储与 Zustand 持久化
    ├── cloud_sync_and_lww.md                    # 2. 四合一云端双向同步与 LWW 仲裁
    ├── edge_tts_pipeline.md                     # 3. 微软 Edge Neural TTS 发声管道
    ├── epub_parser_guide.md                     # 4. 纯前端 EPUB 解析与图片离线化
    ├── speech_eval_and_dictation_diff.md        # 5. 本地双擎口语发音评测与听打 Diff 引擎
    ├── sentence_reader_and_chunking.md          # 6. 句读精读台与启发式意群断句指南
    ├── offline_flight_mode_and_lemmatization.md # 7. 飞行模式离线外壳与英文词形还原指南
    ├── mobile_adaptive_ui_and_performance.md    # 8. 移动端自适应控制台与性能守恒指南
    └── word_game_workshop_and_fallback_pool.md  # 9. 单词闯关双模式游戏引擎与保底题库调度指南
```

---

## 2. 如何激活与调用本 Skill？

### 方式一：显式精准召唤 (推荐)
在与 AI（如 Antigravity / Claude / Cursor 等支持 Agent 架构的助手）对话时，直接在 Prompt 中指名调用：

> **Prompt 示例**：
> - *“请使用 `offline-first-reader` 技能，帮我用 React 和 TypeScript 搭建一个离线优先的英文口语跟读与打分应用。”*
> - *“参考 `offline-first-reader` 中的双擎发音打分算法，为我的应用添加基于 Web Speech 和 Web Audio 的红黄绿发音诊断。”*
> - *“参考 `offline-first-reader` 中的单词闯关工坊，帮我实现 4×4 闪电配对消除与原句挖空听音选义双模式，并包含 12 词保底词库。”*
> - *“依据 `offline-first-reader` 技能中的意群切片与词形还原算法，帮我写一个纯前端的英文长难句断句器与离线字典检索器。”*

### 方式二：自然语义自适应激活
即使没有显式提及技能名称，只要需求命中以下关键词，Antigravity 也会自动在后台激活本 Skill：
- 关键词：`离线阅读器`、`IndexedDB存储`、`微信读书漫游`、`Edge TTS`、`Ava神经元发音`、`EPUB纯前端解析`、`句读精读`、`意群断句`、`口语发音打分`、`回声跟读`、`听打Diff`、`词形还原`、`飞行模式`、`LWW时间戳`、`单词闯关`、`闪电配对`、`单词消消乐`、`听音选义`、`原句挖空`、`保底词库`。

---

## 3. 核心模块的“按需乐高式抽取”实战

您不仅可以用它从零开发完整阅读器，更可以像“乐高积木”一样单独抽取某一个硬核模块：

### 模块 A：单独借用“微软 Edge 高保真神经元朗读管道”
- **何时使用**：应用需要高品质自然人声朗读，不想使用机械的原生语音，也不想购买商业云 TTS。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/edge_tts_pipeline.md`，帮我编写一个独立的 `edgeTTS.ts` 模块。需要包含 Sec-MS-GEC 前端防刷算法、短句切片和管道并发预加载。”*

### 模块 B：单独借用“四合一无冲突云端漫游方案”
- **何时使用**：开发多端应用（电脑/手机），需要支持跨端进度、数据双向同步，且不能发生“已删数据复活”和“旧进度覆盖新进度”。
- **调用 Prompt**：
  > *“请依据 `offline-first-reader` 中的 `cloud_sync_and_lww.md`，为我的 Supabase 项目设计进度 LWW 仲裁逻辑与本地墓碑删除队列。”*

### 模块 C：单独借用“突破 5MB 限制的 IndexedDB 本地海量存储”
- **何时使用**：应用需要离线存储数百兆大文件、富文本或离线字典，LocalStorage 频繁报错配额溢出。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/offline_storage_idb.md`，使用 Zustand + idb-keyval 帮我重构全局状态，实现大体积数据的离线持久化。”*

### 模块 D：单独借用“纯前端 EPUB 解析与图片 Base64 永久保存”
- **何时使用**：不想在后端部署臃肿的 Python/Node 解析服务，希望用户在浏览器选定 `.epub` 后纯前端瞬时秒开，且图片离线不丢。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/epub_parser_guide.md`，用 JSZip 和 DOMParser 编写一个纯前端 EPUB 解析函数，并将所有插图转为 Base64 存入段落。”*

### 模块 E：单独借用“本地双擎口语发音评估与红黄绿三色诊断”
- **何时使用**：构建口语练习、背单词、朗读评分功能，不想花钱调用外部口语评分 API，追求 0 延迟和读者隐私安全。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/speech_eval_and_dictation_diff.md`，帮我实现基于 Web Speech API 与 Web Audio API 20fps RMS 包络的双引擎发音打分函数，输出 0-100 分及每个单词的红黄绿诊断状态。”*

### 模块 F：单独借用“单句盲听听打与单词级 LCS Diff 比对”
- **何时使用**：开发精听听写、单词听写打卡功能，需要对比用户输入的文本与标准答案，并精准标出绿底正确、红底删除线多词和虚线漏词。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/speech_eval_and_dictation_diff.md` 中的 `computeWordDiff` 算法，帮我实现一个单词级最小编辑距离对齐组件。”*

### 模块 G：单独借用“启发式意群切片 (Chunking) 与核心语义提取”
- **何时使用**：辅助英文长难句阅读，希望按母语者的语法节奏块用浅灰斜线自然切分，并高亮核心主谓宾骨架。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/sentence_reader_and_chunking.md`，帮我实现正规自然分句器与基于介词/连词的启发式意群断句算法。”*

### 模块 H：单独借用“纯前端形态学词形还原 (Lemmatization) 引擎”
- **何时使用**：本地离线词典查词时，用户点击原著中的复数、过去式、进行时或不规则变形词（如 `cradled`, `went`），需要自动还原为词典原型查询。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/offline_flight_mode_and_lemmatization.md`，帮我实现全套英文形态学词形还原函数，包含不规则动词表、双写辅音还原和屈折后缀还原流水线。”*

### 模块 I：单独借用“移动端控制栏二级自适应收纳与 100dvh 视口高度”
- **何时使用**：窄屏手机端底部或段落悬浮工具栏按钮过多导致挤压折行，或者弹出输入框时被移动端软键盘遮挡。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/mobile_adaptive_ui_and_performance.md`，帮我重构移动端控制栏，实现高频主行+更多折叠展开，并使用 `h-[100dvh]` 适配软键盘避让。”*

### 模块 J：单独借用“单词闯关双模式游戏引擎与保底题库”
- **何时使用**：需要构建背单词游戏化复习模块（如 4×4 单词消消乐、听音原句挖空选义），解决新用户 0 生词冷启动空屏痛点，并提供跨书平滑溯源。
- **调用 Prompt**：
  > *“请参考 `offline-first-reader` 的 `references/word_game_workshop_and_fallback_pool.md`，帮我编写一个包含 Fisher-Yates 洗牌配对消除、Combo 连击、Edge Ava 神经元音频即触点读、原著例句正则挖空盲猜以及 12 词高质量哲思保底词库的完整游戏化学习组件。”*

---

## 4. 跨项目与跨机器复用指南

如果您开启了一个全新的代码仓库（例如新建了一个 `podcast-learner` 项目），如何把这个 Skill 搬过去？

### 步骤（只需 10 秒）：
1. 复制当前项目下的整个技能目录：
   ```bash
   cp -r /path/to/reader/.agents/skills/offline-first-reader /path/to/new-project/.agents/skills/
   ```
2. **全局化配置（可选）**：
   如果您希望电脑上所有的项目都能随时随地默认使用这个技能，可以将它复制到 Antigravity 全局配置目录：
   ```bash
   cp -r .agents/skills/offline-first-reader ~/.gemini/config/skills/
   ```
   复制后，无论在哪个文件夹里开发，只要打开命令行或 IDE，该 Skill 永久生效！

---

## 5. 本 Skill 可以开发什么样的项目？(经典实战案例库)

本技能的底层本质是：**“大容量富文本/富媒体离线存储 + 云端无冲突多端漫游 + 播音级神经元流式音频 + 交互式深度语言学习与口语实训”**。凡是契合该模型的产品，均可借助本 Skill 在极短时间内高质量交付：

### 案例 1：🗣️ 雅思/托福口语影子跟读营 (Echo Shadowing Camp)
- **痛点**：缺乏外教陪练，无法直观感知自己的语速、连读停顿与单词音素偏差。
- **赋能**：借用模块 A（Ava 原音输入）+ 模块 E（本地双擎发音打分）+ 模块 G（意群断句），打造“原音-脑内回声-录音复现-三色诊断”的完美闭环。

### 案例 2：✈️ 万米高空无网听写与阅读器 (High-Altitude Offline Dictation)
- **痛点**：飞机飞行模式下无 Wi-Fi，常规 App 白屏且查词不可用。
- **赋能**：借用模块 H（形态学词形还原）+ 模块 C（IndexedDB 海量缓存）+ 模块 F（听打 Diff），在机舱中断网盲听磨耳朵、查生词并复习闪卡。

### 案例 3：👶 儿童互动有声绘本 (Interactive Picture Books for Kids)
- **痛点**：绘本插图文件大，普通机器音生硬缺少童趣。
- **赋能**：模块 D（EPUB 插画 Base64 离线化）+ 模块 A（微软 Ana 纯真女孩音色）+ 模块 I（防误触大热区触控）。

### 案例 4：🎧 播客与 TED 演讲精听精读学习器 (Podcast & Speech Dictation Learner)
- **痛点**：外语精听训练需要反复重听长难句并逐词盲打听写，传统工具功能分散。
- **赋能**：模块 F（单词级 Diff 比对）+ 模块 A（分句切片零停顿）+ 模块 B（四合一多端漫游）。

### 案例 5：📑 学术文献与科研论文双语工作台 (Academic Paper Bilingual Workbench)
- **痛点**：ArXiv / 英文期刊长篇大论，生词专业门槛高，排版复杂。
- **赋能**：模块 C（海量本地文献）+ 模块 G（核心主谓宾语义高亮，秒看长难句主干）+ 模块 A（论文自然人声朗读）。
