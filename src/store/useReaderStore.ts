import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
import { ALL_PARAGRAPHS, TOC_DATA, TocItem } from "@/src/data/bookData";
import { supabase } from "@/src/lib/supabaseClient";
import { toast } from "sonner";

// 阅读进度云端同步防抖计时器（防高频并发请求）
let progressDebounceTimer: NodeJS.Timeout | null = null;

// 自定义 IndexedDB 异步持久化存储引擎（彻底打破 localStorage 5MB 限制）
const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    try {
      const value = await get(name);
      return value ?? null;
    } catch (err) {
      console.warn("[IndexedDB] 读取存储失败:", err);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window === "undefined") return;
    try {
      await set(name, value);
    } catch (err) {
      console.error("[IndexedDB] 写入存储失败:", err);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof window === "undefined") return;
    try {
      await del(name);
    } catch (err) {
      console.error("[IndexedDB] 删除存储失败:", err);
    }
  },
};

// 书籍实体接口（多本书籍私人书架）
export interface BookItem {
  id: string;
  title: string;
  paragraphs: string[];
  addTime: number;
  fileType?: string; // 'txt' | 'epub' 等文件类型
  synced?: boolean; // 标记是否已上传至云端
  toc?: TocItem[]; // 结构化章节目录列表
}

// 默认预置书籍常量
export const DEFAULT_BOOK_ID = "default_little_history";
export const DEFAULT_BOOK_TITLE = "世界小史 (A Little History of the World)";

// 初始默认书架（包含预置典藏书籍《世界小史》）
export const INITIAL_BOOKSHELF: Record<string, BookItem> = {
  [DEFAULT_BOOK_ID]: {
    id: DEFAULT_BOOK_ID,
    title: DEFAULT_BOOK_TITLE,
    paragraphs: ALL_PARAGRAPHS,
    addTime: 1727712000000,
    fileType: "built-in",
    synced: true,
    toc: TOC_DATA,
  },
};

// 书籍阅读进度对象（支持时间戳仲裁 Last Write Wins）
export interface BookReadingProgress {
  position: number;
  updatedAt: number; // 毫秒时间戳 Date.now()
}

