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
import { renderTokenizedParagraph } from "@/src/lib/tokenizer";
import { playTTS, stopTTS, updateTTSPlaybackRate } from "@/src/lib/audioPlayer";
import { splitParagraphIntoSentences } from "@/src/utils/edgeTTS";
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
    addNote,
    addVocab,
    targetParagraphIndex,
    setTargetParagraphIndex,
    paragraphTranslations,
    saveParagraphTranslation,
    ttsSpeed,
    setTtsSpeed,
    sentenceTranslations,
    saveSentenceTranslation,
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
  const [sentenceIndices, setSentenceIndices] = React.useState<Record<number, number>>({});
  const [sentencePlayingState, setSentencePlayingState] = React.useState<{
    paraIndex: number;
    sentenceIndex: number;
    mode: "single" | "continuous";
  } | null>(null);
  const [expandedSentenceTrans, setExpandedSentenceTrans] = React.useState<Record<number, boolean>>({});
  const [loadingSentenceTrans, setLoadingSentenceTrans] = React.useState<Record<string, boolean>>({});
  const [sentenceTransErrors, setSentenceTransErrors] = React.useState<Record<string, string>>({});

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

  // 停止句读音频流与连续队列
  const stopSentenceReaderAudio = React.useCallback(() => {
    continuousPlayRef.current.active = false;
    continuousPlayRef.current.sessionId++;
    stopTTS();
    setSentencePlayingState(null);
    setActivePlayingIndex(null);
  }, [setActivePlayingIndex]);

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
    setSentencePlayingState(null);
    setActivePlayingIndex(null);
    setActiveDictationIndex(null);
    setDictationResult(null);
    setShowOriginal(false);
  }, [currentPage, targetParagraphIndex, setActivePlayingIndex]);

  // 清洗 HTML 标签以获取纯净的朗读与翻译文本
  const stripHtml = React.useCallback((text: string): string => {
    if (!text) return "";
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }, []);

  // 组件卸载时安全停止正在朗读的音频并重置高亮状态
  React.useEffect(() => {
    return () => {
      continuousPlayRef.current.active = false;
      continuousPlayRef.current.sessionId++;
      stopTTS();
      setActivePlayingIndex(null);
      setActiveDictationIndex(null);
    };
  }, [setActivePlayingIndex]);

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

  // 展开 / 收起内联“🔍 句读”精读台面板
  const handleToggleSentenceReader = (rawPara: string, index: number) => {
    if (rawPara.trim().startsWith("<img")) {
      toast.info("书籍插图不支持逐句精读");
      return;
    }

    const isCurrentlyOpen = !!expandedSentenceReaders[index];
    if (isCurrentlyOpen) {
      setExpandedSentenceReaders((prev) => ({ ...prev, [index]: false }));
      if (sentencePlayingState?.paraIndex === index) {
        stopSentenceReaderAudio();
      }
      return;
    }

    setExpandedSentenceReaders((prev) => ({ ...prev, [index]: true }));
    setSentenceIndices((prev) => ({
      ...prev,
      [index]: prev[index] ?? 0,
    }));
  };

  // 句读面板：单句朗读（[▶ 听这一句]）
  const handlePlaySingleSentence = (sentence: string, paraIndex: number, sentIdx: number) => {
    const cleanSent = stripHtml(sentence);
    if (!cleanSent) return;

    // 掐断之前的连续队列或其它段落音频
    continuousPlayRef.current.active = false;
    const session = ++continuousPlayRef.current.sessionId;
    stopTTS();

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

    stopTTS();
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

  // 句读面板：切换上一句 / 下一句（若正在单句或连续朗读则自动停止上一句）
  const handleStepSentence = (
    paraIndex: number,
    nextIdx: number,
    totalCount: number
  ) => {
    const clampedIdx = Math.max(0, Math.min(nextIdx, totalCount - 1));
    if (sentencePlayingState?.paraIndex === paraIndex) {
      stopSentenceReaderAudio();
    }
    setSentenceIndices((prev) => ({ ...prev, [paraIndex]: clampedIdx }));
    // 切换句子时默认收起中文译文，防剧透保護精读思考
    setExpandedSentenceTrans((prev) => ({ ...prev, [paraIndex]: false }));
  };

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

  // 一键将听写错词或生词存入生词本
  const handleAddDictationVocab = (word: string, rawPara: string, index: number) => {
    const cleanWord = word.replace(/[^a-zA-Z]/g, "").trim();
    if (!cleanWord) return;

    addVocab({
      word: cleanWord,
      translation: "听写复习生词",
      context: stripHtml(rawPara).slice(0, 160),
      paragraphIndex: index,
      bookId: currentBook.id,
      bookTitle: currentBook.title,
      note: "来自段落听写练习中的遗漏/拼错词汇",
    });

    toast.success(`已将 "${cleanWord}" 添加至生词本！`, {
      description: "可在生词本或 3D 闪卡中进行艾宾浩斯复习巩固。",
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
          className="h-[620px] w-full rounded-lg border border-border/60 bg-background/60 p-6 sm:p-8 overflow-y-auto scroll-smooth"
        >
          <div className="space-y-6 font-serif text-[17px] sm:text-[18px] leading-[1.85] text-foreground max-w-3xl mx-auto">
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
                  className={`group relative pl-8 sm:pl-10 pr-2 sm:pr-36 rounded-r-lg cursor-pointer sm:cursor-default transition-all duration-300 ${
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

                  {/* 悬浮/移动端轻量操作栏 (包含：🔊 朗读 | 🔍 句读 | 译 整段翻译 | 🎧 听写 | 🔖 动态书签 | 📝 随笔) */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`items-center justify-end gap-2 sm:gap-1 mb-1.5 sm:mb-0 sm:absolute sm:right-1 sm:top-1.5 p-1 rounded-lg sm:rounded-md border border-border/50 sm:border-border/60 bg-card/80 sm:bg-card/90 backdrop-blur-xs shadow-2xs sm:shadow-xs z-20 transition-all ${
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
                      className="absolute right-2 top-2 text-amber-500/80 pointer-events-none group-hover:opacity-0 transition-opacity hidden sm:inline"
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

                    return (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-3.5 rounded-xl border border-amber-500/35 bg-amber-50/45 dark:bg-amber-950/20 p-4 sm:p-5 shadow-xs space-y-3.5 transition-all duration-300 animate-in fade-in-50"
                      >
                        {/* a) 顶部状态栏：逐句精读进度 + 朗读速度下拉框 + 状态提示文本 */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-amber-500/25 text-xs font-serif">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-md">
                              <Search className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
                              <span>
                                逐句精读 · 第 {currentSentIdx + 1} / {totalSentences} 句
                              </span>
                            </span>

                            {/* 状态提示文本 */}
                            {isThisParaSentencePlaying ? (
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

                          <div className="flex items-center gap-2">
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
                                    handleStepSentence(globalIndex, sIdx, totalSentences);
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

                        {/* b) 核心展示区：大号衬线字体醒目展示当前选中单句，内部英文单词包裹 <InteractiveWord> */}
                        <div
                          className={`p-3.5 sm:p-4 rounded-lg border transition-all duration-300 ${
                            isThisSentPlaying
                              ? "bg-amber-100/50 dark:bg-amber-950/35 border-amber-500/60 ring-2 ring-amber-500/30 shadow-xs"
                              : "bg-background/85 border-amber-500/25 shadow-2xs"
                          }`}
                        >
                          <div className="text-lg font-serif leading-relaxed text-foreground select-text">
                            {renderTokenizedParagraph(
                              currentSentence,
                              currentSentence,
                              `sr-${globalIndex}-${currentSentIdx}`,
                              globalIndex
                            )}
                          </div>
                        </div>

                        {/* c) 核心控制栏：[▶ 听这一句] | [⏮ 上一句] / [⏭ 下一句] | [🔁 从本句连续听读] | [⏹ 停止] */}
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
                              title="使用当前设定语速朗读此单句"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>▶ 听这一句</span>
                            </Button>

                            {/* [⏮ 上一句] */}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={currentSentIdx <= 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStepSentence(
                                  globalIndex,
                                  currentSentIdx - 1,
                                  totalSentences
                                );
                              }}
                              className="h-8 px-2.5 text-xs font-serif gap-1 border-amber-500/35 bg-background/80 hover:bg-amber-500/10 cursor-pointer disabled:opacity-40"
                              title="切换到上一句"
                            >
                              <SkipBack className="w-3.5 h-3.5" />
                              <span>⏮ 上一句</span>
                            </Button>

                            {/* [⏭ 下一句] */}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={currentSentIdx >= totalSentences - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStepSentence(
                                  globalIndex,
                                  currentSentIdx + 1,
                                  totalSentences
                                );
                              }}
                              className="h-8 px-2.5 text-xs font-serif gap-1 border-amber-500/35 bg-background/80 hover:bg-amber-500/10 cursor-pointer disabled:opacity-40"
                              title="切换到下一句"
                            >
                              <span>⏭ 下一句</span>
                              <SkipForward className="w-3.5 h-3.5" />
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
                              }`}
                              title="从当前选中句开始，自动一句接一句连续播放至本段末尾"
                            >
                              <Repeat className="w-3.5 h-3.5" />
                              <span>🔁 从本句连续听读</span>
                            </Button>

                            {/* [⏹ 停止] */}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!isThisParaSentencePlaying && activePlayingIndex !== globalIndex}
                              onClick={(e) => {
                                e.stopPropagation();
                                stopSentenceReaderAudio();
                              }}
                              className="h-8 px-2.5 text-xs font-serif gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer disabled:opacity-40"
                              title="立即中断当前音频流或连续听读队列"
                            >
                              <Square className="w-3 h-3 fill-current" />
                              <span>⏹ 停止</span>
                            </Button>
                          </div>
                        </div>

                        {/* d) 单句中文按需展开（防剧透） */}
                        <div className="pt-1 border-t border-amber-500/20">
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

                          {isSentTransOpen && (
                            <div className="mt-2 rounded-lg bg-background/75 border-l-3 border-amber-500/70 px-3.5 py-2.5 text-sm font-serif text-foreground/90 leading-relaxed">
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
                            <span>🔁 重听</span>
                          </Button>

                          {/* 👁️ 偷看/隐藏原文按钮 */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs font-serif text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
                            onClick={() => setShowOriginal(!showOriginal)}
                            title={showOriginal ? "隐藏原文以防偷看" : "临时查看原文"}
                          >
                            {showOriginal ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showOriginal ? "隐藏原文" : "👁️ 偷看"}</span>
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
