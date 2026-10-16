// 微软 Edge Neural 高保真神经元语音合成引擎 (Edge TTS)
// 基于官方 REST / WebSocket 混合架构，获取 24kHz 高保真 MP3 音频流
// 支持移动端手势预热、短句切片、管道缓冲预加载与毫秒级会话打断机制

import { useReaderStore } from "@/src/store/useReaderStore";

export interface EdgeTTSOptions {
  voice?: string;
  rate?: string;
  pitch?: string;
  playbackRate?: number;
  timeoutMs?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_BASE_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
export const DEFAULT_EDGE_VOICE = "en-US-AvaMultilingualNeural";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

// 全局会话与句柄追踪，确保切段与停止时绝不串音
let currentSessionId = 0;
let activeAudio: HTMLAudioElement | null = null;
const activeBlobUrls: Set<string> = new Set();
const activeWebSockets: Set<WebSocket> = new Set();

// 移动端 (iOS Safari) 专用手势解锁与共享单例
let sharedUnlockedAudio: HTMLAudioElement | null = null;
let sharedAudioContext: AudioContext | null = null;
let isGlobalUnlockBound = false;

/**
 * 实时动态更新当前正在播放的 Audio 实例语速（支持朗读途中切换下拉框实时变速）
 */
export function updateActiveAudioPlaybackRate(speed: number): void {
  const validSpeed = typeof speed === "number" && speed > 0 ? speed : 1.0;
  if (activeAudio) {
    try {
      activeAudio.defaultPlaybackRate = validSpeed;
      activeAudio.playbackRate = validSpeed;
    } catch {}
  }
  if (sharedUnlockedAudio && sharedUnlockedAudio !== activeAudio) {
    try {
      sharedUnlockedAudio.defaultPlaybackRate = validSpeed;
      sharedUnlockedAudio.playbackRate = validSpeed;
    } catch {}
  }
}

/**
 * 移动端 (iOS Safari) 手势预热/激活：
 * 在用户点击发音按钮的同步主线程瞬间执行，预先触发一次极短静音音频以解锁 iOS 自动播放策略
 */
export function warmupAudioContext(): void {
  if (typeof window === "undefined") return;

  try {
    // 1. 初始化并唤醒 Web AudioContext 上下文
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      if (!sharedAudioContext) {
        sharedAudioContext = new AudioCtx();
      }
      if (sharedAudioContext.state === "suspended") {
        sharedAudioContext.resume().catch(() => {});
      }
    }

    // 2. 初始化并播放一个单样本静音音频以解锁 HTMLAudioElement
    if (!sharedUnlockedAudio) {
      sharedUnlockedAudio = new Audio();
      // 允许内联与背景播放属性
      sharedUnlockedAudio.setAttribute("playsinline", "true");
      sharedUnlockedAudio.setAttribute("webkit-playsinline", "true");
    }

    // 如果音频尚未初始化或已处于暂停空闲状态，注入静音样本以通过用户手势审查
    if (!sharedUnlockedAudio.src || sharedUnlockedAudio.paused) {
      sharedUnlockedAudio.src =
        "data:audio/wav;base64,UklGRigAAABXQVZFRm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";
      const playPromise = sharedUnlockedAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    }
  } catch {}
}

/**
 * 全局一次性用户手势监听器：在用户首次触碰屏幕或点击时提前静默解锁音频通道
 */
export function initGlobalAudioUnlock(): void {
  if (typeof window === "undefined" || isGlobalUnlockBound) return;
  isGlobalUnlockBound = true;

  const unlockHandler = () => {
    warmupAudioContext();
    // 成功捕获首次手势后即刻注销监听器，不占用运行时性能
    window.removeEventListener("touchstart", unlockHandler, true);
    window.removeEventListener("pointerdown", unlockHandler, true);
    window.removeEventListener("click", unlockHandler, true);
  };

  window.addEventListener("touchstart", unlockHandler, { capture: true, once: true });
  window.addEventListener("pointerdown", unlockHandler, { capture: true, once: true });
  window.addEventListener("click", unlockHandler, { capture: true, once: true });
}

// 客户端加载时自动挂载全局首次手势解锁
if (typeof window !== "undefined") {
  initGlobalAudioUnlock();
}

/**
 * 获取或创建已解锁的共享 HTMLAudioElement 播放实例
 */
