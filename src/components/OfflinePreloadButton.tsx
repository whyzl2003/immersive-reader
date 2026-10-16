"useClient";
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useReaderStore } from "@/src/store/useReaderStore";
import { lookupOfflineWord } from "@/src/data/offlineDict";
import { Plane, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// 去除 HTML 标签辅助函数
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// 常见基础高频停用词表（预载时跳过，无需耗费请求）
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "they", "them", "have", "has", "had", 
  "been", "were", "are", "was", "but", "not", "what", "when", "where", "who", "which", "how", 
  "all", "can", "could", "would", "should", "will", "just", "into", "out", "then", "than", 
  "their", "there", "here", "very", "more", "some", "such", "like", "over", "also", "about", 
  "your", "you", "his", "her", "its", "our", "him", "she", "one", "two", "any", "now", "only",
  "may", "might", "shall", "must", "these", "those", "other", "another", "after", "before",
  "even", "most", "many", "much", "time", "come", "came", "make", "made", "said", "says"
]);

interface OfflinePreloadButtonProps {
  className?: string;
  variant?: "outline" | "default" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
}

export function OfflinePreloadButton({
  className = "",
  variant = "outline",
  size = "sm",
  showLabel = true,
}: OfflinePreloadButtonProps) {
  const {
    bookshelf,
    currentBookId,
    currentPage,
    pageSize,
    paragraphTranslations,
    saveParagraphTranslation,
    vocabularyList,
    offlineWordCache,
    saveBatchOfflineWords,
  } = useReaderStore();

  const [isPreloading, setIsPreloading] = React.useState(false);
  const [progress, setProgress] = React.useState<{ current: number; total: number; label: string } | null>(null);

  // 获得当前书籍所有段落
  const currentBook = bookshelf[currentBookId];
  const activeParagraphs = currentBook?.paragraphs || [];

  // 预载后续 30 个段落的译文及页面重点词汇（双预载）
  const handlePreload = async () => {
    if (isPreloading) return;

    // 1. 检查当前是否离线
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("当前处于离线状态，无法连接云端，请连接网络后再预载离线数据");
      return;
    }

    if (!activeParagraphs || activeParagraphs.length === 0) {
      toast.info("当前书籍无可用段落");
      return;
    }

    const currentStartIndex = currentPage * pageSize;
    const targetEndIndex = Math.min(currentStartIndex + 30, activeParagraphs.length);
    const existingTranslations = paragraphTranslations[currentBookId] || {};

    // 2. 筛选出待预载的段落（排除插图和已经翻译成功的段落）
    const pendingTasks: { index: number; text: string }[] = [];
    const candidateWordsSet = new Set<string>();

    for (let i = currentStartIndex; i < targetEndIndex; i++) {
      const raw = activeParagraphs[i];
      if (!raw || raw.trim().startsWith("<img")) continue;

      const cleanText = stripHtml(raw);
      if (!cleanText) continue;

      // 提取未预载的段落
      const cached = existingTranslations[i];
      if (
        !cached ||
        cached.startsWith("翻译获取失败") ||
        cached.startsWith("✈️ 当前处于离线模式")
      ) {
        pendingTasks.push({ index: i, text: cleanText });
      }

      // 提取本段中可能需要预载释义的重点生词
      const tokens = cleanText.match(/\b[A-Za-z]+(?:'[A-Za-z]+)?\b/g) || [];
      for (const token of tokens) {
        const clean = token.toLowerCase();
        if (clean.length < 4) continue;
        if (STOP_WORDS.has(clean)) continue;
        if (offlineWordCache && offlineWordCache[clean]) continue;
        if (vocabularyList.some((v) => v.word.toLowerCase() === clean)) continue;
        // 如果本地内置核心词典与词形还原引擎已经能命中，就不必发起网络请求
        if (lookupOfflineWord(clean)) continue;

        candidateWordsSet.add(clean);
        if (candidateWordsSet.size >= 30) break;
      }
    }

    const wordsToFetch = Array.from(candidateWordsSet);

    if (pendingTasks.length === 0 && wordsToFetch.length === 0) {
      toast.success("✅ 当前及后续 30 段译文与重点生词已全量离线缓存，开启飞行模式也可随时查看！", {
        duration: 4000,
      });
      return;
    }

    // 3. 开始执行后台静默离线双预载
    setIsPreloading(true);
    const totalSteps = pendingTasks.length + wordsToFetch.length;
    setProgress({ current: 0, total: totalSteps, label: "准备预载..." });
    const toastId = toast.loading(`正在离线缓存数据 (0/${totalSteps})...`);

    let successCount = 0;
    let failCount = 0;
    let wordSuccessCount = 0;

    try {
      // 阶段 3.1：预载段落整段译文
      for (let i = 0; i < pendingTasks.length; i++) {
        const task = pendingTasks[i];
        try {
          const res = await fetch("/api/translate-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: task.text }),
          });

          const data = await res.json().catch(() => ({}));
          if (res.ok && data?.success && data?.translation) {
            saveParagraphTranslation(currentBookId, task.index, data.translation);
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          console.warn(`预载段落 #${task.index} 失败:`, err);
          failCount++;
        }

        const currentDone = i + 1;
        setProgress({
          current: currentDone,
          total: totalSteps,
          label: `段落译文 (${currentDone}/${pendingTasks.length})`,
        });
        toast.loading(`正在离线缓存译文 (${currentDone}/${pendingTasks.length})...`, {
          id: toastId,
        });

        // 微延迟防抖
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      // 阶段 3.2：预载段落中提取的重点生词释义
      if (wordsToFetch.length > 0) {
        const batchFetchedWords: Record<string, string> = {};
        for (let i = 0; i < wordsToFetch.length; i += 3) {
          const chunk = wordsToFetch.slice(i, i + 3);
          await Promise.all(
            chunk.map(async (w) => {
              try {
                const res = await fetch(`/api/translate?word=${encodeURIComponent(w)}`);
                const data = await res.json().catch(() => ({}));
                if (res.ok && data?.success && data?.translation) {
                  batchFetchedWords[w] = data.translation;
                  wordSuccessCount++;
                }
              } catch {
                // 忽略个别生词网络超时
              }
            })
          );

          const currentWordDone = Math.min(i + 3, wordsToFetch.length);
          const totalDone = pendingTasks.length + currentWordDone;
          setProgress({
            current: totalDone,
            total: totalSteps,
            label: `重点生词 (${currentWordDone}/${wordsToFetch.length})`,
          });
          toast.loading(`正在离线缓存重点生词 (${currentWordDone}/${wordsToFetch.length})...`, {
            id: toastId,
          });

          await new Promise((resolve) => setTimeout(resolve, 80));
        }

        if (Object.keys(batchFetchedWords).length > 0) {
          saveBatchOfflineWords(batchFetchedWords);
        }
      }

      const summaryParts = [];
      if (successCount > 0) summaryParts.push(`${successCount} 段译文`);
      if (wordSuccessCount > 0) summaryParts.push(`${wordSuccessCount} 个重点词`);

      if (summaryParts.length > 0) {
        toast.success(`✅ 已备好离线数据（成功缓存 ${summaryParts.join("、")}），开启飞行模式也可随时查看！`, {
          id: toastId,
          duration: 4500,
        });
      } else {
        toast.info("已完成检测，暂无新增离线内容需要缓存", { id: toastId });
      }
    } catch (err) {
      console.error("离线双预载执行异常:", err);
      toast.error("离线预载中断，请重试", { id: toastId });
    } finally {
      setIsPreloading(false);
      setProgress(null);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handlePreload}
      disabled={isPreloading}
      className={`relative gap-1.5 transition-all text-xs font-serif ${className}`}
      title="登机前一键预载当前页及后续30段译文与重点词汇，断网时仍可自由查阅"
    >
      {isPreloading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
          {showLabel && (
            <span>
              {progress ? `${progress.label}` : "正在预载..."}
            </span>
          )}
        </>
      ) : (
        <>
          <Plane className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 rotate-[-45deg]" />
          {showLabel && <span>✈️ 预载译文与词库</span>}
        </>
      )}
    </Button>
  );
}
