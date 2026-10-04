export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

// 翻译结果接口
interface TranslateTextResponse {
  success: boolean;
  text: string;
  translation: string;
  source?: string;
  error?: string;
}

// 内存 LRU 级缓存，减少对第三方 API 的重复长文本请求
const textTranslationCache = new Map<string, string>();

/**
 * 尝试通过有道开放翻译接口进行长句/整段翻译
 */
async function translateViaYoudao(text: string): Promise<string | null> {
  try {
    const res = await fetch("https://aidemo.youdao.com/trans", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body: new URLSearchParams({
        q: text,
        from: "Auto",
        to: "zh-CHS",
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.translation) && data.translation.length > 0) {
      return data.translation.join("\n").trim();
    }
  } catch (e) {
    console.error("有道长句翻译失败，准备降级备选接口:", e);
  }
  return null;
}

/**
 * 尝试通过 MyMemory API 进行整句/段落翻译（二级备选）
 */
async function translateViaMyMemory(text: string): Promise<string | null> {
  try {
    // 截取前 800 字符防止超过 MyMemory 单次限制
    const safeText = text.slice(0, 800);
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      safeText
    )}&langpair=en|zh-CN`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (
      data?.responseStatus === 200 &&
      data?.responseData?.translatedText &&
      !data.responseData.translatedText.startsWith("MYMEMORY WARNING:")
    ) {
      return String(data.responseData.translatedText).trim();
    }
  } catch (e) {
    console.error("MyMemory 翻译失败:", e);
  }
  return null;
}

/**
 * 尝试通过谷歌翻译 Web API（三级备选）
 */
async function translateViaGoogle(text: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(
      text
    )}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const fullText = data[0]
        .map((item: unknown[]) => (item && item[0] ? String(item[0]) : ""))
        .join("")
        .trim();
      if (fullText) return fullText;
    }
  } catch (e) {
    console.error("Google 翻译失败:", e);
  }
  return null;
}

// 统一的翻译处理主逻辑
async function handleTranslation(text: string): Promise<NextResponse<TranslateTextResponse>> {
  const cleanText = text.trim();
  if (!cleanText) {
    return NextResponse.json(
      {
        success: false,
        text: "",
        translation: "",
        error: "缺少需要翻译的文本内容",
      },
      { status: 400 }
    );
  }

  // 1. 优先读取内存缓存
  const cacheKey = cleanText.toLowerCase();
  if (textTranslationCache.has(cacheKey)) {
    return NextResponse.json({
      success: true,
      text: cleanText,
      translation: textTranslationCache.get(cacheKey)!,
      source: "cache",
    });
  }

  // 2. 依次尝试高可用翻译服务源
  // 第一通道：有道 AI 翻译（语义地道、针对中文优化、无需 Key）
  let translation = await translateViaYoudao(cleanText);
  let source = "youdao";

  // 第二通道：MyMemory 全球翻译库
  if (!translation) {
    translation = await translateViaMyMemory(cleanText);
    source = "mymemory";
  }

  // 第三通道：Google 翻译 Web 接口
  if (!translation) {
    translation = await translateViaGoogle(cleanText);
    source = "google";
  }

  // 若成功获取翻译
  if (translation) {
    // 写入内存缓存（保留最新 300 条）
    if (textTranslationCache.size > 300) {
      const firstKey = textTranslationCache.keys().next().value;
      if (firstKey) textTranslationCache.delete(firstKey);
    }
    textTranslationCache.set(cacheKey, translation);

    return NextResponse.json({
      success: true,
      text: cleanText,
      translation,
      source,
    });
  }

  // 容错兜底：所有通道均失败时的优雅提示
  return NextResponse.json(
    {
      success: false,
      text: cleanText,
      translation: "翻译获取失败，请重试",
      error: "翻译通道网络暂时不可达",
    },
    { status: 500 }
  );
}

// POST 处理长文本段落
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = body?.text || "";
    return await handleTranslation(text);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        text: "",
        translation: "翻译获取失败，请重试",
        error: String(error),
      },
      { status: 400 }
    );
  }
}

// GET 兼容 URL 参数请求
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get("text") || searchParams.get("q") || "";
  return await handleTranslation(text);
}
