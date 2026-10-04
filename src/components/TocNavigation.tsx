"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TOC_DATA, TocItem } from "@/src/data/bookData";
import { useReaderStore, getBookIdentifier, BookmarkItem } from "@/src/store/useReaderStore";
import { toast } from "sonner";
import {
  BookOpen,
  ListTree,
  ChevronRight,
  Bookmark,
  Pencil,
  Trash2,
  Check,
  X,
  FileText,
} from "lucide-react";

export function TocNavigation() {
  const [open, setOpen] = React.useState(false);

  const {
    pageSize,
    goToChapter,
    goToParagraphIndex,
    currentChapterTitle,
    customBook,
    customBookTitle,
    bookmarks,
    removeBookmark,
    updateBookmarkTitle,
  } = useReaderStore();

  // 当前书籍标识符
  const currentBookId = React.useMemo(() => {
    return getBookIdentifier(customBook, customBookTitle);
  }, [customBook, customBookTitle]);

  // 过滤属于当前书籍的所有自定义书签，并按段落索引升序排列
  const currentBookBookmarks = React.useMemo(() => {
    return bookmarks
      .filter((b) => b.bookId === currentBookId)
      .sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  }, [bookmarks, currentBookId]);

  // 正在编辑名称的书签 ID 和临时输入内容
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");

  // 如果是自定义 TXT，默认打开书签面板；如果是预设书籍，默认打开章节面板
  const defaultTab = customBook ? "bookmarks" : "chapters";

  // 点击章节预设目录跳转
  const handleSelectChapter = (item: TocItem) => {
    goToChapter(item.startIndex);
    setOpen(false);
    toast.info(`已跳转至目录：${item.title}`, {
      description: `起始段落：第 ${item.startIndex + 1} 段（第 ${Math.floor(item.startIndex / pageSize) + 1} 页）`,
    });
  };

  // 点击自定义书签条目跳转
  const handleSelectBookmark = (item: BookmarkItem) => {
    // 正在编辑时不触发跳转
    if (editingId === item.id) return;
    goToParagraphIndex(item.paragraphIndex);
    setOpen(false);
    const targetPage = Math.floor(item.paragraphIndex / pageSize) + 1;
    toast.success(`已定位至书签：${item.customTitle}`, {
      description: `第 ${targetPage} 页 · 段落 #${item.paragraphIndex + 1}`,
    });
  };

  // 开始编辑书签标题
  const handleStartEdit = (item: BookmarkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditingTitle(item.customTitle);
  };

  // 提交保存修改的书签/目录名称
  const handleSaveEdit = (id: string, e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    const clean = editingTitle.trim();
    if (clean) {
      updateBookmarkTitle(id, clean);
      toast.success("已更新目录条目名称");
    }
    setEditingId(null);
    setEditingTitle("");
  };

  // 取消编辑
  const handleCancelEdit = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation();
    setEditingId(null);
    setEditingTitle("");
  };

  // 删除书签
  const handleDeleteBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeBookmark(id);
    toast.info("已移除该书签条目");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-border bg-card/80 hover:bg-accent hover:text-accent-foreground shadow-xs font-serif"
        >
          <ListTree className="w-4 h-4 text-primary" />
          <span>
            📑 目录 {currentBookBookmarks.length > 0 && `(🔖 ${currentBookBookmarks.length})`}
          </span>
        </Button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-[340px] sm:w-[440px] bg-popover text-popover-foreground border-border p-0 flex flex-col"
      >
        <SheetHeader className="p-5 border-b border-border/60 text-left bg-background/50">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <SheetTitle className="font-serif text-lg tracking-wide truncate">
              {customBook ? `《${customBookTitle || "本地文本"}》` : "书籍目录导航"}
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground font-serif">
            支持切换预设章节与您标记的自定义书签目录，点击即可快速精准定位
          </SheetDescription>
        </SheetHeader>

        {/* 顶部 Tabs 分栏：预设章节 vs 我的书签/动态目录 */}
        <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-3 pb-2 border-b border-border/40">
            <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 rounded-lg">
              <TabsTrigger value="chapters" className="text-xs font-serif gap-1.5">
                <ListTree className="w-3.5 h-3.5" />
                <span>预置章节 ({customBook ? 0 : TOC_DATA.length})</span>
              </TabsTrigger>
              <TabsTrigger value="bookmarks" className="text-xs font-serif gap-1.5">
                <Bookmark className="w-3.5 h-3.5 text-amber-500 fill-current" />
                <span>我的书签 ({currentBookBookmarks.length})</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 面板 1：预设章节列表 */}
          <TabsContent value="chapters" className="flex-1 m-0 focus-visible:outline-none overflow-hidden">
            <ScrollArea className="h-[calc(100vh-175px)] p-3">
              {customBook ? (
                <div className="p-8 text-center text-xs text-muted-foreground font-serif space-y-3">
                  <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                  <p className="font-medium text-foreground">本地导入纯文本文档未包含结构化预设章节</p>
                  <p className="text-[11px] leading-relaxed">
                    您可以在正文中鼠标悬停任意段落，点击 🔖 图标为关键节点创建<strong>自定义书签</strong>，并在右侧选项卡中构建专属动态目录！
                  </p>
                </div>
              ) : (
                <div className="space-y-1 pr-2">
                  {TOC_DATA.map((item, index) => {
                    const targetPage = Math.floor(item.startIndex / pageSize);
                    const isCurrentChapter = currentChapterTitle === item.title;

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelectChapter(item)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center justify-between group ${
                          isCurrentChapter
                            ? "bg-accent text-accent-foreground font-medium shadow-xs border border-primary/20"
                            : "hover:bg-muted/70 text-foreground/90"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <span className="text-[11px] font-mono text-muted-foreground/70 shrink-0 w-5 text-right">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="font-serif truncate text-[13.5px]">
                            {item.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] font-mono text-muted-foreground/80 bg-background/60 px-1.5 py-0.5 rounded border border-border/40">
                            P.{targetPage + 1}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* 面板 2：自定义书签与动态目录列表 */}
          <TabsContent value="bookmarks" className="flex-1 m-0 focus-visible:outline-none overflow-hidden">
            <ScrollArea className="h-[calc(100vh-175px)] p-3">
              {currentBookBookmarks.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground font-serif space-y-3">
                  <Bookmark className="w-8 h-8 text-amber-500/40 mx-auto" />
                  <p className="font-medium text-foreground">当前书籍尚未添加任何书签</p>
                  <p className="text-[11px] leading-relaxed">
                    在阅读任意段落时，将鼠标悬停在段落上，点击右侧的 <strong>🔖 书签</strong> 按钮即可将该处收录为目录节点，并支持随时重命名！
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pr-2">
                  {currentBookBookmarks.map((b) => {
                    const targetPage = Math.floor(b.paragraphIndex / pageSize) + 1;
                    const isEditing = editingId === b.id;

                    return (
                      <div
                        key={b.id}
                        onClick={() => handleSelectBookmark(b)}
                        className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer group ${
                          isEditing
                            ? "border-primary/60 bg-muted/40 shadow-xs"
                            : "border-border/60 bg-card/60 hover:bg-accent/60 hover:border-primary/40 hover:shadow-2xs"
                        }`}
                      >
                        {isEditing ? (
                          // 编辑重命名模式
                          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveEdit(b.id, e);
                                  if (e.key === "Escape") handleCancelEdit(e);
                                }}
                                className="h-7 text-xs font-serif bg-background"
                                placeholder="输入书签或目录标题..."
                                autoFocus
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-primary hover:bg-primary/10 shrink-0"
                                onClick={(e) => handleSaveEdit(b.id, e)}
                                title="保存名称"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:bg-muted shrink-0"
                                onClick={(e) => handleCancelEdit(e)}
                                title="取消"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono block">
                              按 Enter 保存，按 Esc 取消
                            </span>
                          </div>
                        ) : (
                          // 常规展示模式
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Bookmark className="w-3.5 h-3.5 text-amber-500 fill-current shrink-0" />
                                <span className="font-serif font-semibold text-xs sm:text-sm text-foreground truncate">
                                  {b.customTitle}
                                </span>
                              </div>

                              {/* 操作按钮区 */}
                              <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
                                <span className="text-[10px] font-mono text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded border border-border/40">
                                  P.{targetPage} · #{b.paragraphIndex + 1}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground rounded"
                                  onClick={(e) => handleStartEdit(b, e)}
                                  title="重命名此书签/目录节点"
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
                                  onClick={(e) => handleDeleteBookmark(b.id, e)}
                                  title="删除书签"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>

                            {/* 原文摘录预览 */}
                            {b.snippet && (
                              <p className="text-[11px] font-serif italic text-muted-foreground/80 line-clamp-2 leading-relaxed pl-5">
                                “{b.snippet}”
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
