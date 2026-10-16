// 跨浏览器原生自适应高保真 TTS 发声引擎
// 集成微软 Edge Neural (Ava 极品自然神经元人声) 与浏览器原生 SpeechSynthesis 智能兜底
// 具备移动端 (iOS Safari) 同步手势预热解锁、系统机械音拦截与毫秒级打断能力

import {
  playEdgeTTS,
  stopEdgeTTS,
  warmupAudioContext,
  updateActiveAudioPlaybackRate,
  DEFAULT_EDGE_VOICE,
} from "@/src/utils/edgeTTS";
import { useReaderStore } from "@/src/store/useReaderStore";

export interface PlayTTSOptions {
  playbackRate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error?: any) => void;
}

// 缓存系统语音列表与选中的极品英文/中文音色
let cachedVoices: SpeechSynthesisVoice[] = [];
let selectedBestVoice: SpeechSynthesisVoice | null = null;
let selectedBestZhVoice: SpeechSynthesisVoice | null = null;
let isVoiceListenerAttached = false;

/**
 * 机械音/玩具音黑名单（彻底排除 macOS / iOS 早期生硬滑稽的系统默认机械音，如 Alex、Fred 等）
 */
const ROBOTIC_VOICE_BLACKLIST = [
  "alex",
  "fred",
  "junior",
  "ralph",
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "deranged",
  "good news",
  "hysterical",
  "pipe organ",
  "trinoids",
  "whisper",
  "zarvox",
  "organ",
  "jester",
  "wobble",
];

function isRoboticVoice(voiceName: string): boolean {
  const lower = voiceName.toLowerCase();
  return ROBOTIC_VOICE_BLACKLIST.some(
    (badName) => lower === badName || lower.startsWith(badName + " ") || lower.includes(`(${badName})`)
  );
}

/**
 * 极品高保真音色匹配器 (Voice Selector)：
 * 按照跨平台高保真优先级自适应匹配并锁定最顶级的真人感 voice：
 * 1. 优先寻找 Edge / Azure 神经元音色 (Ava, Andrew, Jenny, Aria)
 * 2. 寻找 Chrome 的 Google US English / Google UK English
 * 3. 寻找 macOS / iOS 优质真人音色 (优先带 Enhanced/Premium，或 Samantha, Victoria, Karen, Daniel, Siri 等)
 * 4. 严密排除 Alex、Fred 等一切系统玩具机械音
 */
