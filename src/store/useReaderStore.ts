import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ALL_PARAGRAPHS, TOC_DATA } from "@/src/data/bookData";

// 生词条目接口
export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  phonetic?: string;
  context: string;
  addedAt: string;
  root?: string;
  affixes?: string;
  note?: string;
  reviewLevel?: number; // 艾宾浩斯复习阶段（默认 0）
  nextReviewTime?: number; // 下次复习时间戳（毫秒，默认 Date.now()）
  paragraphIndex?: number; // 关联的原文段落全局索引（支持溯源回原文）
}

// 读书笔记条目接口
export interface NoteItem {
  id: string;
  paragraphIndex: number;
  page: number;
  context: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

// 自定义书签与动态目录条目接口
export interface BookmarkItem {
  id: string;
  bookId: string;
  paragraphIndex: number;
  customTitle: string;
  snippet: string;
  timestamp: number;
}

// 阅读器全局状态与操作接口
export interface ReaderState {
  // 分页状态
  currentPage: number;
  pageSize: number;
  totalPages: number;
  currentChapterTitle: string;

  // 生词本状态
  vocabularyList: VocabularyItem[];
  // 读书笔记状态
  notesList: NoteItem[];

  // 自定义书签与动态目录状态
  bookmarks: BookmarkItem[];

  // 自定义导入书籍状态
  customBook: string[] | null;
  customBookTitle: string | null;

  // 自动书签记忆（阅读进度持久化）：记录不同书籍的阅读进度
  readingProgress: Record<string, number>;
  setReadingProgress: (bookId: string, position: number) => void;

  // TTS 正在朗读的段落全局索引追踪
  activePlayingIndex: number | null;
  setActivePlayingIndex: (index: number | null) => void;

  // 主选项卡激活视图（"reader" | "flashcards" | "vocabulary" | "notes"）
  activeTab: string;
  setActiveTab: (tab: string) => void;

  // 分页动作
  setCurrentPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  goToParagraphIndex: (index: number) => void;
  goToChapter: (startIndex: number) => void;

  // 自定义书籍动作
  setCustomBook: (paragraphs: string[], title?: string) => void;
  clearCustomBook: () => void;

  // 书签动作
  addBookmark: (bookId: string, paragraphIndex: number, snippet: string) => void;
  removeBookmark: (id: string) => void;
  updateBookmarkTitle: (id: string, newTitle: string) => void;

  // 生词本动作
  addVocab: (item: Omit<VocabularyItem, "id" | "addedAt">) => void;
  removeVocab: (word: string) => void;
  clearAllVocab: () => void;
  processCardReview: (word: string, isRemembered: boolean) => void;

  // 笔记动作
  addNote: (item: Omit<NoteItem, "id" | "createdAt" | "updatedAt">) => void;
  removeNote: (id: string) => void;
  clearAllNotes: () => void;
}

// 生成书籍的唯一识别 Key（用于区分默认书籍与不同的本地导入 TXT 文本）
export function getBookIdentifier(customBook: string[] | null, customBookTitle: string | null): string {
  if (!customBook || customBook.length === 0) {
    return "default_little_history";
  }
  const cleanTitle = (customBookTitle || "custom_book").trim().replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, "_");
  // 提取首段前 20 字符作为特征指纹，避免同名不同文档混淆
  const snippet = customBook[0] ? customBook[0].slice(0, 20).replace(/\s+/g, "") : "";
  return `book_${cleanTitle}_${snippet}`;
}

// 辅助计算总页数
const calculateTotalPages = (totalParagraphs: number, size: number) => {
  return Math.ceil(totalParagraphs / size) || 1;
};

// 辅助根据页码获取所在章节
const getChapterTitleByPage = (page: number, size: number): string => {
  const currentParaIndex = page * size;
  for (let i = TOC_DATA.length - 1; i >= 0; i--) {
    if (currentParaIndex >= TOC_DATA[i].startIndex) {
      return TOC_DATA[i].title;
    }
  }
  return TOC_DATA[0]?.title ?? "开始阅读";
};

const DEFAULT_PAGE_SIZE = 15;
const INITIAL_TOTAL_PAGES = calculateTotalPages(ALL_PARAGRAPHS.length, DEFAULT_PAGE_SIZE);

