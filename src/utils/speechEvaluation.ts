/**
 * 智能跟读打分与逐词发音诊断引擎 (Speech & Shadowing Evaluation Engine)
 * 融合浏览器原生 Web Speech API (SpeechRecognition) 实时语音识别与
 * Web Audio API (AudioContext + AnalyserNode) 声学包络流利度分析，
 * 实现零成本、低延迟的「准确度 · 流利度 · 完整度」三维评测与逐词红绿灯诊断。
 */

export type WordPronunciationStatus = "excellent" | "good" | "needs_work";

export interface WordPronunciationItem {
  word: string; // 原句中的显示词
  cleanWord: string; // 清洗标点后的纯单词
  status: WordPronunciationStatus; // excellent(绿) | good(黄) | needs_work(红)
  score: number; // 单字得分 (0 - 100)
  spokenAs?: string; // 若读错，识别出的近似词
}

export interface PronunciationEvaluationResult {
  overallScore: number; // 综合总分 (0 - 100)
  accuracyScore: number; // 准确度得分 (0 - 100)
  fluencyScore: number; // 流利度得分 (0 - 100)
  completenessScore: number; // 完整度得分 (0 - 100)
  stars: number; // 星级 (1 - 5)
  gradeLabel: string; // 段位评语
  recognizedTranscript: string; // 语音识别出的英文原文
  wordItems: WordPronunciationItem[]; // 逐词发音诊断列表
  wpm: number; // 实际跟读语速 (Words Per Minute)
  durationSec: number; // 录音有效时长（秒）
  usedAcousticFallback?: boolean; // 若当前浏览器不支持 SpeechRecognition 则使用声学节奏兜底评测
}

export interface AcousticMetrics {
  totalDurationMs: number;
  voicedDurationMs: number;
  pauseCount: number;
  peakRms: number;
  avgRms: number;
}

/**
 * 清洗并提取英文单词序列
 */
