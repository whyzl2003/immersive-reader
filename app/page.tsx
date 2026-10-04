"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { VirtualPager } from "@/src/components/VirtualPager";
import { FlashcardsView } from "@/src/components/FlashcardsView";
import { VocabularyView } from "@/src/components/VocabularyView";
import { NotesView } from "@/src/components/NotesView";
import { BookImporter } from "@/src/components/BookImporter";
import { useReaderStore } from "@/src/store/useReaderStore";
import { BOOK_TITLE, ALL_PARAGRAPHS, TOC_DATA } from "@/src/data/bookData";
import { Sun, Moon, Bell } from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  // 暗黑/羊皮纸浅色模式切换状态
  const [isDark, setIsDark] = React.useState(false);
  const { customBook, customBookTitle, activeTab, setActiveTab } = useReaderStore();

  // 切换主题模式
  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col transition-colors duration-300">
      {/* 顶部极简书卷头部 */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl select-none shrink-0">📖</span>
            <div className="min-w-0">
              <h1 className="font-serif font-bold text-base sm:text-lg leading-tight tracking-wide text-foreground truncate">
                {customBook ? (customBookTitle || "本地导入文本") : BOOK_TITLE}
              </h1>
              <p className="text-xs text-muted-foreground font-serif italic truncate">
                {customBook
                  ? `本地 TXT 导入 · 共 ${customBook.length} 段落`
                  : "E. H. Gombrich · 极简羊皮纸沉浸阅读器"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 📁 本地 TXT 导入与恢复默认书籍组件 */}
            <BookImporter />

            {/* 切换羊皮纸浅色/深色阅读模式 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={isDark ? "切换为羊皮纸浅色" : "切换为深夜暗石墨深色"}
              className="text-foreground/80 hover:text-foreground h-8 w-8"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* 主体容器：严格限制最大宽度 max-w-4xl，并居中排版 */}
      <main className="max-w-4xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        {/* 顶级 Tabs 四大核心面板（全局受控，支持闪卡、笔记一键溯源切换） */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-muted/60 p-1.5 rounded-xl border border-border">
            <TabsTrigger
              value="reader"
              className="text-sm font-medium py-2.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              📖 沉浸阅读
            </TabsTrigger>
            <TabsTrigger
              value="flashcards"
              className="text-sm font-medium py-2.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              🎴 3D 记忆闪卡
            </TabsTrigger>
            <TabsTrigger
              value="vocabulary"
              className="text-sm font-medium py-2.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              📓 我的生词本
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="text-sm font-medium py-2.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              📒 我的笔记
            </TabsTrigger>
          </TabsList>

          {/* 面板 1：沉浸阅读 (VirtualPager 虚拟分页与目录导航) */}
          <TabsContent value="reader" className="space-y-4 focus-visible:outline-none">
            <VirtualPager />
          </TabsContent>

          {/* 面板 2：3D 记忆闪卡 (FlashcardsView 纯 CSS 3D 翻转卡片流) */}
          <TabsContent value="flashcards" className="focus-visible:outline-none">
            <FlashcardsView />
          </TabsContent>

          {/* 面板 3：我的生词本 (VocabularyView 词源与生词清单导出) */}
          <TabsContent value="vocabulary" className="focus-visible:outline-none">
            <VocabularyView />
          </TabsContent>

          {/* 面板 4：我的笔记 (NotesView 随笔卡片与 Markdown 导出) */}
          <TabsContent value="notes" className="focus-visible:outline-none">
            <NotesView />
          </TabsContent>
        </Tabs>
      </main>

      {/* 底部版权与状态栏 */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground font-serif">
        {customBook
          ? `《${customBookTitle || "本地导入文本"}》· 共 ${customBook.length} 段落 · 通用阅读模式`
          : `A Little History of the World · 共 ${ALL_PARAGRAPHS.length} 段落 · ${TOC_DATA.length} 章节`}
      </footer>
    </div>
  );
}
