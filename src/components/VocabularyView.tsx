"use client";

import * as React from "react";
import { useReaderStore, VocabularyItem } from "@/src/store/useReaderStore";
import { BOOK_TITLE, BOOK_ID } from "@/src/data/bookData";
import { playTTS } from "@/src/lib/audioPlayer";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Volume2, Trash2, Download, Bookmark, Sparkles, Link2, Zap } from "lucide-react";
import { toast } from "sonner";

export function VocabularyView() {
  const {
    vocabularyList,
    removeVocab,
    clearAllVocab,
    setActiveTab,
    goToParagraphIndex,
    setActivePlayingIndex,
    switchBook,
    currentBookId,
  } = useReaderStore();

  // 溯源回原文（支持跨书平行切换）
  const handleJumpToSource = (paragraphIndex: number, targetBookId?: string, targetBookTitle?: string) => {
    if (targetBookId && currentBookId !== targetBookId) {
      switchBook(targetBookId);
      toast.info(`📖 已为您自动切换至《${targetBookTitle || "原著书籍"}》`);
    }

    setActiveTab("reader");
    goToParagraphIndex(paragraphIndex);
    toast.info(`📍 正在溯源至段落 #${paragraphIndex + 1}...`);

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
    }, 120);
  };

  // 导出生词本为 Markdown
  const handleExportVocabMarkdown = () => {
    if (vocabularyList.length === 0) {
      toast.info("生词本为空，暂无可导出内容");
      return;
    }

    const exportTime = new Date().toLocaleString("zh-CN");
    const LF = "\n";
    const lines: string[] = [];

    lines.push(`# 《${BOOK_TITLE}》生词本汇总`);
    lines.push("");
    lines.push(`> 📅 导出时间：${exportTime}`);
    lines.push(`> 📊 生词总计：${vocabularyList.length} 个`);
    lines.push("");
    lines.push("---");
    lines.push("");

    vocabularyList.forEach((item, idx) => {
      lines.push(`### ${idx + 1}. **${item.word}**`);
      lines.push("");
      lines.push(`- **释义**：${item.translation}`);
      if (item.root) {
        lines.push(`- **词根**：${item.root}`);
      }
      if (item.affixes) {
        lines.push(`- **词缀**：${item.affixes}`);
      }
      if (item.context) {
        lines.push(`> **原句语境**：${item.context.trim()}`);
      }
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    const md = lines.join(LF);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = `${BOOK_ID}_Vocab_${Date.now()}.md`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`已导出 ${vocabularyList.length} 个生词到 ${filename}`);
  };

  return (
    <div className="space-y-6">
      {/* 顶部工具栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📓</span>
            <h2 className="font-serif font-bold text-lg text-foreground">我的生词本</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-mono font-medium">
              共 {vocabularyList.length} 词
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-serif">
            集中管理正文阅读中收藏的疑难词汇与词源笔记，支持一键朗读与导出
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => {
              setActiveTab("wordgame");
              toast.info("⚡ 已为您切换至【单词闯关】游戏台");
            }}
            className="gap-1.5 font-serif bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold shadow-xs"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>⚡ 去玩单词闯关</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={vocabularyList.length === 0}
            onClick={() => {
              if (window.confirm("确定要清空所有生词吗？清空前请确保您已点击导出备份。")) {
                clearAllVocab();
                toast.info("已清空生词本中的所有词条");
              }
            }}
            className="gap-1.5 font-serif text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>一键清空</span>
          </Button>

          <Button
            size="sm"
            onClick={handleExportVocabMarkdown}
            className="gap-1.5 font-serif bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出生词本</span>
          </Button>
        </div>
      </div>

      {/* 列表渲染 */}
      {vocabularyList.length === 0 ? (
        <Card className="border-border bg-card/60 p-12 text-center">
          <Bookmark className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-serif font-medium text-base text-foreground">生词本暂无词条</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 font-serif">
            在正文阅读时点击任意英文单词，并在弹出气泡中点击“加入生词本”即可收录。
          </p>
          <div className="mt-4">
            <Button
              size="sm"
              onClick={() => {
                setActiveTab("wordgame");
                toast.info("⚡ 已为您切换至【单词闯关】游戏台");
              }}
              className="gap-1.5 font-serif bg-amber-500 hover:bg-amber-600 text-stone-900 font-semibold"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>⚡ 去玩单词闯关（内置保底词库）</span>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {vocabularyList.map((item, idx) => (
            <Card
              key={item.id}
              className="border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-primary">
                      #{idx + 1}
                    </span>
                    <span className="font-serif font-bold text-base text-foreground">
                      {item.word}
                    </span>

                    {/* 📖 所属书籍来源徽章 */}
                    <span
                      className="text-[11px] text-amber-800/80 dark:text-amber-300/80 bg-amber-100/70 dark:bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-200/60 dark:border-amber-900/60 font-serif inline-flex items-center gap-1 select-none shrink-0"
                      title={`收录自原著：《${item.bookTitle || "世界小史"}》`}
                    >
                      📖 {item.bookTitle || "世界小史"}
                    </span>

                    {item.root && (
                      <Badge variant="secondary" className="text-[10px] font-mono bg-primary/10 text-primary border-primary/20">
                        {item.root}
                      </Badge>
                    )}
                    {item.affixes && (
                      <Badge variant="outline" className="text-[10px] font-mono border-border text-muted-foreground">
                        {item.affixes}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs font-medium text-foreground/90">
                    {item.translation}
                  </p>

                  {item.context && (
                    <p className="text-xs font-serif italic text-muted-foreground line-clamp-2">
                      “{item.context}”
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  {/* 🔗 回到原文跳转按钮（支持跨书平行穿梭） */}
                  {typeof item.paragraphIndex === "number" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-amber-700/80 hover:text-amber-800 dark:text-amber-400/80 dark:hover:text-amber-300 font-serif"
                      onClick={() => handleJumpToSource(item.paragraphIndex!, item.bookId, item.bookTitle)}
                      title={`跳转回《${item.bookTitle || "原著"}》第 ${item.paragraphIndex + 1} 段`}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">回到原文</span>
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-primary hover:bg-primary/10"
                    onClick={() => playTTS(item.word)}
                    title="播放发音"
                  >
                    <Volume2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      removeVocab(item.word);
                      toast.success(`已删除生词：${item.word}`);
                    }}
                    title="移除生词"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