function extractWords(text: string): { raw: string; clean: string }[] {
  if (!text) return [];
  const matches = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || [];
  return matches.map((w) => ({
    raw: w,
    clean: w.toLowerCase().replace(/['’]/g, "'"),
  }));
}

/**
 * 计算两个英文单词的编辑距离相似度 (0.0 ~ 1.0)，兼顾词尾屈折变化与近似音容错
 */
function computeWordSimilarity(expected: string, actual: string): number {
  const a = expected.toLowerCase().replace(/[^a-z0-9]/g, "");
  const b = actual.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!a || !b) return 0;
  if (a === b) return 1.0;

  // 常见词尾变形（复数 s/es、过去式 ed、进行时 ing）高度近似
  const stemA = a.replace(/(?:ing|ed|es|s)$/, "");
  const stemB = b.replace(/(?:ing|ed|es|s)$/, "");
  if (stemA.length >= 3 && stemA === stemB) {
    return 0.86;
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  const distance = dp[m][n];
  const maxLen = Math.max(m, n);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * 根据评分返回星级与温润鼓励评语
 */
function getGradeFeedback(score: number): { stars: number; gradeLabel: string } {
  if (score >= 92) {
    return { stars: 5, gradeLabel: "🏆 惊艳母语感 · 发音饱满流利" };
  }
  if (score >= 82) {
    return { stars: 4, gradeLabel: "🎉 发音纯正自然 · 节奏感极佳" };
  }
  if (score >= 70) {
    return { stars: 3, gradeLabel: "👍 表达清晰良好 · 可微调个别弱读词" };
  }
  if (score >= 55) {
    return { stars: 2, gradeLabel: "💪 渐入佳境 · 建议点击标红词重听跟读" };
  }
  return { stars: 2, gradeLabel: "🌱 勇敢开口第一步 · 慢速跟读效果更佳" };
}

/**
 * 核心跟读评分计算器：结合目标文本、ASR 转写候选集、置信度与声学包络指标生成完整报告
 */
export function evaluatePronunciation(params: {
  targetText: string;
  transcriptCandidates: string[];
  avgConfidence: number;
  acoustic: AcousticMetrics;
}): PronunciationEvaluationResult {
  const { targetText, transcriptCandidates, avgConfidence, acoustic } = params;
  const targetTokens = extractWords(targetText);
  const totalTarget = Math.max(1, targetTokens.length);
  const durationSec = Math.max(
    0.5,
    Math.round((acoustic.totalDurationMs / 1000) * 10) / 10
  );

  // 从多个识别候选中挑选与目标句匹配度最高的一条
  let bestTranscript = (transcriptCandidates[0] || "").trim();
  let bestCandidateScore = -1;

  for (const candidate of transcriptCandidates) {
    const cleanCand = candidate.trim();
    if (!cleanCand) continue;
    const candTokens = extractWords(cleanCand);
    let matchHits = 0;
    for (const t of targetTokens) {
      if (candTokens.some((c) => computeWordSimilarity(t.clean, c.clean) >= 0.75)) {
        matchHits++;
      }
    }
    if (matchHits > bestCandidateScore) {
      bestCandidateScore = matchHits;
      bestTranscript = cleanCand;
    }
  }

  const spokenTokens = extractWords(bestTranscript);
  const hasAsrResult = spokenTokens.length > 0;

  // 若当前浏览器环境未返回语音识别文本（如离线或浏览器不支持 Web Speech API），启用声学包络节奏评测兜底
  if (!hasAsrResult) {
    const hasVoiceSignal =
      acoustic.voicedDurationMs >= 250 || acoustic.peakRms >= 0.02;

    if (!hasVoiceSignal) {
      return {
        overallScore: 0,
        accuracyScore: 0,
        fluencyScore: 0,
        completenessScore: 0,
        stars: 1,
        gradeLabel: "🎤 未检测到清晰人声 · 请靠近麦克风重录",
        recognizedTranscript: "",
        wordItems: targetTokens.map((t) => ({
          word: t.raw,
          cleanWord: t.clean,
          status: "needs_work",
          score: 0,
        })),
        wpm: 0,
        durationSec,
        usedAcousticFallback: true,
      };
    }

    // 基于发声时长与目标词数的匹配度估算节奏与完整度
    const expectedVoicedMs = totalTarget * 360;
    const durationRatio = Math.min(
      acoustic.voicedDurationMs / Math.max(300, expectedVoicedMs),
      expectedVoicedMs / Math.max(300, acoustic.voicedDurationMs)
    );
    const estCompleteness = Math.min(
      96,
      Math.max(60, Math.round(durationRatio * 95))
    );
    const pausePenalty = Math.min(20, Math.max(0, (acoustic.pauseCount - 1) * 5));
    const estFluency = Math.min(
      95,
      Math.max(65, Math.round(88 - pausePenalty))
    );
    const estAccuracy = Math.round((estCompleteness + estFluency) / 2);
    const overall = Math.round(
      estAccuracy * 0.6 + estFluency * 0.25 + estCompleteness * 0.15
    );
    const estWpm = Math.round((totalTarget / durationSec) * 60);
    const { stars, gradeLabel } = getGradeFeedback(overall);

    return {
      overallScore: overall,
      accuracyScore: estAccuracy,
      fluencyScore: estFluency,
      completenessScore: estCompleteness,
      stars,
      gradeLabel: `${gradeLabel}（声学节奏评测）`,
      recognizedTranscript: "",
      wordItems: targetTokens.map((t) => ({
        word: t.raw,
        cleanWord: t.clean,
        status: overall >= 80 ? "excellent" : "good",
        score: overall,
      })),
      wpm: estWpm,
      durationSec,
      usedAcousticFallback: true,
    };
  }

  // 动态规划对齐 targetTokens 与 spokenTokens，支持近似音匹配
  const m = targetTokens.length;
  const n = spokenTokens.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      const sim = computeWordSimilarity(
        targetTokens[i].clean,
        spokenTokens[j].clean
      );
      const matchWeight = sim >= 0.65 ? sim : 0;
      dp[i + 1][j + 1] = Math.max(
        dp[i][j] + matchWeight,
        dp[i + 1][j],
        dp[i][j + 1]
      );
    }
  }

  // 回溯找出每个目标词的最佳对齐识别词
  let i = m;
  let j = n;
  const alignedPairs: {
    target: { raw: string; clean: string };
    spoken?: string;
    similarity: number;
  }[] = [];

  while (i > 0) {
    if (j > 0) {
      const sim = computeWordSimilarity(
        targetTokens[i - 1].clean,
        spokenTokens[j - 1].clean
      );
      const matchWeight = sim >= 0.65 ? sim : 0;
      if (
        matchWeight > 0 &&
        Math.abs(dp[i][j] - (dp[i - 1][j - 1] + matchWeight)) < 1e-6
      ) {
        alignedPairs.unshift({
          target: targetTokens[i - 1],
          spoken: spokenTokens[j - 1].raw,
          similarity: sim,
        });
        i--;
        j--;
        continue;
      }
    }

    if (j > 0 && dp[i][j - 1] > dp[i - 1][j]) {
      j--;
    } else {
      // 检查附近是否有未配对但拼写接近的词，用于提示 spokenAs
      const nearbySpoken = spokenTokens[Math.min(n - 1, Math.max(0, j))]?.raw;
      const nearbySim = nearbySpoken
        ? computeWordSimilarity(targetTokens[i - 1].clean, nearbySpoken)
        : 0;
      alignedPairs.unshift({
        target: targetTokens[i - 1],
        spoken: nearbySim >= 0.4 ? nearbySpoken : undefined,
        similarity: nearbySim,
      });
      i--;
    }
  }

  const effectiveConfidence =
    avgConfidence > 0 ? Math.min(1, Math.max(0.65, avgConfidence)) : 0.88;

  let matchedWordsCount = 0;
  let wordScoreSum = 0;

  const wordItems: WordPronunciationItem[] = alignedPairs.map((pair) => {
    if (pair.similarity >= 0.95) {
      matchedWordsCount += 1;
      const wScore = Math.min(
        100,
        Math.round(88 + effectiveConfidence * 12)
      );
      wordScoreSum += wScore;
      return {
        word: pair.target.raw,
        cleanWord: pair.target.clean,
        status: wScore >= 85 ? "excellent" : "good",
        score: wScore,
      };
    }

    if (pair.similarity >= 0.65) {
      matchedWordsCount += 0.85;
      const wScore = Math.min(
        89,
        Math.max(68, Math.round(pair.similarity * 82 + effectiveConfidence * 10))
      );
      wordScoreSum += wScore;
      return {
        word: pair.target.raw,
        cleanWord: pair.target.clean,
        status: "good",
        score: wScore,
        spokenAs:
          pair.spoken && pair.spoken.toLowerCase() !== pair.target.clean
            ? pair.spoken
            : undefined,
      };
    }

    const partialScore = Math.round(pair.similarity * 50);
    wordScoreSum += partialScore;
    return {
      word: pair.target.raw,
      cleanWord: pair.target.clean,
      status: "needs_work",
      score: partialScore,
      spokenAs: pair.spoken,
    };
  });

  // 1. 准确度 (Accuracy)
  const accuracyScore = Math.min(
    100,
    Math.max(0, Math.round(wordScoreSum / totalTarget))
  );

  // 2. 完整度 (Completeness)
  const completenessScore = Math.min(
    100,
    Math.max(0, Math.round((matchedWordsCount / totalTarget) * 100))
  );

  // 3. 流利度 (Fluency)：结合语速 WPM 与停顿平滑度
  const wpm = Math.round((spokenTokens.length / durationSec) * 60);
  let speedScore = 92;
  if (totalTarget === 1) {
    // 单字跟读：主要考量发音干脆度与准确度
    speedScore = durationSec <= 3.5 ? 95 : 82;
  } else {
    // 句子跟读：英文舒适朗读区间约 85 ~ 175 WPM
    if (wpm >= 90 && wpm <= 170) {
      speedScore = 96;
    } else if (wpm >= 65 && wpm < 90) {
      speedScore = 82 + Math.round(((wpm - 65) / 25) * 12);
    } else if (wpm > 170 && wpm <= 210) {
      speedScore = 86;
    } else {
      speedScore = Math.max(60, 78 - Math.abs(wpm - 110) * 0.25);
    }
  }

  const allowedPauses = Math.max(1, Math.floor(totalTarget / 6));
  const extraPauses = Math.max(0, acoustic.pauseCount - allowedPauses);
  const pausePenalty = Math.min(24, extraPauses * 6);
  const fluencyScore = Math.min(
    100,
    Math.max(45, Math.round(speedScore - pausePenalty))
  );

  // 4. 综合总分 (60% 准确度 + 25% 流利度 + 15% 完整度)
  const overallScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        accuracyScore * 0.6 + fluencyScore * 0.25 + completenessScore * 0.15
      )
    )
  );

  const { stars, gradeLabel } = getGradeFeedback(overallScore);

  return {
    overallScore,
    accuracyScore,
    fluencyScore,
    completenessScore,
    stars,
    gradeLabel,
    recognizedTranscript: bestTranscript,
    wordItems,
    wpm,
    durationSec,
    usedAcousticFallback: false,
  };
}

