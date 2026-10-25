"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { VirtualPager } from "@/src/components/VirtualPager";
import { FlashcardsView } from "@/src/components/FlashcardsView";
import { VocabularyView } from "@/src/components/VocabularyView";
import { NotesView } from "@/src/components/NotesView";
import { WordGameView } from "@/src/components/WordGameView";
import { BookImporter } from "@/src/components/BookImporter";
import { BookshelfPanel } from "@/src/components/BookshelfPanel";
import { SyncEmailModal } from "@/src/components/SyncEmailModal";
import { OfflinePreloadButton } from "@/src/components/OfflinePreloadButton";
import { Badge } from "@/components/ui/badge";
import {
  useReaderStore,
  DEFAULT_BOOK_ID,
  INITIAL_BOOKSHELF,
} from "@/src/store/useReaderStore";
import { ALL_PARAGRAPHS, TOC_DATA } from "@/src/data/bookData";
import { supabase } from "@/src/lib/supabaseClient";
import { Sun, Moon } from "lucide-react";
import { toast } from "sonner";

export default function Home() {
  // 暗黑/羊皮纸浅色模式切换状态
  const [isDark, setIsDark] = React.useState(false);
  const { bookshelf, currentBookId, activeTab, setActiveTab } = useReaderStore();

  // 当前激活的书籍实体
  const currentBook =
    bookshelf[currentBookId] ||
    bookshelf[DEFAULT_BOOK_ID] ||
    INITIAL_BOOKSHELF[DEFAULT_BOOK_ID];
  const isDefaultBook = currentBookId === DEFAULT_BOOK_ID;

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

  // Supabase 保活心跳与启动时静默同步机制
  React.useEffect(() => {
    // 1. 保活心跳机制：向 reading_progress 发起一次极轻量读取，激活免费项目防止7天休眠
    (async () => {
      try {
        const { error } = await supabase.from("reading_progress").select("id").limit(1);
        if (!error) {
          console.log("[Supabase Keep-Alive] 心跳唤醒成功，服务活跃中");
        }
      } catch (err) {
        console.warn("[Supabase Keep-Alive] 心跳检测网络波动:", err);
      }
    })();

    // 2. 若用户已绑定邮箱，启动时静默同步云端书架、全量补推存量书籍、同步读书笔记、生词本并按时间戳仲裁阅读进度
    const state = useReaderStore.getState();
    if (state.userEmail && state.userEmail.trim()) {
      Promise.allSettled([
        state.syncBooksWithCloud(),
        state.syncNotesWithCloud(),
        state.syncVocabularyWithCloud(),
        state.pullReadingProgressFromCloud(state.currentBookId, true),
      ]).then((results) => {
        results.forEach((r, idx) => {
          if (r.status === "rejected") {
            console.warn(`[Supabase] 启动静默同步项 [${idx}] 异常:`, r.reason);
          }
        });
      });
    }
  }, []);

  // 离线状态感知监听
  const [isOffline, setIsOffline] = React.useState(false);
  React.useEffect(() => {
    setIsOffline(typeof navigator !== "undefined" && !navigator.onLine);
    const handleOnline = () => {
      setIsOffline(false);
      toast.success("🌐 网络已重新连接，在线云服务已恢复");
    };
    const handleOffline = () => {
      setIsOffline(true);
      toast.info("✈️ 已进入飞行离线模式，已为您激活离线兜底引擎");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col transition-colors duration-300">
      {/* 顶部极简书卷头部 */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl select-none shrink-0">📖</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-serif font-bold text-base sm:text-lg leading-tight tracking-wide text-foreground truncate">
                  {currentBook.title}
                </h1>
                {isOffline && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300 gap-1 text-[11px] font-sans px-2 py-0.5 shrink-0 animate-pulse"
                  >
                    ✈️ 离线模式
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-serif italic truncate">
                {isDefaultBook
                  ? "E. H. Gombrich · 极简羊皮纸沉浸阅读器"
                  : `私人书架平行藏书 · 共 ${currentBook.paragraphs.length} 个段落`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* ✈️ 候机室神器：离线预载译文 */}
            <OfflinePreloadButton variant="outline" size="sm" className="hidden sm:inline-flex" />

            {/* ☁️ Supabase 跨端同步 */}
            <SyncEmailModal />

            {/* 📚 私人书架抽屉入口 */}
            <BookshelfPanel />

            {/* 📁 本地 TXT 快速导入 */}
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
        {/* 顶级 Tabs 五大核心面板（全局受控，支持闪卡、笔记、单词闯关一键溯源切换） */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
          <TabsList className="grid w-full grid-cols-5 gap-1 bg-muted/60 p-1 sm:p-1.5 rounded-xl border border-border">
            <TabsTrigger
              value="reader"
              className="text-xs sm:text-sm font-medium py-2 sm:py-2.5 px-1 sm:px-2.5 truncate data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <span className="hidden sm:inline">📖 </span>沉浸阅读
            </TabsTrigger>
            <TabsTrigger
              value="flashcards"
              className="text-xs sm:text-sm font-medium py-2 sm:py-2.5 px-1 sm:px-2.5 truncate data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <span className="hidden sm:inline">🎴 </span>3D 闪卡
            </TabsTrigger>
            <TabsTrigger
              value="vocabulary"
              className="text-xs sm:text-sm font-medium py-2 sm:py-2.5 px-1 sm:px-2.5 truncate data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <span className="hidden sm:inline">📓 </span>生词本
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="text-xs sm:text-sm font-medium py-2 sm:py-2.5 px-1 sm:px-2.5 truncate data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <span className="hidden sm:inline">📒 </span>我的笔记
            </TabsTrigger>
            <TabsTrigger
              value="wordgame"
              className="text-xs sm:text-sm font-medium py-2 sm:py-2.5 px-1 sm:px-2.5 truncate data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <span className="text-amber-500 font-bold">⚡ </span>单词闯关
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

          {/* 面板 5：单词闯关 (WordGameView 闪电配对与听音选义双模式) */}
          <TabsContent value="wordgame" className="focus-visible:outline-none">
            <WordGameView />
          </TabsContent>
        </Tabs>
      </main>

      {/* 底部版权与状态栏 */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground font-serif">
        {isDefaultBook
          ? `A Little History of the World · 共 ${ALL_PARAGRAPHS.length} 段落 · ${TOC_DATA.length} 章节`
          : `《${currentBook.title}》· 共 ${currentBook.paragraphs.length} 段落 · 私人书架平行阅读模式`}
      </footer>
    </div>
  );
}