// 规范化进度对象，兼容历史 number 类型与缺失字段
export function normalizeReadingProgress(raw: any): BookReadingProgress {
  if (!raw) return { position: 0, updatedAt: 0 };
  if (typeof raw === "number") return { position: raw, updatedAt: 0 };
  return {
    position: typeof raw.position === "number" ? raw.position : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

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
  bookId?: string; // 所属书籍 ID（支持多书平行阅读与跨书精准溯源）
  bookTitle?: string; // 所属书籍名称（如 "超级时代" 或 "世界小史"）
  synced?: boolean; // 标记是否已被云端收录过（用于跨端删除剔除判定）
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
  bookId: string; // 所属书籍 ID（支持多书平行阅读与跨书精准溯源）
  bookTitle: string; // 所属书籍名称（如 "世界小史" 或 "A Little History of the World"）
  synced?: boolean; // 标记是否已同步至云端
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

  // 私人书架状态（平行多本书籍管理）
  bookshelf: Record<string, BookItem>;
  currentBookId: string;
  deletedBooksQueue: string[]; // 待同步至云端删除的书籍 ID 列表

  // 生词本状态
  vocabularyList: VocabularyItem[];
  deletedWordsQueue: string[]; // 待同步至云端删除的词列表（全小写）

  // 读书笔记状态
  notesList: NoteItem[];
  deletedNotesQueue: string[]; // 待同步至云端删除的笔记标识 (${bookId}:::${paragraphIndex})

  // 自定义书签与动态目录状态
  bookmarks: BookmarkItem[];

  // 自动书签记忆（阅读进度持久化）：记录不同书籍的阅读进度与最后更新时间戳
  readingProgress: Record<string, BookReadingProgress>;
  setReadingProgress: (bookId: string, position: number, customUpdatedAt?: number) => void;

  // 书籍段落持久化译文映射表：{ [bookId]: { [paragraphIndex]: "中文译文" } }
  paragraphTranslations: Record<string, Record<number, string>>;
  saveParagraphTranslation: (bookId: string, paragraphIndex: number, translation: string) => void;
  saveBatchParagraphTranslations: (bookId: string, translations: Record<number, string>) => void;

  // 离线高频词典缓存映射表：{ [word]: "中文释义" }
  offlineWordCache: Record<string, string>;
  saveOfflineWord: (word: string, translation: string) => void;
  saveBatchOfflineWords: (words: Record<string, string>) => void;

  // TTS 语速持久化状态（支持 0.7 慢速、0.85 舒缓、1.0 正常）
  ttsSpeed: number;
  setTtsSpeed: (speed: number) => void;

  // 单句译文持久化缓存：{ [sentenceKey]: "中文译文" }（存入 IndexedDB，支持离线查看已翻译单句）
  sentenceTranslations: Record<string, string>;
  saveSentenceTranslation: (sentenceKey: string, translation: string) => void;

  // TTS 正在朗读的段落全局索引追踪
  activePlayingIndex: number | null;
  setActivePlayingIndex: (index: number | null) => void;

  // 主选项卡激活视图（"reader" | "flashcards" | "vocabulary" | "notes"）
  activeTab: string;
  setActiveTab: (tab: string) => void;
  switchTab: (tab: string) => void;

  // 目标定位段落（用于目录或书签精准对齐滚动）
  targetParagraphIndex: number | null;
  setTargetParagraphIndex: (index: number | null) => void;

  // 分页动作
  setCurrentPage: (page: number, overrideTitle?: string) => void;
  nextPage: () => void;
  prevPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  goToParagraphIndex: (index: number) => void;
  goToChapter: (startIndex: number, title?: string) => void;

  // 私人书架动作
  importBookToShelf: (title: string, paragraphs: string[], fileType?: string, toc?: TocItem[]) => string;
  switchBook: (bookId: string) => void;
  removeBookFromShelf: (bookId: string) => void;
  getCurrentBook: () => BookItem;
  syncBooksWithCloud: () => Promise<{ addedCount: number; pushedCount: number; removedCount: number }>;

  // 向后兼容辅助方法
  customBook: string[] | null;
  customBookTitle: string | null;
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
  addNote: (item: Omit<NoteItem, "id" | "createdAt" | "updatedAt" | "bookId" | "bookTitle"> & { bookId?: string; bookTitle?: string }) => void;
  removeNote: (id: string) => void;
  clearAllNotes: () => void;

  // Supabase 云端双向同步状态与动作
  userEmail: string;
  isSyncing: boolean;
  lastSyncTime: number | null;
  setUserEmail: (email: string) => void;
  syncReadingProgressToCloud: (bookId: string, position: number, customUpdatedAt?: number) => Promise<void>;
  pullReadingProgressFromCloud: (bookId: string, showToastOnSync?: boolean) => Promise<number | null>;
  syncVocabularyWithCloud: () => Promise<{ mergedCount: number; addedToLocal: number; pushedToCloud: number; removedCount: number }>;
  syncNotesWithCloud: () => Promise<{ mergedCount: number; addedToLocal: number; pushedToCloud: number; removedCount: number }>;
}

// 兼容性获取书籍的唯一识别 Key（用于区分默认书籍与不同的本地导入 TXT 文本）
export function getBookIdentifier(customBook?: any, customBookTitle?: any): string {
  if (typeof window === "undefined") return DEFAULT_BOOK_ID;
  const state = useReaderStore.getState();
  return state.currentBookId || DEFAULT_BOOK_ID;
}

/**
 * 根据书名生成跨设备确定性唯一的书籍 ID (Deterministic Book ID)
 * 将书籍 title 去除所有特殊符号、标点和空格，统一转化为小写字符串。
 * 确保多台设备离线或单独导入同一本书时，生成完全相同的 book_id，
 * 使得基于 book_id 的云端阅读进度、生词与笔记能够在多设备间无缝对齐。
 * 例如："A Little History of the World" -> "alittlehistoryoftheworld"
 */
export function generateDeterministicBookId(title: string, fileType?: string): string {
  const clean = title.trim();
  // 去除所有空白、标点与特殊符号，保留文字与数字（支持 Unicode 多语言字符）
  const normalized = clean
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");

  // 兜底防御：若极端情况下书名全为特殊符号导致清理后为空，则使用备用字符串
  const baseId = normalized || "untitled";

  // 避免与系统默认典藏书 ID 冲突
  if (baseId === DEFAULT_BOOK_ID || baseId === "defaultlittlehistory") {
    return `${baseId}_custom`;
  }

  return baseId;
}

// 辅助计算总页数
const calculateTotalPages = (totalParagraphs: number, size: number) => {
  return Math.ceil(totalParagraphs / size) || 1;
};

// 辅助根据具体段落索引获取所属章节（精准映射）
export const getChapterTitleByParagraph = (paragraphIndex: number, toc: TocItem[] = TOC_DATA): string => {
  const targetToc = toc && toc.length > 0 ? toc : TOC_DATA;
  for (let i = targetToc.length - 1; i >= 0; i--) {
    if (paragraphIndex >= targetToc[i].startIndex) {
      return targetToc[i].title;
    }
  }
  return targetToc[0]?.title ?? "开始阅读";
};

// 辅助根据页码获取所在章节（优先判定本页开启的新章节，避免页首残留上一章末尾导致错位）
export const getChapterTitleByPage = (page: number, size: number, toc: TocItem[] = TOC_DATA): string => {
  const targetToc = toc && toc.length > 0 ? toc : TOC_DATA;
  const pageStart = page * size;
  const pageEnd = pageStart + size - 1;

  // 1. 若当前页内包含某章节起始点，且该章节属于新开启章节，优先展示该新章节
  const chapterStartingInPage = targetToc.find(
    (item) => item.startIndex >= pageStart && item.startIndex <= pageEnd
  );
  if (chapterStartingInPage) {
    return chapterStartingInPage.title;
  }

  // 2. 否则倒查当前页首段落所属的章节
  for (let i = targetToc.length - 1; i >= 0; i--) {
    if (pageStart >= targetToc[i].startIndex) {
      return targetToc[i].title;
    }
  }
  return targetToc[0]?.title ?? "开始阅读";
};

const DEFAULT_PAGE_SIZE = 15;
const INITIAL_TOTAL_PAGES = calculateTotalPages(ALL_PARAGRAPHS.length, DEFAULT_PAGE_SIZE);

// 初始默认生词列表演示数据（若 IndexedDB 为空时自动注入）
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
    bookId: DEFAULT_BOOK_ID,
    bookTitle: "世界小史",
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
    bookId: DEFAULT_BOOK_ID,
    bookTitle: "世界小史",
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
    bookId: DEFAULT_BOOK_ID,
    bookTitle: "世界小史",
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
    bookId: DEFAULT_BOOK_ID,
    bookTitle: "世界小史",
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
    bookId: DEFAULT_BOOK_ID,
    bookTitle: "世界小史",
    synced: true,
  },
  {
    id: "note-2",
    paragraphIndex: 178,
    page: 13,
    context: "Stone tools must have been invented by someone too. The earliest ones were probably just sticks and stones...",
    note: "工具的诞生标志着文明的破晓，石器并非仅仅是生存器具，更是人类思维具象化的开端。",
    createdAt: "2026-10-03 16:05:00",
    updatedAt: "2026-10-03 16:05:00",
    bookId: DEFAULT_BOOK_ID,
    bookTitle: "世界小史",
    synced: true,
  },
];

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      currentPage: 0,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: INITIAL_TOTAL_PAGES,
      currentChapterTitle: getChapterTitleByPage(0, DEFAULT_PAGE_SIZE),
      targetParagraphIndex: null,
      setTargetParagraphIndex: (index: number | null) => set({ targetParagraphIndex: index }),

      // 私人书架初始状态
      bookshelf: INITIAL_BOOKSHELF,
      currentBookId: DEFAULT_BOOK_ID,
      deletedBooksQueue: [], // 待同步至云端删除的书籍 ID 列表

      vocabularyList: INITIAL_VOCABULARY,
      notesList: INITIAL_NOTES,
      deletedNotesQueue: [], // 待同步至云端删除的笔记标识 (${bookId}:::${paragraphIndex})

      // 自定义书签与动态目录
      bookmarks: [],

      // 生词待删除同步队列（暂存未完成云端删除的词条）
      deletedWordsQueue: [],

      // 自动书签记忆（阅读进度字典：bookId -> { position, updatedAt }）
      readingProgress: {},

      // 保存阅读进度（离线持久化 + 时间戳更新 + 2秒防抖云端同步）
      setReadingProgress: (bookId: string, position: number, customUpdatedAt?: number) => {
        const updatedAt = customUpdatedAt || Date.now();
        set((state) => ({
          readingProgress: {
            ...state.readingProgress,
            [bookId]: { position, updatedAt },
          },
        }));

        // 若已绑定用户邮箱，则防抖 2 秒向云端 Supabase 自动 upsert 进度（带有精确毫秒时间戳）
        const { userEmail } = get();
        if (userEmail && userEmail.trim()) {
          if (progressDebounceTimer) clearTimeout(progressDebounceTimer);
          progressDebounceTimer = setTimeout(() => {
            get().syncReadingProgressToCloud(bookId, position, updatedAt);
          }, 2000);
        }
      },
      // 书籍段落持久化译文映射表：{ [bookId]: { [paragraphIndex]: "中文译文" } }
      paragraphTranslations: {},

      saveParagraphTranslation: (bookId: string, paragraphIndex: number, translation: string) => {
        set((state) => {
          const currentBookTrans = state.paragraphTranslations[bookId] || {};
          return {
            paragraphTranslations: {
              ...state.paragraphTranslations,
              [bookId]: {
                ...currentBookTrans,
                [paragraphIndex]: translation,
              },
            },
          };
        });
      },

      saveBatchParagraphTranslations: (bookId: string, translations: Record<number, string>) => {
        set((state) => {
          const currentBookTrans = state.paragraphTranslations[bookId] || {};
          return {
            paragraphTranslations: {
              ...state.paragraphTranslations,
              [bookId]: {
                ...currentBookTrans,
                ...translations,
              },
            },
          };
        });
      },

      // 离线高频词典缓存映射表
      offlineWordCache: {},

      saveOfflineWord: (word: string, translation: string) => {
        const cleanWord = word.toLowerCase().trim();
        if (!cleanWord || !translation) return;
        set((state) => ({
          offlineWordCache: {
            ...state.offlineWordCache,
            [cleanWord]: translation,
          },
        }));
      },

      saveBatchOfflineWords: (words: Record<string, string>) => {
        if (!words || Object.keys(words).length === 0) return;
        const normalizedWords: Record<string, string> = {};
        for (const [k, v] of Object.entries(words)) {
          const cleanK = k.toLowerCase().trim();
          if (cleanK && v) {
            normalizedWords[cleanK] = v;
          }
        }
        set((state) => ({
          offlineWordCache: {
            ...state.offlineWordCache,
            ...normalizedWords,
          },
        }));
      },

      // TTS 语速持久化状态（支持 0.7 慢速、0.85 舒缓、1.0 正常，默认 1.0）
      ttsSpeed: 1.0,
      setTtsSpeed: (speed: number) => {
        const validSpeed = [0.7, 0.85, 1.0].includes(speed) ? speed : 1.0;
        set({ ttsSpeed: validSpeed });
      },

      // 单句译文持久化缓存：{ [sentenceKey]: "中文译文" }
      sentenceTranslations: {},
      saveSentenceTranslation: (sentenceKey: string, translation: string) => {
        const cleanKey = sentenceKey.trim().replace(/\s+/g, " ");
        if (!cleanKey || !translation) return;
        set((state) => ({
          sentenceTranslations: {
            ...state.sentenceTranslations,
            [sentenceKey]: translation,
            [cleanKey]: translation,
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
      switchTab: (tab: string) => {
        set({ activeTab: tab });
      },

      // 获取当前正在阅读的书籍实体对象
      getCurrentBook: () => {
        const { bookshelf, currentBookId } = get();
        return (
          bookshelf[currentBookId] ||
          bookshelf[DEFAULT_BOOK_ID] ||
          INITIAL_BOOKSHELF[DEFAULT_BOOK_ID]
        );
      },

      // 导入新书至私人书架，并自动切换为当前阅读书籍（支持异步推送至云端 user_books）
      importBookToShelf: (title: string, paragraphs: string[], fileType: string = "txt", toc?: TocItem[]) => {
        const cleanTitle = title.trim() || "未命名书籍";
        const id = generateDeterministicBookId(cleanTitle, fileType);

        const { bookshelf, readingProgress, vocabularyList, notesList } = get();

        // 检查本地书架是否曾有同名的旧随机 ID 书籍（例如历史导入生成的 book_ 时间戳 ID）
        const oldRandomEntry = Object.entries(bookshelf).find(
          ([bId, b]) => bId !== id && bId !== DEFAULT_BOOK_ID && b.title.trim().toLowerCase() === cleanTitle.toLowerCase()
        );
        const oldId = oldRandomEntry ? oldRandomEntry[0] : null;
        const existingBook = bookshelf[id] || (oldRandomEntry ? oldRandomEntry[1] : undefined);

        const newBook: BookItem = {
          id,
          title: cleanTitle,
          paragraphs,
          addTime: existingBook?.addTime || Date.now(),
          fileType,
          synced: existingBook?.synced ?? false,
          toc: toc || [],
        };

        const nextBookshelf = { ...bookshelf };
        if (oldId && oldId !== id) {
          delete nextBookshelf[oldId]; // 移除旧随机 ID，无缝合并
        }
        nextBookshelf[id] = newBook;

        // 若存在旧随机 ID，平滑迁移阅读进度、生词本与笔记关联
        const nextReadingProgress = { ...readingProgress };
        if (oldId && nextReadingProgress[oldId]) {
          if (!nextReadingProgress[id]) {
            nextReadingProgress[id] = nextReadingProgress[oldId];
          }
          delete nextReadingProgress[oldId];
        }

        const nextVocabularyList = oldId
          ? vocabularyList.map((v) => (v.bookId === oldId ? { ...v, bookId: id } : v))
          : vocabularyList;

        const nextNotesList = oldId
          ? notesList.map((n) => (n.bookId === oldId ? { ...n, bookId: id } : n))
          : notesList;

        set({
          bookshelf: nextBookshelf,
          readingProgress: nextReadingProgress,
          vocabularyList: nextVocabularyList,
          notesList: nextNotesList,
        });

        // 离线优先：本地存入后，若已绑定邮箱则异步推送到云端 Supabase user_books
        const { userEmail } = get();
        if (userEmail && userEmail.trim()) {
          (async () => {
            try {
              const { error } = await supabase.from("user_books").upsert(
                {
                  user_email: userEmail.trim().toLowerCase(),
                  book_id: id,
                  title: cleanTitle,
                  paragraphs: paragraphs,
                  file_type: fileType,
                  created_at: new Date().toISOString(),
                },
                { onConflict: "user_email,book_id" }
              );

              if (error) {
                console.warn("[Supabase] 异步推送书籍至云端失败:", error.message);
              } else {
                // 标记该书已成功同步至云端
                set((state) => ({
                  bookshelf: {
                    ...state.bookshelf,
                    [id]: {
                      ...state.bookshelf[id],
                      synced: true,
                    },
                  },
                }));
              }
            } catch (err) {
              console.warn("[Supabase] 异步推送书籍网络异常:", err);
            }
          })();
        }

        // 导入成功后自动切书
        get().switchBook(id);
        return id;
      },

      // 平行切换阅读书籍
      switchBook: (bookId: string) => {
        const { bookshelf, pageSize, readingProgress } = get();
        const targetBook =
          bookshelf[bookId] ||
          bookshelf[DEFAULT_BOOK_ID] ||
          INITIAL_BOOKSHELF[DEFAULT_BOOK_ID];
        const targetBookId = targetBook.id;
        const total = calculateTotalPages(targetBook.paragraphs.length, pageSize);

        // 恢复目标书籍的独立阅读进度（规范化结构）
        const savedEntry = normalizeReadingProgress(readingProgress[targetBookId]);
        const savedPosition = savedEntry.position;
        const targetPage = Math.max(
          0,
          Math.min(Math.floor(savedPosition / pageSize), total - 1)
        );

        const isDefault = targetBookId === DEFAULT_BOOK_ID;
        const hasBookToc = Boolean(targetBook.toc && targetBook.toc.length > 0);
        const chapterTitle = hasBookToc
          ? getChapterTitleByPage(targetPage, pageSize, targetBook.toc)
          : isDefault
          ? getChapterTitleByPage(targetPage, pageSize, TOC_DATA)
          : `《${targetBook.title}》· 第 ${targetPage + 1} 页`;

        // 掐断正在发音的声音与段落高亮
        if (get().activePlayingIndex !== null) {
          set({ activePlayingIndex: null });
        }

        set({
          currentBookId: targetBookId,
          currentPage: targetPage,
          totalPages: total,
          currentChapterTitle: chapterTitle,
        });

        // 异步尝试从 Supabase 云端拉取该书进度并按时间戳仲裁，若云端较新则自动平滑跳转并 Toast 提示
        const { userEmail } = get();
        if (userEmail && userEmail.trim()) {
          get().pullReadingProgressFromCloud(targetBookId, true);
        }
      },

      // 从私人书架删除书籍（本地移除 + 待删除队列追踪 + 异步云端级联删除）
      removeBookFromShelf: (bookId: string) => {
        const { bookshelf, currentBookId, deletedBooksQueue } = get();
        // 至少保留一本藏书，防止书架彻底为空，且默认典藏书籍不可删除
        if (Object.keys(bookshelf).length <= 1 || bookId === DEFAULT_BOOK_ID) return;

        const nextBookshelf = { ...bookshelf };
        delete nextBookshelf[bookId];

        // 本地移除，并将 bookId 加入待删除队列，防止跨端同步时重新拉回复活
        set({
          bookshelf: nextBookshelf,
          deletedBooksQueue: Array.from(new Set([...(deletedBooksQueue || []), bookId])),
        });

        // 若已绑定邮箱，异步向 Supabase 发送书籍和进度的级联删除指令
        const { userEmail } = get();
        if (userEmail && userEmail.trim()) {
          (async () => {
            const email = userEmail.trim().toLowerCase();
            try {
              const [res1, res2] = await Promise.all([
                supabase.from("user_books").delete().eq("user_email", email).eq("book_id", bookId),
                supabase.from("reading_progress").delete().eq("user_email", email).eq("book_id", bookId),
              ]);

              if (res1.error) {
                console.warn("[Supabase] 异步删除云端书籍失败:", res1.error.message);
              } else {
                set((state) => ({
                  deletedBooksQueue: (state.deletedBooksQueue || []).filter((id) => id !== bookId),
                }));
              }
            } catch (err) {
              console.warn("[Supabase] 异步删除云端书籍网络异常:", err);
            }
          })();
        }

        // 联动切换：若删除的恰好是当前正在阅读的书，则自动切换到书架中剩余的第一本书；若书架已空，则重置回默认书籍
        if (currentBookId === bookId) {
          const remainingBookIds = Object.keys(nextBookshelf);
          if (remainingBookIds.length > 0) {
            get().switchBook(remainingBookIds[0]);
          } else {
            set({ bookshelf: INITIAL_BOOKSHELF, currentBookId: DEFAULT_BOOK_ID });
            get().switchBook(DEFAULT_BOOK_ID);
          }
        }
      },

      // 向后兼容旧字段 customBook / customBookTitle
      get customBook() {
        const book = get().getCurrentBook();
        return book.id === DEFAULT_BOOK_ID ? null : book.paragraphs;
      },
      get customBookTitle() {
        const book = get().getCurrentBook();
        return book.id === DEFAULT_BOOK_ID ? null : book.title;
      },
      setCustomBook: (paragraphs: string[], title?: string) => {
        get().importBookToShelf(title || "本地导入文本", paragraphs);
      },
      clearCustomBook: () => {
        get().switchBook(DEFAULT_BOOK_ID);
      },

      // 添加自定义书签
      addBookmark: (bookId: string, paragraphIndex: number, snippet: string) => {
        const { bookmarks } = get();
        const existing = bookmarks.find(
          (b) => b.bookId === bookId && b.paragraphIndex === paragraphIndex
        );
        if (existing) return;

        const cleanSnippet = snippet.trim().replace(/\s+/g, " ");
        const defaultTitle =
          cleanSnippet.length > 20
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

      setCurrentPage: (page: number, overrideTitle?: string) => {
        const { totalPages, pageSize, currentBookId, bookshelf } = get();
        const targetPage = Math.max(0, Math.min(page, totalPages - 1));
        const currentBook =
          bookshelf[currentBookId] || bookshelf[DEFAULT_BOOK_ID];
        const isDefault = currentBookId === DEFAULT_BOOK_ID;
        const hasBookToc = Boolean(currentBook?.toc && currentBook.toc.length > 0);
        const tocToUse = hasBookToc ? currentBook.toc : (isDefault ? TOC_DATA : []);

        let chapterTitle = overrideTitle;
        if (!chapterTitle) {
          chapterTitle = tocToUse && tocToUse.length > 0
            ? getChapterTitleByPage(targetPage, pageSize, tocToUse)
            : `《${currentBook?.title || "自定义书籍"}》· 第 ${targetPage + 1} 页`;
        }

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
        const { pageSize, bookshelf, currentBookId } = get();
        const currentBook = bookshelf[currentBookId] || bookshelf[DEFAULT_BOOK_ID];
        const isDefault = currentBookId === DEFAULT_BOOK_ID;
        const targetToc = (currentBook?.toc && currentBook.toc.length > 0) ? currentBook.toc : (isDefault ? TOC_DATA : []);
        const chapterTitle = getChapterTitleByParagraph(index, targetToc);
        const targetPage = Math.floor(index / pageSize);

        set({
          currentPage: targetPage,
          currentChapterTitle: chapterTitle,
          targetParagraphIndex: index,
        });

        get().setReadingProgress(currentBookId, index);
      },

      goToChapter: (startIndex: number, title?: string) => {
        const { pageSize, bookshelf, currentBookId } = get();
        const currentBook = bookshelf[currentBookId] || bookshelf[DEFAULT_BOOK_ID];
        const isDefault = currentBookId === DEFAULT_BOOK_ID;
        const targetToc = (currentBook?.toc && currentBook.toc.length > 0) ? currentBook.toc : (isDefault ? TOC_DATA : []);

        const matched = targetToc.find((item) => item.startIndex === startIndex) ||
          [...targetToc].reverse().find((item) => startIndex >= item.startIndex);
        const chapterTitle = title || matched?.title || (targetToc[0]?.title ?? "开始阅读");
        const targetPage = Math.floor(startIndex / pageSize);

        set({
          currentPage: targetPage,
          currentChapterTitle: chapterTitle,
          targetParagraphIndex: startIndex,
        });

        get().setReadingProgress(currentBookId, startIndex);
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

        // 自动打包当前书籍 ID 与书名来源
        const currentBook = get().getCurrentBook();
        const effectiveBookId = item.bookId || currentBook?.id || DEFAULT_BOOK_ID;
        const effectiveBookTitle =
          item.bookTitle || currentBook?.title || "未知书目";

        const newVocab: VocabularyItem = {
          ...item,
          id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          bookId: effectiveBookId,
          bookTitle: effectiveBookTitle,
          addedAt: new Date().toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }),
          reviewLevel: item.reviewLevel ?? 0,
          nextReviewTime: item.nextReviewTime ?? Date.now(),
          synced: false,
        };

        set({ vocabularyList: [newVocab, ...vocabularyList] });

        // 离线优先：本地即时保存后，若已绑定邮箱则异步推送到云端 Supabase
        const { userEmail } = get();
        if (userEmail && userEmail.trim()) {
          (async () => {
            try {
              const { error } = await supabase.from("vocabulary").upsert(
                {
                  user_email: userEmail.trim().toLowerCase(),
                  book_id: effectiveBookId,
                  book_title: effectiveBookTitle,
                  word: cleanWord,
                  translation: item.translation || "",
                  context: item.context || "",
                  created_at: new Date().toISOString(),
                },
                { onConflict: "user_email,word" }
              );
              if (error) {
                console.warn("[Supabase] 异步推送生词失败:", error.message);
              } else {
                // 标记该生词已同步至云端
                set((state) => ({
                  vocabularyList: state.vocabularyList.map((v) =>
                    v.id === newVocab.id ? { ...v, synced: true } : v
                  ),
                }));
              }
            } catch (err) {
              console.warn("[Supabase] 异步推送生词异常:", err);
            }
          })();
        }
      },

      // 从生词本移除指定单词（本地即时响应 + 云端异步级联删除 + 待删除队列追踪）
      removeVocab: (word: string) => {
        const { vocabularyList, deletedWordsQueue } = get();
        const lower = word.toLowerCase().trim();

        // 匹配待删除项以获取真实单词拼写
        const targetItem = vocabularyList.find(
          (v) => v.word.toLowerCase() === lower || v.id === word
        );
        const targetWord = targetItem ? targetItem.word : word;

        // 1. 本地立即过滤删除，确保 UI 零延迟响应，并将词记入待删除队列（防止跨设备漫游复活）
        set({
          vocabularyList: vocabularyList.filter(
            (v) => v.word.toLowerCase() !== lower && v.id !== word
          ),
          deletedWordsQueue: Array.from(new Set([...(deletedWordsQueue || []), lower])),
        });

        // 2. 若已绑定用户邮箱，异步向 Supabase vocabulary 表发送删除请求
        const { userEmail } = get();
        if (userEmail && userEmail.trim()) {
          (async () => {
            try {
              const { error } = await supabase
                .from("vocabulary")
                .delete()
                .eq("user_email", userEmail.trim().toLowerCase())
                .ilike("word", targetWord.trim());

              if (error) {
                console.warn("[Supabase] 异步删除云端生词失败:", error.message);
              } else {
                // 云端确认删除后，出队
                set((state) => ({
                  deletedWordsQueue: (state.deletedWordsQueue || []).filter((w) => w !== lower),
                }));
              }
            } catch (err) {
              console.warn("[Supabase] 异步删除云端生词网络异常:", err);
            }
          })();
        }
      },

      // 一键清空所有生词（本地立即清空 + 云端异步同步清空 + 记录清空标记）
      clearAllVocab: () => {
        const { vocabularyList, deletedWordsQueue } = get();
        const wordsToQueue = vocabularyList.map((v) => v.word.toLowerCase().trim());
        set({
          vocabularyList: [],
          deletedWordsQueue: Array.from(new Set([...(deletedWordsQueue || []), ...wordsToQueue])),
        });

        const { userEmail } = get();
        if (userEmail && userEmail.trim()) {
          (async () => {
            try {
              const { error } = await supabase
                .from("vocabulary")
                .delete()
                .eq("user_email", userEmail.trim().toLowerCase());

              if (error) {
                console.warn("[Supabase] 异步清空云端生词失败:", error.message);
              } else {
                set({ deletedWordsQueue: [] });
              }
            } catch (err) {
              console.warn("[Supabase] 异步清空云端生词网络异常:", err);
            }
          })();
        }
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

      // 添加或更新读书笔记（本地即时持久化 + 绑定邮箱异步 upsert 推送云端）
      addNote: (item) => {
        const { notesList, getCurrentBook, userEmail } = get();
        const currentBook = getCurrentBook();
        const effectiveBookId = item.bookId || currentBook?.id || DEFAULT_BOOK_ID;
        const effectiveBookTitle = item.bookTitle || currentBook?.title || "未知书目";
        const now = new Date().toLocaleString("zh-CN");

        // 检查本地是否已有该段落的笔记（存在则更新内容，不存在则新建）
        const existingIndex = notesList.findIndex(
          (n) => (n.bookId || DEFAULT_BOOK_ID) === effectiveBookId && n.paragraphIndex === item.paragraphIndex
        );

        let updatedList: NoteItem[];
        let noteId: string;

        if (existingIndex >= 0) {
          noteId = notesList[existingIndex].id;
          const updatedNote: NoteItem = {
            ...notesList[existingIndex],
            ...item,
            bookId: effectiveBookId,
            bookTitle: effectiveBookTitle,
            context: item.context || notesList[existingIndex].context || "",
            note: item.note,
            updatedAt: now,
            synced: false,
          };
          updatedList = [...notesList];
          updatedList[existingIndex] = updatedNote;
        } else {
          noteId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const newNote: NoteItem = {
            ...item,
            id: noteId,
            bookId: effectiveBookId,
            bookTitle: effectiveBookTitle,
            context: item.context || "",
            note: item.note,
            createdAt: now,
            updatedAt: now,
            synced: false,
          };
          updatedList = [newNote, ...notesList];
        }

        set({ notesList: updatedList });

        // 离线优先：若已绑定用户邮箱，异步向 Supabase notes 表 upsert
        if (userEmail && userEmail.trim()) {
          (async () => {
            try {
              const { error } = await supabase.from("notes").upsert(
                {
                  user_email: userEmail.trim().toLowerCase(),
                  book_id: effectiveBookId,
                  book_title: effectiveBookTitle,
                  paragraph_index: item.paragraphIndex,
                  context: item.context || "",
                  note: item.note,
                },
                { onConflict: "user_email,book_id,paragraph_index" }
              );

              if (error) {
                console.warn("[Supabase] 异步推送读书笔记失败:", error.message);
              } else {
                set((state) => ({
                  notesList: state.notesList.map((n) =>
                    n.id === noteId ? { ...n, synced: true } : n
                  ),
                }));
              }
            } catch (err) {
              console.warn("[Supabase] 异步推送读书笔记异常:", err);
            }
          })();
        }
      },

      // 删除读书笔记（本地立即响应 + 队列追踪 + 异步云端删除）
      removeNote: (id: string) => {
        const { notesList, deletedNotesQueue, userEmail } = get();
        const target = notesList.find((n) => n.id === id);
        if (!target) {
          set({ notesList: notesList.filter((n) => n.id !== id) });
          return;
        }

        const noteKey = `${target.bookId}:::${target.paragraphIndex}`;
        set({
          notesList: notesList.filter((n) => n.id !== id),
          deletedNotesQueue: Array.from(new Set([...(deletedNotesQueue || []), noteKey])),
        });

        if (userEmail && userEmail.trim()) {
          (async () => {
            try {
              const { error } = await supabase
                .from("notes")
                .delete()
                .eq("user_email", userEmail.trim().toLowerCase())
                .eq("book_id", target.bookId)
                .eq("paragraph_index", target.paragraphIndex);

              if (!error) {
                set((state) => ({
                  deletedNotesQueue: (state.deletedNotesQueue || []).filter((k) => k !== noteKey),
                }));
              } else {
                console.warn("[Supabase] 异步删除云端笔记失败:", error.message);
              }
            } catch (err) {
              console.warn("[Supabase] 异步删除云端笔记网络异常:", err);
            }
          })();
        }
      },

      // 一键清空所有读书笔记（本地立即清空 + 异步云端全量删除）
      clearAllNotes: () => {
        const { notesList, deletedNotesQueue, userEmail } = get();
        const allKeys = notesList.map((n) => `${n.bookId}:::${n.paragraphIndex}`);
        set({
          notesList: [],
          deletedNotesQueue: Array.from(new Set([...(deletedNotesQueue || []), ...allKeys])),
        });

        const email = userEmail?.trim().toLowerCase();
        if (email) {
          (async () => {
            try {
              const { error } = await supabase
                .from("notes")
                .delete()
                .eq("user_email", email);

              if (!error) {
                set({ deletedNotesQueue: [] });
              } else {
                console.warn("[Supabase] 异步清空云端笔记失败:", error.message);
              }
            } catch (err) {
              console.warn("[Supabase] 异步清空云端笔记网络异常:", err);
            }
          })();
        }
      },

      // Supabase 云端同步状态与实现
      userEmail: "",
      isSyncing: false,
      lastSyncTime: null,
      setUserEmail: (email: string) => {
        set({ userEmail: email.trim().toLowerCase() });
      },

      // 向云端同步阅读进度（upsert，支持指定精确更新时间戳）
      syncReadingProgressToCloud: async (bookId: string, position: number, customUpdatedAt?: number) => {
        const { userEmail, readingProgress } = get();
        if (!userEmail || !userEmail.trim()) return;

        const currentEntry = normalizeReadingProgress(readingProgress[bookId]);
        const effectiveUpdatedAt = customUpdatedAt || currentEntry.updatedAt || Date.now();

        try {
          const { error } = await supabase.from("reading_progress").upsert(
            {
              user_email: userEmail.trim().toLowerCase(),
              book_id: bookId,
              position: position,
              updated_at: new Date(effectiveUpdatedAt).toISOString(),
            },
            { onConflict: "user_email,book_id" }
          );
          if (error) {
            console.warn("[Supabase] 同步阅读进度失败:", error.message);
          }
        } catch (err) {
          console.warn("[Supabase] 同步阅读进度网络异常:", err);
        }
      },

      // 从云端拉取指定书籍的阅读进度（确立 Last Write Wins 仲裁规则）
      pullReadingProgressFromCloud: async (bookId: string, showToastOnSync: boolean = false) => {
        const { userEmail, readingProgress } = get();
        if (!userEmail || !userEmail.trim()) return null;

        try {
          const { data, error } = await supabase
            .from("reading_progress")
            .select("position, updated_at")
            .eq("user_email", userEmail.trim().toLowerCase())
            .eq("book_id", bookId)
            .maybeSingle();

          if (error) {
            console.warn("[Supabase] 拉取云端阅读进度失败:", error.message);
            return null;
          }

          if (data && typeof data.position === "number") {
            const cloudUpdatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
            const localEntry = normalizeReadingProgress(readingProgress[bookId]);
            const localPos = localEntry.position;
            const localUpdatedAt = localEntry.updatedAt;

            // 仲裁逻辑 (Last Write Wins)：
            // 1. 若云端 updated_at 比本地的 updatedAt 更新，则无条件以云端 position 覆盖本地，并自动平滑跳转到该页
            if (cloudUpdatedAt > localUpdatedAt) {
              set((state) => ({
                readingProgress: {
                  ...state.readingProgress,
                  [bookId]: { position: data.position, updatedAt: cloudUpdatedAt },
                },
              }));

              // 若当前正是该书籍，联动更新当前页码并平滑跳转
              if (get().currentBookId === bookId) {
                const { pageSize, getCurrentBook } = get();
                const targetBook = getCurrentBook();
                const total = calculateTotalPages(targetBook.paragraphs.length, pageSize);
                const targetPage = Math.max(
                  0,
                  Math.min(Math.floor(data.position / pageSize), total - 1)
                );
                set({ currentPage: targetPage });

                if (showToastOnSync && data.position !== localPos) {
                  toast.info("☁️ 已同步跨端最新阅读进度", {
                    description: `已自动漫游至第 ${targetPage + 1} 页（段落 #${data.position + 1}）`,
                  });
                }
              }
              return data.position;
            } else if (localUpdatedAt > cloudUpdatedAt) {
              // 2. 若本地更新时间晚于云端，防抖推送到云端
              get().syncReadingProgressToCloud(bookId, localPos, localUpdatedAt);
            }
            return localPos;
          }
        } catch (err) {
          console.warn("[Supabase] 拉取阅读进度异常:", err);
        }
        return null;
      },

      // 双向同步生词本：全量对齐（合并不存在的生词，并将已被删除的记录从本地彻底剔除）
      syncVocabularyWithCloud: async () => {
        const { userEmail, vocabularyList, deletedWordsQueue } = get();
        const email = userEmail.trim().toLowerCase();
        if (!email) {
          return { mergedCount: vocabularyList.length, addedToLocal: 0, pushedToCloud: 0, removedCount: 0 };
        }

        set({ isSyncing: true });
        try {
          // 0. 先将本地队列中待删除的单词在云端执行一次 delete，确保云端彻底同步删除
          const currentQueue = deletedWordsQueue || [];
          if (currentQueue.length > 0) {
            for (const wordLower of currentQueue) {
              await supabase
                .from("vocabulary")
                .delete()
                .eq("user_email", email)
                .ilike("word", wordLower);
            }
          }

          // 1. 查询云端所有属于该用户的生词
          const { data: cloudItems, error } = await supabase
            .from("vocabulary")
            .select("id, word, translation, context, book_id, book_title, created_at")
            .eq("user_email", email);

          if (error) {
            throw error;
          }

          const cloudWordsMap = new Map<string, any>();
          (cloudItems || []).forEach((row: any) => {
            if (row.word) {
              cloudWordsMap.set(row.word.toLowerCase().trim(), row);
            }
          });

          const queueSet = new Set(currentQueue.map((w) => w.toLowerCase().trim()));

          // 2. 检查本地生词：
          // 若在待删除队列中，或者曾与云端同步 (synced === true) 但目前云端已不存在 (已被另一端删除)
          // -> 则将其从本地彻底剔除！
          let removedCount = 0;
          const remainingLocalList: VocabularyItem[] = [];
          const localWordsMap = new Map<string, VocabularyItem>();

          for (const item of vocabularyList) {
            const lower = item.word.toLowerCase().trim();
            const inCloud = cloudWordsMap.has(lower);
            const isDeletedInQueue = queueSet.has(lower);

            if (isDeletedInQueue || (item.synced && !inCloud)) {
              removedCount++;
              continue;
            }

            // 保留该词并确保标记为已同步
            const updatedItem = inCloud ? { ...item, synced: true } : item;
            remainingLocalList.push(updatedItem);
            localWordsMap.set(lower, updatedItem);
          }

          // 3. 计算云端有但本地没有的生词，注入本地（标记 synced: true）
          const missingInLocal: VocabularyItem[] = [];
          (cloudItems || []).forEach((row: any) => {
            const wordLower = (row.word || "").toLowerCase().trim();
            if (!queueSet.has(wordLower) && !localWordsMap.has(wordLower)) {
              const newVocab: VocabularyItem = {
                id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                word: row.word,
                translation: row.translation || "",
                context: row.context || "",
                bookId: row.book_id || DEFAULT_BOOK_ID,
                bookTitle: row.book_title || "未知书目",
                addedAt: row.created_at
                  ? new Date(row.created_at).toLocaleString("zh-CN")
                  : new Date().toLocaleString("zh-CN"),
                reviewLevel: 0,
                nextReviewTime: 0,
                synced: true,
              };
              missingInLocal.push(newVocab);
              localWordsMap.set(wordLower, newVocab);
            }
          });

          // 4. 计算本地有但云端没有且未曾同步过的生词（例如本地离线新添加的词），推送到云端
          const toPushToCloud = remainingLocalList.filter(
            (item) => !item.synced && !cloudWordsMap.has(item.word.toLowerCase().trim())
          );

          let pushedToCloud = 0;
          if (toPushToCloud.length > 0) {
            const rowsToPush = toPushToCloud.map((item) => ({
              user_email: email,
              book_id: item.bookId || DEFAULT_BOOK_ID,
              book_title: item.bookTitle || "世界小史",
              word: item.word.trim(),
              translation: item.translation || "",
              context: item.context || "",
              created_at: new Date().toISOString(),
            }));

            const { error: pushError } = await supabase
              .from("vocabulary")
              .upsert(rowsToPush, { onConflict: "user_email,word" });

            if (!pushError) {
              pushedToCloud = rowsToPush.length;
              const pushedWordSet = new Set(toPushToCloud.map((i) => i.word.toLowerCase().trim()));
              remainingLocalList.forEach((item) => {
                if (pushedWordSet.has(item.word.toLowerCase().trim())) {
                  item.synced = true;
                }
              });
            } else {
              console.warn("[Supabase] 批量推送本地生词至云端失败:", pushError.message);
            }
          }

          const mergedVocabularyList = [...remainingLocalList, ...missingInLocal];
          set({
            vocabularyList: mergedVocabularyList,
            deletedWordsQueue: [], // 队列已处理完毕，清空
            lastSyncTime: Date.now(),
            isSyncing: false,
          });

          return {
            mergedCount: mergedVocabularyList.length,
            addedToLocal: missingInLocal.length,
            pushedToCloud,
            removedCount,
          };
        } catch (err) {
          console.error("[Supabase] 双向同步生词异常:", err);
          set({ isSyncing: false });
          throw err;
        }
      },

      // 双向同步读书笔记：全量对齐（合并不存在的笔记，剔除已删除笔记，补推本地离线笔记）
      syncNotesWithCloud: async () => {
        const { userEmail, notesList, deletedNotesQueue, pageSize } = get();
        const email = userEmail.trim().toLowerCase();
        if (!email) {
          return { mergedCount: notesList.length, addedToLocal: 0, pushedToCloud: 0, removedCount: 0 };
        }

        try {
          // 0. 重放本地待删除队列
          const currentQueue = deletedNotesQueue || [];
          if (currentQueue.length > 0) {
            for (const key of currentQueue) {
              const [bId, pIndexStr] = key.split(":::");
              const pIndex = parseInt(pIndexStr, 10);
              if (bId && !isNaN(pIndex)) {
                await supabase
                  .from("notes")
                  .delete()
                  .eq("user_email", email)
                  .eq("book_id", bId)
                  .eq("paragraph_index", pIndex);
              }
            }
          }

          // 1. 查询云端所有属于该用户的读书笔记
          const { data: cloudNotes, error } = await supabase
            .from("notes")
            .select("book_id, book_title, paragraph_index, context, note, created_at")
            .eq("user_email", email);

          if (error) {
            throw error;
          }

          const cloudNotesMap = new Map<string, any>();
          (cloudNotes || []).forEach((row: any) => {
            const key = `${row.book_id}:::${row.paragraph_index}`;
            cloudNotesMap.set(key, row);
          });

          const queueSet = new Set(currentQueue);
          let removedCount = 0;
          const remainingLocalList: NoteItem[] = [];
          const localKeysMap = new Map<string, NoteItem>();

          // 2. 本地笔记比对：在删除队列中或曾同步过但在云端已不存在 -> 剔除
          for (const item of notesList) {
            const key = `${item.bookId}:::${item.paragraphIndex}`;
            const inCloud = cloudNotesMap.has(key);
            const isDeletedInQueue = queueSet.has(key);

            if (isDeletedInQueue || (item.synced && !inCloud)) {
              removedCount++;
              continue;
            }

            const updatedItem = inCloud ? { ...item, synced: true } : item;
            remainingLocalList.push(updatedItem);
            localKeysMap.set(key, updatedItem);
          }

          // 3. 计算云端有但本地没有的笔记 -> 注入本地 IndexedDB
          const missingInLocal: NoteItem[] = [];
          (cloudNotes || []).forEach((row: any) => {
            const key = `${row.book_id}:::${row.paragraph_index}`;
            if (!queueSet.has(key) && !localKeysMap.has(key)) {
              const pIndex = row.paragraph_index ?? 0;
              const newNote: NoteItem = {
                id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                bookId: row.book_id,
                bookTitle: row.book_title || "未知书目",
                paragraphIndex: pIndex,
                page: Math.floor(pIndex / (pageSize || 15)) + 1,
                context: row.context || "",
                note: row.note || "",
                createdAt: row.created_at
                  ? new Date(row.created_at).toLocaleString("zh-CN")
                  : new Date().toLocaleString("zh-CN"),
                updatedAt: row.created_at
                  ? new Date(row.created_at).toLocaleString("zh-CN")
                  : new Date().toLocaleString("zh-CN"),
                synced: true,
              };
              missingInLocal.push(newNote);
              localKeysMap.set(key, newNote);
            }
          });

          // 4. 计算本地有但云端没有的笔记（如离线新增） -> 补推到云端
          const toPushToCloud = remainingLocalList.filter(
            (item) => !item.synced && !cloudNotesMap.has(`${item.bookId}:::${item.paragraphIndex}`)
          );

          let pushedToCloud = 0;
          if (toPushToCloud.length > 0) {
            for (const item of toPushToCloud) {
              const { error: pushError } = await supabase.from("notes").upsert(
                {
                  user_email: email,
                  book_id: item.bookId || DEFAULT_BOOK_ID,
                  book_title: item.bookTitle || "世界小史",
                  paragraph_index: item.paragraphIndex,
                  context: item.context || "",
                  note: item.note,
                },
                { onConflict: "user_email,book_id,paragraph_index" }
              );

              if (!pushError) {
                pushedToCloud++;
                item.synced = true;
              } else {
                console.warn("[Supabase] 补推单条读书笔记至云端失败:", pushError.message);
              }
            }
          }

          const mergedNotesList = [...remainingLocalList, ...missingInLocal];
          set({
            notesList: mergedNotesList,
            deletedNotesQueue: [],
          });

          return {
            mergedCount: mergedNotesList.length,
            addedToLocal: missingInLocal.length,
            pushedToCloud,
            removedCount,
          };
        } catch (err) {
          console.error("[Supabase] 双向同步读书笔记异常:", err);
          throw err;
        }
      },

      // 双向同步私人书架：从云端 user_books 拉取未在地的书籍注入本地 IndexedDB，并自动全量补推存量/未同步书籍
      syncBooksWithCloud: async () => {
        const { userEmail, bookshelf, deletedBooksQueue } = get();
        const email = userEmail.trim().toLowerCase();
        if (!email) {
          return { addedCount: 0, pushedCount: 0, removedCount: 0 };
        }

        try {
          // 0. 重放本地待删除书籍队列，确保云端彻底删除
          const currentDeletedQueue = deletedBooksQueue || [];
          if (currentDeletedQueue.length > 0) {
            for (const delId of currentDeletedQueue) {
              await supabase.from("user_books").delete().eq("user_email", email).eq("book_id", delId);
              await supabase.from("reading_progress").delete().eq("user_email", email).eq("book_id", delId);
            }
          }

          // 1. 从云端拉取属于该用户的所有书籍
          const { data: cloudBooks, error } = await supabase
            .from("user_books")
            .select("book_id, title, paragraphs, created_at, file_type")
            .eq("user_email", email);

          if (error) {
            throw error;
          }

          const cloudBooksMap = new Map<string, any>();
          (cloudBooks || []).forEach((row: any) => {
            if (row.book_id) {
              cloudBooksMap.set(row.book_id, row);
            }
          });

          const queueSet = new Set(currentDeletedQueue);
          let removedCount = 0;
          let addedCount = 0;
          let pushedCount = 0;

          const nextBookshelf: Record<string, BookItem> = {
            [DEFAULT_BOOK_ID]: bookshelf[DEFAULT_BOOK_ID] || INITIAL_BOOKSHELF[DEFAULT_BOOK_ID],
          };

          // 2. 检查本地现存书籍：
          // 若在显式删除队列中则移除；
          // 存量书籍自动全量补推上云：若云端缺失该 book_id (!inCloud) 或本地未标记同步 (!book.synced)，全量自动补推上云！
          const booksToPush: BookItem[] = [];

          for (const [id, book] of Object.entries(bookshelf)) {
            if (id === DEFAULT_BOOK_ID) continue;

            const isDeletedInQueue = queueSet.has(id);
            const inCloud = cloudBooksMap.has(id);

            if (isDeletedInQueue) {
              removedCount++;
              continue;
            }

            // 存量书籍自动补推上云：只要云端缺失该书 (!inCloud) 或本地未标记同步 (!book.synced)，加入补推队列
            if (!inCloud || !book.synced) {
              nextBookshelf[id] = book;
              booksToPush.push(book);
            } else {
              nextBookshelf[id] = { ...book, synced: true };
            }
          }

          // 3. 检查云端书籍：
          // 若云端有某本书而本地没有，且不在删除队列中 -> 自动注入本地 IndexedDB，使当前设备拥有整本书！
          (cloudBooks || []).forEach((row: any) => {
            const bId = row.book_id;
            if (!queueSet.has(bId) && !nextBookshelf[bId]) {
              nextBookshelf[bId] = {
                id: bId,
                title: row.title || "未命名书籍",
                paragraphs: Array.isArray(row.paragraphs) ? row.paragraphs : [],
                addTime: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
                fileType: row.file_type || "txt",
                synced: true,
              };
              addedCount++;
            }
          });

          // 4. 将本地未同步或云端缺失的存量书籍全量推送到云端 user_books
          if (booksToPush.length > 0) {
            for (const b of booksToPush) {
              const { error: pushError } = await supabase.from("user_books").upsert(
                {
                  user_email: email,
                  book_id: b.id,
                  title: b.title,
                  paragraphs: b.paragraphs || [],
                  file_type: b.fileType || "txt",
                  created_at: new Date(b.addTime || Date.now()).toISOString(),
                },
                { onConflict: "user_email,book_id" }
              );

              if (!pushError) {
                pushedCount++;
                if (nextBookshelf[b.id]) {
                  nextBookshelf[b.id].synced = true;
                }
              } else {
                console.warn(`[Supabase] 自动补推存量书籍《${b.title}》失败:`, pushError.message);
              }
            }
          }

          set({
            bookshelf: nextBookshelf,
            deletedBooksQueue: [],
          });

          return { addedCount, pushedCount, removedCount };
        } catch (err) {
          console.error("[Supabase] 双向同步云端书籍异常:", err);
          throw err;
        }
      },
    }),
    {
      name: "reader_bookshelf_storage_v1", // IndexedDB 专用键名
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        currentPage: state.currentPage,
        pageSize: state.pageSize,
        currentBookId: state.currentBookId,
        bookshelf: state.bookshelf,
        deletedBooksQueue: state.deletedBooksQueue || [],
        vocabularyList: state.vocabularyList,
        deletedWordsQueue: state.deletedWordsQueue || [],
        notesList: state.notesList,
        deletedNotesQueue: state.deletedNotesQueue || [],
        readingProgress: state.readingProgress,
        bookmarks: state.bookmarks,
        paragraphTranslations: state.paragraphTranslations || {},
        offlineWordCache: state.offlineWordCache || {},
        ttsSpeed: state.ttsSpeed ?? 1.0,
        sentenceTranslations: state.sentenceTranslations || {},
        userEmail: state.userEmail,
        lastSyncTime: state.lastSyncTime,
      }),
    }
  )
);