// 初始默认生词列表演示数据（若 localStorage 为空时自动注入）
const INITIAL_VOCABULARY: VocabularyItem[] = [
  {
    id: "vocab-1",
    word: "civilized",
    translation: "adj. 文明的，有教养的",
    context: "This is a book which teaches what it is to be civilized by its very tone, which is one of gentleness, curiosity and erudition.",
    addedAt: "2026-10-03 10:30",
    root: "civil (公民的)",
    affixes: "-ize (动词后缀) + -ed (形容词后缀)",
    note: "使脱离野蛮状态，具有文化与教养",
    reviewLevel: 0,
    nextReviewTime: 0,
    paragraphIndex: 0,
  },
  {
    id: "vocab-2",
    word: "curiosity",
    translation: "n. 好奇心，求知欲",
    context: "This is a book which teaches what it is to be civilized by its very tone, which is one of gentleness, curiosity and erudition.",
    addedAt: "2026-10-03 11:15",
    root: "cura (关照，注意)",
    affixes: "-ious (形容词后缀) + -ity (名词后缀)",
    note: "对新鲜事物的关切与求知渴望",
    reviewLevel: 0,
    nextReviewTime: 0,
    paragraphIndex: 0,
  },
  {
    id: "vocab-3",
    word: "erudition",
    translation: "n. 博学，深厚的学识",
    context: "This is a book which teaches what it is to be civilized by its very tone, which is one of gentleness, curiosity and erudition.",
    addedAt: "2026-10-03 11:40",
    root: "rudis (粗糙，蒙昧)",
    affixes: "e- (向外，脱离) + -ition (名词后缀)",
    note: "摆脱粗野无知，学识渊博",
    reviewLevel: 0,
    nextReviewTime: 0,
    paragraphIndex: 0,
  },
  {
    id: "vocab-4",
    word: "inventors",
    translation: "n. 发明家，创造者",
    context: "So, just once in a while, when we are talking, or eating some bread, using tools or warming ourselves by the fire, we should remember those early people with gratitude, for they were the greatest inventors of all time.",
    addedAt: "2026-10-03 14:20",
    root: "vent (来，到达)",
    affixes: "in- (进入) + -or (人) + -s (复数)",
    note: "探索未知并开创新事物的人",
    reviewLevel: 0,
    nextReviewTime: 0,
    paragraphIndex: 472,
  },
];