function pickBestVoice(voices: SpeechSynthesisVoice[], isChinese = false): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  // 中文场景兜底音色筛选
  if (isChinese) {
    const msZh = voices.find(
      (v) => v.lang.startsWith("zh") && (v.name.includes("Online") || v.name.includes("Natural"))
    );
    if (msZh) return msZh;

    const appleZh = voices.find(
      (v) =>
        v.lang.startsWith("zh") &&
        (v.name.includes("Siri") ||
          v.name.includes("Tingting") ||
          v.name.includes("Sinji") ||
          v.name.includes("Meijia") ||
          v.name.includes("Enhanced"))
    );
    if (appleZh) return appleZh;

    const anyZh = voices.find((v) => v.lang.startsWith("zh"));
    if (anyZh) return anyZh;
  }

  // 优先级 1 (Edge / Azure 极品神经元音色): 寻找 Ava, Andrew, Jenny, Aria (Online/Natural/Neural)
  const edgeAvaAndrew = voices.find(
    (v) =>
      (v.name.includes("Ava") || v.name.includes("Andrew") || v.name.includes("Jenny") || v.name.includes("Aria")) &&
      (v.name.includes("Natural") || v.name.includes("Online") || v.name.includes("Neural"))
  );
  if (edgeAvaAndrew) return edgeAvaAndrew;

  const edgeGeneral = voices.find(
    (v) =>
      v.name.includes("Microsoft") &&
      (v.name.includes("Online") || v.name.includes("Natural") || v.name.includes("Neural"))
  );
  if (edgeGeneral) return edgeGeneral;

  // 优先级 2 (Chrome 官方高品质音色): 寻找 Chrome 的 Google US English 或 Google UK English
  const chromeGoogleVoice = voices.find(
    (v) =>
      v.name.includes("Google") &&
      (v.name.includes("US English") || v.name.includes("UK English"))
  );
  if (chromeGoogleVoice) return chromeGoogleVoice;

  // 优先级 3 (Apple / macOS 真人自然人声): 优先匹配带有 (Enhanced) 或 (Premium) 的自然人声
  const macEnhancedVoice = voices.find(
    (v) =>
      v.lang.startsWith("en") &&
      !isRoboticVoice(v.name) &&
      (v.name.includes("Enhanced") || v.name.includes("Premium"))
  );
  if (macEnhancedVoice) return macEnhancedVoice;

  // 优先级 4 (macOS / iOS 经典自然音色): 寻找 Siri, Samantha, Victoria, Karen, Daniel, Serena, Oliver, Kate
  const macNaturalNamedVoice = voices.find((v) => {
    if (!v.lang.startsWith("en") || isRoboticVoice(v.name)) return false;
    const n = v.name;
    return (
      n.includes("Siri") ||
      n.includes("Samantha") ||
      n.includes("Victoria") ||
      n.includes("Karen") ||
      n.includes("Daniel") ||
      n.includes("Serena") ||
      n.includes("Oliver") ||
      n.includes("Kate") ||
      n.includes("Tessa")
    );
  });
  if (macNaturalNamedVoice) return macNaturalNamedVoice;

  // 优先级 5 (普通英文音色兜底): 遍历所有英文音色，严格排除 Alex、Fred 等机械音黑名单
  const cleanEnglishVoices = voices.filter(
    (v) => v.lang.startsWith("en") && !isRoboticVoice(v.name)
  );
  if (cleanEnglishVoices.length > 0) {
    // 优先取 en-US，其次列表第一个
    const enUs = cleanEnglishVoices.find((v) => v.lang === "en-US");
    if (enUs) return enUs;
    return cleanEnglishVoices[0];
  }

  // 终极绝境兜底方案：过滤机械音后的任意语音，最后才考虑 fallback
  const nonRoboticAny = voices.find((v) => !isRoboticVoice(v.name));
  if (nonRoboticAny) return nonRoboticAny;

  return voices[0] || null;
}

/**
 * 刷新当前系统的可用语音列表
 */
function refreshVoices(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length > 0) {
    cachedVoices = voices;
    selectedBestVoice = pickBestVoice(voices, false);
    selectedBestZhVoice = pickBestVoice(voices, true);
  }
}

/**
 * 确保已监听 window.speechSynthesis.onvoiceschanged 异步事件
 */
function ensureVoiceListener(): void {
  if (typeof window === "undefined" || !window.speechSynthesis || isVoiceListenerAttached) return;

  refreshVoices();

  if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
    window.speechSynthesis.onvoiceschanged = () => {
      refreshVoices();
    };
    isVoiceListenerAttached = true;
  }
}

// 客户端加载时预挂载语音监听
if (typeof window !== "undefined") {
  ensureVoiceListener();
}

/**
 * 全局统一音频停止：
 * 同时掐断微软 Edge Neural Audio 播放实例与原生 window.speechSynthesis 队列，杜绝声音重叠
 */
