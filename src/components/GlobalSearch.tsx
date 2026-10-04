"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ALL_PARAGRAPHS } from "@/src/data/bookData";
import { useReaderStore } from "@/src/store/useReaderStore";
import { Search, X, ChevronRight, Hash, BookOpen } from "lucide-react";
import { toast } from "sonner";

interface SearchResultItem {
  index: number;
  text: string;
  page: number;
}

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { pageSize, goToParagraphIndex, customBook } = useReaderStore();

  const activeParagraphs = customBook || ALL_PARAGRAPHS;

  // 实时搜索计算（限制前 60 条匹配，保障 UI 秒级响应）
  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];

    const matched: SearchResultItem[] = [];
    for (let i = 0; i < activeParagraphs.length; i++) {
      const para = activeParagraphs[i];
      if (para.toLowerCase().includes(q)) {
        matched.push({
          index: i,
          text: para,
          page: Math.floor(i / pageSize) + 1,
        });
        if (matched.length >= 60) break;
      }
    }
    return matched;
  }, [query, pageSize, activeParagraphs]);

  // 点击搜索结果跳转
  const handleSelect = (item: SearchResultItem) => {
    goToParagraphIndex(item.index);
    setOpen(false);
    toast.success(`已跳转至第 ${item.page} 页 · 段落 #${item.index + 1}`);
  };

  // 高亮关键词文本
  const renderHighlightedSnippet = (text: string, q: string) => {
    const lower = text.toLowerCase();
    const queryLower = q.toLowerCase();
    const matchIdx = lower.indexOf(queryLower);

    if (matchIdx === -1) {
      return text.slice(0, 100) + "...";
    }

    // 截取匹配点前后 35 个字符
    const start = Math.max(0, matchIdx - 35);
    const end = Math.min(text.length, matchIdx + q.length + 55);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < text.length ? "..." : "";

    const before = text.slice(start, matchIdx);
    const matchStr = text.slice(matchIdx, matchIdx + q.length);
    const after = text.slice(matchIdx + q.length, end);

    return (
      <span className="text-xs font-serif leading-relaxed text-foreground/80">
        {prefix}
        {before}
        <mark className="bg-primary/25 text-primary font-semibold rounded-xs px-0.5">
          {matchStr}
        </mark>
        {after}
        {suffix}
      </span>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-border bg-card/80 text-muted-foreground hover:text-foreground font-serif text-xs h-8"
        >
          <Search className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">全书搜索...</span>
          <span className="sm:hidden">搜索</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[340px] sm:w-[460px] p-0 bg-popover text-popover-foreground border-border shadow-lg rounded-xl z-50 overflow-hidden"
      >
        {/* 搜索输入栏 */}
        <div className="p-3 border-b border-border/60 flex items-center gap-2 bg-background/50">
          <Search className="w-4 h-4 text-primary shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入关键词搜索全书 2321 个段落（如 history, Rome）..."
            className="border-0 bg-transparent h-8 shadow-none focus-visible:ring-0 text-sm font-serif"
            autoFocus
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setQuery("")}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* 结果展示与统计 */}
        <div className="py-1 px-3 bg-muted/20 border-b border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {query.trim().length < 2
              ? "请输入至少 2 个字符开始检索"
              : `找到 ${results.length}${results.length >= 60 ? "+" : ""} 处匹配段落`}
          </span>
          <span className="font-mono">全书 2321 段</span>
        </div>

        {/* 搜索结果滚动列表 */}
        <ScrollArea className="max-h-[360px]">
          {query.trim().length >= 2 && results.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground font-serif">
              未找到包含 “{query}” 的相关段落
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {results.map((item) => (
                <button
                  key={item.index}
                  onClick={() => handleSelect(item)}
                  className="w-full text-left p-2.5 rounded-lg transition-colors hover:bg-muted/70 flex flex-col gap-1.5 group border border-transparent hover:border-border/60"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] font-mono font-semibold text-primary flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      段落 #{item.index + 1}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded border border-border/40">
                      第 {item.page} 页
                    </span>
                  </div>
                  <div className="line-clamp-2">
                    {renderHighlightedSnippet(item.text, query.trim())}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