// 初始默认笔记列表演示数据
const INITIAL_NOTES: NoteItem[] = [
  {
    id: "note-1",
    paragraphIndex: 168,
    page: 12,
    context: "Have you ever tried standing between two mirrors? You should. You will see a great long line of shiny mirrors, each one smaller than the one before, stretching away into the distance...",
    note: "作者用两面相对的镜子形成的无限镜像长廊，巧妙地把时间向过去无限延伸的哲学概念形象化了，令人惊叹的通俗启发！",
    createdAt: "2026-10-03 15:20:00",
    updatedAt: "2026-10-03 15:20:00",
  },
  {
    id: "note-2",
    paragraphIndex: 178,
    page: 13,
    context: "Stone tools must have been invented by someone too. The earliest ones were probably just sticks and stones...",
    note: "工具的诞生标志着文明的破晓，石器并非仅仅是生存器具，更是人类思维具象化的开端。",
    createdAt: "2026-10-03 16:05:00",
    updatedAt: "2026-10-03 16:05:00",
  },
];

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      currentPage: 0,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: INITIAL_TOTAL_PAGES,
      currentChapterTitle: getChapterTitleByPage(0, DEFAULT_PAGE_SIZE),

      vocabularyList: INITIAL_VOCABULARY,
      notesList: INITIAL_NOTES,

      // 自定义导入书籍初始状态
      customBook: null,
      customBookTitle: null,

      // 自定义书签与动态目录
      bookmarks: [],

      // 自动书签记忆（阅读进度字典：bookId -> position）
      readingProgress: {},

      // 保存阅读进度
      setReadingProgress: (bookId: string, position: number) => {
        set((state) => ({
          readingProgress: {
            ...state.readingProgress,
            [bookId]: position,
          },
        }));
      },

      // TTS 正在朗读的段落全局索引追踪
      activePlayingIndex: null,
      setActivePlayingIndex: (index: number | null) => {
        set({ activePlayingIndex: index });
      },

      // 主选项卡激活视图
      activeTab: "reader",
      setActiveTab: (tab: string) => {
        set({ activeTab: tab });
      },

      // 添加自定义书签
      addBookmark: (bookId: string, paragraphIndex: number, snippet: string) => {
        const { bookmarks } = get();
        const existing = bookmarks.find(
          (b) => b.bookId === bookId && b.paragraphIndex === paragraphIndex
        );
        if (existing) return;

        const cleanSnippet = snippet.trim().replace(/\s+/g, " ");
        const defaultTitle = cleanSnippet.length > 20
          ? cleanSnippet.slice(0, 20) + "..."
          : cleanSnippet || `段落 #${paragraphIndex + 1}`;

        const newBookmark: BookmarkItem = {
          id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          bookId,
          paragraphIndex,
          customTitle: defaultTitle,
          snippet: cleanSnippet.slice(0, 100),
          timestamp: Date.now(),
        };

        set({ bookmarks: [...bookmarks, newBookmark] });
      },

      // 移除书签
      removeBookmark: (id: string) => {
        const { bookmarks } = get();
        set({ bookmarks: bookmarks.filter((b) => b.id !== id) });
      },

      // 重命名书签/目录名称
      updateBookmarkTitle: (id: string, newTitle: string) => {
        const { bookmarks } = get();
        const cleanTitle = newTitle.trim();
        if (!cleanTitle) return;

        set({
          bookmarks: bookmarks.map((b) =>
            b.id === id ? { ...b, customTitle: cleanTitle } : b
          ),
        });
      },

      setCurrentPage: (page: number) => {
        const { totalPages, pageSize, customBook, customBookTitle } = get();
        const targetPage = Math.max(0, Math.min(page, totalPages - 1));
        const chapterTitle = customBook
          ? `《${customBookTitle || "自定义导入文本"}》· 第 ${targetPage + 1} 页`
          : getChapterTitleByPage(targetPage, pageSize);

        set({
          currentPage: targetPage,
          currentChapterTitle: chapterTitle,
        });
      },

      nextPage: () => {
        const { currentPage, totalPages, setCurrentPage } = get();
        if (currentPage < totalPages - 1) {
          setCurrentPage(currentPage + 1);
        }
      },

      prevPage: () => {
        const { currentPage, setCurrentPage } = get();
        if (currentPage > 0) {
          setCurrentPage(currentPage - 1);
        }
      },

      firstPage: () => {
        get().setCurrentPage(0);
      },

      lastPage: () => {
        const { totalPages, setCurrentPage } = get();
        setCurrentPage(totalPages - 1);
      },

      goToParagraphIndex: (index: number) => {
        const { pageSize, setCurrentPage } = get();
        const targetPage = Math.floor(index / pageSize);
        setCurrentPage(targetPage);
      },

      goToChapter: (startIndex: number) => {
        const { pageSize, setCurrentPage } = get();
        const targetPage = Math.floor(startIndex / pageSize);
        setCurrentPage(targetPage);
      },

      // 设置自定义导入书籍
      setCustomBook: (paragraphs: string[], title?: string) => {
        const { pageSize } = get();
        const total = calculateTotalPages(paragraphs.length, pageSize);
        const bookName = title || "本地导入文本";
        set({
          customBook: paragraphs,
          customBookTitle: bookName,
          currentPage: 0,
          totalPages: total,
          currentChapterTitle: `《${bookName}》· 第 1 页`,
        });
      },

      // 清除自定义书籍，恢复默认书籍
      clearCustomBook: () => {
        const { pageSize } = get();
        const total = calculateTotalPages(ALL_PARAGRAPHS.length, pageSize);
        set({
          customBook: null,
          customBookTitle: null,
          currentPage: 0,
          totalPages: total,
          currentChapterTitle: getChapterTitleByPage(0, pageSize),
        });
      },

      // 添加生词到生词本（防重复添加）
      addVocab: (item) => {
        const { vocabularyList } = get();
        const cleanWord = item.word.trim();
        const lowerWord = cleanWord.toLowerCase();

        // 避免同名单词重复收录
        const exists = vocabularyList.some(
          (v) => v.word.toLowerCase() === lowerWord
        );
        if (exists) return;

        const newVocab: VocabularyItem = {
          ...item,
          id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          addedAt: new Date().toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
          reviewLevel: item.reviewLevel ?? 0,
          nextReviewTime: item.nextReviewTime ?? Date.now(),
        };

        set({ vocabularyList: [newVocab, ...vocabularyList] });
      },

      // 从生词本移除指定单词
      removeVocab: (word: string) => {
        const { vocabularyList } = get();
        const lower = word.toLowerCase();
        set({
          vocabularyList: vocabularyList.filter(
            (v) => v.word.toLowerCase() !== lower && v.id !== word
          ),
        });
      },

      // 一键清空所有生词
      clearAllVocab: () => {
        set({ vocabularyList: [] });
      },

      // 艾宾浩斯记忆闪卡间隔重复算法
      processCardReview: (word: string, isRemembered: boolean) => {
        const { vocabularyList } = get();
        const intervals = [1, 2, 4, 7, 15, 30]; // 艾宾浩斯复习间隔天数
        const lower = word.toLowerCase();

        const updatedList = vocabularyList.map((item) => {
          if (item.word.toLowerCase() !== lower && item.id !== word) {
            return item;
          }

          if (isRemembered) {
            const currentLevel = item.reviewLevel ?? 0;
            const newLevel = Math.min(currentLevel + 1, intervals.length);
            const days = intervals[Math.max(0, newLevel - 1)];
            const nextTime = Date.now() + days * 86400000;
            return {
              ...item,
              reviewLevel: newLevel,
              nextReviewTime: nextTime,
            };
          } else {
            return {
              ...item,
              reviewLevel: 0,
              nextReviewTime: Date.now(),
            };
          }
        });

        set({ vocabularyList: updatedList });
      },

      // 添加读书笔记
      addNote: (item) => {
        const { notesList } = get();
        const now = new Date().toLocaleString("zh-CN");
        const newNote: NoteItem = {
          ...item,
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: now,
          updatedAt: now,
        };

        set({ notesList: [newNote, ...notesList] });
      },

      // 删除读书笔记
      removeNote: (id: string) => {
        const { notesList } = get();
        set({ notesList: notesList.filter((n) => n.id !== id) });
      },

      // 一键清空所有读书笔记
      clearAllNotes: () => {
        set({ notesList: [] });
      },
    }),
    {
      name: "reader_storage_v1", // localStorage 键名
      partialize: (state) => ({
        currentPage: state.currentPage,
        pageSize: state.pageSize,
        vocabularyList: state.vocabularyList,
        notesList: state.notesList,
        readingProgress: state.readingProgress,
        bookmarks: state.bookmarks,
      }),
    }
  )
);
