# 本地双擎口语发音评测与听打 Diff 引擎指南 (Speech Evaluation & Dictation Diff Guide)

本参考文档规定了在纯前端 Web 环境中，不依赖任何付费商业云 API，完全基于浏览器原生 Web Speech API 与 Web Audio API 构建**高精度口语发音评估引擎**与**单词级最小编辑距离听打 Diff 校对系统**的架构规范与实现标准。

---

## 1. 系统全景与双引擎并发架构

传统的纯文本语音识别（ASR）无法测量语速起伏、音量节奏与犹豫停顿；而纯音频振幅分析又缺乏语义理解。本项目采用**双引擎并发采集架构**，实现声学与语义的双轨融合：

```
                      ┌── 用户点击麦克风开始录音 ──┐
                      │                            │
                      ▼                            ▼
        【 引擎 A: Web Speech API 】      【 引擎 B: Web Audio API 】
      (SpeechRecognition / continuous)    (AudioContext / ScriptProcessor)
                      │                            │
         实时转录与多候选提取 (Alternatives)        20fps 采集 RMS 音量包络
                      │                            │
                      ▼                            ▼
              识别文本与置信度序列                有效发声时间与长静音停顿比率
                      │                            │
                      └─────────────┬──────────────┘
                                    │
                                    ▼
                 【 多维综合评分与诊断模型 (evaluatePronunciation) 】
                   - 准确率 (60%): LCS + Levenshtein 动态规划
                   - 流利度 (25%): 实际 WPM 对比与静音惩罚
                   - 完整度 (15%): 目标句单词覆盖率
                                    │
                                    ▼
                 【 单词级红黄绿三色信号灯诊断状态 】
                   - 🟢 excellent   - 🟡 good   - 🔴 needs_work
```

---

## 2. 声学与识别会话管理规范

在 `src/utils/speechEvaluation.ts` 中封装录音会话，同时调度两条管线：

```typescript
export interface SpeechEvalSession {
  stop: () => Promise<SpeechEvalRawResult>;
}

export interface SpeechEvalRawResult {
  transcript: string;
  confidence: number;
  durationMs: number;
  speechRatio: number; // 有效发声时长占比 (0.0 ~ 1.0)
  pauseCount: number;  // 显著停顿 (大于 600ms) 次数
}

export function startSpeechEvalSession(stream: MediaStream): SpeechEvalSession {
  const startTime = Date.now();
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(2048, 1, 1);

  let totalFrames = 0;
  let activeFrames = 0;
  let pauseCount = 0;
  let consecutiveSilenceFrames = 0;

  // 20fps 采样声学振幅 (RMS)
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    let sumSquares = 0;
    for (let i = 0; i < input.length; i++) {
      sumSquares += input[i] * input[i];
    }
    const rms = Math.sqrt(sumSquares / input.length);
    totalFrames++;

    const SILENCE_THRESHOLD = 0.015;
    if (rms > SILENCE_THRESHOLD) {
      activeFrames++;
      consecutiveSilenceFrames = 0;
    } else {
      consecutiveSilenceFrames++;
      // 连续静音超过约 600ms 记为一次停顿
      if (consecutiveSilenceFrames === 15) {
        pauseCount++;
      }
    }
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  // 初始化 Web Speech API
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  let finalTranscript = '';
  let highestConfidence = 0.85;

  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
        highestConfidence = Math.max(highestConfidence, event.results[i][0].confidence || 0.85);
      }
    }
  };

  recognition.start();

  return {
    stop: async () => {
      recognition.stop();
      processor.disconnect();
      source.disconnect();
      await audioContext.close();

      const durationMs = Date.now() - startTime;
      const speechRatio = totalFrames > 0 ? activeFrames / totalFrames : 0.8;

      return {
        transcript: finalTranscript.trim(),
        confidence: highestConfidence,
        durationMs,
        speechRatio,
        pauseCount,
      };
    },
  };
}
```

---

## 3. 多维综合评分与三色诊断模型

### 3.1 评分权重与公式
- **综合总分 (Overall Score, 0~100)**：
  $$\text{Score} = 0.60 \times \text{Accuracy} + 0.25 \times \text{Fluency} + 0.15 \times \text{Completeness}$$