export function getOrCreateSharedAudio(): HTMLAudioElement {
  if (!sharedUnlockedAudio) {
    sharedUnlockedAudio = new Audio();
    sharedUnlockedAudio.setAttribute("playsinline", "true");
    sharedUnlockedAudio.setAttribute("webkit-playsinline", "true");
  }
  return sharedUnlockedAudio;
}

/**
 * 清洗输入文本，去除 Markdown 与 HTML，做 XML 转义，确保生成纯净英语发音 SSML
 */
export function cleanTextForEdgeTTS(text: string): string {
  if (!text) return "";

  // 1. 过滤 HTML 标签
  let cleaned = text.replace(/<[^>]+>/g, " ");

  // 2. 过滤 Markdown 标记符号，替换为空格保持自然断句
  cleaned = cleaned.replace(/[*#_~`\[\]()\\>]/g, " ");

  // 3. 移除不支持的控制字符
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");

  // 4. XML 实体转义
  cleaned = cleaned
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  // 5. 压缩多余空白
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * 智能英文段落逐句拆分算法（供“🔍 句读”精读面板与 TTS 复用）：
 * 兼容常见英文缩写（Mr. / Mrs. / Ms. / Dr. / Prof. / St. / Jr. / Sr. / vs. / etc. / e.g. / i.e. / A.D. / B.C. 等）、
 * 大写人名缩写（如 E. H. Gombrich）以及句末闭合引号/括号（如 ." / ?” / !' / .)）。
 */
export function splitParagraphIntoSentences(rawText: string): string[] {
  const cleanText = rawText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!cleanText) return [];

  const DOT_PLACEHOLDER = "\u0000";

  // 1. 保护常见英文称谓与学术缩写中的句号
  let protectedText = cleanText.replace(
    /\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|Rev|Gen|Col|Capt|Lt|Sgt|Gov|Pres|Hon|Mt|Ft|vs|etc|cf|al|Fig|fig|No|no|Vol|vol|Ch|ch|pp|p)\./g,
    `$1${DOT_PLACEHOLDER}`
  );

  // 2. 保护多点缩写（如 e.g., i.e., A.D., B.C., U.S., U.K., a.m., p.m.）
  protectedText = protectedText.replace(
    /\b(e\.g|i\.e|A\.D|B\.C\.E|B\.C|C\.E|a\.m|p\.m|U\.S|U\.K)\./gi,
    (match) => match.replace(/\./g, DOT_PLACEHOLDER)
  );

  // 3. 保护单字母大写人名缩写（如 E. H. Gombrich）與数字小数点（如 3.14）
  protectedText = protectedText
    .replace(/\b([A-Z])\.(?=\s+[A-Z])/g, `$1${DOT_PLACEHOLDER}`)
    .replace(/(\d)\.(\d)/g, `$1${DOT_PLACEHOLDER}$2`);

  // 4. 匹配完整句子边界（包含句末标点 . ! ? … 及紧随其后的闭合引号或右括号）
  const rawMatches = protectedText.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|\s*$)/g);
  if (!rawMatches || rawMatches.length === 0) {
    return [cleanText];
  }

  const result: string[] = [];
  for (const part of rawMatches) {
    const restored = part.replace(/\u0000/g, ".").trim();
    if (restored) {
      result.push(restored);
    }
  }

  return result.length > 0 ? result : [cleanText];
}

/**
 * 智能句子安全拆分算法（专为 TTS 流式预加载优化）：
 * 1. 若文本字符数 <= 100，直接单句返回避免不必要拆分；
 * 2. 否则复用缩写安全的智能分句算法切分为句子列表；
 * 3. 若切分后某单句依然极长（> 200 字符），按逗号做二级平滑分割。
 */
export function splitIntoSentences(rawText: string): string[] {
  const text = rawText.trim();
  if (!text) return [];
  if (text.length <= 100) return [text];

  const baseSentences = splitParagraphIntoSentences(text);
  if (baseSentences.length === 0) return [text];

  const sentences: string[] = [];
  for (const match of baseSentences) {
    const trimmed = match.trim();
    if (!trimmed) continue;

    // 单句超过 200 字符时，按逗号细化拆分防止单次 SSML 阻塞
    if (trimmed.length > 200) {
      const subParts = trimmed.split(/(?<=[,，;])\s+/);
      for (const sp of subParts) {
        const subTrimmed = sp.trim();
        if (subTrimmed) sentences.push(subTrimmed);
      }
    } else {
      sentences.push(trimmed);
    }
  }

  return sentences.length > 0 ? sentences : [text];
}

