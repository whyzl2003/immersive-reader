# IndexedDB 离线存储实现指南 (Offline Storage Guide)

本参考文档规定了在 Web 端构建高容量、离线优先阅读器时，如何利用 Zustand 与 IndexedDB 彻底打破 LocalStorage 5MB 配额壁垒的工程标准。

---

## 1. 为什么必须使用 IndexedDB？

| 存储方案 | 容量上限 | 读写特性 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **`localStorage`** | 约 5MB | 同步阻塞主线程，大文本导致页面假死 | 仅适合存储简单字符串偏好 |
| **`IndexedDB`** | 硬盘可用空间的 20%~80%（通常数十 GB） | 异步非阻塞，支持二进制 Blob 与复杂对象树 | 适合整本数百万字原著、Base64 插图、完整词典库 |

---

## 2. 推荐封装：Zustand + idb-keyval

使用轻量级库 `idb-keyval` 作为 Zustand 的持久化适配器（无需手写冗长的原生 IndexedDB 事务代码）：

```typescript
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";

// 自定义 IndexedDB 异步存储适配器
const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

export const useAppStore = create<State>()(
  persist(
    (set, get) => ({
      // 业务状态
      bookshelf: {},
      readingProgress: {},
      // ...
    }),
    {
      name: "my-app-storage",
      storage: createJSONStorage(() => idbStorage),
      // 可选：指定持久化字段以优化性能
      partialize: (state) => ({
        bookshelf: state.bookshelf,
        vocabulary: state.vocabulary,
        readingProgress: state.readingProgress,
        notes: state.notes,
        userEmail: state.userEmail,
        deletedWordsQueue: state.deletedWordsQueue,
        deletedBooksQueue: state.deletedBooksQueue,
      }),
    }
  )
);
```

---

## 3. 数据模型设计黄金准则

1. **结构扁平化**：书籍以 `bookId` 作为 Key 构建字典映射表 `Record<string, Book>`，避免遍历深层嵌套大数组；
2. **段落级切片**：正文统一预清洗为 `paragraphs: string[]`。无论是纯文本还是带图段落（`<img>` 标签），都以段落为原子阅读单元；
3. **元数据与内容绑定**：每本书对象内包含 `id, title, paragraphs, synced, fileType`，确保本地书架既能脱机渲染，又能按需推送到云端。