1. **准确率 (Accuracy)**：
   - 提取原句标准词列表 $W_{target}$ 与识别词列表 $W_{rec}$；
   - 采用**最长公共子序列 (LCS)** 找出保序命中的单词基底；
   - 对未严格相等的词，采用 **Levenshtein 距离** 计算编辑形似度，公式：
     $$\text{Similarity}(w_1, w_2) = 1 - \frac{\text{Levenshtein}(w_1, w_2)}{\max(|w_1|, |w_2|)}$$
     若形似度 $\ge 0.70$（允许轻微辅音脱落或单复数变化），计为部分命中（相似度得分）。

2. **流利度 (Fluency)**：
   - 标准语速基准：正常英文口语朗读约为 $130 \sim 160\text{ WPM}$；
   - 测算朗读实际 WPM：
     $$\text{WPM} = \frac{|W_{rec}|}{\text{durationMs} / 60000}$$
   - 语速偏离标准区间进行高斯衰减惩罚，同时结合声学静音比率与长停顿扣分：
     $$\text{Fluency} = \text{BaseRateScore} \times \text{speechRatio} - \min(pauseCount \times 4, 25)$$

3. **完整度 (Completeness)**：
   $$\text{Completeness} = \min\left(100, \frac{|W_{matched}|}{|W_{target}|} \times 100\right)$$

### 3.2 单词级三色信号灯状态判断
每一个目标单词被赋予诊断状态：
- 🟢 **`excellent` (良好/极佳)**：完全匹配或 Levenshtein 相似度 $\ge 0.90$；
- 🟡 **`good` (尚可/待改进)**：相似度在 $0.70 \sim 0.89$ 之间，或朗读存在过长犹豫；
- 🔴 **`needs_work` (漏读/严重偏差)**：相似度 $< 0.70$ 或原句词汇未在识别结果中出现。

---

## 4. 单句听打最小编辑距离 Diff 比对机制

在单句听打模式（Dictation）中，为了直观展示用户的拼写正误，系统执行**单词级差分比对 (Word-level LCS Diff)**：

```typescript
export interface DiffToken {
  type: 'match' | 'insert' | 'delete';
  value: string;
}

export function computeWordDiff(target: string, input: string): DiffToken[] {
  // 1. 标准化清洗：去除外围标点并转为小写
  const clean = (s: string) => s.toLowerCase().replace(/[^\w\s']/g, '').trim();
  const targetWords = clean(target).split(/\s+/).filter(Boolean);
  const inputWords = clean(input).split(/\s+/).filter(Boolean);

  // 2. 动态规划构建 LCS 转移矩阵
  const m = targetWords.length;
  const n = inputWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (targetWords[i - 1] === inputWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 3. 双指针回溯生成三种 Diff 标记
  const diffs: DiffToken[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && targetWords[i - 1] === inputWords[j - 1]) {
      diffs.unshift({ type: 'match', value: targetWords[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffs.unshift({ type: 'insert', value: inputWords[j - 1] }); // 用户多打的词
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diffs.unshift({ type: 'delete', value: targetWords[i - 1] }); // 用户漏打的词
      i--;
    }
  }
  return diffs;
}
```

### UI 呈现规范
- `match`：绿色温润药丸背景（`bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300`）；
- `insert`：红色删除线标签（`bg-rose-100 text-rose-800 line-through dark:bg-rose-950/40 dark:text-rose-300`）；
- `delete`：浅灰虚线下划线提示原词（`border-b-2 border-dashed border-amber-500/60 text-muted-foreground`）。

---

## 5. 关键避坑准则 (Gotchas)

1. **麦克风权限生命周期管理与静默释放**：
   - 调用 `navigator.mediaDevices.getUserMedia({ audio: true })` 获得音轨后，必须在录音停止或组件 `useEffect` 卸载时，**显式遍历并停止所有音轨**：
     ```typescript
     stream.getTracks().forEach(track => track.stop());
     ```
   - 若未停止，设备顶部的“麦克风占用指示灯”会持续亮起，严重影响用户体验并造成设备电池损耗。
2. **移动端麦克风权限拒绝与静默兜底**：
   - 用户可能在弹窗中选择“拒绝”麦克风权限。必须使用 `try...catch` 包裹，并在捕获 `NotAllowedError` 时优雅展示友好引导 Toast，禁止抛出未捕获异常导致页面白屏。
3. **单生词查词弹窗复用**：
   - 在正文单词弹窗（`InteractiveWord.tsx`）中同样挂载该评测模块时，由于单词音频较短，应将流利度权重降低（或直接取准确率得分），突出音素与字母发音契合度。