export function stopTTS(): void {
  // 1. 掐断 Edge Neural TTS
  stopEdgeTTS();

  // 2. 掐断浏览器原生 SpeechSynthesis
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * 实时动态更新正在播放的 TTS 音频倍速
 */
export function updateTTSPlaybackRate(speed: number): void {
  updateActiveAudioPlaybackRate(speed);
}

/**
 * 浏览器原生 SpeechSynthesis 发声兜底实现
 */
export function playNativeTTS(text: string, options?: PlayTTSOptions): void {
  if (!text || typeof window === "undefined") return;

  // 同步手势预热
  warmupAudioContext();

  const cleanText = text.replace(/[*#_~`\[\]()]/g, " ");
  if (!cleanText.trim()) return;

  if (!window.speechSynthesis) {
    options?.onError?.(new Error("当前浏览器不支持 SpeechSynthesis 原生语音接口"));
    return;
  }

  ensureVoiceListener();

  if (!cachedVoices || cachedVoices.length === 0) {
    refreshVoices();
  }

  const isChinese = /[\u4e00-\u9fa5]/.test(cleanText);
  const utterance = new SpeechSynthesisUtterance(cleanText);

  utterance.lang = isChinese ? "zh-CN" : "en-US";

  const targetVoice = isChinese ? selectedBestZhVoice : selectedBestVoice;
  if (targetVoice) {
    utterance.voice = targetVoice;
  }

  const currentSpeed =
    options?.playbackRate ??
    (typeof window !== "undefined" ? useReaderStore.getState().ttsSpeed : 1.0) ??
    1.0;
  utterance.rate = currentSpeed;

  if (options?.onStart) {
    utterance.onstart = () => options.onStart?.();
  }

  utterance.onend = () => {
    options?.onEnd?.();
  };

  utterance.onerror = (e) => {
    if (e.error === "canceled" || e.error === "interrupted") return;
    options?.onError?.(e);
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * 全局双轨自适应高保真发声入口 (Adaptive TTS)：
 * 1. 触发新发音前立即掐断一切旧声音；
 * 2. 立即在同步执行主线程中执行手势预热与音频通道激活（破除 iOS Safari 自动播放拦截）；
 * 3. 优先调用微软 Edge Neural 高保真神经元语音 (AvaMultilingualNeural，24kHz 高清 MP3)；
 * 4. 若因离线无网等原因无法访问，自动优雅降级为 window.speechSynthesis（并严格排除 Alex 等呆板机械音）；
 * 5. 确保在任何环境与设备下均绝不“卡死失声”。
 */
export async function playAdaptiveTTS(text: string, options?: PlayTTSOptions): Promise<void> {
  if (!text || typeof window === "undefined") return;

  // 1. 掐断之前任何正在播放的声音
  stopTTS();

  // 2. 必须在用户手势的同步主线程瞬间执行预热（解锁 iOS Safari WebKit 音频上下文）
  warmupAudioContext();

  const isChinese = /[\u4e00-\u9fa5]/.test(text);

  // 中文内容直接走原生中文极品音色，避免英文音色发音不准
  if (isChinese) {
    playNativeTTS(text, options);
    return;
  }

  // 离线状态（飞行模式）：0 延迟直连原生系统离线语音，无需等待网络超时
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    playNativeTTS(text, options);
    return;
  }

  const currentSpeed =
    options?.playbackRate ??
    (typeof window !== "undefined" ? useReaderStore.getState().ttsSpeed : 1.0) ??
    1.0;

  try {
    // 优先调用 Edge Neural TTS（AvaMultilingualNeural 极品真人音色）
    await playEdgeTTS(text, {
      voice: DEFAULT_EDGE_VOICE,
      playbackRate: currentSpeed,
      timeoutMs: 6000,
      onStart: options?.onStart,
      onEnd: options?.onEnd,
      onError: (err) => {
        // 如果是用户主动停止导致的打断，直接退出
        if (err?.message?.includes("中断") || err?.name === "AbortError") return;
        console.warn("[TTS] Edge TTS 播放发生错误，降级至原生语音:", err);
        playNativeTTS(text, options);
      },
    });
  } catch (edgeError: any) {
    // 若属于用户主动打断（如再次点击暂停按钮），不降级播报
    if (edgeError?.message?.includes("中断") || edgeError?.name === "AbortError") {
      return;
    }
    // 彻底离线或异常时，自动优雅降级为原生自然音色
    console.warn("[TTS] Edge Neural TTS 离线不可用，自动降级为原生 Web Speech API 自然人声:", edgeError);
    playNativeTTS(text, options);
  }
}

/**
 * 全局统一的发声入口，默认指向自适应双轨发声引擎
 */
export function playTTS(text: string, options?: PlayTTSOptions): void {
  // 在外层暴露的同步入口立即执行预热，确保持续处于手势激活态
  warmupAudioContext();
  playAdaptiveTTS(text, options);
}

/**
 * 单词发音统一接口：直接复用 Ava 极品神经元语音，杜绝单词点读降级为系统机械音
 */
export function playWordAudio(text: string): void {
  warmupAudioContext();
  playTTS(text);
}
