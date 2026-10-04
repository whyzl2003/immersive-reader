export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { ROOTS_DICTIONARY } from "@/data/rootsDictionary";

export type { WordAnalysis } from "@/data/rootsDictionary";

/**
 * 本地静态词根词缀解析接口 (Edge Runtime 内存直读，无 fs/path 依赖，完全兼容 Cloudflare Edge)
 * 查询成功返回词源 JSON 对象 { root: string, affixes: string, note: string }，未匹配则返回 null
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawWord = searchParams.get("word")?.trim();

  if (!rawWord) {
    return NextResponse.json(null);
  }

  // 1. 小写化并清洗首尾任何标点符号与空白字符
  const cleanWord = rawWord.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

  if (!cleanWord) {
    return NextResponse.json(null);
  }

  // 2. 本地静态数据精准内存匹配
  if (ROOTS_DICTIONARY[cleanWord]) {
    return NextResponse.json(ROOTS_DICTIONARY[cleanWord]);
  }

  // 3. 基础形态回退尝试（例如去除复数 -s 或 -es，尝试匹配原形）
  if (cleanWord.endsWith("s") && ROOTS_DICTIONARY[cleanWord.slice(0, -1)]) {
    return NextResponse.json(ROOTS_DICTIONARY[cleanWord.slice(0, -1)]);
  }

  // 4. 未找到返回 null
  return NextResponse.json(null);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawWord = body?.word?.trim();

    if (!rawWord) {
      return NextResponse.json(null);
    }

    const cleanWord = rawWord.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");

    if (ROOTS_DICTIONARY[cleanWord]) {
      return NextResponse.json(ROOTS_DICTIONARY[cleanWord]);
    }

    if (cleanWord.endsWith("s") && ROOTS_DICTIONARY[cleanWord.slice(0, -1)]) {
      return NextResponse.json(ROOTS_DICTIONARY[cleanWord.slice(0, -1)]);
    }

    return NextResponse.json(null);
  } catch {
    return NextResponse.json(null);
  }
}
