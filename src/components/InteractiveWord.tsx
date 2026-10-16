"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { playTTS } from "@/src/lib/audioPlayer";
import { useReaderStore } from "@/src/store/useReaderStore";
import { ROOTS_DICTIONARY } from "@/src/data/rootsDictionary";
import { lookupOfflineWord } from "@/src/data/offlineDict";
import type { WordAnalysis } from "@/src/app/api/analyze-word/route";
import { Volume2, Loader2, BookmarkPlus, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";

// 前端内存翻译缓存，避免高频点读重复网络请求
const localTranslationCache = new Map<string, string>();

interface InteractiveWordProps {
  // 纯净发音与检索词
  word: string;
  // 原样显示标记（可能带有前导或末尾标点）
  displayToken?: string;
  // 所在段落原文语境
  context: string;
  // 所在段落全局索引（用于溯源回原文）
  paragraphIndex?: number;
}

export function InteractiveWord({
  word,
  displayToken,
  context,
  paragraphIndex,
}: InteractiveWordProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [translation, setTranslation] = React.useState<string>("");

  // 词源查询核心状态
  const [rootInfo, setRootInfo] = React.useState<WordAnalysis | null>(null);
  const [isFetchingRoots, setIsFetchingRoots] = React.useState<boolean>(false);
  const [rootsError, setRootsError] = React.useState<string | null>(null);

  const { addVocab, vocabularyList, offlineWordCache, saveOfflineWord } = useReaderStore();

  const cleanWord = word.trim().replace(/^['"“‘—\-]+|['"”’—\-]+$/g, "");
  const lowerWord = cleanWord.toLowerCase();
  const textToShow = displayToken ?? word;

  // 判断是否已收录进生词本
  const isSaved = React.useMemo(() => {
    return vocabularyList.some((v) => v.word.toLowerCase() === lowerWord);
  }, [vocabularyList, lowerWord]);

  // 点击单词触发点读：即刻发音 + 弹出气泡获取释义 + 词源展示（离线零网络直接秒出，不转圈）
  const handleClick = async (e: React.MouseEvent) => {
    // 阻止事件冒泡，避免触发段落容器的选中折叠
    e.stopPropagation();

    // 1. 立即触发原生/有道智能发音（离线时自动走系统 window.speechSynthesis）
    playTTS(cleanWord);

    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

    // 2. 词源拉取逻辑：离线短路拦截，严禁发起网络请求，彻底消除无限转圈死锁
    setRootsError(null);
    if (isOffline) {
      // 离线状态：直接在本地词典/词根表中同步查找，立即结束加载状态
      setIsFetchingRoots(false);
      const directRoot = ROOTS_DICTIONARY[lowerWord];
      if (directRoot) {
        setRootInfo({
          root: directRoot.root,
          affixes: directRoot.affixes,
          note: directRoot.note,
        });
      } else {
        // 尝试通过词形还原查找对应原词的词根
        const offlineMatch = lookupOfflineWord(cleanWord);
        const originalWord = offlineMatch?.originalWord?.toLowerCase();
        const fallbackRoot = originalWord ? ROOTS_DICTIONARY[originalWord] : null;
        if (fallbackRoot) {
          setRootInfo({
            root: fallbackRoot.root,
            affixes: fallbackRoot.affixes,
            note: fallbackRoot.note,
          });
        } else {
          setRootInfo(null);
        }
      }
    } else {
      // 在线状态：正常异步拉取词源分析
      setIsFetchingRoots(true);
      (async () => {
        try {
          console.log("[Roots] 准备查询:", cleanWord);
          const res = await fetch("/api/analyze-word?word=" + encodeURIComponent(cleanWord));
          if (!res.ok) {
            throw new Error(`HTTP 异常状态码: ${res.status}`);
          }
          const data = await res.json();
          console.log("[Roots] API 返回结果:", data);
          setRootInfo(data);
        } catch (error) {
          console.error("[Roots] 查询词源失败:", error);
          // 在线请求失败时，兜底查找本地离线词根
          const localRoot = ROOTS_DICTIONARY[lowerWord];
          if (localRoot) {
            setRootInfo({
              root: localRoot.root,
              affixes: localRoot.affixes,
              note: localRoot.note,
            });
          } else {
            setRootsError("词源查询失败");
            setRootInfo(null);
          }
        } finally {
          setIsFetchingRoots(false);
        }
      })();
    }

    // 3. 基础释义拉取逻辑（离线查词优先级：内存缓存 -> 生词本 -> offlineWordCache -> offlineDict 内置核心词典与词形还原 -> 在线网络请求）
    // 3.1 优先命中内存缓存
    if (localTranslationCache.has(lowerWord)) {
      const cached = localTranslationCache.get(lowerWord)!;
      setTranslation(cached);
      return;
    }

    // 3.2 离线优先：命中本地生词本已存释义
    const vocabItem = vocabularyList.find((v) => v.word.toLowerCase() === lowerWord);
    if (vocabItem && vocabItem.translation) {
      setTranslation(vocabItem.translation);
      localTranslationCache.set(lowerWord, vocabItem.translation);
      return;
    }

    // 3.3 离线优先：命中 IndexedDB 持久化的离线预载缓存表 (offlineWordCache)
    if (offlineWordCache && offlineWordCache[lowerWord]) {
      const cachedMeaning = offlineWordCache[lowerWord];
      setTranslation(cachedMeaning);
      localTranslationCache.set(lowerWord, cachedMeaning);
      return;
    }

    // 3.4 离线优先：命中内置离线核心词典与智能词形还原引擎 (offlineDict.ts)
    const offlineEntry = lookupOfflineWord(cleanWord);
    if (offlineEntry) {
      let displayMeaning = offlineEntry.translation;
      if (offlineEntry.isLemmatized && offlineEntry.originalWord) {
        displayMeaning = `[原形 ${offlineEntry.originalWord}] ${displayMeaning}`;
      }
      setTranslation(displayMeaning);
      localTranslationCache.set(lowerWord, displayMeaning);
      return;
    }

    // 3.5 备用离线：命中本地词根词典 ROOTS_DICTIONARY 中的说明
    if (ROOTS_DICTIONARY[lowerWord]?.note) {
      const rootMeaning = `【词源释义】${ROOTS_DICTIONARY[lowerWord].note}`;
      setTranslation(rootMeaning);
      localTranslationCache.set(lowerWord, rootMeaning);
      return;
    }

    // 3.6 检查当前是否处于离线飞行模式
    if (isOffline) {
      setTranslation("✈️ 当前处于离线模式，该词暂无本地释义（可在联网时使用顶部“✈️预载译文”一键缓存，或联网后点击获取完整释义）");
      return;
    }

    // 3.7 在线网络请求查词，并自动将结果存入 offlineWordCache
    setLoading(true);
    try {
      const res = await fetch(`/api/translate?word=${encodeURIComponent(cleanWord)}`);
      const data = await res.json();
      if (data && data.success && data.translation) {
        setTranslation(data.translation);
        localTranslationCache.set(lowerWord, data.translation);
        // 持久化到本地 IndexedDB 离线词汇缓存中，供后续离线阅读使用
        saveOfflineWord(cleanWord, data.translation);
        console.log("[单词, 释义, 语境]:", [cleanWord, data.translation, context]);
      } else {
        setTranslation("暂无中文释义");
      }
    } catch (err) {
      console.error("查询释义异常:", err);
      setTranslation("查询失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  };

  // 添加到生词本处理函数
  const handleAddToVocab = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSaved) {
      toast.info(`该生词已在生词本中：${cleanWord}`);
      return;
    }

    addVocab({
      word: cleanWord,
      translation: translation || "暂无释义",
      context,
      paragraphIndex,
      root: rootInfo?.root,
      affixes: rootInfo?.affixes,
      note: rootInfo?.note,
    });
    toast.success(`已收藏至生词本：${cleanWord}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          onClick={handleClick}
          className={`cursor-pointer rounded-xs px-[1.5px] py-[0.5px] transition-colors duration-150 inline-block select-text ${
            isSaved ? "underline decoration-primary/40 decoration-1 underline-offset-3" : ""
          } ${
            open
              ? "bg-primary/20 text-primary font-medium"
              : "hover:bg-primary/10 hover:text-primary active:bg-primary/25"
          }`}
          title="点击查词发音"
        >
          {textToShow}
        </span>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="center"
        sideOffset={6}
        className="w-80 p-3.5 bg-popover text-popover-foreground border-border shadow-md rounded-xl z-50 animate-in fade-in-50 zoom-in-95"
      >
        <div className="space-y-2">
          {/* 气泡顶栏：单词标题与重播发音 */}
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-serif font-bold text-base text-foreground truncate">
                {cleanWord}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-primary hover:bg-primary/10 hover:text-primary shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                playTTS(cleanWord);
              }}
              title="重新朗读发音"
            >
              <Volume2 className="w-4 h-4" />
            </Button>
          </div>

          {/* 基础释义内容显示区域 */}
          <div className="text-xs leading-relaxed min-h-[28px] flex items-center">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>查询释义中...</span>
              </div>
            ) : (
              <p className="text-foreground/90 font-sans">
                {translation || "加载中..."}
              </p>
            )}
          </div>

          {/* 1. 显式加载状态：点击后立即渲染 */}
          {isFetchingRoots && (
            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>🔄 正在查询词源...</span>
            </div>
          )}

          {/* 4. 显式异常状态：查询出错时提示 */}
          {rootsError && (
            <div className="text-xs text-destructive mt-2 py-1">
              ⚠️ 词源查询失败
            </div>
          )}

          {/* 3. 词源拆解展示区域：有数据时醒目高亮展示 */}
          {!isFetchingRoots && rootInfo && (
            <div className="pt-2.5 border-t border-border/50 space-y-1.5 animate-in fade-in-50 duration-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary font-serif">
                <span>🌱 词源拆解</span>
              </div>

              <div className="flex flex-wrap gap-1.5 items-center">
                <Badge
                  variant="secondary"
                  className="text-[11px] font-mono bg-primary/10 text-primary border-primary/20 px-2 py-0.5"
                >
                  词根: {rootInfo.root}
                </Badge>
                <Badge
                  variant="outline"
                  className="text-[11px] font-mono border-border text-foreground/80 px-2 py-0.5"
                >
                  词缀: {rootInfo.affixes}
                </Badge>
              </div>

              {rootInfo.note && (
                <p className="text-[11px] text-muted-foreground leading-normal pl-0.5 font-serif italic">
                  💡 {rootInfo.note}
                </p>
              )}
            </div>
          )}

          {/* 气泡底栏：语境捕获提示与真实生词本收藏操作 */}
          <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-mono">已记录至语境日志</span>
            <button
              onClick={handleAddToVocab}
              className={`flex items-center gap-1 font-medium transition-colors ${
                isSaved ? "text-primary/70 cursor-default" : "text-primary hover:underline"
              }`}
              title={isSaved ? "已在生词本中" : "收藏至我的生词本与 3D 闪卡"}
            >
              {isSaved ? (
                <>
                  <BookmarkCheck className="w-3.5 h-3.5 text-primary" />
                  <span>已收藏</span>
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>加入生词本</span>
                </>
              )}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
