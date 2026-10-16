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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookImporter } from "@/src/components/BookImporter";
import {
  useReaderStore,
  BookItem,
  DEFAULT_BOOK_ID,
  normalizeReadingProgress,
} from "@/src/store/useReaderStore";
import {
  Library,
  BookOpen,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface BookshelfPanelProps {
  className?: string;
}

export function BookshelfPanel({ className = "" }: BookshelfPanelProps) {
  const [open, setOpen] = React.useState(false);
  const {
    bookshelf,
    currentBookId,
    readingProgress,
    pageSize,
    switchBook,
    removeBookFromShelf,
  } = useReaderStore();

  // 书架列表数组（优先显示当前正在阅读的书籍，其余按添加时间倒序排列）
  const booksList = React.useMemo(() => {
    const list = Object.values(bookshelf || {});
    return list.sort((a, b) => {
      // 当前阅读书籍优先置顶
      if (a.id === currentBookId) return -1;
      if (b.id === currentBookId) return 1;
      return (b.addTime || 0) - (a.addTime || 0);
    });
  }, [bookshelf, currentBookId]);

  // 切换阅读书籍
  const handleSwitchBook = (book: BookItem) => {
    if (book.id === currentBookId) {
      setOpen(false);
      return;
    }
    switchBook(book.id);
    setOpen(false);
    toast.success(`已切换至《${book.title}》`, {
      description: `共 ${book.paragraphs.length} 段落，已恢复您的历史阅读进度。`,
    });
  };

  // 删除单本书籍
  const handleDeleteBook = (book: BookItem, e: React.MouseEvent) => {
    e.stopPropagation();

    // 当书架仅剩一本书时，提示保护
    if (booksList.length <= 1) {
      toast.warning("书架中至少需要保留一本藏书，暂不可移除");
      return;
    }

    const confirmed = window.confirm(`确定要从书架删除《${book.title}》吗？`);
    if (confirmed) {
      removeBookFromShelf(book.id);
      toast.info(`已从书架移除《${book.title}》`);
    }
  };

  // 格式化时间戳
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return "未知时间";
    const date = new Date(timestamp);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${d} ${hh}:${mm}`;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 font-serif text-xs border-border bg-card/80 hover:bg-accent hover:text-accent-foreground shadow-xs ${className}`}
          title="打开私人书架管理平行书籍"
        >
          <Library className="w-3.5 h-3.5 text-primary" />
          <span>📚 私人书架 ({booksList.length})</span>
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-popover text-popover-foreground border-border p-0 flex flex-col overflow-hidden"
      >
        {/* 顶部标题栏 */}
        <SheetHeader className="p-4 sm:p-5 border-b border-border/60 text-left bg-background/50 shrink-0">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Library className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <SheetTitle className="font-serif text-lg tracking-wide truncate">
                  我的私人书架
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground font-serif truncate">
                  IndexedDB 异步极速存储 · 多本图书平行阅读
                </SheetDescription>
              </div>
            </div>

            {/* 顶栏快速导入按钮 */}
            <div className="shrink-0">
              <BookImporter size="sm">
                <span>导入新书</span>
              </BookImporter>
            </div>
          </div>
        </SheetHeader>

        {/* 藏书统计条 */}
        <div className="px-4 sm:px-5 py-2.5 bg-muted/40 border-b border-border/40 flex items-center justify-between text-xs text-muted-foreground font-serif shrink-0">
          <span>共收录 {booksList.length} 本藏书</span>
          <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
            <Sparkles className="w-3 h-3" />
            存储引擎：IndexedDB (无容量上限)
          </span>
        </div>

        {/* 书架列表原生平滑滚轮区域：彻底避免 Radix display:table 导致的横向溢出截断 */}
        <div className="flex-1 w-full p-4 sm:p-6 overflow-y-auto overflow-x-hidden space-y-3.5 box-border">
          {booksList.map((book) => {
            const isCurrent = book.id === currentBookId;
            const isDefault = book.id === DEFAULT_BOOK_ID;
            const progressEntry = normalizeReadingProgress(readingProgress[book.id]);
            const savedPosition = progressEntry.position;
            const totalParas = book.paragraphs?.length || 0;

            // 计算整数百分比：若无进度则默认为 0%
            const percent =
              typeof savedPosition === "number" && totalParas > 0
                ? Math.min(
                    100,
                    Math.max(0, Math.round((savedPosition / totalParas) * 100))
                  )
                : 0;

            const savedPage = Math.floor((savedPosition || 0) / (pageSize || 15)) + 1;
            const totalPages = Math.ceil(totalParas / (pageSize || 15)) || 1;

            return (
              <div
                key={book.id}
                onClick={() => handleSwitchBook(book)}
                className={`relative w-full p-4 rounded-xl border transition-all box-border overflow-hidden cursor-pointer ${
                  isCurrent
                    ? "border-amber-500/80 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs"
                    : "border-border/70 bg-card hover:bg-muted/30 hover:border-border"
                }`}
              >
                {/* 右上角绝对定位删除按钮：永远可见，绝不受文本与排版挤压 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (booksList.length <= 1) {
                      toast.warning("书架中至少需要保留一本藏书，不可移除");
                      return;
                    }
                    if (window.confirm(`确定要从书架移除《${book.title}》吗？`)) {
                      removeBookFromShelf(book.id);
                      toast.info(`已从书架移除《${book.title}》`);
                    }
                  }}
                  className="absolute top-3 right-3 p-1.5 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors z-10 cursor-pointer text-sm leading-none"
                  title="删除此书"
                >
                  🗑️
                </button>

                {/* 书名与徽章区域（设置 pr-8 预留出右上角删除按钮位置，truncate 防止超长撑爆） */}
                <div className="flex items-center gap-2 pr-8 mb-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center shrink-0 text-sm">
                    {isDefault ? "🏛️" : "📖"}
                  </div>
                  <h4
                    className="font-semibold text-sm truncate text-foreground flex-1 min-w-0"
                    title={book.title}
                  >
                    {book.title}
                  </h4>
                  {isCurrent && (
                    <Badge
                      variant="default"
                      className="text-[10px] px-1.5 py-0 bg-amber-500 hover:bg-amber-600 text-white shrink-0 font-normal shadow-2xs"
                    >
                      📖 阅读中
                    </Badge>
                  )}
                  {isDefault && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 shrink-0 font-normal"
                    >
                      系统典藏
                    </Badge>
                  )}
                </div>

                {/* 元数据：段落统计与当前页码 */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-mono mb-2 w-full">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {totalParas} 段落
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    第 {savedPage} / {totalPages} 页
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
                    <Clock className="w-3 h-3" />
                    {formatTime(book.addTime)}
                  </span>
                </div>

                {/* 进度与元信息区：w-full，进度百分比紧跟在进度条旁边，严禁超出边界 */}
                <div className="w-full space-y-1 pt-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                    <span>阅读进度</span>
                    <span className="font-medium text-foreground">
                      已读 {percent}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 dark:bg-amber-500 transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
