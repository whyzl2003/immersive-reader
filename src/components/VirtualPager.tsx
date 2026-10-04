"use client";

import * as React from "react";
import { useReaderStore, getBookIdentifier } from "@/src/store/useReaderStore";
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
import { BookImporter } from "@/src/components/BookImporter";
import { renderTokenizedParagraph } from "@/src/lib/tokenizer";
import { playTTS, stopTTS } from "@/src/lib/audioPlayer";
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
} from "lucide-react";
import { toast } from "sonner";

export function VirtualPager() {
  const {
    currentPage,
    pageSize,
    totalPages,
    currentChapterTitle,
    customBook,
    customBookTitle,
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
  } = useReaderStore();

  const scrollViewportRef = React.useRef<HTMLDivElement>(null);
  // 维护段落 DOM 元素引用表，用于朗读时触发视差平滑居中滚动
  const paragraphRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());

  // 动态数据源：若导入了自定义书籍则以自定义段落为准，否则回退到《世界小史》
  const activeParagraphs = customBook || ALL_PARAGRAPHS;

  // 获取当前书籍的稳定唯一标识符
  const currentBookId = React.useMemo(() => {
    return getBookIdentifier(customBook, customBookTitle);
  }, [customBook, customBookTitle]);

  // 记录已恢复过进度的书籍 ID，避免重复弹出提示
  const restoredBookRef = React.useRef<string | null>(null);

  // 1. 初始化恢复位置：挂载或切换书籍时检查并自动恢复上次阅读进度
  React.useEffect(() => {
    if (restoredBookRef.current === currentBookId) return;
    restoredBookRef.current = currentBookId;

    const savedPosition = readingProgress[currentBookId];
    if (typeof savedPosition === "number" && savedPosition > 0) {
      const targetPage = Math.floor(savedPosition / pageSize);
      if (targetPage > 0 && targetPage < totalPages && targetPage !== currentPage) {
        setCurrentPage(targetPage);
        toast.info("📍 已为您恢复至上次阅读位置", {
          description: `已自动跳转至第 ${targetPage + 1} 页（段落 #${savedPosition + 1}）`,
          duration: 3500,
        });
      }
    }
  }, [currentBookId, readingProgress, pageSize, totalPages, currentPage, setCurrentPage]);

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

  // 段落内联翻译状态：缓存映射表、展开控制、加载状态
  const [translatedParagraphs, setTranslatedParagraphs] = React.useState<Record<number, string>>({});
  const [expandedTranslations, setExpandedTranslations] = React.useState<Record<number, boolean>>({});
  const [loadingTranslations, setLoadingTranslations] = React.useState<Record<number, boolean>>({});

  // 记随笔弹窗状态与选中段落数据
  const [noteDialogOpen, setNoteDialogOpen] = React.useState(false);
  const [activeNotePara, setActiveNotePara] = React.useState<{
    text: string;
    index: number;
  } | null>(null);
  const [noteContent, setNoteContent] = React.useState("");

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

  // 翻页时自动平滑滚动回顶部，并停止正在朗读的声音与清空高亮状态
  React.useEffect(() => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
    stopTTS();
    setActivePlayingIndex(null);
  }, [currentPage, setActivePlayingIndex]);

  // 组件卸载时安全停止正在朗读的音频并重置高亮状态
  React.useEffect(() => {
    return () => {
      stopTTS();
      setActivePlayingIndex(null);
    };
  }, [setActivePlayingIndex]);

  // 段落朗读：跨浏览器原生自适应高保真 TTS（Edge Ava/Andrew -> Chrome -> Siri/Samantha，无缝防冲突）
  const handleSpeakParagraph = (text: string, index: number) => {
    // 若当前正在朗读该段落，点击则停止
    if (activePlayingIndex === index) {
      stopTTS();
      setActivePlayingIndex(null);
      toast.info("已停止朗读");
      return;
    }

    const cleanText = text.trim();
    if (!cleanText) return;

    // 播放前先调用 cancel() 掐断旧声音，并立即更新当前段落为活跃高亮状态
    setActivePlayingIndex(index);

    playTTS(cleanText, {
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

  // 打开段落记随笔弹窗
  const handleOpenNoteDialog = (text: string, index: number) => {
    setActiveNotePara({ text, index });
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
  const handleToggleBookmark = (text: string, index: number) => {
    const existing = bookmarks.find(
      (b) => b.bookId === currentBookId && b.paragraphIndex === index
    );
    if (existing) {
      removeBookmark(existing.id);
      toast.info(`已移除段落 #${index + 1} 的书签`);
    } else {
      addBookmark(currentBookId, index, text);
      toast.success(`已为段落 #${index + 1} 添加书签！`, {
        description: "可在目录侧边栏查看、重命名或快速定位。",
      });
    }
  };

  // 切换段落内联翻译：支持展开/收起、前端状态缓存与加载动画
  const handleToggleTranslation = async (text: string, index: number) => {
    const isExpanded = !!expandedTranslations[index];

    // 若当前已展开，再次点击则收起
    if (isExpanded) {
      setExpandedTranslations((prev) => ({ ...prev, [index]: false }));
      return;
    }

    // 展开内联面板
    setExpandedTranslations((prev) => ({ ...prev, [index]: true }));

    // 若已有缓存的成功翻译结果，不再重复请求网络
    if (
      translatedParagraphs[index] &&
      translatedParagraphs[index] !== "翻译获取失败，请重试"
    ) {
      return;
    }

    // 触发异步翻译请求
    setLoadingTranslations((prev) => ({ ...prev, [index]: true }));
    try {
      const res = await fetch("/api/translate-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      if (res.ok && data?.success && data?.translation) {
        setTranslatedParagraphs((prev) => ({
          ...prev,
          [index]: data.translation,
        }));
      } else {
        const errMsg = data?.translation || "翻译获取失败，请重试";
        setTranslatedParagraphs((prev) => ({
          ...prev,
          [index]: errMsg,
        }));
        toast.error("翻译获取失败，请重试");
      }
    } catch (error) {
      console.error("段落翻译请求异常:", error);
      setTranslatedParagraphs((prev) => ({
        ...prev,
        [index]: "翻译获取失败，请重试",
      }));
      toast.error("翻译获取失败，请重试");
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
              const translationText = translatedParagraphs[globalIndex];

              // 当前段落的书签状态
              const currentBookmark = bookmarks.find(
                (b) => b.bookId === currentBookId && b.paragraphIndex === globalIndex
              );
              const isBookmarked = !!currentBookmark;

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
                  className={`group relative pl-8 sm:pl-10 pr-28 rounded-r-lg transition-all duration-300 ease-in-out ${
                    isSpeaking
                      ? "border-l-4 border-amber-500 bg-amber-100/40 dark:bg-amber-900/30 py-2.5 shadow-xs"
                      : isExpanded
                      ? "border-l-2 border-primary/50 bg-muted/15 py-1.5"
                      : isBookmarked
                      ? "border-l-2 border-amber-500/50 bg-amber-500/5 py-1.5"
                      : "border-l-2 border-transparent hover:border-primary/40 hover:bg-muted/10 py-1.5"
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

                  {/* 悬浮轻量操作栏 (包含：🔊 朗读 | 译 整段翻译 | 🔖 动态书签 | 📝 随笔) */}
                  <div
                    className={`absolute right-1 top-1.5 transition-opacity flex items-center gap-1 bg-card/90 backdrop-blur-xs p-1 rounded-md border border-border/60 shadow-xs z-20 ${
                      isSpeaking ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {/* 🔊 段落朗读按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-6 w-6 rounded transition-colors ${
                        isSpeaking
                          ? "text-amber-600 dark:text-amber-400 bg-amber-500/20 hover:bg-amber-500/30 animate-pulse font-bold"
                          : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                      }`}
                      onClick={() => handleSpeakParagraph(para, globalIndex)}
                      title={isSpeaking ? "停止朗读" : "朗读该段落 (Sentence TTS)"}
                    >
                      {isSpeaking ? <Square className="w-3 h-3 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </Button>

                    {/* 译 段落整句翻译按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-6 w-6 rounded hover:bg-primary/10 transition-colors ${
                        isExpanded ? "text-primary bg-primary/10 font-bold" : "text-muted-foreground hover:text-primary"
                      }`}
                      onClick={() => handleToggleTranslation(para, globalIndex)}
                      title={isExpanded ? "收起中文译文" : "查看段落翻译 (Translate)"}
                    >
                      <span className="text-[12px] font-serif font-bold leading-none select-none">
                        译
                      </span>
                    </Button>

                    {/* 🔖 自定义书签/动态目录标记按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-6 w-6 rounded transition-colors ${
                        isBookmarked
                          ? "text-amber-500 hover:text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 font-bold"
                          : "text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                      }`}
                      onClick={() => handleToggleBookmark(para, globalIndex)}
                      title={isBookmarked ? "移除此段书签" : "将此段添加至书签/动态目录"}
                    >
                      <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? "fill-current" : ""}`} />
                    </Button>

                    {/* 📝 记读书随笔按钮 */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={() => handleOpenNoteDialog(para, globalIndex)}
                      title="为此段记录读书随笔"
                    >
                      <PenSquare className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* 已收藏书签常驻右侧静默徽标（非悬浮时可见） */}
                  {isBookmarked && (
                    <span
                      className="absolute right-2 top-2 text-amber-500/80 pointer-events-none group-hover:opacity-0 transition-opacity"
                      title="已设为书签"
                    >
                      <Bookmark className="w-3.5 h-3.5 fill-current" />
                    </span>
                  )}

                  {/* 段落分词点读渲染 */}
                  <p
                    className={`tracking-normal text-justify select-text transition-colors duration-300 ${
                      isSpeaking ? "text-foreground font-medium" : "text-foreground/90"
                    }`}
                  >
                    {renderTokenizedParagraph(para, para, globalIndex, globalIndex)}
                  </p>

                  {/* 内联整段/长句翻译展示区 */}
                  {isExpanded && (
                    <div className="mt-3 text-[15px] sm:text-[16px] font-sans leading-relaxed text-foreground/90 bg-muted/50 dark:bg-muted/30 border-l-4 border-primary/70 rounded-r-md px-4 py-3 shadow-2xs transition-all duration-300">
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
                      ) : translationText === "翻译获取失败，请重试" ? (
                        <div className="flex items-center justify-between py-1 text-xs text-destructive">
                          <span>翻译获取失败，请重试</span>
                          <button
                            type="button"
                            onClick={() => {
                              // 清除失败记录后重试
                              setTranslatedParagraphs((prev) => {
                                const next = { ...prev };
                                delete next[globalIndex];
                                return next;
                              });
                              handleToggleTranslation(para, globalIndex);
                            }}
                            className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
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
