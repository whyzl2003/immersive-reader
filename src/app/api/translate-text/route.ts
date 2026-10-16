export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

// 翻译响应接口
interface TranslateTextResponse {
  success: boolean;
  text: string;
  translation: string;
  source?: string;
  error?: string;
}

// 内存 LRU 级缓存
const textTranslationCache = new Map<string, string>();

/**
 * 将长文本按标点与句子边界智能切分为小于等于 maxChunkSize（默认250字符）的短句块
 */
function splitTextIntoChunks(text: string, maxChunkSize = 250): string[] {
  const clean = text.trim();
  if (!clean || clean.length <= maxChunkSize) {
    return clean ? [clean] : [];
  }

  // 1. 优先按句末标点（. ! ? 及换行）切分句子
  const rawSentences = clean.split(/(?<=[.!?\n])\s+/).filter((s) => s.trim().length > 0);

  // 2. 防御性处理：对极长单句（超过 maxChunkSize）按逗号分号或空格进行二次安全拆分
  const safeSentences: string[] = [];
  for (const s of rawSentences) {
    if (s.length <= maxChunkSize) {
      safeSentences.push(s);
    } else {
      const subClauses = s.split(/(?<=[,;:])\s+/).filter(Boolean);
      for (const clause of subClauses) {
        if (clause.length <= maxChunkSize) {
          safeSentences.push(clause);
        } else {
          let remaining = clause;
          while (remaining.length > 0) {
            if (remaining.length <= maxChunkSize) {
              safeSentences.push(remaining);
              break;
            }
            let sliceIndex = remaining.lastIndexOf(" ", maxChunkSize);
            if (sliceIndex <= 0) sliceIndex = maxChunkSize;
            safeSentences.push(remaining.slice(0, sliceIndex).trim());
            remaining = remaining.slice(sliceIndex).trim();
          }
        }
      }
    }
  }

  // 3. 贪心合并为尺寸在 250 字符以内的 chunks，减少请求数并保障上下文完整
  const chunks: string[] = [];
  let currentChunk = "";

  for (const s of safeSentences) {
    if (!currentChunk) {
      currentChunk = s;
    } else if ((currentChunk + " " + s).length <= maxChunkSize) {
      currentChunk = currentChunk + " " + s;
    } else {
      chunks.push(currentChunk.trim());
      currentChunk = s;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * 主通道：谷歌翻译 POST Form-UrlEncoded 方式
 * 彻底规避 GET URL 长度限制与机房拦截
 */
async function translateChunkViaGoogle(chunk: string): Promise<string> {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    body: `q=${encodeURIComponent(chunk)}`,
  });

  if (!res.ok) {
    throw new Error(`Google 翻译接口 HTTP 状态码: ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    throw new Error("Google 翻译接口返回非 JSON 内容（可能触发验证拦截）");
  }

  const data = await res.json();
  if (!data || !Array.isArray(data[0])) {
    throw new Error("Google 翻译接口数据结构缺少译文分段");
  }

  const translated = data[0].map((item: any) => (item && item[0] ? item[0] : "")).join("");
  const cleanResult = translated.trim();
  if (!cleanResult) {
    throw new Error("Google 译文解析结果为空");
  }

  return cleanResult;
}

/**
 * 降级通道一：有道开放翻译接口（对国内网络友好）
 */
async function translateChunkViaYoudao(chunk: string): Promise<string | null> {
  try {
    const res = await fetch("https://aidemo.youdao.com/trans", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      body: new URLSearchParams({
        q: chunk,
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
    console.warn("有道分块翻译失败:", e);
  }
  return null;
}

/**
 * 降级通道二：MyMemory 全球翻译库（单块 <= 250 字符，完全在其 500 字符限制内）
 */
async function translateChunkViaMyMemory(chunk: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      chunk
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
    console.warn("MyMemory 分块翻译失败:", e);
  }
  return null;
}

/**
 * 对单个文本块（<= 250 字符）执行完整降级翻译流水线：Google -> 有道 -> MyMemory
 */
async function translateSingleChunk(chunk: string): Promise<string> {
  const cleanChunk = chunk.trim();
  if (!cleanChunk) return "";

  // 1. 优先尝试 Google POST 翻译
  try {
    return await translateChunkViaGoogle(cleanChunk);
  } catch (gErr) {
    console.warn(
      `[长段落分块翻译] Google 失败，尝试有道备选: ${
        gErr instanceof Error ? gErr.message : String(gErr)
      }`
    );
  }

  // 2. 降级尝试有道翻译
  try {
    const youdaoResult = await translateChunkViaYoudao(cleanChunk);
    if (youdaoResult) return youdaoResult;
  } catch (yErr) {
    console.warn(
      `[长段落分块翻译] 有道备选失败，尝试 MyMemory 备选: ${
        yErr instanceof Error ? yErr.message : String(yErr)
      }`
    );
  }

  // 3. 降级尝试 MyMemory
  try {
    const myMemoryResult = await translateChunkViaMyMemory(cleanChunk);
    if (myMemoryResult) return myMemoryResult;
  } catch (mErr) {
    console.warn(
      `[长段落分块翻译] MyMemory 备选失败: ${
        mErr instanceof Error ? mErr.message : String(mErr)
      }`
    );
  }

  throw new Error(`分片短句翻译在全部通道均失败: "${cleanChunk.slice(0, 30)}..."`);
}

/**
 * POST 处理长文本段落翻译主路由
 */
export async function POST(req: NextRequest) {
  let cleanText = "";
  try {
    const body = await req.json().catch(() => ({}));
    const rawText = body?.text || "";
    cleanText = typeof rawText === "string" ? rawText.trim() : "";

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

    // 1. 优先命中内存缓存
    const cacheKey = cleanText.toLowerCase();
    if (textTranslationCache.has(cacheKey)) {
      return NextResponse.json({
        success: true,
        text: cleanText,
        translation: textTranslationCache.get(cacheKey)!,
        source: "cache",
      });
    }

    // 2. 智能分片：若文本长度 > 250，切分为多个短句块（<= 250 字符）；若 <= 250，作为单个块
    const chunks = splitTextIntoChunks(cleanText, 250);

    // 3. 并发翻译所有分片，每块均享有 Google -> 有道 -> MyMemory 三级容错
    const translatedChunks = await Promise.all(
      chunks.map((chunk) => translateSingleChunk(chunk))
    );

    // 4. 按原顺序组装翻译文本
    const finalTranslation = translatedChunks.filter(Boolean).join("");
    if (!finalTranslation) {
      throw new Error("翻译合并结果为空");
    }

    // 5. 写入内存缓存（保留最新 300 条）
    if (textTranslationCache.size > 300) {
      const firstKey = textTranslationCache.keys().next().value;
      if (firstKey) textTranslationCache.delete(firstKey);
    }
    textTranslationCache.set(cacheKey, finalTranslation);

    return NextResponse.json({
      success: true,
      text: cleanText,
      translation: finalTranslation,
      source: "multi-chunk-pipeline",
    });
  } catch (error) {
    // 容错拦截：在服务端控制台打印错误，并向前端返回 500 状态码与包含明确原因的错误信息
    console.error("段落翻译解析或请求发生内部错误:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        text: cleanText,
        translation: `翻译获取失败，请重试 (${errorMsg})`,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}

/**
 * GET 保持兼容性（从 URL 查询参数获取 text）
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const text = searchParams.get("text") || searchParams.get("q") || "";
    const mockRequest = new NextRequest(req.url, {
      method: "POST",
      body: JSON.stringify({ text }),
      headers: { "Content-Type": "application/json" },
    });
    return await POST(mockRequest);
  } catch (error) {
    console.error("GET 翻译请求异常:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        text: "",
        translation: `翻译获取失败，请重试 (${errorMsg})`,
        error: errorMsg,
      },
      { status: 500 }
    );
  }
}
