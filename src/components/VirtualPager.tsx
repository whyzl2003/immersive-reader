"use client";

import * as React from "react";
import {
  useReaderStore,
  getBookIdentifier,
  DEFAULT_BOOK_ID,
  INITIAL_BOOKSHELF,
  normalizeReadingProgress,
} from "@/src/store/useReaderStore";
import { ALL_PARAGRAPHS } from "@/src/data/bookData";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TocNavigation } from "@/src/components/TocNavigation";
import { GlobalSearch } from "@/src/components/GlobalSearch";
import { BookshelfPanel } from "@/src/components/BookshelfPanel";
import { OfflinePreloadButton } from "@/src/components/OfflinePreloadButton";
import { renderTokenizedParagraph, renderChunkedSentence } from "@/src/lib/tokenizer";
import { playTTS, stopTTS, updateTTSPlaybackRate } from "@/src/lib/audioPlayer";
import { splitParagraphIntoSentences } from "@/src/utils/edgeTTS";
import { lookupOfflineWord } from "@/src/data/offlineDict";
import {
  startSpeechEvalSession,
  type PronunciationEvaluationResult,
  type SpeechEvalSession,
} from "@/src/utils/speechEvaluation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  BookOpen,
  Volume2,
  PenSquare,
  Square,
  Languages,
  Loader2,
  RefreshCw,
  Bookmark,
  Headphones,
  RotateCcw,
  Eye,
  EyeOff,
  X,
  CheckCircle2,
  Search,
  Play,
  SkipBack,
  SkipForward,
  Repeat,
  ChevronDown,
  ChevronUp,
  Mic,
  Scissors,
  Star,
} from "lucide-react";
import { toast } from "sonner";

// 听写比对结果项接口
interface DictationDiffItem {
  type: "correct" | "missing" | "wrong" | "extra";
  word: string;
  expected?: string;
}

interface DictationResult {
  accuracy: number;
  correctCount: number;
  totalWords: number;
  diff: DictationDiffItem[];
}

