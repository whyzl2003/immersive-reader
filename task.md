# 任务清单 (Task List)

- [x] 1. 构建纯前端双引擎语音评测核心 (`src/utils/speechEvaluation.ts`)
  - [x] 集成 `SpeechRecognition` 英文转写与声学置信度采样
  - [x] 集成 `AudioContext + AnalyserNode` 实时 RMS 音量包络、有效发声时长与卡顿检测
  - [x] 实现 LCS + Levenshtein 字符级相似度对齐算法，输出准确度、流利度、完整度三维评分与红绿灯逐词诊断
- [x] 2. 升级句读精读台跟读打分与逐词纠音 (`src/components/VirtualPager.tsx`)
  - [x] 在 `handleToggleShadowingRecord` 录音生命周期中接入 `startSpeechEvalSession`
  - [x] 渲染「🎯 智能跟读打分与逐词发音诊断」报告卡片（综合得分、星级、WPM 语速、三维指标徽章）
  - [x] 支持点击诊断区任意单词重听标准读音，点击黄/红待加强词自动联动 `handleAddDictationVocab` 一键加入生词本
- [x] 3. 升级查词气泡单词级跟读打分 (`src/components/InteractiveWord.tsx`)
  - [x] 在查词弹窗顶栏新增 `[🎙️ 跟读打分]` 按钮与 3.2s 自动收音评测
  - [x] 显示单词发音得分、星级与 `[▶️ 听我的发音]` 回放按钮
- [x] 4. 编译与边缘打包验证
  - [x] 运行 `npm run pages:build` 验证 TypeScript 与 Cloudflare Pages 边缘打包 0 报错通过
