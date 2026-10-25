"use client";

import * as React from "react";
import { useReaderStore, VocabularyItem } from "@/src/store/useReaderStore";
import { playTTS, playWordAudio } from "@/src/lib/audioPlayer";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Headphones,
  RotateCcw,
  Volume2,
  Eye,
  EyeOff,
  Flame,
  Timer,
  BookOpen,
  Library,
  Sparkles,
  Trophy,
  CheckCircle2,
  XCircle,
  Link2,
  ArrowRight,
  Shuffle,
  Medal,
} from "lucide-react";
import { toast } from "sonner";

// 规范化游戏词汇条目接口
export interface NormalizedGameWord {
  id: string;
  word: string;
  translation: string;
  context: string;
  bookTitle: string;
  bookId?: string;
  paragraphIndex?: number;
  isFallback?: boolean;
}

// 核心预置保底词汇库（12个高质量哲思与原著高频词，确保生词本为空时也能 100% 立即畅玩）
export const FALLBACK_WORD_POOL: NormalizedGameWord[] = [
  {
    id: "fallback-fulfillment",
    word: "fulfillment",
    translation: "成就感/实现",
    context: "True fulfillment comes from internal mastery rather than external validation.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-combative",
    word: "combative",
    translation: "好斗的/好辩的",
    context: "A combative approach rarely yields peaceful understanding between civilizations.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-conflict-averse",
    word: "conflict-averse",
    translation: "回避冲突的",
    context: "Being conflict-averse often postpones necessary confrontations with reality.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-prioritize",
    word: "prioritize",
    translation: "划分优先级",
    context: "Wise leaders learn to prioritize collective well-being over transient impulses.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-instrumental",
    word: "instrumental",
    translation: "工具性的/手段的",
    context: "Language became an instrumental tool in uniting dispersed communities.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-introspection",
    word: "introspection",
    translation: "内省/自省",
    context: "Philosophical introspection allows us to examine the nature of historical motives.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-autonomy",
    word: "autonomy",
    translation: "自主权/独立性",
    context: "The quest for moral autonomy was at the heart of early modern revolutions.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-affiliation",
    word: "affiliation",
    translation: "归属感/联结",
    context: "A strong sense of social affiliation bound the early tribes together against hardship.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-tranquility",
    word: "tranquility",
    translation: "宁静/平和",
    context: "Monks sought inner tranquility amidst the chaotic turmoil of medieval Europe.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-resilient",
    word: "resilient",
    translation: "有韧性的/适应力强的",
    context: "The human spirit proved exceptionally resilient across centuries of famine and conflict.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-contemplate",
    word: "contemplate",
    translation: "沉思/深思",
    context: "Scholars gathered under ancient arches to contemplate the mysteries of the universe.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
  {
    id: "fallback-enlighten",
    word: "enlighten",
    translation: "启蒙/阐明",
    context: "Thinkers strove to enlighten minds through reason and scientific inquiry.",
    bookTitle: "世界小史 (A Little History of the World)",
    isFallback: true,
  },
];

// Fisher-Yates 随机打乱数组工具
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 闪电配对卡片接口
interface MatchCard {
  id: string; // 唯一ID: `en-${wordId}` 或 `zh-${wordId}`
  wordId: string;
  type: "en" | "zh";
  text: string;
  word: string; // 用于英文发音
  isMatched: boolean;
}

// 听音选义题目接口
interface QuizQuestion {
  targetWord: NormalizedGameWord;
  options: {
    text: string;
    isCorrect: boolean;
  }[];
}

export function WordGameView() {
  const {
    vocabularyList,
    currentBookId,
    bookshelf,
    goToParagraphIndex,
    setActiveTab,
    setActivePlayingIndex,
    switchBook,
  } = useReaderStore();

  // 1. 游戏顶级状态
  const [activeGameMode, setActiveGameMode] = React.useState<"match" | "listen">("match");
  const [poolScope, setPoolScope] = React.useState<"current" | "all">("current");

  // 2. 题库池构建与智能保底机制
  const gameWordPool = React.useMemo<NormalizedGameWord[]>(() => {
    // 转换为规范化词条
    const convertVocab = (item: VocabularyItem): NormalizedGameWord => ({
      id: item.id || `vocab-${item.word.toLowerCase()}`,
      word: item.word,
      translation: item.translation,
      context: item.context || "",
      bookTitle: item.bookTitle || "当前书籍",
      bookId: item.bookId || currentBookId,
      paragraphIndex: item.paragraphIndex,
      isFallback: false,
    });

    const allVocabWords = vocabularyList.map(convertVocab);
    const currentBookVocabWords = allVocabWords.filter(
      (item) => !item.bookId || item.bookId === currentBookId
    );

    let chosenPool: NormalizedGameWord[] = [];

    if (poolScope === "current") {
      chosenPool = [...currentBookVocabWords];
      // 若当前书生词不足 8 个，自动合并全部生词本进行补充
      if (chosenPool.length < 8) {
        const existingWords = new Set(chosenPool.map((w) => w.word.toLowerCase()));
        for (const item of allVocabWords) {
          if (!existingWords.has(item.word.toLowerCase())) {
            chosenPool.push(item);
            existingWords.add(item.word.toLowerCase());
          }
        }
      }
    } else {
      chosenPool = [...allVocabWords];
    }

    // 若生词总数仍少于 8 个，自动从保底核心词库合并补充
    if (chosenPool.length < 8) {
      const existingWords = new Set(chosenPool.map((w) => w.word.toLowerCase()));
      for (const fallbackItem of FALLBACK_WORD_POOL) {
        if (!existingWords.has(fallbackItem.word.toLowerCase())) {
          chosenPool.push(fallbackItem);
          existingWords.add(fallbackItem.word.toLowerCase());
        }
      }
    }

    return chosenPool;
  }, [vocabularyList, currentBookId, poolScope]);

  // 跨书平行跳转原文逻辑
  const handleJumpToSource = (paragraphIndex?: number, targetBookId?: string, targetBookTitle?: string) => {
    if (typeof paragraphIndex !== "number") {
      toast.info("💡 此词为预置典藏哲思词汇，可在正文阅读中自由探索更多例句");
      setActiveTab("reader");
      return;
    }

    if (targetBookId && currentBookId !== targetBookId) {
      switchBook(targetBookId);
      toast.info(`📖 已为您自动切换至《${targetBookTitle || "原著书籍"}》`);
    }

    setActiveTab("reader");
    goToParagraphIndex(paragraphIndex);
    toast.info(`📍 正在穿梭至原著段落 #${paragraphIndex + 1}...`);

    setTimeout(() => {
      const element = document.getElementById(`paragraph-${paragraphIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setActivePlayingIndex(paragraphIndex);
      setTimeout(() => {
        if (useReaderStore.getState().activePlayingIndex === paragraphIndex) {
          setActivePlayingIndex(null);
        }
      }, 3500);
    }, 150);
  };

  // ==========================================
  // 【模式一：⚡ 闪电配对（4×4 单词消消乐）】
  // ==========================================
  const [matchCards, setMatchCards] = React.useState<MatchCard[]>([]);
  const [selectedMatchIds, setSelectedMatchIds] = React.useState<string[]>([]);
  const [matchedIds, setMatchedIds] = React.useState<Set<string>>(new Set());
  const [wrongMatchIds, setWrongMatchIds] = React.useState<string[]>([]);
  const [matchTimer, setMatchTimer] = React.useState(0);
  const [isMatchTimerActive, setIsMatchTimerActive] = React.useState(false);
  const [matchCombo, setMatchCombo] = React.useState(0);
  const [maxMatchCombo, setMaxMatchCombo] = React.useState(0);
  const [isMatchVictory, setIsMatchVictory] = React.useState(false);

  // 初始化闪电配对卡片
  const initMatchGame = React.useCallback(() => {
    if (gameWordPool.length === 0) return;

    // 从题库池中随机抽选 8 个词
    const poolShuffled = shuffleArray(gameWordPool);
    const selectedWords = poolShuffled.slice(0, 8);

    const cards: MatchCard[] = [];
    selectedWords.forEach((item) => {
      // 英文卡
      cards.push({
        id: `en-${item.id}`,
        wordId: item.id,
        type: "en",
        text: item.word,
        word: item.word,
        isMatched: false,
      });
      // 中文卡
      cards.push({
        id: `zh-${item.id}`,
        wordId: item.id,
        type: "zh",
        text: item.translation,
        word: item.word,
        isMatched: false,
      });
    });

    // 16 张卡片全局洗牌
    setMatchCards(shuffleArray(cards));
    setSelectedMatchIds([]);
    setMatchedIds(new Set());
    setWrongMatchIds([]);
    setMatchTimer(0);
    setIsMatchTimerActive(true);
    setMatchCombo(0);
    setMaxMatchCombo(0);
    setIsMatchVictory(false);
  }, [gameWordPool]);

  // 配对计时器
  React.useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isMatchTimerActive && !isMatchVictory) {
      interval = setInterval(() => {
        setMatchTimer((t) => t + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isMatchTimerActive, isMatchVictory]);

  // 当切换到闪电配对或词库变化时初始化
  React.useEffect(() => {
    if (activeGameMode === "match") {
      initMatchGame();
    }
  }, [activeGameMode, initMatchGame]);

  // 点击配对卡片交互
  const handleMatchCardClick = (card: MatchCard) => {
    if (
      card.isMatched ||
      matchedIds.has(card.id) ||
      wrongMatchIds.length > 0 ||
      selectedMatchIds.includes(card.id) ||
      isMatchVictory
    ) {
      return;
    }

    // 点击英文卡时，立即触发 Ava 神经元发音
    if (card.type === "en") {
      playWordAudio(card.word);
    }

    const currentSelected = [...selectedMatchIds, card.id];
    setSelectedMatchIds(currentSelected);

    // 当选中第 2 张卡片时进行配对判定
    if (currentSelected.length === 2) {
      const firstCard = matchCards.find((c) => c.id === currentSelected[0]);
      const secondCard = card;

      if (!firstCard) {
        setSelectedMatchIds([]);
        return;
      }

      // 配对成功判定：同一单词条目的一英一中
      const isPairMatched =
        firstCard.wordId === secondCard.wordId && firstCard.type !== secondCard.type;

      if (isPairMatched) {
        // 连击累加
        setMatchCombo((prev) => {
          const next = prev + 1;
          setMaxMatchCombo((m) => Math.max(m, next));
          return next;
        });

        // 翡翠绿高亮闪烁，并延时平滑消隐
        const newMatchedSet = new Set(matchedIds);
        newMatchedSet.add(firstCard.id);
        newMatchedSet.add(secondCard.id);

        setTimeout(() => {
          setMatchedIds(newMatchedSet);
          setSelectedMatchIds([]);

          // 判定是否全部消完（16 张卡片全部匹配）
          if (newMatchedSet.size >= matchCards.length && matchCards.length > 0) {
            setIsMatchTimerActive(false);
            setIsMatchVictory(true);
            toast.success("🎉 恭喜闪电通关！用时 " + (matchTimer + 1) + " 秒！");
          }
        }, 320);
      } else {
        // 匹配失败：连击归零，玫瑰红边框 + 抖动动画
        setMatchCombo(0);
        setWrongMatchIds([firstCard.id, secondCard.id]);

        setTimeout(() => {
          setWrongMatchIds([]);
          setSelectedMatchIds([]);
        }, 520);
      }
    }
  };

  // ==========================================
  // 【模式二：🎧 听音选义（Ava 神经元听力 + 原句挖空盲猜）】
  // ==========================================
  const [quizQuestions, setQuizQuestions] = React.useState<QuizQuestion[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = React.useState(0);
  const [quizScore, setQuizScore] = React.useState(0);
  const [quizCombo, setQuizCombo] = React.useState(0);
  const [maxQuizCombo, setMaxQuizCombo] = React.useState(0);
  const [isWordRevealed, setIsWordRevealed] = React.useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = React.useState<number | null>(null);
  const [isAnswered, setIsAnswered] = React.useState(false);
  const [isAnswerCorrect, setIsAnswerCorrect] = React.useState(false);
  const [isQuizCompleted, setIsQuizCompleted] = React.useState(false);

  // 初始化听音选义题库（10 题）
  const initListenQuiz = React.useCallback(() => {
    if (gameWordPool.length === 0) return;

    // 随机打乱词库
    const poolShuffled = shuffleArray(gameWordPool);
    // 取前 10 个词作为考题（若不足 10 个则取全部）
    const targetWords = poolShuffled.slice(0, Math.min(10, poolShuffled.length));

    const questions: QuizQuestion[] = targetWords.map((target) => {
      // 干扰项从其他词中挑 3 个
      const otherWords = poolShuffled.filter((w) => w.id !== target.id);
      const distractorPool = shuffleArray(otherWords).slice(0, 3);

      const options = [
        { text: target.translation, isCorrect: true },
        ...distractorPool.map((d) => ({ text: d.translation, isCorrect: false })),
      ];

      return {
        targetWord: target,
        options: shuffleArray(options),
      };
    });

    setQuizQuestions(questions);
    setCurrentQuizIndex(0);
    setQuizScore(0);
    setQuizCombo(0);
    setMaxQuizCombo(0);
    setIsWordRevealed(false);
    setSelectedOptionIndex(null);
    setIsAnswered(false);
    setIsAnswerCorrect(false);
    setIsQuizCompleted(false);

    // 自动朗读第一题
    if (questions.length > 0) {
      setTimeout(() => {
        playWordAudio(questions[0].targetWord.word);
      }, 200);
    }
  }, [gameWordPool]);

  // 当切换到听音选义或题库刷新时初始化
  React.useEffect(() => {
    if (activeGameMode === "listen") {
      initListenQuiz();
    }
  }, [activeGameMode, initListenQuiz]);

  const currentQuestion = quizQuestions[currentQuizIndex];

  // 自动朗读当前题目单词（切题时）
  const speakCurrentWord = React.useCallback(() => {
    if (currentQuestion) {
      playWordAudio(currentQuestion.targetWord.word);
    }
  }, [currentQuestion]);

  // 点击选项作答
  const handleOptionSelect = (optionIndex: number, isCorrect: boolean) => {
    if (isAnswered || !currentQuestion) return;

    setIsAnswered(true);
    setSelectedOptionIndex(optionIndex);
    setIsAnswerCorrect(isCorrect);
    // 答题后自动解开毛玻璃遮罩，展现清晰词形
    setIsWordRevealed(true);

    if (isCorrect) {
      const nextCombo = quizCombo + 1;
      setQuizCombo(nextCombo);
      setMaxQuizCombo((m) => Math.max(m, nextCombo));
      setQuizScore((s) => s + 100);

      // 选对后 0.9 秒平滑自动切入下一题
      setTimeout(() => {
        goToNextQuizQuestion();
      }, 900);
    } else {
      // 选错连击归零，并保持在当前界面让用户查看原句与正确答案，提供跨书溯源与手动下一题
      setQuizCombo(0);
    }
  };

  // 下一题处理
  const goToNextQuizQuestion = () => {
    if (currentQuizIndex + 1 < quizQuestions.length) {
      const nextIndex = currentQuizIndex + 1;
      setCurrentQuizIndex(nextIndex);
      setSelectedOptionIndex(null);
      setIsAnswered(false);
      setIsAnswerCorrect(false);
      setIsWordRevealed(false);

      // 切换新题自动调用语音朗读
      setTimeout(() => {
        playWordAudio(quizQuestions[nextIndex].targetWord.word);
      }, 150);
    } else {
      setIsQuizCompleted(true);
    }
  };

  // 原句语境中的挖空替换渲染（未答对前将单词挖空为 ______，答对或揭示后展示高亮单词）
  const renderClozeContext = (context: string, word: string, reveal: boolean) => {
    if (!context || !context.trim()) {
      return (
        <span className="italic text-muted-foreground">
          （暂无原句收录，请结合释义与发音推测词意）
        </span>
      );
    }

    try {
      // 忽略大小写的全局匹配
      const regex = new RegExp(`(${word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "gi");
      const parts = context.split(regex);

      return (
        <span>
          {parts.map((part, idx) => {
            if (part.toLowerCase() === word.toLowerCase()) {
              if (reveal) {
                return (
                  <span
                    key={idx}
                    className="font-bold underline decoration-emerald-500 decoration-2 text-emerald-600 dark:text-emerald-400 mx-1 bg-emerald-500/10 px-1 py-0.5 rounded transition-colors"
                  >
                    {part}
                  </span>
                );
              }
              return (
                <span
                  key={idx}
                  className="font-bold underline decoration-amber-500 decoration-2 text-amber-600 dark:text-amber-400 mx-1 font-mono tracking-widest bg-amber-500/10 px-1.5 py-0.5 rounded"
                >
                  ______
                </span>
              );
            }
            return <span key={idx}>{part}</span>;
          })}
        </span>
      );
    } catch {
      return <span>{context}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 内置 CSS 抖动动画样式 */}
      <style jsx global>{`
        @keyframes card-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }
        .animate-card-shake {
          animation: card-shake 0.45s ease-in-out;
        }
      `}</style>

      {/* 顶部控制面板：模式切换与题库范围选择 */}
      <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h2 className="font-serif font-bold text-lg text-foreground">单词闯关游戏台</h2>
            <Badge
              variant="outline"
              className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs px-2 py-0.5"
            >
              Ava 神经元高保真语音
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-serif">
            通过 4×4 闪电配对消除与原句挖空听音选义，多重感官强化词汇长效记忆
          </p>
        </div>

        {/* 题库范围切换与模式胶囊 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 题库来源切换 */}
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/60 text-xs font-serif">
            <button
              onClick={() => {
                setPoolScope("current");
                toast.info("已切换至【当前书籍生词】（不足 8 词将智能补充保底）");
              }}
              className={`px-2.5 py-1 rounded-md transition-all ${
                poolScope === "current"
                  ? "bg-card text-foreground font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              📖 当前书籍生词
            </button>
            <button
              onClick={() => {
                setPoolScope("all");
                toast.info("已切换至【全部生词本】题库");
              }}
              className={`px-2.5 py-1 rounded-md transition-all ${
                poolScope === "all"
                  ? "bg-card text-foreground font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              📚 全部生词本 ({vocabularyList.length})
            </button>
          </div>

          {/* 子模式切换胶囊 */}
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/60 text-xs font-serif">
            <button
              onClick={() => setActiveGameMode("match")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                activeGameMode === "match"
                  ? "bg-primary text-primary-foreground font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>闪电配对</span>
            </button>
            <button
              onClick={() => setActiveGameMode("listen")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                activeGameMode === "listen"
                  ? "bg-primary text-primary-foreground font-medium shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>听音选义</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 子模式一：⚡ 闪电配对（4×4 单词消消乐）视图              */}
      {/* ========================================================= */}
      {activeGameMode === "match" && (
        <div className="space-y-4">
          {/* 配对状态栏 */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card/80 text-xs sm:text-sm font-serif">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Timer className="w-4 h-4 text-amber-500" />
                用时：<strong className="text-foreground font-mono">{matchTimer}</strong> 秒
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Flame
                  className={`w-4 h-4 transition-colors ${
                    matchCombo > 0 ? "text-rose-500 animate-pulse" : "text-muted-foreground"
                  }`}
                />
                连击：
                <strong
                  className={`font-mono transition-transform ${
                    matchCombo > 0 ? "text-rose-500 font-bold scale-110" : "text-foreground"
                  }`}
                >
                  Combo x{matchCombo}
                </strong>
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={initMatchGame}
              className="h-8 gap-1 text-xs font-serif hover:bg-muted"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>重新开局</span>
            </Button>
          </div>

          {/* 4×4 羊皮纸温润风格卡片网格 */}
          {isMatchVictory ? (
            <Card className="border-border bg-card/80 p-8 sm:p-12 text-center shadow-lg relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
              <Trophy className="w-14 h-14 text-amber-500 mx-auto mb-4 animate-bounce" />
              <h3 className="font-serif font-bold text-xl sm:text-2xl text-foreground">
                🎉 恭喜闪电通关！
              </h3>
              <p className="text-sm text-muted-foreground font-serif mt-2">
                用时 <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-base">{matchTimer}</span> 秒 · 最高连击{" "}
                <span className="font-mono font-bold text-rose-500 text-base">{maxMatchCombo}</span> 次
              </p>
              <div className="flex justify-center gap-3 mt-6">
                <Button
                  onClick={initMatchGame}
                  className="gap-2 bg-primary text-primary-foreground font-serif shadow-md hover:bg-primary/90"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>🚀 再来一局</span>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
              {matchCards.map((card) => {
                const isSelected = selectedMatchIds.includes(card.id);
                const isMatched = matchedIds.has(card.id);
                const isWrong = wrongMatchIds.includes(card.id);

                return (
                  <button
                    key={card.id}
                    onClick={() => handleMatchCardClick(card)}
                    disabled={isMatched}
                    className={`h-24 sm:h-28 p-3 rounded-xl border flex flex-col items-center justify-center text-center relative transition-all duration-300 select-none ${
                      isMatched
                        ? "opacity-0 pointer-events-none scale-90"
                        : isWrong
                        ? "border-rose-500 ring-2 ring-rose-400/60 bg-rose-500/20 text-rose-700 dark:text-rose-300 animate-card-shake shadow-md"
                        : isSelected
                        ? "border-amber-500 ring-2 ring-amber-400/50 bg-amber-500/15 dark:bg-amber-500/25 text-foreground shadow-md scale-[1.02]"
                        : "border-border bg-card/90 hover:bg-card hover:border-amber-400/50 hover:shadow-sm text-foreground"
                    }`}
                  >
                    {/* 卡片类型微标 */}
                    <span
                      className={`absolute top-1.5 left-2 text-[10px] uppercase font-mono px-1 py-0.2 rounded ${
                        card.type === "en"
                          ? "text-sky-600 dark:text-sky-400 bg-sky-500/10"
                          : "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                      }`}
                    >
                      {card.type === "en" ? "EN" : "释义"}
                    </span>

                    {/* 英文卡发声标识 */}
                    {card.type === "en" && (
                      <Volume2 className="absolute top-1.5 right-2 w-3 h-3 text-muted-foreground/60" />
                    )}

                    {/* 卡片核心文字 */}
                    <span
                      className={`px-1 leading-snug line-clamp-3 ${
                        card.type === "en"
                          ? "font-serif font-bold text-sm sm:text-base tracking-wide"
                          : "font-serif text-xs sm:text-sm text-foreground/90"
                      }`}
                    >
                      {card.text}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 子模式二：🎧 听音选义（Ava 神经元听力 + 原句挖空盲猜）视图  */}
      {/* ========================================================= */}
      {activeGameMode === "listen" && (
        <div className="space-y-4">
          {/* 听力状态与进度条 */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card/80 text-xs sm:text-sm font-serif">
            <div className="flex items-center gap-3">
              <span className="font-medium text-foreground">
                第{" "}
                <strong className="font-mono text-primary text-base">
                  {Math.min(currentQuizIndex + 1, quizQuestions.length)}
                </strong>{" "}
                / {quizQuestions.length} 题
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                得分：<strong className="font-mono text-foreground">{quizScore}</strong>
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="flex items-center gap-0.5 text-muted-foreground">
                <Flame
                  className={`w-3.5 h-3.5 ${quizCombo > 0 ? "text-rose-500" : "text-muted-foreground"}`}
                />
                <strong className={`font-mono ${quizCombo > 0 ? "text-rose-500" : "text-foreground"}`}>
                  Combo x{quizCombo}
                </strong>
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={initListenQuiz}
              className="h-8 gap-1 text-xs font-serif hover:bg-muted"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>重新开局</span>
            </Button>
          </div>

          {/* 答题结算页 */}
          {isQuizCompleted ? (
            <Card className="border-border bg-card/80 p-8 sm:p-12 text-center shadow-lg relative overflow-hidden">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
              <Medal className="w-14 h-14 text-emerald-500 mx-auto mb-4 animate-bounce" />
              <h3 className="font-serif font-bold text-xl sm:text-2xl text-foreground">
                🎉 听力闯关圆满达成！
              </h3>

              {/* 评级 */}
              <div className="mt-3">
                <Badge
                  variant="outline"
                  className="text-sm px-3 py-1 border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-serif"
                >
                  {quizScore >= 900
                    ? "🏆 词汇大师 · SSS 满贯"
                    : quizScore >= 700
                    ? "🌟 卓越先锋 · 听觉敏锐"
                    : quizScore >= 500
                    ? "📘 进阶学者 · 稳步提升"
                    : "🌱 勤学学徒 · 持续精进"}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto my-6 p-4 rounded-xl border border-border bg-muted/40 font-serif">
                <div>
                  <div className="text-xs text-muted-foreground">总得分</div>
                  <div className="font-mono font-bold text-lg text-primary">{quizScore}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">最高连击</div>
                  <div className="font-mono font-bold text-lg text-rose-500">{maxQuizCombo}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">正确率</div>
                  <div className="font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400">
                    {quizQuestions.length > 0
                      ? Math.round((quizScore / (quizQuestions.length * 100)) * 100)
                      : 0}
                    %
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-3">
                <Button
                  onClick={initListenQuiz}
                  className="gap-2 bg-primary text-primary-foreground font-serif shadow-md hover:bg-primary/90"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>🚀 再来一轮</span>
                </Button>
              </div>
            </Card>
          ) : currentQuestion ? (
            <div className="space-y-4">
              {/* 题目卡片区 */}
              <Card className="border-border bg-card/90 shadow-xs p-6 space-y-5">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border/60 pb-5">
                  {/* 大号发声按钮 */}
                  <Button
                    size="lg"
                    onClick={speakCurrentWord}
                    className="gap-2.5 h-12 px-6 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-serif text-base"
                  >
                    <Volume2 className="w-5 h-5 animate-pulse" />
                    <span>点击重听发音</span>
                  </Button>

                  {/* 词形模糊与显示切换 + 书籍徽章 */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsWordRevealed((prev) => !prev)}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-serif transition-colors px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted"
                      title={isWordRevealed ? "隐藏词形（开启纯听力盲测）" : "揭晓词形"}
                    >
                      {isWordRevealed ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                          <span>隐去词形</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>看一眼词形</span>
                        </>
                      )}
                    </button>

                    <Badge
                      variant="outline"
                      className="text-xs font-serif max-w-[200px] truncate border-border bg-muted/60 text-muted-foreground"
                    >
                      📖 {currentQuestion.targetWord.bookTitle}
                    </Badge>
                  </div>
                </div>

                {/* 单词展示区（支持毛玻璃模糊） */}
                <div className="text-center py-2">
                  <span
                    className={`font-serif text-2xl sm:text-3xl font-bold tracking-wide transition-all duration-300 ${
                      isWordRevealed || isAnswered
                        ? "filter-none select-text text-foreground"
                        : "blur-md select-none text-foreground/40 hover:blur-sm"
                    }`}
                  >
                    {currentQuestion.targetWord.word}
                  </span>
                  {!isWordRevealed && !isAnswered && (
                    <p className="text-[11px] text-muted-foreground/70 font-serif mt-1">
                      🎧 默认已开启盲测毛玻璃模糊，可点击上方按钮看词形
                    </p>
                  )}
                </div>

                {/* 原句语境线索（挖空） */}
                <div className="p-4 rounded-xl bg-muted/40 border border-border/80 font-serif text-sm leading-relaxed text-foreground/90">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5 font-medium">
                    <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                    <span>原著上下文线索：</span>
                  </div>
                  <p className="italic">
                    “
                    {renderClozeContext(
                      currentQuestion.targetWord.context,
                      currentQuestion.targetWord.word,
                      isWordRevealed || isAnswered
                    )}
                    ”
                  </p>
                </div>
              </Card>

              {/* 四选一选项区 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = selectedOptionIndex === idx;
                  const isCorrect = option.isCorrect;

                  let optionStyle =
                    "border-border bg-card/90 hover:bg-card hover:border-amber-400/50 text-foreground";

                  if (isAnswered) {
                    if (isCorrect) {
                      optionStyle =
                        "border-emerald-500 ring-2 ring-emerald-400/60 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 font-medium shadow-sm";
                    } else if (isSelected) {
                      optionStyle =
                        "border-rose-500 ring-2 ring-rose-400/60 bg-rose-500/15 text-rose-800 dark:text-rose-200 animate-card-shake shadow-sm";
                    } else {
                      optionStyle = "border-border bg-card/40 opacity-50";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleOptionSelect(idx, option.isCorrect)}
                      disabled={isAnswered}
                      className={`p-4 rounded-xl border flex items-center justify-between text-left font-serif transition-all duration-200 ${optionStyle}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full border border-border flex items-center justify-center text-xs font-mono font-medium text-muted-foreground bg-muted/60">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-sm font-medium leading-snug">{option.text}</span>
                      </div>

                      {isAnswered && isCorrect && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      )}
                      {isAnswered && isSelected && !isCorrect && (
                        <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 答错时浮现的穿梭与下一题按钮 */}
              {isAnswered && !isAnswerCorrect && (
                <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                  <div className="text-xs text-rose-700 dark:text-rose-300 font-serif">
                    💡 遗憾答错！正确释义为：
                    <strong className="font-bold underline ml-1">
                      {currentQuestion.targetWord.translation}
                    </strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleJumpToSource(
                          currentQuestion.targetWord.paragraphIndex,
                          currentQuestion.targetWord.bookId,
                          currentQuestion.targetWord.bookTitle
                        )
                      }
                      className="gap-1 text-xs font-serif border-border bg-card hover:bg-muted"
                    >
                      <Link2 className="w-3.5 h-3.5 text-sky-500" />
                      <span>回到原文</span>
                    </Button>

                    <Button
                      size="sm"
                      onClick={goToNextQuizQuestion}
                      className="gap-1 text-xs font-serif bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <span>下一题</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
