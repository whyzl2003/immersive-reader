export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

// 内存级缓存微软 Azure Speech 凭证 Token (有效期约 10 分钟，提前 3 分钟刷新)
let cachedTokenInfo: {
  endpoint: any;
  token: string;
  expiredAt: number;
} | null = null;

async function hmacSha256(keyBytes: Uint8Array, dataStr: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(dataStr)
  );
  return new Uint8Array(signature);
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getFormattedDate(): string {
  return new Date().toUTCString().replace(/GMT/, "").trim().toLowerCase() + " gmt";
}

async function signEndpointUrl(urlStr: string): Promise<string> {
  const url = urlStr.split("://")[1];
  const encodedUrl = encodeURIComponent(url);
  const uuidStr = crypto.randomUUID().replace(/-/g, "");
  const formattedDate = getFormattedDate();
  const bytesToSign = `MSTranslatorAndroidApp${encodedUrl}${formattedDate}${uuidStr}`.toLowerCase();
  
  // 微软官方 Translator Android 密钥常数
  const secretKey = base64ToBytes("oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==");
  const signData = await hmacSha256(secretKey, bytesToSign);
  const signBase64 = bytesToBase64(signData);
  
  return `MSTranslatorAndroidApp::${signBase64}::${formattedDate}::${uuidStr}`;
}

/**
 * 获取或刷新微软官方 Azure Cognitive Services 语音合成凭证
 */
async function getAzureEndpoint() {
  const now = Date.now() / 1000;

  // 提前 3 分钟刷新
  if (cachedTokenInfo && cachedTokenInfo.expiredAt && now < cachedTokenInfo.expiredAt - 180) {
    return cachedTokenInfo;
  }

  const endpointUrl = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
  const clientId = crypto.randomUUID().replace(/-/g, "");
  const signature = await signEndpointUrl(endpointUrl);

  const res = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Accept-Language": "en-US",
      "X-ClientVersion": "4.0.530a 5fe1dc6c",
      "X-UserId": "0f04d16a175c411e",
      "X-HomeGeographicRegion": "en-US",
      "X-ClientTraceId": clientId,
      "X-MT-Signature": signature,
      "User-Agent": "okhttp/4.5.0",
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": "0",
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`获取微软 Azure Speech 凭证失败 (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const jwt = data.t.split(".")[1];
  const decodedJwt = JSON.parse(atob(jwt));

  cachedTokenInfo = {
    endpoint: data,
    token: data.t,
    expiredAt: decodedJwt.exp,
  };

  return cachedTokenInfo;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, voice = "en-US-AvaMultilingualNeural", rate = "0%", pitch = "0%" } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "缺少朗读文本参数 text" }, { status: 400 });
    }

    // 清洗文本与 XML 实体转义
    const cleanText = text
      .replace(/<[^>]+>/g, " ")
      .replace(/[*#_~`\[\]()\\>]/g, " ")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText) {
      return NextResponse.json({ error: "净化后朗读文本为空" }, { status: 400 });
    }

    const { endpoint, token } = await getAzureEndpoint();
    const ttsUrl = `https://${endpoint.r}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
      <voice name="${voice}">
        <prosody rate="${rate}" pitch="${pitch}">
          ${cleanText}
        </prosody>
      </voice>
    </speak>`;

    const ttsRes = await fetch(ttsUrl, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/ssml+xml",
        "User-Agent": "okhttp/4.5.0",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: ssml,
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      return NextResponse.json(
        { error: `Azure Speech 合成失败 (${ttsRes.status}): ${errText}` },
        { status: 500 }
      );
    }

    const audioBytes = await ttsRes.arrayBuffer();

    return new Response(audioBytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (error: any) {
    console.error("[TTS API] 合成异常:", error);
    return NextResponse.json({ error: error?.message || "服务器内部错误" }, { status: 500 });
  }
}