/**
 * 纯前端计算 Sec-MS-GEC 防刷校验 Token (基于 Windows File Time 与 SHA-256)
 */
export async function generateSecMsGec(): Promise<string> {
  const WIN_EPOCH = 11644473600;
  const S_TO_NS = 1e9;

  let ticks = Date.now() / 1000;
  ticks += WIN_EPOCH;
  ticks -= ticks % 300; // 向下取整到 5 分钟
  ticks *= S_TO_NS / 100; // 转为 100 纳秒间隔

  const strToHash = `${Math.floor(ticks)}${TRUSTED_CLIENT_TOKEN}`;

  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(strToHash);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  return "7774E230964520D7AADF1B8F5286732EB1E44649465C1FFFCFC55980F708FB9C";
}

/**
 * 生成 32 位随机 Connection ID
 */
function generateConnectionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 彻底停止并销毁当前 Edge TTS 正在进行的网络请求、后台预加载队列与音频播放
 */
export function stopEdgeTTS(): void {
  // 递增会话 ID，使当前以及所有后台进行中的异步管道请求瞬间失效
  currentSessionId++;

  // 1. 关闭所有活跃中的 WebSocket
  for (const ws of activeWebSockets) {
    try {
      ws.close();
    } catch {}
  }
  activeWebSockets.clear();

  // 2. 暂停当前音频实例并解除回调
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.onplay = null;
      activeAudio.onended = null;
      activeAudio.onerror = null;
    } catch {}
    activeAudio = null;
  }

  // 3. 释放已生成的所有 ObjectURL
  for (const url of activeBlobUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  activeBlobUrls.clear();
}

/**
 * 通道 1：通过应用专属边缘 API 路由 (/api/tts) 获取官方高保真 Ava MP3
 * 全平台通用（Mac Chrome/Safari/iOS 100% 畅通，无 403 与 UA 限制）
 * 仅返回 blobUrl，不触碰 Audio 实例，确保并发预加载绝对安全
 */
