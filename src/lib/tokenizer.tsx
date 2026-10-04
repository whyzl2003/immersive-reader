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
