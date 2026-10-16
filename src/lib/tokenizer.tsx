import * as React from "react";
import { InteractiveWord } from "@/src/components/InteractiveWord";

/**
 * 文本解析分词函数 (Tokenizer)
 * 将纯文本段落安全地拆解，把其中的单词包裹进 <InteractiveWord> 组件，
 * 同时 100% 原样保留所有的空格、标点符号与原始排版。
 *
 * @param paragraphText 待分词的段落原文
 * @param context 所在段落上下文语境
 * @param keyPrefix 唯一 key 前缀，避免 React 渲染冲突
 * @returns ReactNode 数组
 */
export function renderTokenizedParagraph(
  paragraphText: string,
  context: string,
  keyPrefix: string | number,
  paragraphIndex?: number
): React.ReactNode[] {
  if (!paragraphText) return [];

  const resolvedParaIndex =
    typeof paragraphIndex === "number"
      ? paragraphIndex
      : typeof keyPrefix === "number"
      ? keyPrefix
      : undefined;

  // 匹配连续英文字符/数字/连字符，或中文字符
  const tokenRegex = /([a-zA-Z0-9'’-]+|[\u4e00-\u9fa5])/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIndex = 0;

  while ((match = tokenRegex.exec(paragraphText)) !== null) {
    const matchIndex = match.index;
    const token = match[0];

    // 1. 处理匹配前的非单词内容（空格、标点、特殊符号等），原样保留
    if (matchIndex > lastIndex) {
      nodes.push(
        <React.Fragment key={`${keyPrefix}-punct-${lastIndex}`}>
          {paragraphText.substring(lastIndex, matchIndex)}
        </React.Fragment>
      );
    }

    // 2. 清洗单词：剔除首尾的连字符、引号等附着符号，用于真实查词与发音
    const cleanWord = token.replace(/^[\s'’"—-]+|[\s'’"—-]+$/g, "");

    // 判断 cleanWord 是否包含有效字符（字母、数字或汉字）
    const isValidWord = /[a-zA-Z\u4e00-\u9fa5]/.test(cleanWord);

    if (isValidWord) {
      nodes.push(
        <InteractiveWord
          key={`${keyPrefix}-w-${tokenIndex}-${cleanWord}`}
          word={cleanWord}
          displayToken={token}
          context={context}
          paragraphIndex={resolvedParaIndex}
        />
      );
    } else {
      // 纯标点或纯符号，原样输出
      nodes.push(
        <React.Fragment key={`${keyPrefix}-raw-${tokenIndex}`}>
          {token}
        </React.Fragment>
      );
    }

    tokenIndex++;
    lastIndex = tokenRegex.lastIndex;
  }

  // 3. 处理段落尾部剩余的非单词字符
  if (lastIndex < paragraphText.length) {
    nodes.push(
      <React.Fragment key={`${keyPrefix}-tail`}>
        {paragraphText.substring(lastIndex)}
      </React.Fragment>
    );
  }

  return nodes;
}

// 常见从句引导词（在句中引导新意群时前插斜杠）
const CLAUSE_INTRODUCERS = new Set([
  "that",
  "which",
  "who",
  "whom",
  "whose",
  "where",
  "when",
  "because",
  "although",
  "though",
  "if",
  "unless",
  "until",
  "while",
  "whether",
  "since",
  "as",
]);

// 常见介词（在长句中构成介词短语意群边界时前插斜杠）
const PREPOSITION_STARTERS = new Set([
  "in",
  "on",
  "at",
  "from",
  "with",
  "without",
  "through",
  "into",
  "upon",
  "between",
  "among",
  "against",
  "during",
  "despite",
  "beyond",
  "within",
  "towards",
  "toward",
  "beneath",
  "under",
  "above",
  "across",
  "behind",
  "before",
  "after",
  "about",
  "for",
  "by",
  "to",
]);

/**
 * 渲染古铜金意群斜杠标记
 */
function renderSenseSlash(key: string): React.ReactNode {
  return (
    <span
      key={key}
      className="text-amber-600/80 dark:text-amber-400/85 font-sans font-bold mx-1.5 select-none"
      title="意群停顿与换气点"
      aria-hidden="true"
    >
      /
    </span>
  );
}

/**
 * 在单个文本片段内部进行单词级 <InteractiveWord> 包裹，并在从句引导词、长介词短语及句中标点后插入意群斜杠
 */
function renderSegmentWithChunks(
  segmentText: string,
  context: string,
  keyPrefix: string,
  resolvedParaIndex: number | undefined,
  enableInternalSlashes: boolean
): React.ReactNode[] {
  if (!segmentText) return [];

  const tokenRegex = /([a-zA-Z0-9'’-]+|[\u4e00-\u9fa5])/g;
  const matches: { index: number; end: number; token: string; cleanWord: string }[] = [];
  let m: RegExpExecArray | null;

  while ((m = tokenRegex.exec(segmentText)) !== null) {
    const token = m[0];
    const cleanWord = token.replace(/^[\s'’"—-]+|[\s'’"—-]+$/g, "");
    matches.push({
      index: m.index,
      end: tokenRegex.lastIndex,
      token,
      cleanWord,
    });
  }

  if (matches.length === 0) {
    return [<React.Fragment key={`${keyPrefix}-empty`}>{segmentText}</React.Fragment>];
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let wordsSinceLastPause = 0;

  for (let i = 0; i < matches.length; i++) {
    const item = matches[i];
    const lowerWord = item.cleanWord.toLowerCase();
    const nextItem = matches[i + 1];
    const nextLower = nextItem ? nextItem.cleanWord.toLowerCase() : "";
    const remainingWords = matches.length - i;

    // 1. 处理当前单词之前的间隔文本（空格或标点）
    let hadPunctSlash = false;
    if (item.index > lastIndex) {
      const gap = segmentText.substring(lastIndex, item.index);
      // 检查间隔中是否包含句中逗号、分号、冒号或破折号
      const punctMatch = enableInternalSlashes
        ? gap.match(/^([\s\S]*?(?:[,;:]|—|–|--))(\s*)$/)
        : null;

      if (punctMatch && i > 0) {
        nodes.push(
          <React.Fragment key={`${keyPrefix}-gap-pre-${i}`}>
            {punctMatch[1]}
          </React.Fragment>
        );
        nodes.push(renderSenseSlash(`${keyPrefix}-punct-slash-${i}`));
        if (punctMatch[2]) {
          nodes.push(
            <React.Fragment key={`${keyPrefix}-gap-post-${i}`}>
              {punctMatch[2]}
            </React.Fragment>
          );
        }
        wordsSinceLastPause = 0;
        hadPunctSlash = true;
      } else {
        nodes.push(
          <React.Fragment key={`${keyPrefix}-gap-${i}`}>{gap}</React.Fragment>
        );
      }
    }

    // 2. 判断是否需要在当前词之前插入意群斜杠（从句引导词或长介词短语边界）
    if (enableInternalSlashes && !hadPunctSlash && i > 0) {
      // 避免把 "so that" / "even if" / "even though" / "as if" / "as though" 拆断在第二个词前
      const prevLower = matches[i - 1].cleanWord.toLowerCase();
      const isSecondWordOfCompound =
        (lowerWord === "that" && (prevLower === "so" || prevLower === "order")) ||
        ((lowerWord === "if" || lowerWord === "though") &&
          (prevLower === "as" || prevLower === "even"));

      if (!isSecondWordOfCompound) {
        const isCompoundIntroducerStart =
          (lowerWord === "so" && nextLower === "that") ||
          (lowerWord === "even" && (nextLower === "if" || nextLower === "though")) ||
          (lowerWord === "as" && (nextLower === "if" || nextLower === "though"));

        const isClauseIntroducer =
          isCompoundIntroducerStart || CLAUSE_INTRODUCERS.has(lowerWord);

        const isLongPrepPhrase =
          PREPOSITION_STARTERS.has(lowerWord) &&
          wordsSinceLastPause >= 3 &&
          remainingWords >= 3;

        if (
          (isClauseIntroducer && wordsSinceLastPause >= 2 && remainingWords >= 2) ||
          isLongPrepPhrase
        ) {
          nodes.push(renderSenseSlash(`${keyPrefix}-intro-slash-${i}`));
          wordsSinceLastPause = 0;
        }
      }
    }

    // 3. 渲染包裹 <InteractiveWord> 的单词本体
    const isValidWord = /[a-zA-Z\u4e00-\u9fa5]/.test(item.cleanWord);
    if (isValidWord) {
      nodes.push(
        <InteractiveWord
          key={`${keyPrefix}-w-${i}-${item.cleanWord}`}
          word={item.cleanWord}
          displayToken={item.token}
          context={context}
          paragraphIndex={resolvedParaIndex}
        />
      );
      wordsSinceLastPause++;
    } else {
      nodes.push(
        <React.Fragment key={`${keyPrefix}-raw-${i}`}>
          {item.token}
        </React.Fragment>
      );
    }

    lastIndex = item.end;
  }

  // 4. 处理片段尾部剩余字符
  if (lastIndex < segmentText.length) {
    nodes.push(
      <React.Fragment key={`${keyPrefix}-tail`}>
        {segmentText.substring(lastIndex)}
      </React.Fragment>
    );
  }

  return nodes;
}

/**
 * ✂️ 意群斜杠断句与主干透视分词渲染器
 * - 自动识别成对破折号（— ... — / – ... –）与双逗号短插入语（如 `, even standing on tiptoes,`、`, too,`），
 *   将其设为 `opacity-65 italic` 弱化显示，凸显句子主谓宾主干；
 * - 在从句引导词、长介词短语及逗号/分号/破折号停顿处插入古铜金 ` / ` 意群标记；
 * - 句中所有英文单词 100% 保持 `<InteractiveWord>` 包裹，点击查词与词源不受任何影响。
 */
export function renderChunkedSentence(
  sentenceText: string,
  context: string,
  keyPrefix: string | number,
  paragraphIndex?: number
): React.ReactNode[] {
  if (!sentenceText) return [];

  const resolvedParaIndex =
    typeof paragraphIndex === "number"
      ? paragraphIndex
      : typeof keyPrefix === "number"
      ? keyPrefix
      : undefined;

  // 匹配成对破折号插入语，或双逗号之间的短插入语（1~7 个词，且后跟小写字母继续主句或常见插入语）
  const parentheticalRegex =
    /((?:—|–|--)\s*[^—–-]+?\s*(?:—|–|--)|,\s*(?:even\b|still\b|also\b|too\b|however\b|therefore\b|moreover\b|nevertheless\b|indeed\b|perhaps\b|maybe\b|of course\b|in fact\b|for example\b|for instance\b|after all\b|as it were\b|so to speak\b|in other words\b|at least\b|at first\b|at last\b|on the other hand\b|by the way\b|to be sure\b|no doubt\b|I think\b|I suppose\b|you see\b|you know\b|as you know\b|though\b|although\b|[a-zA-Z]+ing\b|[a-zA-Z]+ed\b|with\b|without\b|in\b|on\b|at\b|by\b|for\b|from\b|like\b|unlike\b)[^,.;:!?]{0,48},(?=\s+[a-zA-Z])|,\s*[a-zA-Z'’-]+(?:\s+[a-zA-Z'’-]+){0,3}\s*,(?=\s+(?!and\b|or\b|but\b)[a-z]))/g;

  const segments: { text: string; isParenthetical: boolean }[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = parentheticalRegex.exec(sentenceText)) !== null) {
    if (match.index > lastIdx) {
      segments.push({
        text: sentenceText.substring(lastIdx, match.index),
        isParenthetical: false,
      });
    }
    segments.push({
      text: match[0],
      isParenthetical: true,
    });
    lastIdx = parentheticalRegex.lastIndex;
  }

  if (lastIdx < sentenceText.length) {
    segments.push({
      text: sentenceText.substring(lastIdx),
      isParenthetical: false,
    });
  }

  const output: React.ReactNode[] = [];

  segments.forEach((seg, sIdx) => {
    const segKey = `${keyPrefix}-seg-${sIdx}`;
    const hasMoreSegments = sIdx < segments.length - 1;

    if (seg.isParenthetical) {
      output.push(
        <span
          key={segKey}
          className="opacity-65 italic transition-opacity duration-200 hover:opacity-95"
          title="插入语 / 修饰补充成分（已弱化以凸显句子主干）"
        >
          {renderSegmentWithChunks(
            seg.text,
            context,
            segKey,
            resolvedParaIndex,
            false
          )}
        </span>
      );
      if (hasMoreSegments) {
        output.push(renderSenseSlash(`${segKey}-after-paren`));
      }
    } else {
      output.push(
        ...renderSegmentWithChunks(
          seg.text,
          context,
          segKey,
          resolvedParaIndex,
          true
        )
      );
    }
  });

  return output;
}