async function fetchAudioFromApi(
  text: string,
  voice: string,
  timeoutMs: number,
  sessionId: number
): Promise<{ blobUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (sessionId !== currentSessionId) {
      throw new Error("TTS 会话已中断");
    }

    if (!res.ok) {
      throw new Error(`TTS API 响应异常: ${res.status}`);
    }

    const blob = await res.blob();
    if (blob.size === 0) {
      throw new Error("返回音频数据为空");
    }

    const blobUrl = URL.createObjectURL(blob);
    activeBlobUrls.add(blobUrl);

    return { blobUrl };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * 通道 2：直连微软公共 WebSocket 兜底合成（带心跳与重试）
 * 仅返回 blobUrl，不触碰 Audio 实例
 */
async function fetchAudioFromWebSocket(
  text: string,
  voice: string,
  timeoutMs: number,
  sessionId: number
): Promise<{ blobUrl: string }> {
  const secMsGec = await generateSecMsGec();
  const connectionId = generateConnectionId();
  const wssUrl = `${WSS_BASE_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let isSettled = false;
    const audioChunks: ArrayBuffer[] = [];

    const timer = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
      reject(new Error(`WebSocket 响应超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      if (ws) {
        activeWebSockets.delete(ws);
      }
    };

    try {
      ws = new WebSocket(wssUrl);
      activeWebSockets.add(ws);
      ws.binaryType = "arraybuffer";
    } catch (e) {
      cleanup();
      return reject(e);
    }

    ws.onopen = () => {
      if (isSettled || !ws || sessionId !== currentSessionId) {
        cleanup();
        return;
      }

      const dateStr = new Date().toString();
      const configPayload =
        `X-Timestamp:${dateStr}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: OUTPUT_FORMAT,
              },
            },
          },
        });
      ws.send(configPayload);

      const requestId = generateConnectionId();
      const ssmlContent =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">` +
        `<voice name="${voice}">` +
        `<prosody rate="0%" pitch="0%">` +
        `${text}` +
        `</prosody>` +
        `</voice>` +
        `</speak>`;

      const ssmlMessage = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${dateStr}Z\r\nPath:ssml\r\n\r\n${ssmlContent}`;
      ws.send(ssmlMessage);
    };

    ws.onmessage = (event) => {
      if (isSettled || sessionId !== currentSessionId) return;

      if (event.data instanceof ArrayBuffer) {
        const buffer = event.data;
        if (buffer.byteLength > 2) {
          const view = new DataView(buffer);
          const headerLength = view.getUint16(0);
          const audioOffset = 2 + headerLength;
          if (buffer.byteLength > audioOffset) {
            const chunk = buffer.slice(audioOffset);
            audioChunks.push(chunk);
          }
        }
      } else if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          if (isSettled) return;
          isSettled = true;
          cleanup();
          try {
            ws?.close();
          } catch {}

          if (sessionId !== currentSessionId) {
            return reject(new Error("TTS 会话已中断"));
          }

          if (audioChunks.length === 0) {
            return reject(new Error("Edge TTS 未返回任何有效音频分片"));
          }

          try {
            const blob = new Blob(audioChunks, { type: "audio/mp3" });
            const blobUrl = URL.createObjectURL(blob);
            activeBlobUrls.add(blobUrl);
            resolve({ blobUrl });
          } catch (blobErr) {
            reject(blobErr);
          }
        }
      }
    };

    ws.onerror = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(new Error("Edge TTS WebSocket 连接错误"));
    };

    ws.onclose = (ev) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(new Error(`Edge TTS 连接意外关闭: code=${ev.code}`));
    };
  });
}

/**
 * 单句合成底层调度：API 优先 + 静默重试 + WebSocket 降级保障
 */
export async function synthesizeSingleSentence(
  text: string,
  voice: string = DEFAULT_EDGE_VOICE,
  timeoutMs: number = 6000,
  sessionId: number
): Promise<{ blobUrl: string }> {
  if (typeof window === "undefined") {
    throw new Error("Edge TTS 仅支持浏览器环境运行");
  }

  if (sessionId !== currentSessionId) {
    throw new Error("TTS 会话已中断");
  }

  const cleanText = cleanTextForEdgeTTS(text);
  if (!cleanText) {
    throw new Error("朗读文本为空");
  }

  // 1. 第一优选：请求高可用边缘 API 路由 (/api/tts)
  try {
    return await fetchAudioFromApi(cleanText, voice, Math.min(timeoutMs, 4500), sessionId);
  } catch (apiError: any) {
    if (sessionId !== currentSessionId) throw apiError;
    console.warn("[TTS] API 首次调用受阻，正在执行 2 秒快速重试:", apiError?.message);
  }

  // 2. API 静默重试机制：自动重试一次（超时限制在 2 秒内）
  try {
    return await fetchAudioFromApi(cleanText, voice, 2000, sessionId);
  } catch {
    // 忽略二次 API 错误，平滑转入 WebSocket 通道
  }

  // 3. 第二优选：直连微软公共 WebSocket
  try {
    return await fetchAudioFromWebSocket(cleanText, voice, timeoutMs, sessionId);
  } catch (wsError) {
    // 若首次 WebSocket 报错且非主动中断，再静默重试一次（2 秒内）
    if (sessionId === currentSessionId) {
      try {
        console.warn("[TTS] WebSocket 首次握手异常，执行 2 秒快速重试...");
        return await fetchAudioFromWebSocket(cleanText, voice, 2000, sessionId);
      } catch {}
    }
    throw wsError;
  }
}

/**
 * 播放单句并等待播放完成
 */
function playAudioSentence(
  audio: HTMLAudioElement,
  blobUrl: string,
  params: {
    isFirst: boolean;
    isLast: boolean;
    options?: EdgeTTSOptions;
    sessionId: number;
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (params.sessionId !== currentSessionId) {
      try {
        URL.revokeObjectURL(blobUrl);
        activeBlobUrls.delete(blobUrl);
      } catch {}
      return resolve();
    }

    activeAudio = audio;

    // 读取当前全局或传入的语速档位，并同步应用到 Audio 实例
    const initialSpeed =
      params.options?.playbackRate ??
      (typeof window !== "undefined" ? useReaderStore.getState().ttsSpeed : 1.0) ??
      1.0;
    try {
      audio.defaultPlaybackRate = initialSpeed;
      audio.playbackRate = initialSpeed;
    } catch {}

    audio.onplay = () => {
      if (params.sessionId !== currentSessionId) return;
      // 播放启动瞬间再次对齐最新实时语速（兼容 Safari/iOS WebKit 重置 src 后的状态）
      const liveSpeed =
        (typeof window !== "undefined" ? useReaderStore.getState().ttsSpeed : undefined) ??
        params.options?.playbackRate ??
        1.0;
      try {
        audio.defaultPlaybackRate = liveSpeed;
        audio.playbackRate = liveSpeed;
      } catch {}

      if (params.isFirst) {
        params.options?.onStart?.();
      }
    };

    audio.onended = () => {
      try {
        URL.revokeObjectURL(blobUrl);
        activeBlobUrls.delete(blobUrl);
      } catch {}

      if (activeAudio === audio) {
        activeAudio = null;
      }

      if (params.sessionId !== currentSessionId) {
        return resolve();
      }

      if (params.isLast) {
        params.options?.onEnd?.();
      }
      resolve();
    };

    audio.onerror = (e) => {
      try {
        URL.revokeObjectURL(blobUrl);
        activeBlobUrls.delete(blobUrl);
      } catch {}

      if (activeAudio === audio) {
        activeAudio = null;
      }

      if (params.sessionId !== currentSessionId) {
        return resolve();
      }
      params.options?.onError?.(e);
      reject(e);
    };

    audio.play().catch((playErr) => {
      try {
        URL.revokeObjectURL(blobUrl);
        activeBlobUrls.delete(blobUrl);
      } catch {}

      if (activeAudio === audio) {
        activeAudio = null;
      }

      if (params.sessionId !== currentSessionId) {
        return resolve();
      }
      params.options?.onError?.(playErr);
      reject(playErr);
    });
  });
}

/**
 * 高保真神经元队列切片与管道缓冲播放引擎：
 * 1. 自动对长短段落进行标点分句；
 * 2. 播第一句的同时，后台并行管道预加载第二句，实现近乎零停顿的丝滑真人阅读体验；
 * 3. 严格遵循会话 ID 隔离，点击暂停或切段立即中断一切后台队列，绝不串音；
 * 4. 整个段落读完精准对齐生命周期回调（喇叭与方块状态完全一致）。
 */
export async function playEdgeTTS(text: string, options?: EdgeTTSOptions): Promise<void> {
  stopEdgeTTS();

  const sessionId = currentSessionId;
  const voice = options?.voice || DEFAULT_EDGE_VOICE;
  const timeoutMs = options?.timeoutMs ?? 6000;

  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return;

  let nextAudioPromise: Promise<{ blobUrl: string }> | null = null;

  for (let i = 0; i < sentences.length; i++) {
    if (sessionId !== currentSessionId) return;

    let currentResult: { blobUrl: string };
    try {
      if (i === 0) {
        currentResult = await synthesizeSingleSentence(sentences[0], voice, timeoutMs, sessionId);
      } else {
        currentResult = nextAudioPromise
          ? await nextAudioPromise
          : await synthesizeSingleSentence(sentences[i], voice, timeoutMs, sessionId);
      }
    } catch (synthErr) {
      if (sessionId !== currentSessionId) return;
      options?.onError?.(synthErr);
      throw synthErr;
    }

    if (sessionId !== currentSessionId) return;

    // 管道并行异步预加载下一句（仅下载数据生成 blobUrl，不触发播放，不碰 Audio 实例）
    if (i + 1 < sentences.length) {
      nextAudioPromise = synthesizeSingleSentence(sentences[i + 1], voice, timeoutMs, sessionId);
    } else {
      nextAudioPromise = null;
    }

    // 采用经过手势激活的共享 Audio 实例按顺序播放当前句
    const audio = getOrCreateSharedAudio();
    audio.src = currentResult.blobUrl;

    const currentSpeed =
      options?.playbackRate ??
      (typeof window !== "undefined" ? useReaderStore.getState().ttsSpeed : 1.0) ??
      1.0;
    try {
      audio.defaultPlaybackRate = currentSpeed;
      audio.playbackRate = currentSpeed;
    } catch {}

    await playAudioSentence(audio, currentResult.blobUrl, {
      isFirst: i === 0,
      isLast: i === sentences.length - 1,
      options,
      sessionId,
    });
  }
}
