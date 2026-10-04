"use client";

import * as React from "react";
import { useReaderStore, VocabularyItem } from "@/src/store/useReaderStore";
import { playTTS } from "@/src/lib/audioPlayer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Volume2, RotateCcw, Trash2, Sparkles, CheckCircle2, BookmarkCheck, CalendarClock, Brain, Link2 } from "lucide-react";
import { toast } from "sonner";

// 单张 3D 翻转闪卡子组件（集成艾宾浩斯复习操作与平滑飞出离场动效）
function FlashcardItem({ item }: { item: VocabularyItem }) {
  // 支持点击手动切换翻转状态（兼顾移动端触屏与桌面点击）
  const [flipped, setFlipped] = React.useState(false);
  const [isExiting, setIsExiting] = React.useState(false);
  const {
    removeVocab,
    processCardReview,
    setActiveTab,
    goToParagraphIndex,
    setActivePlayingIndex,
  } = useReaderStore();
  const vocab = item;

  const handleAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    playTTS(item.word);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeVocab(item.word);
    toast.success(`已从生词本中移除：${item.word}`);
  };

  // 溯源回原文穿梭交互逻辑
  const handleJumpToSource = (paragraphIndex: number) => {
    // 1. 全局状态中视图切换回“沉浸阅读”主界面
    setActiveTab("reader");

    // 2. 翻页到目标段落所在的分页
    goToParagraphIndex(paragraphIndex);

    toast.info(`📍 正在溯源至段落 #${paragraphIndex + 1}...`);

    // 3. 延迟 80ms 确保 DOM 渲染完成，平滑滚动至舒适阅读区偏中上位置
    setTimeout(() => {
      const element = document.getElementById(`paragraph-${paragraphIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      // 4. （视觉增强）联动高亮逻辑，将目标段落短暂设为 activePlayingIndex 的高亮状态
      setActivePlayingIndex(paragraphIndex);

      // 3.5秒后自动淡出高亮
      setTimeout(() => {
        if (useReaderStore.getState().activePlayingIndex === paragraphIndex) {
          setActivePlayingIndex(null);
        }
      }, 3500);
    }, 80);
  };

  // 点击“忘记了”：重置复习阶段至 0，今天继续复习
  const handleForgot = (e: React.MouseEvent) => {
    e.stopPropagation();
    processCardReview(item.word, false);
    toast.info(`「${item.word}」复习阶段已重置为初级，今日继续巩固！`);
    setFlipped(false);
  };

  // 点击“记住了”：触发平滑飞出动效，并推进至下一艾宾浩斯复习周期
  const handleRemembered = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExiting(true);
    setTimeout(() => {
      processCardReview(item.word, true);
      toast.success(`🎉 记住「${item.word}」，已根据艾宾浩斯记忆曲线进入下一复习阶段！`);
    }, 300);
  };

  return (
    <div
      onClick={() => setFlipped(!flipped)}
      className={`group [perspective:1000px] h-80 w-full select-none cursor-pointer transition-all duration-300 ${
        isExiting ? "opacity-0 translate-x-10 scale-90 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* 3D 翻转主体 */}
      <div
        className={`relative w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${
          flipped ? "[transform:rotateY(180deg)]" : ""
        } group-hover:[transform:rotateY(180deg)]`}
      >
        {/* 正面（单词、词根词缀、复习阶段、发音与翻转引导） */}
        <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] rounded-xl border border-border bg-card p-5 flex flex-col justify-between shadow-xs transition-shadow hover:shadow-md">
          {/* 正面顶栏 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>3D 闪卡</span>
              </span>
              {typeof item.reviewLevel === "number" && item.reviewLevel > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono text-primary/80 border-primary/20">
                  阶段 {item.reviewLevel}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full"
              onClick={handleAudio}
              title="播放单词发音"
            >
              <Volume2 className="w-4 h-4" />
            </Button>
          </div>

          {/* 正面中间：大字单词与词根词缀 */}
          <div className="text-center space-y-2 py-2">
            <h3 className="font-serif font-bold text-2xl text-foreground tracking-wide">
              {item.word}
            </h3>
            {item.root && (
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                <Badge variant="secondary" className="text-[10px] font-mono bg-primary/10 text-primary border-primary/20">
                  {item.root}
                </Badge>
              </div>
            )}
          </div>

          {/* 正面底栏：提示信息 */}
          <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-mono">{item.addedAt || "刚刚收录"}</span>
            <span className="flex items-center gap-1 text-primary/80 font-serif">
              <RotateCcw className="w-3 h-3" />
              <span>翻转查看释义与打卡</span>
            </span>
          </div>
        </div>

        {/* 背面（中文释义、语境例句、词源解析与艾宾浩斯操作按钮） */}
        <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-xl border border-primary/40 bg-muted/40 p-5 flex flex-col justify-between shadow-md">
          {/* 背面顶栏 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 truncate max-w-[170px]">
              <span className="font-serif font-bold text-sm text-primary truncate">
                {vocab.word}
              </span>
              {typeof item.reviewLevel === "number" && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0 font-mono">
                  Lv.{item.reviewLevel}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-primary hover:bg-primary/10 rounded-full"
                onClick={handleAudio}
                title="重新发音"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
                onClick={handleRemove}
                title="从生词库中移除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* 背面中间：中文释义、原句与词源解析 */}
          <div className="space-y-2.5 py-1 overflow-y-auto max-h-[155px] pr-1">
            <div className="text-sm font-semibold text-foreground leading-snug">
              {vocab.translation}
            </div>

            {vocab.context && (
              <div className="text-xs font-serif italic text-muted-foreground bg-background/60 p-2.5 rounded-md border-l-2 border-primary/50 leading-relaxed">
                “{vocab.context.trim()}”
              </div>
            )}

            {/* 🔗 回到原文跳转按钮（排版于释义与例句后，第一行严格阻止事件冒泡） */}
            {typeof item.paragraphIndex === "number" && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  handleJumpToSource(item.paragraphIndex!);
                }}
                className="text-xs text-amber-700/60 hover:text-amber-800 dark:text-amber-400/60 dark:hover:text-amber-300 cursor-pointer transition-colors mt-2 flex justify-end items-center gap-1 select-none"
                title="定位并跳转回原文段落"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>回到原文</span>
              </div>
            )}

            {/* 词源深度解析区块 */}
            {(vocab.affixes || vocab.note) && (
              <div className="p-2.5 bg-muted/30 rounded-md text-xs text-muted-foreground space-y-1">
                {vocab.affixes && (
                  <div>
                    <span className="font-medium">🧩 词缀：</span>
                    {vocab.affixes}
                  </div>
                )}
                {vocab.note && (
                  <div>
                    <span className="font-medium">💡 提示：</span>
                    {vocab.note}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 背面底栏：艾宾浩斯复习操作按钮 */}
          <div className="pt-2 border-t border-border/40 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleForgot}
              className="flex-1 h-8 text-xs font-serif text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <span>❌ 忘记了</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRemembered}
              className="flex-1 h-8 text-xs font-serif text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-600 font-medium transition-colors"
            >
              <span>✅ 记住了</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FlashcardsView() {
  const { vocabularyList } = useReaderStore();
  const [showAllCards, setShowAllCards] = React.useState(false);

  // 客户端挂载标记，防止服务端渲染时时间戳微秒差异造成水合不一致
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const now = mounted ? Date.now() : 0;
  // 艾宾浩斯过滤：仅展示下次复习时间戳 <= 当前时间的到期卡片
  const dueCards = React.useMemo(() => {
    if (!mounted) return vocabularyList;
    return vocabularyList.filter((item) => (item.nextReviewTime ?? 0) <= now);
  }, [vocabularyList, mounted, now]);

  // 当前实际渲染的卡片列表
  const displayedCards = showAllCards ? vocabularyList : dueCards;

  return (
    <div className="space-y-6">
      {/* 顶部统计栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border bg-card shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎴</span>
            <h2 className="font-serif font-bold text-lg text-foreground">3D 记忆闪卡</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-mono font-medium">
              今日待复习：{dueCards.length} 张 / 总卡片：{vocabularyList.length} 张
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-serif">
            基于艾宾浩斯遗忘曲线过滤，翻转卡片后点击“记住了”或“忘记了”以动态安排下次最佳复习周期
          </p>
        </div>

        {/* 快捷切换视图：默认仅展示待复习，允许用户查看全部 */}
        {vocabularyList.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAllCards(!showAllCards)}
              className="gap-1.5 font-serif text-xs border-border"
            >
              <CalendarClock className="w-3.5 h-3.5 text-primary" />
              <span>{showAllCards ? "只看待复习" : "查看全部卡片"}</span>
            </Button>
          </div>
        )}
      </div>

      {/* 闪卡网格流 */}
      {vocabularyList.length === 0 ? (
        <Card className="border-border bg-card/60 p-12 text-center">
          <BookmarkCheck className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-serif font-medium text-base text-foreground">闪卡库空空如也</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 font-serif">
            在正文阅读时点击任意不熟悉的生词，在弹出的气泡中点击“加入生词本”，系统将自动生成对应的 3D 记忆闪卡！
          </p>
        </Card>
      ) : displayedCards.length === 0 ? (
        <Card className="border-border bg-card/60 p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="font-serif font-bold text-lg text-foreground">今日复习已全部完成！🎉</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1.5 font-serif leading-relaxed">
            太棒了！今日待复习的词条已全部完成打卡。艾宾浩斯间隔重复算法将在指定科学周期后再次唤醒它们。
          </p>
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllCards(true)}
              className="font-serif text-xs gap-1.5"
            >
              <Brain className="w-3.5 h-3.5 text-primary" />
              <span>提前复习全部 {vocabularyList.length} 张卡片</span>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedCards.map((item) => (
            <FlashcardItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