// 规范化分词函数（提取英文单词并保留连字符与撇号）
const tokenizeWords = (text: string): { raw: string; clean: string }[] => {
  if (!text) return [];
  const matches = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || [];
  return matches.map((w) => ({
    raw: w,
    clean: w.toLowerCase().replace(/['’]/g, "'"),
  }));
};

// LCS 最长公共子序列精准文本比对算法（忽略大小写与标点差异）
const computeDictationDiff = (targetText: string, userInput: string): DictationResult => {
  const targetTokens = tokenizeWords(targetText);
  const userTokens = tokenizeWords(userInput);

  const m = targetTokens.length;
  const n = userTokens.length;

  if (m === 0) {
    return { accuracy: 100, correctCount: 0, totalWords: 0, diff: [] };
  }

  // 动态规划计算 LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (targetTokens[i].clean === userTokens[j].clean) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // 回溯构建 Diff 序列
  let i = m;
  let j = n;
  const rawDiff: DictationDiffItem[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && targetTokens[i - 1].clean === userTokens[j - 1].clean) {
      rawDiff.unshift({
        type: "correct",
        word: targetTokens[i - 1].raw,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawDiff.unshift({
        type: "wrong",
        word: userTokens[j - 1].raw,
      });
      j--;
    } else {
      rawDiff.unshift({
        type: "missing",
        word: targetTokens[i - 1].raw,
      });
      i--;
    }
  }

  // 智能配对优化：将相邻的 [missing, wrong] 或 [wrong, missing] 合并为更直观的“拼错替换”
  const optimizedDiff: DictationDiffItem[] = [];
  for (let k = 0; k < rawDiff.length; k++) {
    const current = rawDiff[k];
    const next = rawDiff[k + 1];

    if (
      current &&
      next &&
      ((current.type === "missing" && next.type === "wrong") ||
        (current.type === "wrong" && next.type === "missing"))
    ) {
      const missingItem = current.type === "missing" ? current : next;
      const wrongItem = current.type === "wrong" ? current : next;

      optimizedDiff.push({
        type: "wrong",
        word: wrongItem.word,
        expected: missingItem.word,
      });
      k++;
    } else {
      optimizedDiff.push(current);
    }
  }

  const correctCount = dp[m][n];
  const accuracy = Math.min(100, Math.max(0, Math.round((correctCount / m) * 100)));

  return {
    accuracy,
    correctCount,
    totalWords: m,
    diff: optimizedDiff,
  };
};

export function VirtualPager() {
  const {
    currentPage,
    pageSize,
    totalPages,
    currentChapterTitle,
    bookshelf,
    currentBookId,
    readingProgress,
    setReadingProgress,
    activePlayingIndex,
    setActivePlayingIndex,
    bookmarks,
    addBookmark,
    removeBookmark,
    setCurrentPage,
    firstPage,
    prevPage,
    nextPage,
    lastPage,
    notesList,
    addNote,
    removeNote,
    addVocab,
    targetParagraphIndex,
    setTargetParagraphIndex,
    paragraphTranslations,
    saveParagraphTranslation,
    ttsSpeed,
    setTtsSpeed,
    sentenceTranslations,
    saveSentenceTranslation,
    offlineWordCache,
    saveOfflineWord,
  } = useReaderStore();

  const scrollViewportRef = React.useRef<HTMLDivElement>(null);
  // 维护段落 DOM 元素引用表，用于朗读时触发视差平滑居中滚动或目录跳转顶部对齐
  const paragraphRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());

  // 目录跳转或书签跳转时的目标段落呼吸高亮
  const [pulseHighlightIndex, setPulseHighlightIndex] = React.useState<number | null>(null);

  // 动态数据源：从当前书籍中提取段落，若无则使用默认世界小史
  const currentBook =
    bookshelf[currentBookId] ||
    bookshelf[DEFAULT_BOOK_ID] ||
    INITIAL_BOOKSHELF[DEFAULT_BOOK_ID];
  const activeParagraphs = currentBook?.paragraphs || ALL_PARAGRAPHS;

  // 记录已恢复过进度的书籍 ID，避免重复弹出提示
  const restoredBookRef = React.useRef<string | null>(null);

  // 1. 初始化恢复位置：挂载或切换书籍时检查并自动恢复上次阅读进度
  React.useEffect(() => {
    if (restoredBookRef.current === currentBookId) return;
    restoredBookRef.current = currentBookId;

    const progressEntry = normalizeReadingProgress(readingProgress[currentBookId]);
    const savedPosition = progressEntry.position;
    if (typeof savedPosition === "number" && savedPosition > 0) {
      const targetPage = Math.floor(savedPosition / pageSize);
      if (targetPage > 0 && targetPage < totalPages && targetPage !== currentPage) {
        setCurrentPage(targetPage);
        toast.info("📍 已为您恢复至上次阅读位置", {
          description: `《${currentBook.title}》已自动定位至第 ${targetPage + 1} 页（段落 #${savedPosition + 1}）`,
          duration: 3500,
        });
      }
    }
  }, [currentBookId, readingProgress, pageSize, totalPages, currentPage, setCurrentPage, currentBook.title]);

  // 2. 捕获并保存进度：翻页后防抖 500ms 存入全局持久化状态
  React.useEffect(() => {
    // 确保当前书籍已完成初始恢复判定后再开启防抖保存
    if (restoredBookRef.current !== currentBookId) return;

    const currentStartIndex = currentPage * pageSize;
    const timer = setTimeout(() => {
      setReadingProgress(currentBookId, currentStartIndex);
    }, 500);

    return () => clearTimeout(timer);
  }, [currentPage, pageSize, currentBookId, setReadingProgress]);

  // 段落内联翻译状态：展开控制、加载状态、临时错误映射表
  const [expandedTranslations, setExpandedTranslations] = React.useState<Record<number, boolean>>({});
  const [loadingTranslations, setLoadingTranslations] = React.useState<Record<number, boolean>>({});
  const [localTranslationErrors, setLocalTranslationErrors] = React.useState<Record<number, string>>({});

  // 当前书籍的 IndexedDB 持久化段落译文
  const bookTranslations = paragraphTranslations[currentBookId] || {};

  // 记随笔弹窗状态与选中段落数据
  const [noteDialogOpen, setNoteDialogOpen] = React.useState(false);
  const [activeNotePara, setActiveNotePara] = React.useState<{
    text: string;
    index: number;
  } | null>(null);
  const [noteContent, setNoteContent] = React.useState("");

  // 段落听写练习（Dictation）专属状态
  const [activeDictationIndex, setActiveDictationIndex] = React.useState<number | null>(null);
  const [dictationInput, setDictationInput] = React.useState("");
  const [dictationResult, setDictationResult] = React.useState<DictationResult | null>(null);
  const [showOriginal, setShowOriginal] = React.useState(false);

  // 🔍 句读（Sentence Reader 逐句精读与多档变速跟读）专属状态
  const [expandedSentenceReaders, setExpandedSentenceReaders] = React.useState<Record<number, boolean>>({});
  const [activeSentenceReaderPara, setActiveSentenceReaderPara] = React.useState<number | null>(null);
  const [sentenceIndices, setSentenceIndices] = React.useState<Record<number, number>>({});
  const [sentencePlayingState, setSentencePlayingState] = React.useState<{
    paraIndex: number;
    sentenceIndex: number;
    mode: "single" | "continuous";
  } | null>(null);
  const [expandedSentenceTrans, setExpandedSentenceTrans] = React.useState<Record<number, boolean>>({});
  const [loadingSentenceTrans, setLoadingSentenceTrans] = React.useState<Record<string, boolean>>({});
  const [sentenceTransErrors, setSentenceTransErrors] = React.useState<Record<string, string>>({});

  // ✂️ 意群斜杠断句与主干透视开关状态
  const [isChunkingMode, setIsChunkingMode] = React.useState<boolean>(false);

  // 📱 手机端句读控制栏“⋯ 更多”折叠状态（桌面端始终全部展开）
  const [showMoreControls, setShowMoreControls] = React.useState<boolean>(false);

  // 🎙️ 原声跟读对比与 🎯 智能跟读打分状态与引用
  const [recordingParaIndex, setRecordingParaIndex] = React.useState<number | null>(null);
  const [shadowingAudioUrls, setShadowingAudioUrls] = React.useState<Record<number, string>>({});
  const [shadowingEvalResults, setShadowingEvalResults] = React.useState<
    Record<number, PronunciationEvaluationResult | null>
  >({});
  const [evaluatingParaIndex, setEvaluatingParaIndex] = React.useState<number | null>(null);
  const [playingUserAudioPara, setPlayingUserAudioPara] = React.useState<number | null>(null);
  const [echoComparingPara, setEchoComparingPara] = React.useState<number | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const audioChunksRef = React.useRef<BlobPart[]>([]);
  const userAudioPlayerRef = React.useRef<HTMLAudioElement | null>(null);
  const shadowingUrlsRef = React.useRef<Record<number, string>>({});
  const speechEvalSessionRef = React.useRef<SpeechEvalSession | null>(null);

  // ✍️ 句读单句听打（Sentence Dictation）专属状态与输入框引用
  const [sentenceDictationOpen, setSentenceDictationOpen] = React.useState<Record<number, boolean>>({});
  const [sentenceDictationInputs, setSentenceDictationInputs] = React.useState<Record<number, string>>({});
  const [sentenceDictationResults, setSentenceDictationResults] = React.useState<
    Record<number, DictationResult | null>
  >({});
  const [sentenceDictationPeeks, setSentenceDictationPeeks] = React.useState<Record<number, boolean>>({});
  const sentenceDictationTextareaRefs = React.useRef<Map<number, HTMLTextAreaElement>>(new Map());

  // 连续听读队列同步会话引用，避免异步回调闭包过期
  const continuousPlayRef = React.useRef<{
    active: boolean;
    paraIndex: number;
    sentenceIndex: number;
    sessionId: number;
  }>({
    active: false,
    paraIndex: -1,
    sentenceIndex: 0,
    sessionId: 0,
  });

  // 移动端轻触唤出段落工具栏状态（纯净沉浸阅读：手机端默认隐藏，轻点段落按需呼出）
  const [activeParagraphIndex, setActiveParagraphIndex] = React.useState<number | null>(null);

  // 停止正在播放的用户跟读录音
  const stopUserRecordedAudio = React.useCallback(() => {
    if (userAudioPlayerRef.current) {
      try {
        userAudioPlayerRef.current.pause();
        userAudioPlayerRef.current.currentTime = 0;
      } catch {
        // 忽略音频暂停异常
      }
      userAudioPlayerRef.current = null;
    }
    setPlayingUserAudioPara(null);
    setEchoComparingPara(null);
  }, []);

  // 停止正在进行的麦克风录音并释放硬件流（abortEval 为 true 时放弃语音评测）
  const stopActiveRecording = React.useCallback((abortEval = false) => {
    if (abortEval && speechEvalSessionRef.current) {
      speechEvalSessionRef.current.abort();
      speechEvalSessionRef.current = null;
      setEvaluatingParaIndex(null);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // 忽略停止异常
      }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setRecordingParaIndex(null);
  }, []);

  // 清理释放指定段落的跟读录音 Blob URL 与发音评测报告
  const revokeShadowingUrl = React.useCallback((paraIndex: number) => {
    const oldUrl = shadowingUrlsRef.current[paraIndex];
    if (oldUrl) {
      try {
        URL.revokeObjectURL(oldUrl);
      } catch {
        // 忽略 URL 释放异常
      }
      delete shadowingUrlsRef.current[paraIndex];
    }
    setShadowingAudioUrls((prev) => {
      if (!prev[paraIndex]) return prev;
      const next = { ...prev };
      delete next[paraIndex];
      return next;
    });
    setShadowingEvalResults((prev) => {
      if (!prev[paraIndex]) return prev;
      const next = { ...prev };
      delete next[paraIndex];
      return next;
    });
  }, []);

  // 清理释放所有跟读录音 Blob URL 与发音评测报告
  const revokeAllShadowingUrls = React.useCallback(() => {
    Object.values(shadowingUrlsRef.current).forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // 忽略 URL 释放异常
      }
    });
    shadowingUrlsRef.current = {};
    setShadowingAudioUrls({});
    setShadowingEvalResults({});
  }, []);

  // 停止句读音频流、连续队列与回声对比
  const stopSentenceReaderAudio = React.useCallback(() => {
    continuousPlayRef.current.active = false;
    continuousPlayRef.current.sessionId++;
    stopTTS();
    stopUserRecordedAudio();
    setSentencePlayingState(null);
    setActivePlayingIndex(null);
  }, [setActivePlayingIndex, stopUserRecordedAudio]);

  // 切换书籍或翻页时自动收起移动端已激活的段落工具栏
  React.useEffect(() => {
    setActiveParagraphIndex(null);
  }, [currentPage, currentBookId]);

  // 核心切片逻辑：根据 currentPage 和 pageSize 从 activeParagraphs 中计算并截取
  const startIndex = currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, activeParagraphs.length);
  const currentParagraphs = React.useMemo(() => {
    return activeParagraphs.slice(startIndex, endIndex);
  }, [activeParagraphs, startIndex, endIndex]);

  // 视差自动跟随：当朗读段落切换时，触发平滑滚动使当前活跃段落居中于舒适阅读区
  React.useEffect(() => {
    if (activePlayingIndex !== null) {
      const el = paragraphRefs.current.get(activePlayingIndex);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activePlayingIndex]);

  // 目录跳转或书签跳转时的精准段落对齐与呼吸灯效果
  React.useEffect(() => {
    if (targetParagraphIndex === null) return;

    // 稍微延迟 60ms 确保 DOM 挂载和布局更新
    const timer = setTimeout(() => {
      const el = paragraphRefs.current.get(targetParagraphIndex);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setPulseHighlightIndex(targetParagraphIndex);
        setTargetParagraphIndex(null);

        const clearTimer = setTimeout(() => {
          setPulseHighlightIndex(null);
        }, 2200);
        return () => clearTimeout(clearTimer);
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [targetParagraphIndex, currentPage, currentParagraphs, setTargetParagraphIndex]);

  // 翻页时停止声音与退出听写状态；若不是目标段落定向跳转，则平滑回滚至顶部
  React.useEffect(() => {
    if (targetParagraphIndex === null && scrollViewportRef.current) {
      scrollViewportRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
    continuousPlayRef.current.active = false;
    continuousPlayRef.current.sessionId++;
    stopTTS();
    stopActiveRecording();
    stopUserRecordedAudio();
    revokeAllShadowingUrls();
    setSentencePlayingState(null);
    setActivePlayingIndex(null);
    setActiveDictationIndex(null);
    setDictationResult(null);
    setShowOriginal(false);
  }, [currentPage, targetParagraphIndex, setActivePlayingIndex, stopActiveRecording, stopUserRecordedAudio, revokeAllShadowingUrls]);

  // 清洗 HTML 标签以获取纯净的朗读与翻译文本
  const stripHtml = React.useCallback((text: string): string => {
    if (!text) return "";
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }, []);

  // 组件卸载时安全停止正在朗读的音频、录音并释放所有 Blob URL
  React.useEffect(() => {
    return () => {
      continuousPlayRef.current.active = false;
      continuousPlayRef.current.sessionId++;
      stopTTS();
      stopActiveRecording();
      stopUserRecordedAudio();
      revokeAllShadowingUrls();
      setActivePlayingIndex(null);
      setActiveDictationIndex(null);
    };
  }, [setActivePlayingIndex, stopActiveRecording, stopUserRecordedAudio, revokeAllShadowingUrls]);

  // 切换全局语速并实时更新正在播放的音频实例
  const handleSpeedChange = (newSpeed: number) => {
    setTtsSpeed(newSpeed);
    updateTTSPlaybackRate(newSpeed);
    const labelMap: Record<number, string> = {
      0.7: "0.7x 慢速",
      0.85: "0.85x 舒缓",
      1.0: "1.0x 正常",
    };
    toast.info(`已切换朗读速度为 ${labelMap[newSpeed] || `${newSpeed}x`}`);
  };

  // 展开 / 收起内联“🔍 句读”精读台面板（关闭时自动清理释放录音 Blob URL）
  const handleToggleSentenceReader = (rawPara: string, index: number) => {
    if (rawPara.trim().startsWith("<img")) {
      toast.info("书籍插图不支持逐句精读");
      return;
    }

    const isCurrentlyOpen = !!expandedSentenceReaders[index];
    if (isCurrentlyOpen) {
      setExpandedSentenceReaders((prev) => ({ ...prev, [index]: false }));
      if (activeSentenceReaderPara === index) {
        setActiveSentenceReaderPara(null);
      }
      if (sentencePlayingState?.paraIndex === index) {
        stopSentenceReaderAudio();
      }
      if (recordingParaIndex === index) {
        stopActiveRecording();
      }
      if (playingUserAudioPara === index || echoComparingPara === index) {
        stopUserRecordedAudio();
      }
      revokeShadowingUrl(index);
      return;
    }

    setExpandedSentenceReaders((prev) => ({ ...prev, [index]: true }));
    setActiveSentenceReaderPara(index);
    setSentenceIndices((prev) => ({
      ...prev,
      [index]: prev[index] ?? 0,
    }));
  };

  // 句读面板：单句朗读（[▶ 听这一句]）
  const handlePlaySingleSentence = (sentence: string, paraIndex: number, sentIdx: number) => {
    const cleanSent = stripHtml(sentence);
    if (!cleanSent) return;

    setActiveSentenceReaderPara(paraIndex);
    // 掐断之前的连续队列、录音播放或其它段落音频
    continuousPlayRef.current.active = false;
    const session = ++continuousPlayRef.current.sessionId;
    stopTTS();
    stopUserRecordedAudio();

    setSentencePlayingState({
      paraIndex,
      sentenceIndex: sentIdx,
      mode: "single",
    });
    setActivePlayingIndex(paraIndex);

    playTTS(cleanSent, {
      playbackRate: ttsSpeed,
      onStart: () => {
        if (continuousPlayRef.current.sessionId !== session) return;
        setSentencePlayingState({
          paraIndex,
          sentenceIndex: sentIdx,
          mode: "single",
        });
        setActivePlayingIndex(paraIndex);
      },
      onEnd: () => {
        if (continuousPlayRef.current.sessionId !== session) return;
        setSentencePlayingState(null);
        setActivePlayingIndex(null);
      },
      onError: () => {
        if (continuousPlayRef.current.sessionId !== session) return;
        setSentencePlayingState(null);
        setActivePlayingIndex(null);
      },
    });
  };

  // 句读面板：从当前句开始连续听读（[🔁 从本句连续听读]）
  const handlePlayContinuousSentences = (
    sentences: string[],
    paraIndex: number,
    startSentIdx: number
  ) => {
    if (!sentences || sentences.length === 0) return;

    setActiveSentenceReaderPara(paraIndex);
    stopTTS();
    stopUserRecordedAudio();
    const session = ++continuousPlayRef.current.sessionId;
    continuousPlayRef.current = {
      active: true,
      paraIndex,
      sentenceIndex: startSentIdx,
      sessionId: session,
    };

    const playNextStep = (idx: number) => {
      if (
        !continuousPlayRef.current.active ||
        continuousPlayRef.current.sessionId !== session
      ) {
        return;
      }

      if (idx >= sentences.length) {
        continuousPlayRef.current.active = false;
        setSentencePlayingState(null);
        setActivePlayingIndex(null);
        toast.success(`段落 #${paraIndex + 1} 逐句连读已完成`);
        return;
      }

      const targetSentence = stripHtml(sentences[idx]);
      if (!targetSentence) {
        playNextStep(idx + 1);
        return;
      }

      // 自动翻到当前句并更新高亮状态
      continuousPlayRef.current.sentenceIndex = idx;
      setSentenceIndices((prev) => ({ ...prev, [paraIndex]: idx }));
      setSentencePlayingState({
        paraIndex,
        sentenceIndex: idx,
        mode: "continuous",
      });
      setActivePlayingIndex(paraIndex);

      playTTS(targetSentence, {
        playbackRate: useReaderStore.getState().ttsSpeed,
        onStart: () => {
          if (
            !continuousPlayRef.current.active ||
            continuousPlayRef.current.sessionId !== session
          ) {
            return;
          }
          setSentenceIndices((prev) => ({ ...prev, [paraIndex]: idx }));
          setSentencePlayingState({
            paraIndex,
            sentenceIndex: idx,
            mode: "continuous",
          });
          setActivePlayingIndex(paraIndex);
        },
        onEnd: () => {
          if (
            !continuousPlayRef.current.active ||
            continuousPlayRef.current.sessionId !== session
          ) {
            return;
          }
          playNextStep(idx + 1);
        },
        onError: () => {
          if (continuousPlayRef.current.sessionId !== session) return;
          continuousPlayRef.current.active = false;
          setSentencePlayingState(null);
          setActivePlayingIndex(null);
        },
      });
    };

    playNextStep(startSentIdx);
  };

  // 句读面板：切换上一句 / 下一句（自动清空上一句听打与录音状态，若处于听打模式则自动播放新切换的这一句）
  const handleStepSentence = (
    paraIndex: number,
    nextIdx: number,
    totalCount: number,
    sentencesList?: string[]
  ) => {
    setActiveSentenceReaderPara(paraIndex);
    const clampedIdx = Math.max(0, Math.min(nextIdx, totalCount - 1));
    if (sentencePlayingState?.paraIndex === paraIndex) {
      stopSentenceReaderAudio();
    }
    if (recordingParaIndex === paraIndex) {
      stopActiveRecording();
    }
    if (playingUserAudioPara === paraIndex || echoComparingPara === paraIndex) {
      stopUserRecordedAudio();
    }
    // 切换上下句时自动清理释放上一句的跟读录音 Blob URL
    revokeShadowingUrl(paraIndex);

    setSentenceIndices((prev) => ({ ...prev, [paraIndex]: clampedIdx }));
    // 切换句子时默认收起中文译文，防剧透保护精读思考
    setExpandedSentenceTrans((prev) => ({ ...prev, [paraIndex]: false }));
    // 自动清空上一句的听打输入内容与核对结果，并恢复盲听模糊保护
    setSentenceDictationInputs((prev) => ({ ...prev, [paraIndex]: "" }));
    setSentenceDictationResults((prev) => ({ ...prev, [paraIndex]: null }));
    setSentenceDictationPeeks((prev) => ({ ...prev, [paraIndex]: false }));

    // 若当前处于“✍️ 听打本句”模式，切换到新句子时自动播放该句发音
    if (sentenceDictationOpen[paraIndex] && sentencesList && sentencesList[clampedIdx]) {
      handlePlaySingleSentence(sentencesList[clampedIdx], paraIndex, clampedIdx);
    }
  };

  // 句读面板：开启 / 退出“✍️ 听打本句”模式
  const handleToggleSentenceDictation = (
    sentence: string,
    paraIndex: number,
    sentIdx: number
  ) => {
    setActiveSentenceReaderPara(paraIndex);
    const isCurrentlyOpen = !!sentenceDictationOpen[paraIndex];
    if (isCurrentlyOpen) {
      setSentenceDictationOpen((prev) => ({ ...prev, [paraIndex]: false }));
      setSentenceDictationResults((prev) => ({ ...prev, [paraIndex]: null }));
      setSentenceDictationPeeks((prev) => ({ ...prev, [paraIndex]: false }));
      if (sentencePlayingState?.paraIndex === paraIndex) {
        stopSentenceReaderAudio();
      }
      return;
    }

    // 开启单句听打：重置输入与结果、开启防偷看模糊、收起中文参考，并立即自动播放当前单句语音
    setSentenceDictationOpen((prev) => ({ ...prev, [paraIndex]: true }));
    setSentenceDictationInputs((prev) => ({ ...prev, [paraIndex]: "" }));
    setSentenceDictationResults((prev) => ({ ...prev, [paraIndex]: null }));
    setSentenceDictationPeeks((prev) => ({ ...prev, [paraIndex]: false }));
    setExpandedSentenceTrans((prev) => ({ ...prev, [paraIndex]: false }));

    handlePlaySingleSentence(sentence, paraIndex, sentIdx);
  };

  // 句读面板：核对本句听打内容（三色 Diff 比对并自动解除原句模糊）
  const handleCheckSentenceDictation = (sentence: string, paraIndex: number) => {
    const userInput = (sentenceDictationInputs[paraIndex] || "").trim();
    if (!userInput) {
      toast.warning("请输入您听到的英文句子后再核对");
      return;
    }

    const cleanTarget = stripHtml(sentence);
    const result = computeDictationDiff(cleanTarget, userInput);
    setSentenceDictationResults((prev) => ({ ...prev, [paraIndex]: result }));
    // 核对完成后自动解除上方原句的模糊遮盖
    setSentenceDictationPeeks((prev) => ({ ...prev, [paraIndex]: true }));

    if (result.accuracy === 100) {
      toast.success("🏆 太棒了！本句听打全对，准确率 100%！🎉");
    } else if (result.accuracy >= 80) {
      toast.info(`🎉 本句听打完成！准确率 ${result.accuracy}%，非常优秀！💪`);
    } else {
      toast.info(
        `💪 本句听打完成！准确率 ${result.accuracy}%，点击拼错/遗漏的词可直接收入生词本。`
      );
    }
  };

  // 🎙️ 句读面板：启动 / 停止原声跟读录音并同步进行 🎯 智能发音评测
  const handleToggleShadowingRecord = async (paraIndex: number, targetSentence: string) => {
    setActiveSentenceReaderPara(paraIndex);

    // 若当前段落正在录音，点击则结束录音并触发自动评分
    if (recordingParaIndex === paraIndex) {
      stopActiveRecording(false);
      return;
    }

    // 录音前先停止正在播放的 TTS 语音、其它录音或回声对比
    stopSentenceReaderAudio();
    stopActiveRecording(true);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      toast.error("未能获取麦克风权限，请检查浏览器设置");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      // 清理上一次评测结果，启动双引擎并行语音识别与声学包络监测
      setShadowingEvalResults((prev) => ({ ...prev, [paraIndex]: null }));
      const evalSession = startSpeechEvalSession(stream);
      speechEvalSessionRef.current = evalSession;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
        setRecordingParaIndex(null);

        if (audioChunksRef.current.length === 0) {
          if (speechEvalSessionRef.current) {
            speechEvalSessionRef.current.abort();
            speechEvalSessionRef.current = null;
          }
          return;
        }

        const mimeType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const blobUrl = URL.createObjectURL(audioBlob);

        // 释放旧 URL 并保存新录音 Blob URL
        const prevUrl = shadowingUrlsRef.current[paraIndex];
        if (prevUrl) {
          try {
            URL.revokeObjectURL(prevUrl);
          } catch {
            // 忽略释放异常
          }
        }
        shadowingUrlsRef.current[paraIndex] = blobUrl;
        setShadowingAudioUrls((prev) => ({
          ...prev,
          [paraIndex]: blobUrl,
        }));

        // 执行智能跟读打分与逐词发音诊断
        const activeEvalSession = speechEvalSessionRef.current;
        speechEvalSessionRef.current = null;
        if (activeEvalSession) {
          setEvaluatingParaIndex(paraIndex);
          try {
            const cleanTarget = stripHtml(targetSentence);
            const evalResult = await activeEvalSession.stopAndEvaluate(cleanTarget);
            setShadowingEvalResults((prev) => ({
              ...prev,
              [paraIndex]: evalResult,
            }));
            const starStr = "⭐".repeat(Math.max(1, evalResult.stars));
            toast.success(`🎯 跟读评分：${evalResult.overallScore} 分 ${starStr}`, {
              description: `${evalResult.gradeLabel} · 点击「🔄 原音+我的对比」或下方诊断词可纠音。`,
            });
          } catch {
            toast.success("🎙️ 跟读录音已完成！");
          } finally {
            setEvaluatingParaIndex((curr) => (curr === paraIndex ? null : curr));
          }
        } else {
          toast.success("🎙️ 跟读录音已完成！", {
            description: "可点击「▶️ 听我的发音」或「🔄 原音+我的对比」体验回声对比法。",
          });
        }
      };

      recorder.start();
      setRecordingParaIndex(paraIndex);
    } catch {
      toast.error("未能获取麦克风权限，请检查浏览器设置");
      setRecordingParaIndex(null);
    }
  };

  // ▶️ 句读面板：单独播放用户刚刚录下的跟读发音
  const handlePlayUserRecording = (paraIndex: number) => {
    setActiveSentenceReaderPara(paraIndex);
    const url = shadowingAudioUrls[paraIndex];
    if (!url) return;

    // 若当前正在单独播放用户录音，再次点击则停止
    if (playingUserAudioPara === paraIndex && echoComparingPara !== paraIndex) {
      stopUserRecordedAudio();
      return;
    }

    stopSentenceReaderAudio();
    stopActiveRecording();

    const userAudio = new Audio(url);
    userAudioPlayerRef.current = userAudio;
    setPlayingUserAudioPara(paraIndex);

    userAudio.onended = () => {
      setPlayingUserAudioPara(null);
      userAudioPlayerRef.current = null;
    };
    userAudio.onerror = () => {
      setPlayingUserAudioPara(null);
      userAudioPlayerRef.current = null;
      toast.error("播放跟读录音失败");
    };

    userAudio.play().catch(() => {
      setPlayingUserAudioPara(null);
      userAudioPlayerRef.current = null;
    });
  };

  // 🔄 句读面板：回声对比法（先由 Ava 按当前语速朗读原句，onEnd 瞬间无缝接力播放用户跟读录音）
  const handleEchoCompare = (
    sentence: string,
    paraIndex: number,
    sentIdx: number
  ) => {
    setActiveSentenceReaderPara(paraIndex);
    const url = shadowingAudioUrls[paraIndex];
    if (!url) return;

    // 若已在回声对比中，点击则立即停止
    if (echoComparingPara === paraIndex) {
      stopSentenceReaderAudio();
      return;
    }

    const cleanSent = stripHtml(sentence);
    if (!cleanSent) return;

    stopSentenceReaderAudio();
    stopActiveRecording();

    const session = ++continuousPlayRef.current.sessionId;
    setEchoComparingPara(paraIndex);
    setSentencePlayingState({
      paraIndex,
      sentenceIndex: sentIdx,
      mode: "single",
    });
    setActivePlayingIndex(paraIndex);

    playTTS(cleanSent, {
      playbackRate: ttsSpeed,
      onStart: () => {
        if (continuousPlayRef.current.sessionId !== session) return;
        setSentencePlayingState({
          paraIndex,
          sentenceIndex: sentIdx,
          mode: "single",
        });
        setActivePlayingIndex(paraIndex);
      },
      onEnd: () => {
        if (continuousPlayRef.current.sessionId !== session) return;
        setSentencePlayingState(null);
        setActivePlayingIndex(null);

        // 原音结束瞬间，无缝接力播放用户跟读录音
        const activeUrl = shadowingUrlsRef.current[paraIndex] || url;
        if (!activeUrl) {
          setEchoComparingPara(null);
          return;
        }

        const userAudio = new Audio(activeUrl);
        userAudioPlayerRef.current = userAudio;
        setPlayingUserAudioPara(paraIndex);

        userAudio.onended = () => {
          setPlayingUserAudioPara(null);
          setEchoComparingPara(null);
          userAudioPlayerRef.current = null;
        };
        userAudio.onerror = () => {
          setPlayingUserAudioPara(null);
          setEchoComparingPara(null);
          userAudioPlayerRef.current = null;
        };
        userAudio.play().catch(() => {
          setPlayingUserAudioPara(null);
          setEchoComparingPara(null);
          userAudioPlayerRef.current = null;
        });
      },
      onError: () => {
        if (continuousPlayRef.current.sessionId !== session) return;
        setSentencePlayingState(null);
        setActivePlayingIndex(null);
        setEchoComparingPara(null);
      },
    });
  };

  // ⭐ 句读面板：金句一键收藏（打通“📒 我的笔记”，连同单句译文与【✨ 句读金句收藏】标签存入）
  const handleToggleFavoriteSentence = (
    sentence: string,
    paraIndex: number,
    totalSentencesInPara: number
  ) => {
    setActiveSentenceReaderPara(paraIndex);
    const cleanSent = stripHtml(sentence).replace(/\s+/g, " ").trim();
    if (!cleanSent) return;

    const existingParaNote = notesList.find(
      (n) =>
        (n.bookId || DEFAULT_BOOK_ID) === currentBook.id &&
        n.paragraphIndex === paraIndex
    );

    const rawTrans =
      sentenceTranslations[sentence] ||
      sentenceTranslations[cleanSent] ||
      (totalSentencesInPara === 1 ? bookTranslations[paraIndex] : "");
    const validTrans =
      rawTrans &&
      !rawTrans.startsWith("单句翻译") &&
      !rawTrans.startsWith("翻译获取失败") &&
      !rawTrans.startsWith("✈️")
        ? rawTrans.trim()
        : "";

    const isAlreadyFavorited = Boolean(
      existingParaNote &&
        (existingParaNote.context.trim() === cleanSent ||
          existingParaNote.context.includes(cleanSent) ||
          existingParaNote.note.includes(cleanSent)) &&
        existingParaNote.note.includes("【✨ 句读金句收藏】")
    );

    if (isAlreadyFavorited && existingParaNote) {
      // 若此前收藏时还未加载中文译文，而现在已有中文译文，则自动补全中文译文
      if (validTrans && !existingParaNote.note.includes(validTrans)) {
        const enrichedNote = `${existingParaNote.note}\n中文参考：${validTrans}`;
        addNote({
          paragraphIndex: paraIndex,
          page: Math.floor(paraIndex / pageSize) + 1,
          context: existingParaNote.context,
          note: enrichedNote,
          bookId: currentBook.id,
          bookTitle: currentBook.title,
        });
        toast.success("🌟 已将本句中文译文同步更新至「📒 我的笔记」！");
        return;
      }

      // 若该段笔记仅由此金句构成，再次点击支持取消收藏
      if (
        existingParaNote.context.trim() === cleanSent &&
        existingParaNote.note.startsWith("【✨ 句读金句收藏】")
      ) {
        removeNote(existingParaNote.id);
        toast.info("已取消收藏该金句");
        return;
      }

      toast.info("🌟 该金句已收藏在「📒 我的笔记」中！");
      return;
    }

    const favoriteTagContent = validTrans
      ? `【✨ 句读金句收藏】\n中文参考：${validTrans}`
      : `【✨ 句读金句收藏】`;

    if (existingParaNote) {
      const combinedContext = existingParaNote.context.includes(cleanSent)
        ? existingParaNote.context
        : `${existingParaNote.context}\n${cleanSent}`;
      const combinedNote = `${existingParaNote.note}\n\n${favoriteTagContent}（“${cleanSent}”）`;
      addNote({
        paragraphIndex: paraIndex,
        page: Math.floor(paraIndex / pageSize) + 1,
        context: combinedContext,
        note: combinedNote,
        bookId: currentBook.id,
        bookTitle: currentBook.title,
      });
    } else {
      addNote({
        paragraphIndex: paraIndex,
        page: Math.floor(paraIndex / pageSize) + 1,
        context: cleanSent,
        note: favoriteTagContent,
        bookId: currentBook.id,
        bookTitle: currentBook.title,
      });
    }

    toast.success("🌟 金句已收藏至「📒 我的笔记」！", {
      description: validTrans
        ? "已连同本句中文译文及所属书名一并收录，支持一键回到原文或导出 Obsidian。"
        : "已绑定所属书名与段落溯源，可在「📒 我的笔记」中查看或导出 Obsidian。",
    });
  };

  // ⌨️ 句读面板：全键盘极客操控心流（Space 重听/停止 · ←/→ 切换上下句 · D 听打本句 · C 意群断句）
  React.useEffect(() => {
    const openParaKeys = Object.keys(expandedSentenceReaders)
      .map(Number)
      .filter((idx) => expandedSentenceReaders[idx]);

    if (openParaKeys.length === 0) return;

    const targetParaIndex =
      activeSentenceReaderPara !== null &&
      expandedSentenceReaders[activeSentenceReaderPara]
        ? activeSentenceReaderPara
        : openParaKeys[0];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // 当焦点位于任何 input / textarea / select 或可编辑区域内时不触发全局句读快捷键
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          activeEl.isContentEditable)
      ) {
        return;
      }

      const rawPara = activeParagraphs[targetParaIndex];
      if (!rawPara || rawPara.trim().startsWith("<img")) return;

      const cleanPara = stripHtml(rawPara);
      const sentences = splitParagraphIntoSentences(cleanPara);
      const totalSentences = Math.max(1, sentences.length);
      const currentSentIdx = Math.min(
        Math.max(0, sentenceIndices[targetParaIndex] ?? 0),
        totalSentences - 1
      );
      const currentSentence = sentences[currentSentIdx] || cleanPara;

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        const isCurrentParaPlaying =
          sentencePlayingState?.paraIndex === targetParaIndex ||
          activePlayingIndex === targetParaIndex ||
          playingUserAudioPara === targetParaIndex ||
          echoComparingPara === targetParaIndex;
        if (isCurrentParaPlaying) {
          stopSentenceReaderAudio();
        } else {
          handlePlaySingleSentence(
            currentSentence,
            targetParaIndex,
            currentSentIdx
          );
        }
      } else if (e.code === "ArrowLeft" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (currentSentIdx > 0) {
          handleStepSentence(
            targetParaIndex,
            currentSentIdx - 1,
            totalSentences,
            sentences
          );
        }
      } else if (e.code === "ArrowRight" || e.key === "ArrowRight") {
        e.preventDefault();
        if (currentSentIdx < totalSentences - 1) {
          handleStepSentence(
            targetParaIndex,
            currentSentIdx + 1,
            totalSentences,
            sentences
          );
        }
      } else if (e.code === "KeyD" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        if (!sentenceDictationOpen[targetParaIndex]) {
          handleToggleSentenceDictation(
            currentSentence,
            targetParaIndex,
            currentSentIdx
          );
        }
        setTimeout(() => {
          sentenceDictationTextareaRefs.current.get(targetParaIndex)?.focus();
        }, 40);
      } else if (e.code === "KeyC" || e.key === "c" || e.key === "C") {
        e.preventDefault();
        setIsChunkingMode((prev) => {
          const next = !prev;
          toast.info(
            next
              ? "✂️ 已开启意群断句与主干透视"
              : "已关闭意群断句"
          );
          return next;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // 句读面板：按需获取并缓存单句中文参考译文
  const fetchSingleSentenceTranslation = async (
    sentence: string,
    paraIndex: number,
    totalSentencesInPara: number
  ) => {
    const cleanKey = stripHtml(sentence).replace(/\s+/g, " ").trim();
    if (!cleanKey) return;

    // 1. 优先查本地 IndexedDB 的 sentenceTranslations 缓存
    const cached = sentenceTranslations[sentence] || sentenceTranslations[cleanKey];
    if (
      cached &&
      !cached.startsWith("翻译获取失败") &&
      !cached.startsWith("✈️")
    ) {
      return;
    }

    // 若本段仅有 1 句，且整段翻译缓存已存在，则直接复用并同步写入单句缓存
    if (totalSentencesInPara === 1 && bookTranslations[paraIndex]) {
      const paraTrans = bookTranslations[paraIndex];
      if (!paraTrans.startsWith("翻译获取失败") && !paraTrans.startsWith("✈️")) {
        saveSentenceTranslation(cleanKey, paraTrans);
        return;
      }
    }

    // 2. 离线状态检测
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const offlineMsg =
        "✈️ 当前处于离线模式，该句尚未缓存译文（联网点开一次后即可离线永久查看）";
      setSentenceTransErrors((prev) => ({ ...prev, [cleanKey]: offlineMsg }));
      return;
    }

    // 3. 在线请求 /api/translate-text 并持久化存入 sentenceTranslations
    setLoadingSentenceTrans((prev) => ({ ...prev, [cleanKey]: true }));
    try {
      const res = await fetch("/api/translate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanKey }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.translation) {
        saveSentenceTranslation(cleanKey, data.translation);
        setSentenceTransErrors((prev) => {
          const next = { ...prev };
          delete next[cleanKey];
          return next;
        });
      } else {
        const errMsg = data?.translation || "单句翻译获取失败，请稍后重试";
        setSentenceTransErrors((prev) => ({ ...prev, [cleanKey]: errMsg }));
      }
    } catch {
      setSentenceTransErrors((prev) => ({
        ...prev,
        [cleanKey]: "单句翻译请求异常，请检查网络后重试",
      }));
    } finally {
      setLoadingSentenceTrans((prev) => ({ ...prev, [cleanKey]: false }));
    }
  };

  // 切换句读面板中的“📖 查看本句中文参考”展开状态
  const handleToggleSentenceTrans = (
    sentence: string,
    paraIndex: number,
    totalSentencesInPara: number
  ) => {
    const isNowOpen = !expandedSentenceTrans[paraIndex];
    setExpandedSentenceTrans((prev) => ({ ...prev, [paraIndex]: isNowOpen }));
    if (isNowOpen) {
      fetchSingleSentenceTranslation(sentence, paraIndex, totalSentencesInPara);
    }
  };

  // 段落朗读：跨浏览器原生自适应高保真 TTS（支持 Ava 等顶级神经元发音人与段落呼吸灯）
  const handleSpeakParagraph = (rawPara: string, index: number) => {
    // 停止可能正在进行的句读连续队列
    continuousPlayRef.current.active = false;
    continuousPlayRef.current.sessionId++;
    setSentencePlayingState(null);

    // 若当前正在朗读该段落，点击则停止
    if (activePlayingIndex === index) {
      stopTTS();
      setActivePlayingIndex(null);
      toast.info("已停止朗读");
      return;
    }

    // 过滤掉纯插图，避免向 TTS 传入无效数据
    if (rawPara.trim().startsWith("<img")) {
      toast.info("此内容为书籍插图，无朗读文本");
      return;
    }

    const cleanText = stripHtml(rawPara);
    if (!cleanText) return;

    // 播放前先调用 cancel() 掐断旧声音，并立即更新当前段落为活跃高亮状态
    setActivePlayingIndex(index);

    playTTS(cleanText, {
      playbackRate: ttsSpeed,
      onStart: () => {
        setActivePlayingIndex(index);
        toast.info(`正在朗读段落 #${index + 1}...`);
      },
      onEnd: () => {
        setActivePlayingIndex(null);
      },
      onError: () => {
        setActivePlayingIndex(null);
      },
    });
  };

  // 听写练习：重播朗读音频（每次点击均从头播放）
  const handleReplayDictation = (rawPara: string, index: number) => {
    continuousPlayRef.current.active = false;
    continuousPlayRef.current.sessionId++;
    setSentencePlayingState(null);
    stopTTS();
    const cleanText = stripHtml(rawPara);
    if (!cleanText) return;

    setActivePlayingIndex(index);
    playTTS(cleanText, {
      playbackRate: ttsSpeed,
      onStart: () => {
        setActivePlayingIndex(index);
        toast.info(`正在重听段落 #${index + 1}...`);
      },
      onEnd: () => {
        setActivePlayingIndex(null);
      },
      onError: () => {
        setActivePlayingIndex(null);
      },
    });
  };

  // 开启 / 退出段落听写练习
  const handleToggleDictation = (rawPara: string, index: number) => {
    if (activeDictationIndex === index) {
      setActiveDictationIndex(null);
      setDictationResult(null);
      stopTTS();
      setActivePlayingIndex(null);
      return;
    }

    setActiveDictationIndex(index);
    setDictationInput("");
    setDictationResult(null);
    setShowOriginal(false);

    // 自动播放该段落朗读音频
    handleReplayDictation(rawPara, index);
  };

  // 核对听写内容
  const handleCheckDictation = (rawPara: string) => {
    if (!dictationInput.trim()) {
      toast.warning("请输入听到的英文内容后再核对");
      return;
    }

    const cleanTarget = stripHtml(rawPara);
    const result = computeDictationDiff(cleanTarget, dictationInput);
    setDictationResult(result);
    // 核对完毕后解除模糊，方便对照排查
    setShowOriginal(true);

    if (result.accuracy === 100) {
      toast.success("太棒了！听写全对，准确率 100%！🎉");
    } else if (result.accuracy >= 80) {
      toast.info(`听写完成！准确率 ${result.accuracy}%，非常优秀！💪`);
    } else {
      toast.info(`听写完成！准确率 ${result.accuracy}%，点击拼错/遗漏的词可直接收入生词本。`);
    }
  };

  // 一键将听写错词或生词存入生词本（联动离线词典与在线查词获取真实释义）
  const handleAddDictationVocab = async (
    word: string,
    rawContext: string,
    index: number,
    sourceNote = "来自听写练习中的遗漏/拼错词汇"
  ) => {
    const cleanWord = word.replace(/[^a-zA-Z'-]/g, "").replace(/^['-]+|['-]+$/g, "").trim();
    if (!cleanWord) return;

    const lowerWord = cleanWord.toLowerCase();
    const contextSnippet = stripHtml(rawContext).slice(0, 180);

    // 1. 优先从本地预载词库或内置核心离线词典匹配释义
    const offlineMatch = lookupOfflineWord(lowerWord);
    let resolvedTranslation: string =
      (offlineWordCache && offlineWordCache[lowerWord]) ||
      (offlineMatch ? offlineMatch.translation : "") ||
      "";

    // 2. 若本地未命中且当前在线，快速请求查词接口补全中文释义
    if (!resolvedTranslation && typeof navigator !== "undefined" && navigator.onLine) {
      try {
        const res = await fetch(`/api/translate?word=${encodeURIComponent(cleanWord)}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.success && data?.translation) {
          resolvedTranslation = data.translation;
          saveOfflineWord(lowerWord, data.translation);
        }
      } catch {
        // 忽略网络波动，使用兜底标注
      }
    }

    const finalTranslation = resolvedTranslation || "听写重点生词";

    addVocab({
      word: cleanWord,
      translation: finalTranslation,
      context: contextSnippet,
      paragraphIndex: index,
      bookId: currentBook.id,
      bookTitle: currentBook.title,
      note: sourceNote,
    });

    toast.success(`已将 "${cleanWord}" 添加至生词本！`, {
      description: `${finalTranslation} · 可在生词本或 3D 闪卡中复习巩固。`,
    });
  };

  // 打开段落记随笔弹窗
  const handleOpenNoteDialog = (rawPara: string, index: number) => {
    const isImage = rawPara.trim().startsWith("<img");
    const cleanText = isImage ? "[书籍插图]" : stripHtml(rawPara);
    setActiveNotePara({ text: cleanText, index });
    setNoteContent("");
    setNoteDialogOpen(true);
  };

  // 保存段落读书随笔
  const handleSaveParagraphNote = () => {
    if (!activeNotePara) return;
    if (!noteContent.trim()) {
      toast.error("请输入笔记内容");
      return;
    }

    addNote({
      paragraphIndex: activeNotePara.index,
      page: Math.floor(activeNotePara.index / pageSize) + 1,
      context: activeNotePara.text,
      note: noteContent.trim(),
    });

    setNoteDialogOpen(false);
    setActiveNotePara(null);
    setNoteContent("");
    toast.success(`已为段落 #${activeNotePara.index + 1} 保存读书随笔！`);
  };

  // 切换段落自定义书签（添加/移除）
  const handleToggleBookmark = (rawPara: string, index: number) => {
    const isImage = rawPara.trim().startsWith("<img");
    const cleanSnippet = isImage ? "[书籍插图]" : stripHtml(rawPara);

    const existing = bookmarks.find(
      (b) => b.bookId === currentBookId && b.paragraphIndex === index
    );
    if (existing) {
      removeBookmark(existing.id);
      toast.info(`已移除段落 #${index + 1} 的书签`);
    } else {
      addBookmark(currentBookId, index, cleanSnippet);
      toast.success(`已为段落 #${index + 1} 添加书签！`, {
        description: "可在目录侧边栏查看、重命名或快速定位。",
      });
    }
  };

  // 切换段落内联翻译：支持展开/收起、前端状态缓存与加载动画
  const handleToggleTranslation = async (rawPara: string, index: number) => {
    const isExpanded = !!expandedTranslations[index];

    // 若当前已展开，再次点击则收起
    if (isExpanded) {
      setExpandedTranslations((prev) => ({ ...prev, [index]: false }));
      return;
    }

    // 插图无需翻译
    if (rawPara.trim().startsWith("<img")) {
      toast.info("书籍插图无需翻译");
      return;
    }

    const cleanText = stripHtml(rawPara);
    if (!cleanText) return;

    // 展开内联面板
    setExpandedTranslations((prev) => ({ ...prev, [index]: true }));

    // 1. 若本地 IndexedDB 中已有成功译文，直接使用，0 延迟秒开
    const cachedTranslation = bookTranslations[index];
    if (
      cachedTranslation &&
      !cachedTranslation.startsWith("翻译获取失败") &&
      !cachedTranslation.startsWith("✈️ 当前处于离线模式")
    ) {
      return;
    }

    // 2. 检查当前是否离线
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (isOffline) {
      const offlineMsg = "✈️ 当前处于离线模式，该段未预载译文（可在有网时点击顶部‘预载译文’提前缓存）";
      setLocalTranslationErrors((prev) => ({ ...prev, [index]: offlineMsg }));
      toast.info(offlineMsg);
      return;
    }

    // 3. 在线异步请求翻译
    setLoadingTranslations((prev) => ({ ...prev, [index]: true }));
    try {
      const res = await fetch("/api/translate-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: cleanText }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.translation) {
        // 成功存入本地 IndexedDB 持久化缓存！
        saveParagraphTranslation(currentBookId, index, data.translation);
        setLocalTranslationErrors((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
      } else {
        const errorDetail = data?.error ? ` (${data.error})` : "";
        const errMsg = data?.translation || `翻译获取失败，请重试${errorDetail}`;
        setLocalTranslationErrors((prev) => ({
          ...prev,
          [index]: errMsg,
        }));
        toast.error(errMsg);
      }
    } catch (error) {
      console.error("段落翻译请求异常:", error);
      const errorDetail = error instanceof Error ? ` (${error.message})` : "";
      const errMsg = `翻译获取失败，请重试${errorDetail}`;
      setLocalTranslationErrors((prev) => ({
        ...prev,
        [index]: errMsg,
      }));
      toast.error(errMsg);
    } finally {
      setLoadingTranslations((prev) => ({ ...prev, [index]: false }));
    }
  };

  // 进度百分比计算
  const progressPercent = Math.round(((currentPage + 1) / totalPages) * 100);

  return (
    <Card className="border-border bg-card shadow-sm transition-all duration-300">
      {/* 顶部章节信息、全文搜索与目录快捷条 */}
      <CardHeader className="py-3 px-6 border-b border-border/60 bg-muted/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-4 h-4 text-primary shrink-0" />
            <span
              className="font-serif font-semibold text-sm truncate text-foreground"
              title={currentChapterTitle}
            >
              {currentChapterTitle}
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
            {/* 当前段落区间标示 */}
            <span className="text-xs font-mono text-muted-foreground bg-background/80 px-2 py-0.5 rounded border border-border/50 hidden md:inline">
              第 {startIndex + 1} - {endIndex} 段 / 共 {activeParagraphs.length} 段
            </span>

            {/* ✈️ 候机室神器：一键离线预载后续译文 */}
            <OfflinePreloadButton variant="ghost" size="sm" className="h-8 border border-border/40 hover:bg-muted" />

            {/* 📚 我的书架抽屉 */}
            <BookshelfPanel />

            {/* 🔍 全文搜索组件 */}
            <GlobalSearch />

            {/* 📑 TOC 目录抽屉按钮 */}
            <TocNavigation />
          </div>
        </div>
      </CardHeader>

      {/* 正文滚动阅读区：采用温润羊皮纸衬线字体与舒缓行距 */}
      <CardContent className="p-6">
        <div
          ref={scrollViewportRef}
          className="h-[calc(100dvh-14rem)] min-h-[420px] max-h-[860px] w-full rounded-lg border border-border/60 bg-background/60 p-6 sm:p-8 overflow-y-auto scroll-smooth"
        >
          <div className="space-y-7 pt-3 font-serif text-[17px] sm:text-[18px] leading-[1.85] text-foreground max-w-3xl mx-auto">
            {currentParagraphs.map((para, index) => {
              const globalIndex = startIndex + index;
              const isSpeaking = activePlayingIndex === globalIndex;
              const isExpanded = !!expandedTranslations[globalIndex];
              const isLoading = !!loadingTranslations[globalIndex];
              const translationText = bookTranslations[globalIndex] || localTranslationErrors[globalIndex];

              // 识别段落语义类型：插图、标题或普通段落
              const isImage = para.trim().startsWith("<img");
              const headingMatch = !isImage ? para.match(/^<(h[1-6])[^>]*>([\s\S]*)<\/\1>$/i) : null;
              const isHeading = !!headingMatch;

              // 当前段落的书签状态
              const currentBookmark = bookmarks.find(
                (b) => b.bookId === currentBookId && b.paragraphIndex === globalIndex
              );
              const isBookmarked = !!currentBookmark;

              // 当前段落的听写与模糊状态
              const isDictating = activeDictationIndex === globalIndex;
              const isBlurred = isDictating && !showOriginal && !dictationResult;
              const isPulseTarget = pulseHighlightIndex === globalIndex;

              // 当前段落的“🔍 句读”面板展开与播放状态
              const isSentenceReaderOpen = !!expandedSentenceReaders[globalIndex];
              const isThisParaSentencePlaying =
                sentencePlayingState?.paraIndex === globalIndex;

              return (
                <div
                  key={globalIndex}
                  id={`paragraph-${globalIndex}`}
                  ref={(el) => {
                    if (el) {
                      paragraphRefs.current.set(globalIndex, el);
                    } else {
                      paragraphRefs.current.delete(globalIndex);
                    }
                  }}
                  onClick={() => {
                    setActiveParagraphIndex((prev) => (prev === globalIndex ? null : globalIndex));
                  }}
                  className={`group relative pl-8 sm:pl-10 pr-2 sm:pr-4 rounded-r-lg cursor-pointer sm:cursor-default transition-all duration-300 ${
                    isPulseTarget
                      ? "border-l-4 border-primary bg-primary/10 ring-2 ring-primary/40 rounded-md py-2.5 shadow-sm transition-all duration-700"
                      : isDictating || isSentenceReaderOpen
                      ? "border-l-4 border-amber-600/70 bg-amber-50/25 dark:bg-amber-950/15 py-2.5 rounded-md shadow-xs transition-all duration-300"
                      : isSpeaking
                      ? "border-l-4 border-amber-500 bg-amber-100/40 dark:bg-amber-950/25 rounded-md shadow-[0_0_15px_rgba(251,191,36,0.15)] py-2.5 transition-all duration-1000 ease-in-out"
                      : isExpanded
                      ? "border-l-2 border-primary/50 bg-muted/15 py-1.5 transition-all duration-700 ease-in-out"
                      : isBookmarked
                      ? "border-l-2 border-amber-500/50 bg-amber-500/5 py-1.5 transition-all duration-700 ease-in-out"
                      : activeParagraphIndex === globalIndex
                      ? "border-l-2 border-amber-500/40 bg-amber-500/5 py-1.5 transition-all duration-300 ease-in-out"
                      : "border-l-2 border-transparent hover:border-primary/40 hover:bg-muted/10 py-1.5 transition-all duration-700 ease-in-out"
                  }`}
                >
                  {/* 全局段落序号 */}
                  <span
                    className={`absolute left-2.5 top-2.5 text-[11px] font-mono select-none transition-colors ${
                      isSpeaking
                        ? "text-amber-600 dark:text-amber-400 font-bold"
                        : isBookmarked
                        ? "text-amber-500 font-bold"
                        : "text-muted-foreground/50 group-hover:text-primary"
                    }`}
                  >
                    {String(globalIndex + 1).padStart(2, "0")}
                  </span>

                  {/* 悬浮/移动端轻量操作栏：桌面端上移至段落右上方 -top-7 right-2，彻底避免遮挡第一行末尾文字 */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`items-center justify-end gap-2 sm:gap-1 mb-1.5 sm:mb-0 sm:absolute sm:-top-7 sm:right-2 before:content-[''] before:hidden sm:before:block before:absolute before:-bottom-3 before:left-0 before:right-0 before:h-3 p-1 rounded-lg sm:rounded-md border border-border/50 sm:border-border/60 bg-card/85 sm:bg-card/95 backdrop-blur-xs shadow-2xs sm:shadow-xs z-20 transition-all ${
                      isSpeaking || isSentenceReaderOpen
                        ? "flex opacity-100"
                        : activeParagraphIndex === globalIndex
                        ? "flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 animate-in fade-in-50 duration-200"
                        : "hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100"
                    }`}
                  >
                    {/* 🔊 段落朗读按钮（仅非图片段落展示） */}
                    {!isImage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-9 w-9 min-w-[36px] min-h-[36px] sm:h-6 sm:w-6 sm:min-w-0 sm:min-h-0 p-0 flex items-center justify-center rounded-md sm:rounded transition-colors ${
                          isSpeaking && !isThisParaSentencePlaying
                            ? "text-amber-600 dark:text-amber-400 bg-amber-500/20 hover:bg-amber-500/30 animate-pulse font-bold"
                            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSpeakParagraph(para, globalIndex);
                        }}
                        title={isSpeaking ? "停止朗读" : "朗读该段落 (Sentence TTS)"}
                      >
                        {isSpeaking && !isThisParaSentencePlaying ? (
                          <Square className="w-3.5 h-3.5 sm:w-3 sm:h-3 fill-current" />
                        ) : (
                          <Volume2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        )}
                      </Button>
                    )}

                    {/* 🔍 句读（Sentence Reader 逐句精读与多档变速跟读）按钮（仅非图片段落展示） */}
                    {!isImage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-9 px-2 min-w-[36px] min-h-[36px] sm:h-6 sm:px-1.5 sm:min-w-0 sm:min-h-0 flex items-center justify-center gap-0.5 rounded-md sm:rounded transition-colors cursor-pointer ${
                          isSentenceReaderOpen
                            ? "bg-amber-600/20 border border-amber-600/40 text-amber-900 dark:text-amber-100 font-bold shadow-2xs"
                            : "bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 sm:bg-transparent sm:border-transparent sm:text-muted-foreground sm:hover:text-primary sm:hover:bg-primary/10"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSentenceReader(para, globalIndex);
                        }}
                        title={isSentenceReaderOpen ? "收起逐句精读台" : "🔍 句读：开启逐句精读与多档变速跟读 (Sentence Reader)"}
                      >
                        <Search className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0" />
                        <span className="text-[12px] sm:text-[11px] font-serif font-semibold leading-none select-none">
                          句读
                        </span>
                      </Button>
                    )}

                    {/* 译 段落整句翻译按钮（仅非图片段落展示） */}
                    {!isImage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-9 w-9 min-w-[36px] min-h-[36px] sm:h-6 sm:w-6 sm:min-w-0 sm:min-h-0 p-0 flex items-center justify-center rounded-md sm:rounded transition-colors ${
                          isExpanded
                            ? "bg-amber-500/25 border border-amber-500/40 text-amber-900 dark:text-amber-100 font-bold shadow-2xs"
                            : "bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 sm:bg-transparent sm:border-transparent sm:text-muted-foreground sm:hover:text-primary sm:hover:bg-primary/10"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTranslation(para, globalIndex);
                        }}
                        title={isExpanded ? "收起中文译文" : "查看段落翻译 (Translate)"}
                      >
                        <span className="text-[13px] sm:text-[12px] font-serif font-bold leading-none select-none">
                          译
                        </span>
                      </Button>
                    )}

                    {/* 🎧 听写练习按钮（仅非图片段落展示） */}
                    {!isImage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-9 w-9 min-w-[36px] min-h-[36px] sm:h-6 sm:w-6 sm:min-w-0 sm:min-h-0 p-0 flex items-center justify-center rounded-md sm:rounded transition-colors ${
                          activeDictationIndex === globalIndex
                            ? "text-primary bg-primary/20 font-bold"
                            : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleDictation(para, globalIndex);
                        }}
                        title={activeDictationIndex === globalIndex ? "退出听写练习" : "段落听写练习 (Dictation)"}
                      >
                        <Headphones className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      </Button>
                    )}

                    {/* 🔖 自定义书签/动态目录标记按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-9 w-9 min-w-[36px] min-h-[36px] sm:h-6 sm:w-6 sm:min-w-0 sm:min-h-0 p-0 flex items-center justify-center rounded-md sm:rounded transition-colors ${
                        isBookmarked
                          ? "text-amber-500 hover:text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 font-bold"
                          : "text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                      }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleBookmark(para, globalIndex);
                        }}
                      title={isBookmarked ? "移除此段书签" : "将此段添加至书签/动态目录"}
                    >
                      <Bookmark className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${isBookmarked ? "fill-current" : ""}`} />
                    </Button>

                    {/* 📝 记读书随笔按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 min-w-[36px] min-h-[36px] sm:h-6 sm:w-6 sm:min-w-0 sm:min-h-0 p-0 flex items-center justify-center rounded-md sm:rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenNoteDialog(para, globalIndex);
                      }}
                      title="为此段记录读书随笔"
                    >
                      <PenSquare className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </Button>
                  </div>

                  {/* 已收藏书签常驻右侧静默徽标（桌面端非悬浮时可见） */}
                  {isBookmarked && (
                    <span
                      className="absolute right-2 -top-5 text-amber-500/80 pointer-events-none group-hover:opacity-0 transition-opacity hidden sm:inline"
                      title="已设为书签"
                    >
                      <Bookmark className="w-3.5 h-3.5 fill-current" />
                    </span>
                  )}

                  {/* 结构化节点多态排版与深度分词点读渲染 */}
                  {(() => {
                    // 1. 插图节点
                    if (isImage) {
                      const imgMatch = para.match(/<img[^>]+src="([^">]+)"(?:[^>]*alt="([^">]*)")?/i);
                      const imgSrc = imgMatch ? imgMatch[1] : "";
                      const imgAlt = imgMatch ? imgMatch[2] : "";

                      return (
                        <div className="my-3 flex flex-col items-center justify-center">
                          <img
                            src={imgSrc}
                            alt={imgAlt || "书籍插图"}
                            className="max-h-[520px] w-auto max-w-full rounded-xl object-contain shadow-md border border-border/50 bg-background/50 p-1.5 transition-all"
                            loading="lazy"
                          />
                          {imgAlt && (
                            <span className="text-xs text-muted-foreground mt-2 italic font-serif text-center">
                              {imgAlt}
                            </span>
                          )}
                        </div>
                      );
                    }

                    // 2. 标题节点 (<h1> ~ <h6>)
                    if (headingMatch) {
                      const headingTag = headingMatch[1].toLowerCase();
                      const headingText = stripHtml(headingMatch[2]);

                      return (
                        <div
                          className={`font-serif tracking-wide transition-all duration-300 ${
                            headingTag === "h1"
                              ? "text-2xl sm:text-3xl font-bold text-primary mt-6 mb-3 border-b border-border/40 pb-2"
                              : headingTag === "h2"
                              ? "text-xl sm:text-2xl font-bold text-foreground mt-5 mb-2.5"
                              : headingTag === "h3"
                              ? "text-lg sm:text-xl font-semibold text-foreground/90 mt-4 mb-2"
                              : "text-base sm:text-lg font-semibold text-foreground/80 mt-3 mb-1.5"
                          } ${isSpeaking ? "text-amber-600 dark:text-amber-400" : ""} ${
                            isBlurred ? "filter blur-sm select-none opacity-30 pointer-events-none" : ""
                          }`}
                        >
                          {renderTokenizedParagraph(headingText, headingText, globalIndex, globalIndex)}
                        </div>
                      );
                    }

                    // 3. 正文段落节点 (<p> 或纯文本)
                    const cleanParaText =
                      para.startsWith("<p>") && para.endsWith("</p>")
                        ? stripHtml(para)
                        : para;

                    return (
                      <div className="relative">
                        <p
                          className={`tracking-normal text-justify select-text transition-all duration-300 ${
                            isSpeaking ? "text-foreground font-medium" : "text-foreground/90"
                          } ${isBlurred ? "filter blur-sm select-none opacity-30 pointer-events-none" : ""}`}
                        >
                          {renderTokenizedParagraph(cleanParaText, cleanParaText, globalIndex, globalIndex)}
                        </p>
                        {isBlurred && (
                          <div className="my-2 flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => setShowOriginal(true)}
                              className="bg-card/90 backdrop-blur-xs border border-border/80 px-3 py-1 rounded-full shadow-xs text-xs font-serif text-muted-foreground hover:text-foreground hover:border-primary/50 cursor-pointer transition-all flex items-center gap-1.5"
                              title="点击临时偷看原文"
                            >
                              <Eye className="w-3.5 h-3.5 text-primary" />
                              <span>正文已模糊防偷看 · 点击临时查看原文</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 🔍 内联句读精读台面板 (Sentence Reader Panel) */}
                  {isSentenceReaderOpen && !isImage && (() => {
                    const cleanParaForSentences = stripHtml(para);
                    const sentences = splitParagraphIntoSentences(cleanParaForSentences);
                    const totalSentences = Math.max(1, sentences.length);
                    const currentSentIdx = Math.min(
                      Math.max(0, sentenceIndices[globalIndex] ?? 0),
                      totalSentences - 1
                    );
                    const currentSentence = sentences[currentSentIdx] || cleanParaForSentences;
                    const cleanSentenceKey = currentSentence.replace(/\s+/g, " ").trim();

                    const isThisSentPlaying =
                      isThisParaSentencePlaying &&
                      sentencePlayingState?.sentenceIndex === currentSentIdx;
                    const isContinuousMode =
                      isThisParaSentencePlaying &&
                      sentencePlayingState?.mode === "continuous";

                    const isSentTransOpen = !!expandedSentenceTrans[globalIndex];
                    const isSentTransLoading = !!loadingSentenceTrans[cleanSentenceKey];
                    const cachedSentTrans =
                      sentenceTranslations[currentSentence] ||
                      sentenceTranslations[cleanSentenceKey] ||
                      (totalSentences === 1 ? bookTranslations[globalIndex] : undefined) ||
                      sentenceTransErrors[cleanSentenceKey];

                    // ✍️ 单句听打状态与防偷看模糊判定
                    const isSentDictating = !!sentenceDictationOpen[globalIndex];
                    const sentDictationInput = sentenceDictationInputs[globalIndex] || "";
                    const sentDictationResult = sentenceDictationResults[globalIndex] || null;
                    const isSentPeeked = !!sentenceDictationPeeks[globalIndex];
                    const isSentBlurred =
                      isSentDictating && !isSentPeeked && !sentDictationResult;

                    // 🎙️ 原声跟读录音、回声对比与 🎯 智能跟读评测状态
                    const isRecordingThisPara = recordingParaIndex === globalIndex;
                    const isEvaluatingThisPara = evaluatingParaIndex === globalIndex;
                    const currentShadowingUrl = shadowingAudioUrls[globalIndex];
                    const currentEvalResult = shadowingEvalResults[globalIndex] || null;
                    const isPlayingUserAudio = playingUserAudioPara === globalIndex;
                    const isEchoComparing = echoComparingPara === globalIndex;

                    // ⭐ 当前单句是否已收藏至“📒 我的笔记”
                    const existingParaNote = notesList.find(
                      (n) =>
                        (n.bookId || DEFAULT_BOOK_ID) === currentBook.id &&
                        n.paragraphIndex === globalIndex
                    );
                    const isSentenceFavorited = Boolean(
                      existingParaNote &&
                        (existingParaNote.context.trim() === cleanSentenceKey ||
                          existingParaNote.context.includes(cleanSentenceKey) ||
                          existingParaNote.note.includes(cleanSentenceKey)) &&
                        existingParaNote.note.includes("【✨ 句读金句收藏】")
                    );

                    return (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSentenceReaderPara(globalIndex);
                        }}
                        className="mt-3.5 rounded-xl border border-amber-500/35 bg-amber-50/45 dark:bg-amber-950/20 p-4 sm:p-5 shadow-xs space-y-3.5 transition-all duration-300 animate-in fade-in-50"
                      >
                        {/* a) 顶部状态栏：逐句精读进度 + [✂️ 意群断句] + 朗读速度下拉框 + [⭐ 收藏本句] + 状态提示文本 */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-amber-500/25 text-xs font-serif">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-md">
                              <Search className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
                              <span>
                                逐句精读 · 第 {currentSentIdx + 1} / {totalSentences} 句
                              </span>
                            </span>

                            {/* 状态提示文本 */}
                            {isRecordingThisPara ? (
                              <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-bold animate-pulse">
                                <Mic className="w-3.5 h-3.5" />
                                <span>正在录制您的跟读发音...</span>
                              </span>
                            ) : isEchoComparing ? (
                              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-semibold animate-pulse">
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>
                                  {isPlayingUserAudio
                                    ? "回声对比中 · 正在播放您的发音..."
                                    : "回声对比中 · 正在播放 Ava 原音..."}
                                </span>
                              </span>
                            ) : isPlayingUserAudio ? (
                              <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium animate-pulse">
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>正在回放您的跟读录音...</span>
                              </span>
                            ) : isThisParaSentencePlaying ? (
                              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-medium animate-pulse">
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>
                                  {isContinuousMode
                                    ? `连续听读中 · 正在朗读第 ${(sentencePlayingState?.sentenceIndex ?? currentSentIdx) + 1} 句...`
                                    : `正在朗读第 ${(sentencePlayingState?.sentenceIndex ?? currentSentIdx) + 1} 句...`}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">
                                点击句中任意单词可直接查词与看词源
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            {/* [✂️ 意群断句] 开关按钮 */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveSentenceReaderPara(globalIndex);
                                setIsChunkingMode((prev) => !prev);
                              }}
                              className={`h-7 px-2.5 rounded-md border text-xs font-serif inline-flex items-center gap-1 transition-all cursor-pointer ${
                                isChunkingMode
                                  ? "bg-amber-600/20 border-amber-600/60 text-amber-950 dark:text-amber-100 font-bold shadow-2xs"
                                  : "border-amber-500/35 bg-background/85 text-muted-foreground hover:text-foreground hover:bg-amber-500/10"
                              }`}
                              title="开启意群斜杠断句与插入语弱化（主干透视），快捷键：C"
                            >
                              <Scissors className="w-3 h-3" />
                              <span>✂️ 意群断句</span>
                            </button>

                            {/* 朗读速度下拉选择器 */}
                            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-serif">
                              <span className="hidden sm:inline">朗读速度:</span>
                              <select
                                value={String(ttsSpeed)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleSpeedChange( parseFloat(e.target.value) );
                                }}
                                className="h-7 rounded-md border border-amber-500/40 bg-background/90 px-2 py-0.5 text-xs font-mono font-medium text-foreground shadow-2xs focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                                title="调整 Ava 神经元语音与离线语音的朗读倍速"
                              >
                                <option value="0.7">0.7x 慢速</option>
                                <option value="0.85">0.85x 舒缓</option>
                                <option value="1">1.0x 正常</option>
                              </select>
                            </label>

                            {/* [⭐ 收藏本句] / [🌟 已收藏] 金句一键收藏按钮 */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavoriteSentence(
                                  currentSentence,
                                  globalIndex,
                                  totalSentences
                                );
                              }}
                              className={`h-7 px-2.5 rounded-md border text-xs font-serif inline-flex items-center gap-1 transition-all cursor-pointer ${
                                isSentenceFavorited
                                  ? "bg-amber-500/25 border-amber-500/70 text-amber-950 dark:text-amber-100 font-bold shadow-2xs"
                                  : "border-amber-500/35 bg-background/85 text-amber-900 dark:text-amber-200 hover:bg-amber-500/15"
                              }`}
                              title={
                                isSentenceFavorited
                                  ? "该金句已收录至「📒 我的笔记」（点击可更新译文或取消收藏）"
                                  : "将本句连同中文译文与【✨ 句读金句收藏】标签一键存入「📒 我的笔记」"
                              }
                            >
                              <Star
                                className={`w-3 h-3 ${
                                  isSentenceFavorited
                                    ? "fill-amber-500 text-amber-500"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                              />
                              <span>{isSentenceFavorited ? "🌟 已收藏" : "⭐ 收藏本句"}</span>
                            </button>

                            {/* 收起句读面板按钮 */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSentenceReader(para, globalIndex);
                              }}
                              title="收起逐句精读台"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* 句子进度指示点（多句时支持点击任意句点快速跳句） */}
                        {totalSentences > 1 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {sentences.map((_, sIdx) => {
                              const isCurrent = sIdx === currentSentIdx;
                              const isPlayingDot =
                                isThisParaSentencePlaying &&
                                sentencePlayingState?.sentenceIndex === sIdx;
                              return (
                                <button
                                  key={sIdx}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStepSentence(
                                      globalIndex,
                                      sIdx,
                                      totalSentences,
                                      sentences
                                    );
                                  }}
                                  className={`h-5 min-w-[22px] px-1.5 rounded text-[11px] font-mono transition-all cursor-pointer ${
                                    isPlayingDot
                                      ? "bg-amber-500 text-white font-bold ring-2 ring-amber-400/50 animate-pulse"
                                      : isCurrent
                                      ? "bg-amber-600/85 text-white font-semibold shadow-2xs"
                                      : "bg-background/70 text-muted-foreground hover:bg-amber-500/20 hover:text-foreground border border-border/50"
                                  }`}
                                  title={`跳转至第 ${sIdx + 1} 句`}
                                >
                                  {sIdx + 1}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* b) 核心展示区：大号衬线字体醒目展示当前选中单句，支持意群斜杠断句与主干透视，内部单词 100% 包裹 <InteractiveWord> */}
                        <div
                          className={`relative p-3.5 sm:p-4 rounded-lg border transition-all duration-300 ${
                            isThisSentPlaying || isEchoComparing
                              ? "bg-amber-100/50 dark:bg-amber-950/35 border-amber-500/60 ring-2 ring-amber-500/30 shadow-xs"
                              : "bg-background/85 border-amber-500/25 shadow-2xs"
                          }`}
                        >
                          <div
                            className={`text-lg font-serif leading-relaxed text-foreground select-text transition-all duration-300 ${
                              isSentBlurred
                                ? "filter blur-md select-none opacity-40 pointer-events-none"
                                : ""
                            }`}
                          >
                            {isChunkingMode
                              ? renderChunkedSentence(
                                  currentSentence,
                                  currentSentence,
                                  `sr-chunk-${globalIndex}-${currentSentIdx}`,
                                  globalIndex
                                )
                              : renderTokenizedParagraph(
                                  currentSentence,
                                  currentSentence,
                                  `sr-${globalIndex}-${currentSentIdx}`,
                                  globalIndex
                                )}
                          </div>

                          {/* ✂️ 意群断句开启时的轻量视觉图例 */}
                          {isChunkingMode && !isSentBlurred && (
                            <div className="mt-2 pt-1.5 border-t border-amber-500/15 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-serif select-none">
                              <span className="inline-flex items-center gap-1">
                                <span className="text-amber-600 dark:text-amber-400 font-sans font-bold">
                                  /
                                </span>
                                <span>意群换气与连读停顿点</span>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <span className="italic opacity-65">斜体浅色</span>
                                <span>插入语修饰成分（弱化以凸显主谓宾主干）</span>
                              </span>
                            </div>
                          )}

                          {/* 防偷看盲听保护悬浮按钮：[👀 偷看一眼] / [🙈 恢复遮盖] */}
                          {isSentDictating && !sentDictationResult && (
                            <div
                              className={`${
                                isSentBlurred
                                  ? "absolute inset-0 flex items-center justify-center z-10"
                                  : "mt-2 flex items-center justify-end"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSentenceDictationPeeks((prev) => ({
                                    ...prev,
                                    [globalIndex]: !prev[globalIndex],
                                  }));
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-serif bg-card/95 backdrop-blur-xs border border-amber-500/40 text-amber-900 dark:text-amber-100 hover:bg-amber-500/15 shadow-xs cursor-pointer transition-all"
                                title={
                                  isSentBlurred
                                    ? "临时取消模糊偷看一眼原句"
                                    : "恢复原句模糊进入盲听状态"
                                }
                              >
                                {isSentBlurred ? (
                                  <>
                                    <Eye className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                    <span>👀 偷看一眼</span>
                                  </>
                                ) : (
                                  <>
                                    <EyeOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                    <span>🙈 恢复盲听遮盖</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* c) 核心控制栏：[▶ 听这一句] | [⏮ 上一句] / [⏭ 下一句] | [✍️ 听打本句] | [🔁 从本句连续听读] | [⏹ 停止] + 🎙️ 原声跟读对比区 */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            {/* [▶ 听这一句] */}
                            <Button
                              variant="default"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlaySingleSentence(
                                  currentSentence,
                                  globalIndex,
                                  currentSentIdx
                                );
                              }}
                              className="h-8 px-3 text-xs font-serif gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-2xs cursor-pointer"
                              title="使用当前设定语速朗读此单句（快捷键：空格）"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>听这一句</span>
                            </Button>

                            {/* [上一句] */}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={currentSentIdx <= 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStepSentence(
                                  globalIndex,
                                  currentSentIdx - 1,
                                  totalSentences,
                                  sentences
                                );
                              }}
                              className="h-8 px-2.5 text-xs font-serif gap-1 border-amber-500/35 bg-background/80 hover:bg-amber-500/10 cursor-pointer disabled:opacity-40"
                              title="切换到上一句（快捷键：←）"
                            >
                              <SkipBack className="w-3.5 h-3.5" />
                              <span>上一句</span>
                            </Button>

                            {/* [下一句] */}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={currentSentIdx >= totalSentences - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStepSentence(
                                  globalIndex,
                                  currentSentIdx + 1,
                                  totalSentences,
                                  sentences
                                );
                              }}
                              className="h-8 px-2.5 text-xs font-serif gap-1 border-amber-500/35 bg-background/80 hover:bg-amber-500/10 cursor-pointer disabled:opacity-40"
                              title="切换到下一句（快捷键：→）"
                            >
                              <span>下一句</span>
                              <SkipForward className="w-3.5 h-3.5" />
                            </Button>

                            {/* 手机端“⋯ 更多 / 收起”开关：折叠 ✍️听打本句 与 🔁连续听读，桌面端隐藏 */}
                            <Button
                              variant="outline"
                              size="sm"
                              aria-expanded={showMoreControls}
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowMoreControls((prev) => !prev);
                              }}
                              className="sm:hidden h-9 min-w-[36px] px-2.5 text-xs font-serif gap-1 border-amber-500/35 bg-background/80 hover:bg-amber-500/10 cursor-pointer"
                              title={showMoreControls ? "收起更多功能" : "展开更多功能：听打本句、连续听读"}
                            >
                              <span>{showMoreControls ? "收起" : "⋯ 更多"}</span>
                            </Button>

                            {/* [✍️ 听打本句] / [👁️ 退出听打] */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSentenceDictation(
                                  currentSentence,
                                  globalIndex,
                                  currentSentIdx
                                );
                              }}
                              className={`h-8 px-3 text-xs font-serif gap-1.5 cursor-pointer transition-all ${
                                isSentDictating
                                  ? "bg-amber-600/20 text-amber-950 dark:text-amber-100 font-bold border-amber-600/60 shadow-2xs"
                                  : "border-amber-500/40 bg-background/80 hover:bg-amber-500/15 text-foreground"
                              } ${
                                showMoreControls || isSentDictating || isContinuousMode
                                  ? ""
                                  : "hidden sm:inline-flex"
                              }`}
                              title={
                                isSentDictating
                                  ? "退出单句盲听打字模式"
                                  : "开启本句盲听打字与三色 Diff 核对（快捷键：D）"
                              }
                            >
                              <span>{isSentDictating ? "👁️ 退出听打" : "✍️ 听打本句"}</span>
                            </Button>

                            {/* [🔁 从本句连续听读] */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlayContinuousSentences(
                                  sentences,
                                  globalIndex,
                                  currentSentIdx
                                );
                              }}
                              className={`h-8 px-3 text-xs font-serif gap-1.5 border-amber-500/40 cursor-pointer ${
                                isContinuousMode
                                  ? "bg-amber-500/20 text-amber-900 dark:text-amber-100 font-bold border-amber-500"
                                  : "bg-background/80 hover:bg-amber-500/15 text-foreground"
                              } ${
                                showMoreControls || isSentDictating || isContinuousMode
                                  ? ""
                                  : "hidden sm:inline-flex"
                              }`}
                              title="从当前选中句开始，自动一句接一句连续播放至本段末尾"
                            >
                              <Repeat className="w-3.5 h-3.5" />
                              <span>从本句连续听读</span>
                            </Button>

                            {/* [停止] */}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={
                                !isThisParaSentencePlaying &&
                                activePlayingIndex !== globalIndex &&
                                !isPlayingUserAudio &&
                                !isEchoComparing
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                stopSentenceReaderAudio();
                              }}
                              className={`h-8 px-2.5 text-xs font-serif gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-40 ${
                                isThisParaSentencePlaying ||
                                activePlayingIndex === globalIndex ||
                                isPlayingUserAudio ||
                                isEchoComparing
                                  ? ""
                                  : "hidden sm:inline-flex"
                              }`}
                              title="立即中断当前音频流、回声对比或连续听读队列"
                            >
                              <Square className="w-3 h-3 fill-current" />
                              <span>停止</span>
                            </Button>

                            {/* 🎙️ 原声跟读对比（Echo Shadowing 录音与连播）按钮组 */}
                            <div className="flex flex-wrap items-center gap-1.5 pl-0 sm:pl-1.5 sm:border-l sm:border-amber-500/30">
                              <Button
                                variant={isRecordingThisPara ? "default" : "outline"}
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleShadowingRecord(globalIndex, currentSentence);
                                }}
                                className={`h-8 px-3 text-xs font-serif gap-1.5 cursor-pointer transition-all ${
                                  isRecordingThisPara
                                    ? "bg-red-600 hover:bg-red-700 text-white font-bold animate-pulse ring-2 ring-red-400/50 shadow-xs"
                                    : "border-amber-500/40 bg-background/80 hover:bg-amber-500/15 text-foreground"
                                }`}
                                title={
                                  isRecordingThisPara
                                    ? "点击停止跟读录音并生成发音评测报告"
                                    : "开启麦克风录制本句跟读发音并进行 AI 智能发音评分"
                                }
                              >
                                <span>
                                  {isRecordingThisPara
                                    ? "⏹ 结束录音并打分..."
                                    : "🎙️ 跟读打分"}
                                </span>
                              </Button>

                              {/* 录音完成后浮现：[▶️ 听我的发音] 与 [🔄 原音+我的对比] */}
                              {currentShadowingUrl && !isRecordingThisPara && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePlayUserRecording(globalIndex);
                                    }}
                                    className={`h-8 px-2.5 text-xs font-serif gap-1 cursor-pointer transition-all ${
                                      isPlayingUserAudio && !isEchoComparing
                                        ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-900 dark:text-emerald-100 font-bold"
                                        : "border-amber-500/40 bg-background/85 hover:bg-amber-500/15 text-foreground"
                                    }`}
                                    title="单独回放您刚刚录下的跟读音频"
                                  >
                                    <span>
                                      {isPlayingUserAudio && !isEchoComparing
                                        ? "⏹ 停止回放"
                                        : "▶️ 听我的发音"}
                                    </span>
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEchoCompare(
                                        currentSentence,
                                        globalIndex,
                                        currentSentIdx
                                      );
                                    }}
                                    className={`h-8 px-3 text-xs font-serif gap-1 cursor-pointer transition-all ${
                                      isEchoComparing
                                        ? "bg-amber-600 text-white font-bold border-amber-600 shadow-xs animate-pulse"
                                        : "border-amber-600/50 bg-amber-500/15 hover:bg-amber-500/25 text-amber-950 dark:text-amber-100 font-semibold"
                                    }`}
                                    title="回声对比法（Echo Method）：先由 Ava 朗读原句，结束瞬间无缝接力播放您的跟读录音"
                                  >
                                    <span>
                                      {isEchoComparing
                                        ? "🔄 回声对比中..."
                                        : "🔄 原音+我的对比"}
                                    </span>
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 🎯 智能跟读打分与逐词发音诊断面板 */}
                        {(isEvaluatingThisPara || currentEvalResult) && (
                          <div className="pt-2.5 border-t border-amber-500/25 animate-in fade-in-50 duration-200">
                            {isEvaluatingThisPara && !currentEvalResult ? (
                              <div className="flex items-center gap-2 py-2.5 px-3.5 rounded-lg bg-background/85 border border-amber-500/30 text-xs font-serif text-amber-800 dark:text-amber-200">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                <span>🎯 正在进行声学包络与逐词发音诊断...</span>
                              </div>
                            ) : currentEvalResult ? (
                              <div className="rounded-lg bg-background/90 border border-amber-500/35 p-3.5 space-y-3 shadow-2xs">
                                {/* 顶部综合得分、星级与三维指标栏 */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border/50">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-serif font-bold border ${
                                        currentEvalResult.overallScore >= 85
                                          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/35"
                                          : currentEvalResult.overallScore >= 68
                                          ? "bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-500/40"
                                          : "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/35"
                                      }`}
                                    >
                                      <span>🎯 发音总分：{currentEvalResult.overallScore} 分</span>
                                      <span className="tracking-tighter">
                                        {"⭐".repeat(Math.max(1, currentEvalResult.stars))}
                                      </span>
                                    </span>

                                    <span className="text-xs font-serif font-semibold text-foreground/90">
                                      {currentEvalResult.gradeLabel}
                                    </span>

                                    <span className="text-[11px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/50">
                                      语速 {currentEvalResult.wpm} 词/分 · 时长 {currentEvalResult.durationSec}s
                                    </span>
                                  </div>

                                  {/* 三维细分指标徽章 */}
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/25">
                                      准确度 {currentEvalResult.accuracyScore}%
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-800 dark:text-sky-200 border border-sky-500/25">
                                      流利度 {currentEvalResult.fluencyScore}%
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-900 dark:text-amber-200 border border-amber-500/25">
                                      完整度 {currentEvalResult.completenessScore}%
                                    </span>
                                  </div>
                                </div>

                                {/* 简化评分提示：未启用语音识别时，分数仅基于语速与停顿，逐词诊断仅供参考 */}
                                {currentEvalResult.usedAcousticFallback && (
                                  <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[11px] font-serif text-amber-900 dark:text-amber-200">
                                    <span>⚠️</span>
                                    <span>
                                      当前为<b>简化评分</b>：未能识别到语音内容（浏览器不支持语音识别、离线或声音过小），分数仅依据语速与停顿，逐词诊断仅供参考。建议使用 Chrome / Edge 并保持联网以获得完整评测。
                                    </span>
                                  </div>
                                )}

                                {/* 逐词发音红绿灯诊断区 */}
                                {currentEvalResult.wordItems.length > 0 && (
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground font-serif">
                                      <span>
                                        🩺 逐词发音诊断（点击任意词听标准发音；点击黄/红词可同时纠音并一键收入生词本）：
                                      </span>
                                      <div className="flex items-center gap-2.5 select-none">
                                        <span className="inline-flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                          <span>地道 ({currentEvalResult.wordItems.filter((w) => w.status === "excellent").length})</span>
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                                          <span>尚可 ({currentEvalResult.wordItems.filter((w) => w.status === "good").length})</span>
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-red-500" />
                                          <span>需加强 ({currentEvalResult.wordItems.filter((w) => w.status === "needs_work").length})</span>
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                      {currentEvalResult.wordItems.map((item, wIdx) => {
                                        const isExcellent = item.status === "excellent";
                                        const isGood = item.status === "good";
                                        return (
                                          <button
                                            key={`${item.cleanWord}-${wIdx}`}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              playTTS(item.cleanWord);
                                              if (!isExcellent) {
                                                handleAddDictationVocab(
                                                  item.cleanWord,
                                                  currentSentence,
                                                  globalIndex,
                                                  `来自句读跟读发音诊断（单句跟读得分 ${item.score} 分）`
                                                );
                                              }
                                            }}
                                            className={`px-2 py-0.5 rounded-md text-sm font-serif border transition-all cursor-pointer inline-flex items-center gap-1 ${
                                              isExcellent
                                                ? "bg-emerald-500/12 text-emerald-900 dark:text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/20"
                                                : isGood
                                                ? "bg-amber-500/20 text-amber-950 dark:text-amber-100 border-amber-500/45 hover:bg-amber-500/30 font-medium"
                                                : "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40 hover:bg-red-500/25 font-semibold underline decoration-wavy decoration-red-500/70"
                                            }`}
                                            title={
                                              isExcellent
                                                ? `发音地道 (${item.score}分) · 点击重听 "${item.word}" 标准读音`
                                                : item.spokenAs
                                                ? `发音近似 "${item.spokenAs}" (${item.score}分) · 点击听标准发音并加入生词本`
                                                : `建议重点练习 (${item.score}分) · 点击听标准发音并加入生词本`
                                            }
                                          >
                                            <span>{item.word}</span>
                                            <span className="text-[10px] font-mono opacity-75">
                                              {item.score}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </div>
                        )}

                        {/* ✍️ 单句听打输入框与三色精密 Diff 比对面板 */}
                        {isSentDictating && (
                          <div className="pt-2 border-t border-amber-500/25 space-y-3 animate-in fade-in-50 duration-200">
                            {!sentDictationResult ? (
                              <div className="space-y-2.5">
                                <Textarea
                                  ref={(el) => {
                                    if (el) {
                                      sentenceDictationTextareaRefs.current.set(globalIndex, el);
                                    } else {
                                      sentenceDictationTextareaRefs.current.delete(globalIndex);
                                    }
                                  }}
                                  value={sentDictationInput}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setSentenceDictationInputs((prev) => ({
                                      ...prev,
                                      [globalIndex]: val,
                                    }));
                                  }}
                                  onKeyDown={(e) => {
                                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleCheckSentenceDictation(currentSentence, globalIndex);
                                    } else if (
                                      (e.metaKey || e.ctrlKey) &&
                                      (e.key === "r" || e.key === "R")
                                    ) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handlePlaySingleSentence(
                                        currentSentence,
                                        globalIndex,
                                        currentSentIdx
                                      );
                                    }
                                  }}
                                  placeholder="倾听本句发音，输入您听到的英文句子...（快捷键：Cmd/Ctrl + Enter 核对；Cmd/Ctrl + R 重听本句）"
                                  className="min-h-[80px] bg-background/95 font-serif text-sm sm:text-base leading-relaxed resize-y border-amber-500/35 focus-visible:ring-amber-500"
                                  autoFocus
                                />
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground font-serif">
                                    💡 忽略大小写与标点符号差异，核对后点击红/黄词汇可一键加入生词本
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePlaySingleSentence(
                                          currentSentence,
                                          globalIndex,
                                          currentSentIdx
                                        );
                                      }}
                                      className="h-8 px-3 text-xs font-serif gap-1.5 border-amber-500/40 bg-background/85 hover:bg-amber-500/15 cursor-pointer"
                                      title="重新播放本句发音 (Cmd/Ctrl + R)"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      <span>重听本句</span>
                                    </Button>
                                    <Button
                                      size="sm"
                                      disabled={!sentDictationInput.trim()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCheckSentenceDictation(currentSentence, globalIndex);
                                      }}
                                      className="h-8 px-3.5 text-xs font-serif gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-2xs cursor-pointer disabled:opacity-40"
                                      title="提交并运行三色 Diff 核对 (Cmd/Ctrl + Enter)"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>核对本句</span>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3 bg-background/85 rounded-lg p-3.5 border border-amber-500/30 shadow-2xs">
                                {/* 准确率得分与快捷闯关操作栏 */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/50">
                                  <div className="flex flex-wrap items-center gap-2 text-xs font-serif">
                                    <span
                                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold border ${
                                        sentDictationResult.accuracy >= 85
                                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                          : sentDictationResult.accuracy >= 60
                                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                          : "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30"
                                      }`}
                                    >
                                      🏆 本句准确率：{sentDictationResult.accuracy}% (正确{" "}
                                      {sentDictationResult.correctCount} / 共{" "}
                                      {sentDictationResult.totalWords} 词)
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {/* [🔄 重练本句] */}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSentenceDictationInputs((prev) => ({
                                          ...prev,
                                          [globalIndex]: "",
                                        }));
                                        setSentenceDictationResults((prev) => ({
                                          ...prev,
                                          [globalIndex]: null,
                                        }));
                                        setSentenceDictationPeeks((prev) => ({
                                          ...prev,
                                          [globalIndex]: false,
                                        }));
                                        handlePlaySingleSentence(
                                          currentSentence,
                                          globalIndex,
                                          currentSentIdx
                                        );
                                      }}
                                      className="h-7 px-2.5 text-xs font-serif gap-1 border-amber-500/40 hover:bg-amber-500/15 cursor-pointer"
                                      title="清空本句输入并重新盲听练习"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                      <span>🔄 重练本句</span>
                                    </Button>

                                    {/* [⏭ 听打下一句] */}
                                    <Button
                                      size="sm"
                                      disabled={currentSentIdx >= totalSentences - 1}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStepSentence(
                                          globalIndex,
                                          currentSentIdx + 1,
                                          totalSentences,
                                          sentences
                                        );
                                      }}
                                      className="h-7 px-2.5 text-xs font-serif gap-1 bg-amber-600 hover:bg-amber-700 text-white shadow-2xs cursor-pointer disabled:opacity-40"
                                      title="切换到下一句并自动播放语音继续听打"
                                    >
                                      <span>听打下一句</span>
                                      <SkipForward className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>

                                {/* 三色精密 Diff 词汇逐一渲染（支持红/黄词汇点击查词并一键加入生词本） */}
                                <div className="p-2.5 rounded-md bg-muted/20 border border-border/50 font-serif text-base leading-relaxed flex flex-wrap gap-1.5 items-baseline">
                                  {sentDictationResult.diff.map((token, tIdx) => {
                                    if (token.type === "correct") {
                                      return (
                                        <span
                                          key={tIdx}
                                          className="text-emerald-700 dark:text-emerald-400 font-semibold px-1 rounded"
                                        >
                                          {token.word}
                                        </span>
                                      );
                                    }
                                    if (token.type === "wrong") {
                                      return (
                                        <button
                                          key={tIdx}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleAddDictationVocab(
                                              token.expected || token.word,
                                              currentSentence,
                                              globalIndex,
                                              "来自「🔍句读 · ✍️单句听打」错词记录"
                                            );
                                          }}
                                          title={`拼写错误或多余词汇 · 点击查词并将 "${token.expected || token.word}" 一键加入生词本`}
                                          className="inline-flex items-center gap-1 bg-red-500/15 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded text-sm hover:bg-red-500/25 transition-colors cursor-pointer border border-red-500/20 group/sdiff"
                                        >
                                          <span className="line-through decoration-red-500/80">
                                            {token.word}
                                          </span>
                                          {token.expected && (
                                            <span className="text-emerald-700 dark:text-emerald-300 font-semibold underline decoration-emerald-500">
                                              → {token.expected}
                                            </span>
                                          )}
                                          <span className="text-[10px] text-primary opacity-0 group-hover/sdiff:opacity-100 transition-opacity font-mono">
                                            ➕存生词
                                          </span>
                                        </button>
                                      );
                                    }
                                    return (
                                      <button
                                        key={tIdx}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleAddDictationVocab(
                                            token.word,
                                            currentSentence,
                                            globalIndex,
                                            "来自「🔍句读 · ✍️单句听打」漏词记录"
                                          );
                                        }}
                                        title={`遗漏未写词汇 · 点击查词并将 "${token.word}" 一键加入生词本`}
                                        className="bg-amber-500/20 text-amber-800 dark:text-amber-300 border-b-2 border-amber-500 px-1.5 py-0.5 rounded text-sm font-semibold hover:bg-amber-500/30 transition-colors cursor-pointer inline-flex items-center gap-1 group/sdiff"
                                      >
                                        <span>{token.word}</span>
                                        <span className="text-[10px] text-amber-700 dark:text-amber-300 opacity-0 group-hover/sdiff:opacity-100 transition-opacity font-mono">
                                          ➕存生词
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* 三色图例说明 */}
                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-serif">
                                  <span className="inline-flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                                    绿色：拼写正确
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                                    红色删除线：拼写错误或多余（点击入生词本）
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                                    黄色底色：遗漏未写（点击入生词本）
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* d) 单句中文按需展开（防剧透）与底部全键盘极客操控指引 */}
                        <div className="pt-1.5 border-t border-amber-500/20 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSentenceTrans(
                                  currentSentence,
                                  globalIndex,
                                  totalSentences
                                );
                              }}
                              className="inline-flex items-center gap-1.5 text-xs font-serif text-amber-900/85 dark:text-amber-200/85 hover:text-amber-700 dark:hover:text-amber-100 py-1 cursor-pointer transition-colors select-none"
                            >
                              {isSentTransOpen ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                              <span className="font-medium">
                                📖 {isSentTransOpen ? "收起本句中文参考" : "查看本句中文参考"}
                              </span>
                            </button>

                            <span className="text-[11px] text-muted-foreground/80 font-mono select-none">
                              ⌨️ 快捷键：空格 重听本句 · ←/→ 切换上下句 · D 听打本句 · C 意群断句
                            </span>
                          </div>

                          {isSentTransOpen && (
                            <div className="mt-1 rounded-lg bg-background/75 border-l-3 border-amber-500/70 px-3.5 py-2.5 text-sm font-serif text-foreground/90 leading-relaxed">
                              {isSentTransLoading ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono py-1">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                  <span>正在解析本句中文翻译...</span>
                                </div>
                              ) : cachedSentTrans ? (
                                <div className="flex items-center justify-between gap-2">
                                  <p className="select-text text-[15px] leading-relaxed">
                                    {cachedSentTrans}
                                  </p>
                                  {(cachedSentTrans.startsWith("单句翻译") ||
                                    cachedSentTrans.startsWith("✈️")) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        fetchSingleSentenceTranslation(
                                          currentSentence,
                                          globalIndex,
                                          totalSentences
                                        );
                                      }}
                                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0 cursor-pointer"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      <span>重试</span>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  点击上方按钮加载本句中文参考译文
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 🎧 段落听写练习专属交互面板 */}
                  {isDictating && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-3.5 text-sm font-sans bg-card border border-border/80 rounded-xl p-4 sm:p-5 shadow-xs space-y-3.5 transition-all duration-300"
                    >
                      {/* 顶部标题与控制操作栏 */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-border/50 text-xs font-serif">
                        <div className="flex items-center gap-2 font-bold text-foreground">
                          <div className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Headphones className="w-3.5 h-3.5" />
                          </div>
                          <span>段落听写练习</span>
                          <span className="text-[11px] font-mono text-muted-foreground font-normal">
                            (段落 #{globalIndex + 1})
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* 🔁 重听按钮（支持从头重播） */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-xs font-serif gap-1 border-border/70 hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
                            onClick={() => handleReplayDictation(para, globalIndex)}
                            title="重新播放该段朗读音频 (可在输入框内按 Cmd/Ctrl+R)"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>重听</span>
                          </Button>

                          {/* 偷看/隐藏原文按钮 */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs font-serif text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
                            onClick={() => setShowOriginal(!showOriginal)}
                            title={showOriginal ? "隐藏原文以防偷看" : "临时查看原文"}
                          >
                            {showOriginal ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showOriginal ? "隐藏原文" : "偷看"}</span>
                          </Button>

                          {/* 退出听写按钮 */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                            onClick={() => {
                              setActiveDictationIndex(null);
                              setDictationResult(null);
                              stopTTS();
                            }}
                            title="退出听写模式"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* 听写输入区（未核对时） */}
                      {!dictationResult ? (
                        <div className="space-y-2.5">
                          <Textarea
                            placeholder="认真倾听发音，在此输入您听到的英文内容...&#10;（快捷键：Cmd/Ctrl + Enter 开始核对；Cmd/Ctrl + R 重听音频）"
                            value={dictationInput}
                            onChange={(e) => setDictationInput(e.target.value)}
                            onKeyDown={(e) => {
                              // Cmd/Ctrl + Enter: 核对
                              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                e.preventDefault();
                                handleCheckDictation(para);
                              }
                              // Cmd/Ctrl + R: 重听（阻止网页刷新）
                              if ((e.metaKey || e.ctrlKey) && (e.key === "r" || e.key === "R")) {
                                e.preventDefault();
                                handleReplayDictation(para, globalIndex);
                              }
                            }}
                            rows={3}
                            className="font-serif text-[15px] leading-relaxed border-border/80 focus-visible:ring-primary/40 bg-background/50 resize-y"
                            autoFocus
                          />

                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-[11px] text-muted-foreground/70 font-mono">
                              提示：核对时将忽略英文字母大小写与标点符号差异
                            </span>
                            <div className="flex items-center gap-2">
                              {dictationInput && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                                  onClick={() => setDictationInput("")}
                                >
                                  清空输入
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="h-7 px-3.5 text-xs font-serif bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-2xs cursor-pointer"
                                onClick={() => handleCheckDictation(para)}
                                disabled={!dictationInput.trim()}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>开始核对</span>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* 听写核对比对结果区 */
                        <div className="space-y-3.5 pt-1">
                          {/* 比对图例与分数 */}
                          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-muted/40 border border-border/60 text-xs font-serif">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {dictationResult.accuracy >= 90 ? "🏆" : dictationResult.accuracy >= 70 ? "🎉" : "💪"}
                              </span>
                              <div>
                                <span className="font-bold text-foreground text-sm">
                                  听写准确率：{dictationResult.accuracy}%
                                </span>
                                <span className="text-muted-foreground text-[11px] ml-2 font-mono">
                                  (正确匹配 {dictationResult.correctCount} / 原文共 {dictationResult.totalWords} 词)
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 text-[11px] font-mono">
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                                正确匹配
                              </span>
                              <span className="flex items-center gap-1 text-red-500 line-through">
                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                                拼错/多余
                              </span>
                              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
                                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                                遗漏未写
                              </span>
                            </div>
                          </div>

                          {/* 逐词比对渲染区 */}
                          <div className="p-4 rounded-lg bg-background/80 border border-border/70 font-serif text-[16px] leading-[2] tracking-normal select-text space-x-1">
                            {dictationResult.diff.map((item, dIdx) => {
                              if (item.type === "correct") {
                                return (
                                  <span
                                    key={dIdx}
                                    className="text-emerald-600 dark:text-emerald-400 font-medium inline-block"
                                  >
                                    {item.word}
                                  </span>
                                );
                              }

                              if (item.type === "wrong") {
                                return (
                                  <span
                                    key={dIdx}
                                    onClick={() => handleAddDictationVocab(item.expected || item.word, para, globalIndex)}
                                    className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 px-1.5 py-0.5 rounded cursor-pointer hover:bg-red-100 transition-colors group/diff text-xs font-mono"
                                    title={`拼错/多余词：点击将标准词 "${item.expected || item.word}" 加入生词本`}
                                  >
                                    <span className="text-red-500 line-through decoration-red-400">
                                      {item.word}
                                    </span>
                                    {item.expected && (
                                      <span className="text-emerald-700 dark:text-emerald-300 font-semibold underline decoration-emerald-500">
                                        → {item.expected}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-primary opacity-0 group-hover/diff:opacity-100 transition-opacity">
                                      ➕存生词
                                    </span>
                                  </span>
                                );
                              }

                              // missing: 遗漏未写
                              return (
                                <span
                                  key={dIdx}
                                  onClick={() => handleAddDictationVocab(item.word, para, globalIndex)}
                                  className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-950/60 border border-amber-300/60 dark:border-amber-800/50 px-1.5 py-0.5 rounded text-amber-900 dark:text-amber-200 font-medium cursor-pointer hover:bg-amber-200 transition-colors group/diff text-xs font-mono"
                                  title={`遗漏单词：点击将 "${item.word}" 加入生词本`}
                                >
                                  <span>{item.word}</span>
                                  <span className="text-[10px] text-amber-700 dark:text-amber-400 opacity-0 group-hover/diff:opacity-100 transition-opacity">
                                    ➕存生词
                                  </span>
                                </span>
                              );
                            })}
                          </div>

                          {/* 底部重试与操作按钮 */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-muted-foreground font-serif">
                              💡 点击上方任意红色或黄色词汇，可一键加入生词本进行 3D 闪卡复习。
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs font-serif gap-1 border-border/70 cursor-pointer"
                                onClick={() => {
                                  setDictationResult(null);
                                  setDictationInput("");
                                  setShowOriginal(false);
                                  handleReplayDictation(para, globalIndex);
                                }}
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>重新挑战</span>
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs font-serif bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
                                onClick={() => {
                                  setActiveDictationIndex(null);
                                  setDictationResult(null);
                                }}
                              >
                                完成听写
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 内联整段/长句翻译展示区 */}
                  {isExpanded && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-3 text-[15px] sm:text-[16px] font-sans leading-relaxed text-foreground/90 bg-muted/50 dark:bg-muted/30 border-l-4 border-primary/70 rounded-r-md px-4 py-3 shadow-2xs transition-all duration-300"
                    >
                      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-border/40 text-[11px] font-mono text-muted-foreground select-none">
                        <span className="flex items-center gap-1.5 text-primary font-medium">
                          <Languages className="w-3.5 h-3.5" />
                          中文释文参考
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleTranslation(para, globalIndex)}
                          className="hover:text-foreground text-xs hover:underline cursor-pointer"
                        >
                          收起
                        </button>
                      </div>

                      {isLoading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 font-mono">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          <span>正在智能解析整句与段落翻译...</span>
                        </div>
                      ) : translationText && (translationText.startsWith("翻译获取失败") || translationText.startsWith("✈️ 当前处于离线模式")) ? (
                        <div className="flex items-center justify-between py-1 text-xs text-destructive">
                          <span className="truncate max-w-[220px] sm:max-w-md">{translationText}</span>
                          <button
                            type="button"
                            onClick={() => {
                              // 清除失败记录后重试
                              setLocalTranslationErrors((prev) => {
                                const next = { ...prev };
                                delete next[globalIndex];
                                return next;
                              });
                              handleToggleTranslation(para, globalIndex);
                            }}
                            className="flex items-center gap-1 text-primary hover:underline cursor-pointer shrink-0 ml-2"
                          >
                            <RefreshCw className="w-3 h-3" />
                            重新获取
                          </button>
                        </div>
                      ) : (
                        <p className="select-text whitespace-pre-wrap font-serif text-[15px] sm:text-[16px] text-foreground/90 leading-relaxed pt-0.5">
                          {translationText}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>

      {/* 底部分页控制器 */}
      <CardFooter className="py-4 px-6 border-t border-border/60 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* 阅读进度百分比 */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span>阅读进度：</span>
          <span className="font-semibold text-foreground">{progressPercent}%</span>
          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* 分页控制按钮组 */}
        <div className="flex items-center gap-1.5">
          {/* 首页 */}
          <Button
            variant="outline"
            size="sm"
            onClick={firstPage}
            disabled={currentPage === 0}
            className="border-border text-xs gap-1 h-8 px-2.5 font-serif"
            title="跳转至第一页"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">首页</span>
          </Button>

          {/* 上一页 */}
          <Button
            variant="outline"
            size="sm"
            onClick={prevPage}
            disabled={currentPage === 0}
            className="border-border text-xs gap-1 h-8 px-3 font-serif"
            title="上一页"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>上一页</span>
          </Button>

          {/* 页码指示器 */}
          <div className="px-3 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-mono font-medium border border-border/40 min-w-[90px] text-center">
            第 {currentPage + 1} / {totalPages} 页
          </div>

          {/* 下一页 */}
          <Button
            variant="outline"
            size="sm"
            onClick={nextPage}
            disabled={currentPage >= totalPages - 1}
            className="border-border text-xs gap-1 h-8 px-3 font-serif"
            title="下一页"
          >
            <span>下一页</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>

          {/* 尾页 */}
          <Button
            variant="outline"
            size="sm"
            onClick={lastPage}
            disabled={currentPage >= totalPages - 1}
            className="border-border text-xs gap-1 h-8 px-2.5 font-serif"
            title="跳转至最后一页"
          >
            <span className="hidden sm:inline">尾页</span>
            <ChevronsRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardFooter>

      {/* 段落读书随笔弹出框 (Dialog) */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-md bg-popover text-popover-foreground border-border">
          <DialogHeader>
            <DialogTitle className="font-serif">
              记录段落随笔 · 段落 #{activeNotePara ? activeNotePara.index + 1 : ""}
            </DialogTitle>
            <DialogDescription className="text-xs">
              输入您的阅读启发、哲思感悟，将自动关联至当前段落并长久持久化。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            {activeNotePara && (
              <div className="space-y-1">
                <span className="text-[11px] font-mono text-muted-foreground block">
                  所选段落原文：
                </span>
                <div className="max-h-24 overflow-y-auto bg-muted/40 p-2.5 rounded-md border-l-2 border-primary/60 text-xs font-serif italic text-muted-foreground leading-relaxed">
                  “{activeNotePara.text.trim()}”
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                随笔正文：
              </label>
              <Textarea
                placeholder="记录灵感、重点提炼或质疑反思..."
                rows={4}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNoteDialogOpen(false)}
            >
              取消
            </Button>
            <Button size="sm" onClick={handleSaveParagraphNote}>
              保存随笔
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