/**
 * 启动并行语音识别与声学包络监测会话（供 MediaRecorder 录音期间同步调用）
 */
export interface SpeechEvalSession {
  stopAndEvaluate: (targetText: string) => Promise<PronunciationEvaluationResult>;
  abort: () => void;
}

export function startSpeechEvalSession(stream: MediaStream): SpeechEvalSession {
  const startTime = Date.now();
  let voicedFrames = 0;
  let silentFramesInSpeech = 0;
  let pauseCount = 0;
  let inSpeechSegment = false;
  let peakRms = 0;
  let rmsSum = 0;
  let rmsCount = 0;

  // 1. 启动 Web Audio API 声学包络监测
  let audioCtx: AudioContext | null = null;
  let analyserInterval: ReturnType<typeof setInterval> | null = null;

  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Float32Array(analyser.fftSize);
      analyserInterval = setInterval(() => {
        analyser.getFloatTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sumSquares += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        if (rms > peakRms) peakRms = rms;
        rmsSum += rms;
        rmsCount++;

        // 阈值判定是否正在发声
        if (rms > 0.015) {
          voicedFrames++;
          if (inSpeechSegment && silentFramesInSpeech >= 9) {
            // 超过 450ms (9 * 50ms) 的句中停顿记为一次卡顿
            pauseCount++;
          }
          inSpeechSegment = true;
          silentFramesInSpeech = 0;
        } else if (inSpeechSegment) {
          silentFramesInSpeech++;
        }
      }, 50);
    }
  } catch {
    // 忽略部分旧浏览器 AudioContext 初始化异常
  }

  // 2. 启动 Web Speech API (SpeechRecognition / webkitSpeechRecognition) 实时英文语音转写
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let recognition: any = null;
  const finalizedSegments: string[] = [];
  const altFirstSegments: string[] = [];
  let latestInterim = "";
  const confidenceSamples: number[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionClass) {
      recognition = new SpeechRecognitionClass();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            const topTranscript = res[0]?.transcript || "";
            if (topTranscript.trim()) {
              finalizedSegments.push(topTranscript.trim());
            }
            if (typeof res[0]?.confidence === "number" && res[0].confidence > 0) {
              confidenceSamples.push(res[0].confidence);
            }
            if (res[1]?.transcript) {
              altFirstSegments.push(res[1].transcript.trim());
            }
          } else {
            interim += (res[0]?.transcript || "") + " ";
            if (typeof res[0]?.confidence === "number" && res[0].confidence > 0) {
              confidenceSamples.push(res[0].confidence);
            }
          }
        }
        latestInterim = interim.trim();
      };

      recognition.onerror = () => {
        // 静默容错，交由声学包络或已有分片完成评分
      };

      recognition.start();
    }
  } catch {
    // 浏览器不支持 SpeechRecognition 时自动降级
  }

  const cleanupHardware = () => {
    if (analyserInterval) {
      clearInterval(analyserInterval);
      analyserInterval = null;
    }
    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  };

  return {
    stopAndEvaluate: (targetText: string) =>
      new Promise<PronunciationEvaluationResult>((resolve) => {
        const totalDurationMs = Math.max(300, Date.now() - startTime);
        cleanupHardware();

        const finalize = () => {
          const primaryTranscript = [
            ...finalizedSegments,
            latestInterim,
          ]
            .filter(Boolean)
            .join(" ")
            .trim();

          const altTranscript = [
            ...altFirstSegments,
            latestInterim,
          ]
            .filter(Boolean)
            .join(" ")
            .trim();

          const candidates = Array.from(
            new Set([primaryTranscript, altTranscript].filter(Boolean))
          );

          const avgConfidence =
            confidenceSamples.length > 0
              ? confidenceSamples.reduce((a, b) => a + b, 0) /
                confidenceSamples.length
              : 0.86;

          const acoustic: AcousticMetrics = {
            totalDurationMs,
            voicedDurationMs: voicedFrames * 50,
            pauseCount,
            peakRms,
            avgRms: rmsCount > 0 ? rmsSum / rmsCount : 0,
          };

          resolve(
            evaluatePronunciation({
              targetText,
              transcriptCandidates: candidates,
              avgConfidence,
              acoustic,
            })
          );
        };

        if (recognition) {
          let settled = false;
          const finishOnce = () => {
            if (settled) return;
            settled = true;
            finalize();
          };

          recognition.onend = finishOnce;
          try {
            recognition.stop();
          } catch {
            finishOnce();
          }
          // 最多等待 380ms 让浏览器 SpeechRecognition 吐出最后一段 final result
          setTimeout(finishOnce, 380);
        } else {
          finalize();
        }
      }),

    abort: () => {
      cleanupHardware();
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          // 忽略关闭异常
        }
        recognition = null;
      }
    },
  };
}
