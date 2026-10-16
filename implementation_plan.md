# 🎯 智能跟读打分与逐词发音诊断（Pronunciation & Shadowing Assessment）实施方案

## 1. 功能定位与核心亮点
借鉴主流词典（有道/欧路）的口语评测体验，采用**零付费 API、纯前端双引擎并行架构（Web Speech API 声学置信度识别 + Web Audio API 声学能量包络监测）**，在**「🔍 句读精读台」**与**「📖 点词查词卡片」**中同步实现实时跟读打分与逐词红绿灯发音诊断。

## 2. 核心模块设计

### 2.1 双引擎语音评测核心 (`src/utils/speechEvaluation.ts`)
- **Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)**：
  - 开启 `lang = "en-US"`、`continuous = true`、`interimResults = true`、`maxAlternatives = 3`，捕获用户英文发音转写候选序列与底层声学置信度 `confidence`。
- **Web Audio API (`AudioContext` + `AnalyserNode`)**：
  - 实时以 20fps 计算时域 RMS 音量包络，精准统计有效发声时长（`voicedDurationMs`）、句中超长卡顿次数（`pauseCount`）以及朗读语速（`wpm`），并在不支持语音识别的浏览器或离线环境下提供声学韵律兜底评分。
- **三维加权评分与红绿灯逐词诊断 (`evaluatePronunciation`)**：
  - **准确度 (`accuracyScore`, 60% 权重)**：基于 LCS 序列对齐与 Levenshtein 字符级音素相似度计算每个目标词的发音得分。
  - **流利度 (`fluencyScore`, 25% 权重)**：结合语速 WPM 舒适区间与句中卡顿惩罚计算。
  - **完整度 (`completenessScore`, 15% 权重)**：统计已清晰读出的目标词占比。
  - **逐词红绿灯诊断 (`wordItems`)**：为句中每个单词标记 `🟢 地道 (excellent)`、`🟡 尚可 (good)`、`🔴 需加强 (needs_work)` 及实际近似发音提示。

### 2.2 句读精读台跟读打分面板 (`src/components/VirtualPager.tsx`)
- 点击 `[🎙️ 跟读打分]` 录音并在结束瞬间自动弹出 **🎯 智能跟读打分与逐词发音诊断面板**。
- 展示综合得分、星级评语、语速/时长，以及「准确度 / 流利度 / 完整度」三维指标徽章。
- **逐词点击纠音与一键入生词本**：点击诊断区任意单词即可重听标准发音；点击黄色/红色待加强词汇可同时播放标准发音并一键收入「生词本」。

### 2.3 查词气泡单词跟读打分 (`src/components/InteractiveWord.tsx`)
- 在查词弹窗顶部喇叭按钮旁新增 `[🎙️ 跟读打分]` 按钮（支持 3.2 秒自动收音评测），实时给出单字发音得分、星级与 `[▶️ 听我的发音]` 对比回放。
