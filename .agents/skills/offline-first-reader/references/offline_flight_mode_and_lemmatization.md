# 飞行模式离线外壳与英文形态学词形还原指南 (Offline Flight Mode & Lemmatization Guide)

本参考文档规定了在完全切断外网（如高空机舱飞行模式、高铁无信号隧道或地下车库）的环境下，保障阅读应用**零秒白屏、全功能离线查词、英文词形还原（Lemmatization）与候机室预载**的完整工程架构标准。

---

## 1. 痛点分析：假离线与真离线的本质差距

市面上多数所谓的“离线应用”仅缓存了静态 HTML，存在三大死穴：
1. **离线查词死锁**：用户点击带有时态变形的单词（如 `cradled`），因外网断开导致 API 请求挂起或抛出未捕获错误，UI 转圈卡死；
2. **长难句无法查译**：断网后整页英文失去译文对照支持；
3. **PWA 冷启动失败**：重启浏览器后由于静态资源 Chunk 校验失败引发恐龙白屏。

---

## 2. PWA 离线外壳与 Service Worker 缓存策略

在 `public/sw.js` 中配置 Cache-First 离线外壳：

```javascript
const CACHE_NAME = 'offline-reader-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // 仅拦截静态资源与主入口，绕过实时 WebSocket 与特定 API
  if (request.method !== 'GET' || request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Cache First 并后台异步更新 (Stale-While-Revalidate)
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(request);
    })
  );
});
```

---

## 3. 英文形态学词形还原引擎 (Morphological Lemmatizer)

### 3.1 词形还原流水线
在离线查词场景下，书籍正文中的单词绝大多数带有语法屈折变形。必须通过形态学规则流水线将其自动还原为**词典原型（Lemma）**，否则本地词典无法命中：

```
                      [ 输入屈折单词 (如 "running", "cradled", "stories", "went") ]
                                                  │
                                                  ▼
                                    【 步骤 1: 不规则动词字典精准映射 】
                                      (went -> go, had -> have, came -> come)
                                                  │ (未命中)
                                                  ▼
                                    【 步骤 2: 复数 / 第三人称单数还原 】
                                      (-ies -> -y, -ves -> -f/fe, -es, -s)
                                                  │ (未命中)
                                                  ▼
                                    【 步骤 3: 过去式与过去分词还原 】
                                      (-ied -> -y, 双写辅音还原, -ed, -d)
                                                  │ (未命中)
                                                  ▼
                                    【 步骤 4: 现在分词 / 动名词还原 】
                                      (-ying -> -ie, 双写辅音还原, -ing, +e 还原)
                                                  │ (未命中)
                                                  ▼
                                    【 步骤 5: 副词与派生形容词还原 】
                                      (-ily -> -y, -ly)
                                                  │
                                                  ▼
                                        [ 返回词典原型 (Lemma) ]
```

### 3.2 还原算法核心实现 (`src/utils/lemmatizer.ts`)

```typescript
// 不规则动词哈希映射表 (精选高频核心词)
const IRREGULAR_VERBS: Record<string, string> = {
  went: 'go', gone: 'go', was: 'be', were: 'be', been: 'be',
  had: 'have', has: 'have', did: 'do', done: 'do', said: 'say',
  made: 'make', came: 'come', took: 'take', saw: 'see', knew: 'know',
  got: 'get', gave: 'give', found: 'find', thought: 'think', told: 'tell',
  became: 'become', left: 'leave', felt: 'feel', brought: 'bring', begun: 'begin',
  began: 'begin', kept: 'keep', held: 'hold', wrote: 'write', written: 'write',
  stood: 'stand', heard: 'hear', meant: 'mean', met: 'meet', ran: 'run',
  paid: 'pay', sat: 'sit', spoken: 'speak', spoke: 'speak', lay: 'lie',
  led: 'lead', read: 'read', grown: 'grow', grew: 'grow', lost: 'lose'
};

export function lemmatizeWord(word: string): string[] {
  const w = word.toLowerCase().trim();
  const candidates = new Set<string>([w]);

  // 1. 不规则动词命中
  if (IRREGULAR_VERBS[w]) {
    candidates.add(IRREGULAR_VERBS[w]);
  }

  // 2. 复数 / 三单 (-ies, -es, -s)
  if (w.endsWith('ies') && w.length > 4) candidates.add(w.slice(0, -3) + 'y');
  if (w.endsWith('ves') && w.length > 4) {
    candidates.add(w.slice(0, -3) + 'f');
    candidates.add(w.slice(0, -3) + 'fe');
  }
  if (w.endsWith('es') && w.length > 3) candidates.add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) candidates.add(w.slice(0, -1));

  // 3. 过去式 / 分词 (-ed, -d)
  if (w.endsWith('ied') && w.length > 4) candidates.add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed') && w.length > 4) {
    candidates.add(w.slice(0, -2));    // walked -> walk
    candidates.add(w.slice(0, -1));    // cradled -> cradle
    // 双写辅音还原 (stopped -> stop, planned -> plan)
    if (/([bdfgmnprt])\1ed$/.test(w)) {
      candidates.add(w.slice(0, -3));
    }
  }

  // 4. 进行时 (-ing)
  if (w.endsWith('ing') && w.length > 5) {
    candidates.add(w.slice(0, -3));          // asking -> ask
    candidates.add(w.slice(0, -3) + 'e');    // making -> make
    if (/([bdfgmnprt])\1ing$/.test(w)) {
      candidates.add(w.slice(0, -4));        // running -> run
    }
    if (w.endsWith('ying')) {
      candidates.add(w.slice(0, -4) + 'ie'); // dying -> die
    }
  }

  // 5. 副词 (-ly)
  if (w.endsWith('ily') && w.length > 4) candidates.add(w.slice(0, -3) + 'y');
  if (w.endsWith('ly') && w.length > 4) candidates.add(w.slice(0, -2));

  return Array.from(candidates);
}
```

### 3.3 四级分层离线检索体系
离线点击单词时，系统依次在以下 4 级本地缓存中穿透检索：
1. **本地临时会话缓存 (`localTranslationCache`)**；
2. **我的生词本 (`vocabularyList`)**；
3. **候机室预载词库 (`offlineWordCache` in IndexedDB)**；
4. **内置核心高频词典 (`lookupOfflineWord`)**。

只要任意候选形态命中，立即完成渲染；同时**严格短路网络请求**，严禁触发远程 API，彻底杜绝转圈死锁。

---

## 4. 候机室“段落译文 + 重点生词”双预载架构

在登机起飞前（或处于优质 Wi-Fi 时），用户轻点【✈️ 预载后续内容】：
1. **长段落分片并发翻译**：
   - 提取后续 30 个段落，将超长段落按标点切分为小于 250 字符的子句；
   - 并发调用翻译接口并将结果保序拼接，写入 IndexedDB 的 `paragraphTranslations` 表；
2. **重点生词离线提取**：
   - 过滤 HTML 标记与英文停用词表（Stop Words: `the, a, is, was, in, on, of...`）；
   - 批量拉取生词音标与中文释义，写入 IndexedDB 的 `offlineWordCache` 表；
3. 进入飞行模式后，点击译文直接从本地秒级展开，无任何网络延迟。
