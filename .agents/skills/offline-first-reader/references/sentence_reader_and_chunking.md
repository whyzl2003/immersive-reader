# 句读精读台与启发式意群断句指南 (Sentence Reader & Chunking Guide)

本参考文档规定了在纯前端阅读器中，如何将大段落文本精准解构至单句微观粒度，实现**长难句意群切片（Chunking）**、**主干语义高亮（Core Semantic Highlight）**以及**全键盘无鼠标沉浸式句读工坊**的标准架构。

---

## 1. 认知理念：从“走马观花”到“微观精研”

传统电子阅读器以整段为最小视觉单位，读者在面对长难句时极易发生“扫读忽略”或“跳读断层”。**句读精读台**将整段正文解构为离散的自然句流，在保留上下文语境的同时，为单句提供独立的声学复读、意群断句、回声跟读与听写研磨工坊。

---

## 2. 正规自然分句器 (Robust Sentence Splitter)

### 痛点根因
简单的按标点 `/[.!?]/` 分割，会误将英语中常见的人名头衔、缩写、网址与小数点粗暴切断（如 `Mr. Smith`, `Dr. Who`, `e.g.`, `U.S.A.`）。

### 正规分句实现 (`src/utils/chunking.ts`)
采用负向先行断言（Negative Lookahead）与缩写白名单保护：

```typescript
// 英文常见缩写白名单
const ABBREVIATIONS = [
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr',
  'vs', 'etc', 'e.g', 'i.e', 'u.s', 'u.k', 'fig'
];

export function splitIntoSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  // 1. 临时占位保护缩写中的点号
  let protectedText = text;
  ABBREVIATIONS.forEach(abbr => {
    const reg = new RegExp(`\\b(${abbr})\\.(\\s*)`, 'gi');
    protectedText = protectedText.replace(reg, '$1__DOT__$2');
  });

  // 2. 保护数字中的小数点 (如 3.14)
  protectedText = protectedText.replace(/(\d+)\.(\d+)/g, '$1__DOT__$2');

  // 3. 执行正规分句切分 (断言跟随大写字母或引号)
  const sentenceRegex = /(?<=[.!?]["'”]?)\s+(?=[A-Z"“])/g;
  const rawSentences = protectedText.split(sentenceRegex);

  // 4. 还原占位符并清洗空白
  return rawSentences
    .map(s => s.replace(/__DOT__/g, '.').trim())
    .filter(s => s.length > 0);
}
```

---

## 3. 启发式意群断句算法 (Heuristic Chunking)

### 算法目标
英语母语者阅读时是以“意群（Sense Group）”为节奏单位进行心智解码的。意群划分算法旨在长句中自动识别介词短语、连词引导从句、不定式结构及逻辑停顿标点，自然插入断句标记。

### 规则分类与切片状态机
意群切片按以下词类边界执行划分：
1. **引导词/连词**：`that, which, who, whom, whose, when, where, why, because, although, since, while, if, unless`；
2. **介词与介词短语**：`in, on, at, by, for, with, about, into, through, during, before, after, without`；
3. **动词不定式**：`to + 动词原型`；
4. **标点与连接符**：逗号、分号、冒号、破折号；
5. **并列连词**：`and, but, or, yet, so`。

```typescript
export interface ChunkToken {
  text: string;
  isCore?: boolean; // 是否为主干核心词
}

export function chunkSentence(sentence: string): ChunkToken[][] {
  const words = sentence.split(/\s+/);
  const chunks: ChunkToken[][] = [];
  let currentChunk: ChunkToken[] = [];

  const CHUNK_STARTERS = new Set([
    'in', 'on', 'at', 'with', 'by', 'for', 'about', 'into', 'through', 'during',
    'that', 'which', 'who', 'whose', 'when', 'where', 'why', 'because', 'although',
    'if', 'and', 'but', 'or', 'so', 'to'
  ]);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');

    // 遇到意群起始词或标点，且当前块已有一定长度 (>= 3 词)，执行断块
    const isPunctuationBreak = /[,;:\-—]/.test(words[i - 1] || '');
    const isStarter = CHUNK_STARTERS.has(cleanWord);

    if ((isStarter || isPunctuationBreak) && currentChunk.length >= 3) {
      chunks.push(currentChunk);
      currentChunk = [];
    }

    currentChunk.push({ text: word });
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
```

### UI 排版呈现
在前端界面中，不同意群块之间通过**微缩间距与半透明斜线**（`text-muted-foreground/40 font-light mx-1.5`）柔和隔开，营造自然的节奏呼吸感。

---

## 4. 主干语义提取 (Core Semantic Extraction)

长难句的修饰成分（定语从句、状语从句、同位语）往往会分散读者对命题主干的注意力。
- **启发式识别主谓宾**：
  - 提取句首第一个核心名词性短语作为主语候选；
  - 匹配紧随其后的时态助动词或核心谓语动词；
  - 在意群模式下为这部分主干单词附加 `font-semibold text-amber-900 dark:text-amber-200 bg-amber-50/60 dark:bg-amber-950/30 rounded px-0.5` 专属高亮；
  - 帮助读者一眼看穿全句骨架，极大降低复杂句理解心智开销。

---

## 5. 精英键盘快捷键全无鼠导航

精读工坊作为高频语言训练场，必须支持纯键盘盲操交互，消除反复移动鼠标的注意力损耗：

| 快捷键 | 触发动作 | 工程实现要点 |
| :--- | :--- | :--- |
| <kbd>Space</kbd> | 播放 / 暂停当前句原音 | 阻止默认页面滚动冒泡 (`e.preventDefault()`) |
| <kbd>R</kbd> | 开启 / 停止口语发音录音评测 | 自动触发麦克风授权与声学/ASR双引擎管线 |
| <kbd>J</kbd> / <kbd>→</kbd> | 切换至下一句 | `sentenceIndex + 1`，自动预载下一句 TTS |
| <kbd>K</kbd> / <kbd>←</kbd> | 切换至上一句 | `sentenceIndex - 1`，平滑焦点迁移 |
| <kbd>D</kbd> | 快速进入 / 退出单句听打模式 | 自动清空输入框并聚焦文本域 |
| <kbd>Esc</kbd> | 关闭精读台返回整书阅读 | 自动销毁未完成的录音与音频管道 |
