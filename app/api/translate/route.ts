export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

// 翻译结果接口定义
interface TranslateResponse {
  success: boolean;
  word: string;
  translation: string;
  audioUrl: string;
  phonetic?: string;
  source?: string;
}

// 内存级 LRU 简易缓存，减少重复请求
const translationCache = new Map<string, { translation: string; phonetic?: string }>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawWord = searchParams.get("word")?.trim();

  if (!rawWord) {
    return NextResponse.json(
      { success: false, error: "缺少查询单词参数 word" },
      { status: 400 }
    );
  }

  // 清洗单词，去除首尾符号并转为小写
  const cleanWord = rawWord.replace(/^['"“‘—\-]+|['"”’—\-]+$/g, "").trim();
  const lowerWord = cleanWord.toLowerCase();

  // 判断是否包含中文
  const isChinese = /[\u4e00-\u9fa5]/.test(cleanWord);
  const lang = isChinese ? "zh" : "eng";
  const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanWord)}&le=${lang}`;

  // 1. 优先命中服务端内存缓存
  if (translationCache.has(lowerWord)) {
    const cached = translationCache.get(lowerWord)!;
    return NextResponse.json({
      success: true,
      word: cleanWord,
      translation: cached.translation,
      phonetic: cached.phonetic,
      audioUrl,
      source: "cache",
    } satisfies TranslateResponse);
  }

  try {
    // 2. 第一优先：请求有道词典 Suggest 接口（响应快、稳定性高、无 CORS 拦截）
    const youdaoSuggestUrl = `https://dict.youdao.com/suggest?num=1&doctype=json&q=${encodeURIComponent(cleanWord)}`;
    const res = await fetch(youdaoSuggestUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      next: { revalidate: 86400 }, // 缓存 24 小时
    });

    if (res.ok) {
      const data = await res.json();
      const entries = data?.data?.entries;
      if (Array.isArray(entries) && entries.length > 0 && entries[0]?.explain) {
        const translation = entries[0].explain;
        translationCache.set(lowerWord, { translation });
        return NextResponse.json({
          success: true,
          word: cleanWord,
          translation,
          audioUrl,
          source: "youdao",
        } satisfies TranslateResponse);
      }
    }

    // 3. 第二降级兜底：请求谷歌翻译单字接口
    const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(cleanWord)}`;
    const googleRes = await fetch(googleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    if (googleRes.ok) {
      const gData = await googleRes.json();
      if (gData && Array.isArray(gData[0])) {
        const transResult = gData[0]
          .map((item: unknown[]) => (item && item[0] ? String(item[0]) : ""))
          .join("")
          .trim();
        if (transResult) {
          translationCache.set(lowerWord, { translation: transResult });
          return NextResponse.json({
            success: true,
            word: cleanWord,
            translation: transResult,
            audioUrl,
            source: "google",
          } satisfies TranslateResponse);
        }
      }
    }

    // 若均无明确结果，返回未找到释义
    return NextResponse.json({
      success: true,
      word: cleanWord,
      translation: "暂未查询到该词条释义",
      audioUrl,
      source: "fallback",
    } satisfies TranslateResponse);
  } catch (error) {
    console.error("服务端翻译查询出错:", error);
    return NextResponse.json(
      {
        success: false,
        word: cleanWord,
        translation: "查询释义失败，请稍后重试",
        audioUrl,
        error: String(error),
      },
      { status: 500 }
    );
  }
}
