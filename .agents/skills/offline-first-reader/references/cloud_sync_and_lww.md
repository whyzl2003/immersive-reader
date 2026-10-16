# 四合一云端双向同步与 LWW 仲裁指南 (Cloud Sync & Conflict Resolution)

本参考文档规定了在基于 Supabase (PostgreSQL) 构建类似“微信读书”的跨端双向静默同步时，解决“进度冲突”、“离线删除复活”与“存量书籍补推”的核心工程方案。

---

## 1. 核心挑战与解决矩阵

```text
挑战 1: 设备 A 读到第 30 页，设备 B 读到第 10 页 ──> 采用 Last-Write-Wins (LWW) 时间戳仲裁
挑战 2: 设备 A 删除了单词，设备 B 还有该词 ──> 采用 本地墓碑队列 (deletedQueues) 防死灰复燃
挑战 3: 以前在单机导入的书未推上云 ──> 采用 存量书籍遍历自动补推 (Auto Push)
挑战 4: 多用户数据混淆与重复插入 ──> 采用 PostgREST 复合唯一键 (user_email, item_id) UPSERT
```

---

## 2. 阅读进度：Last-Write-Wins (LWW) 仲裁设计

### 本地与云端数据契约
- 本地记录毫秒级时间戳：`{ position: number, updatedAt: number }`
- 云端记录 ISO 8601 时间戳：`{ progress: number, updated_at: string }`

### 同步仲裁逻辑
```typescript
const cloudUpdatedAtMs = new Date(cloudRecord.updated_at).getTime();
const localUpdatedAtMs = localRecord.updatedAt || 0;

if (cloudUpdatedAtMs > localUpdatedAtMs) {
  // 1. 云端更新：判定对端设备发生过更新，采用云端进度覆盖本地，并提示用户恢复
  setReadingProgressLocally(bookId, cloudRecord.progress, cloudUpdatedAtMs);
} else if (localUpdatedAtMs > cloudUpdatedAtMs) {
  // 2. 本地更新：判定当前设备更新，立即反推最新进度覆盖云端
  await supabase.from("reading_progress").upsert({
    user_email: userEmail,
    book_id: bookId,
    progress: localRecord.position,
    updated_at: new Date(localUpdatedAtMs).toISOString(),
  }, { onConflict: "user_email,book_id" });
}
```

---

## 3. 防复活机制：墓碑删除队列 (`deletedQueues`)

如果直接执行 `拉取云端 -> 合并本地`，已被设备 A 删掉的词条会从云端再次被拉回设备 A，造成“删不掉”的严重 Bug。

### 正确的同步工作流：
1. **删除时入队**：本地点击删除单词时，除了从界面移除，立即将单词存入 `deletedWordsQueue: string[]`（持久化在 IndexedDB）；
2. **同步时先行抹除**：点击同步或自动同步时，第一步向云端发起批量删除：
   ```typescript
   if (deletedWordsQueue.length > 0) {
     await supabase.from("vocabulary").delete()
       .eq("user_email", userEmail)
       .in("word", deletedWordsQueue);
   }
   ```
3. **拉取时显式过滤**：从云端拉取剩余数据时，必须过滤掉该队列中的数据：
   ```typescript
   const cleanCloudList = cloudList.filter(item => !deletedWordsQueue.includes(item.word));
   ```
4. **事务完成清空队列**：同步成功后，清空本地 `deletedWordsQueue`。

---

## 4. 存量书籍全量补推 (Auto Push Existing Books)

解决单机导入书籍未上云的痛点：
```typescript
for (const [bookId, book] of Object.entries(bookshelf)) {
  const isCloudMissing = !cloudBookIds.has(bookId);
  const isLocalNotSynced = !book.synced;

  if (isCloudMissing || isLocalNotSynced) {
    // 全量补推整书元数据与段落数组
    await supabase.from("user_books").upsert({
      user_email: userEmail,
      book_id: bookId,
      title: book.title,
      paragraphs: book.paragraphs,
      file_type: "epub", // 或 txt
    }, { onConflict: "user_email,book_id" });

    // 标记本地已同步
    markBookSyncedLocally(bookId, true);
  }
}
```
