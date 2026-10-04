// 跨浏览器原生自适应高保真 TTS 发声引擎
// 全面基于浏览器原生 window.speechSynthesis，具备极品音色智能匹配与毫秒级打断能力

export interface PlayTTSOptions {
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
 * 极品音色匹配器 (Voice Selector)：
 * 按照跨平台高保真优先级自适应匹配并锁定最佳 voice：
 * 1. 优先寻找 Edge 浏览器的 Ava 或 Andrew (Online/Natural) 或 Microsoft Online/Natural 音色
 * 2. 降级寻找 Chrome 的 Google US English / Google UK English
 * 3. 降级寻找 Mac 系统的 Siri 或 Samantha
 * 4. 终极兜底为列表中的任意 en-US、en-GB 或英文音色
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
      (v) => v.lang.startsWith("zh") && (v.name.includes("Siri") || v.name.includes("Tingting"))
    );
    if (appleZh) return appleZh;

    const anyZh = voices.find((v) => v.lang.startsWith("zh"));
    if (anyZh) return anyZh;
  }

  // 优先级 1 (Edge 神级音色): 优先寻找 Edge 的 Ava 或 Andrew (Online/Natural)，或 Microsoft Online/Natural
  const edgeAvaAndrew = voices.find(
    (v) =>
      (v.name.includes("Ava") || v.name.includes("Andrew")) &&
      (v.name.includes("Natural") || v.name.includes("Online"))
  );
  if (edgeAvaAndrew) return edgeAvaAndrew;

  const edgeGeneral = voices.find(
    (v) =>
      v.name.includes("Microsoft") &&
      (v.name.includes("Online") || v.name.includes("Natural"))
  );
  if (edgeGeneral) return edgeGeneral;

  // 优先级 2 (Chrome 官方音色): 寻找 Chrome 的 Google US English 或 Google UK English
  const chromeGoogleVoice = voices.find(
    (v) =>
      v.name.includes("Google") &&
      (v.name.includes("US English") || v.name.includes("UK English"))
  );
  if (chromeGoogleVoice) return chromeGoogleVoice;

  // 优先级 3 (Mac 系统音色): 寻找 Mac 系统的 Siri 或 Samantha
  const macSiriSamantha = voices.find(
    (v) => v.name.includes("Siri") || v.name.includes("Samantha")
  );
  if (macSiriSamantha) return macSiriSamantha;

  // 终极兜底方案: 列表中的任意 en-US 或 en-GB 英文音色
  const fallbackEn = voices.find(
    (v) => v.lang === "en-US" || v.lang === "en-GB" || v.lang.startsWith("en")
  );
  if (fallbackEn) return fallbackEn;

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
 * 彻底停止当前正在播放的原生语音，清空朗读队列
 */
export function stopTTS(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

/**
 * 跨浏览器原生自适应高保真 TTS 发声函数：
 * 1. 无论是长句、整段大文本还是短单词，统一使用同一个配置好 utterance.voice 的原生引擎。
 * 2. 播放前无条件调用 window.speechSynthesis.cancel() 掐断旧声音，严格防冲突。
 * 3. 适度放慢语速（rate = 0.9）确保自然质感。
 * 
 * @param text 需要朗读发音的文本
 * @param options 可选生命周期回调（onStart, onEnd, onError）
 */
export function playTTS(text: string, options?: PlayTTSOptions): void {
  if (!text || typeof window === "undefined") return;

  // 文本净化，去除 Markdown 字符和多余空白
  const cleanText = text.replace(/[*#_~`\[\]()]/g, "").trim();
  if (!cleanText) return;

  if (!window.speechSynthesis) {
    options?.onError?.(new Error("当前浏览器不支持 SpeechSynthesis 原生语音接口"));
    return;
  }

  ensureVoiceListener();

  // 若尚未抓取到系统语音，主动拉取一次
  if (!cachedVoices || cachedVoices.length === 0) {
    refreshVoices();
  }

  // 发声前调用 cancel() 掐断旧声音，清空朗读队列
  stopTTS();

  const isChinese = /[\u4e00-\u9fa5]/.test(cleanText);
  const utterance = new SpeechSynthesisUtterance(cleanText);

  // 设定语言代码
  utterance.lang = isChinese ? "zh-CN" : "en-US";

  // 将极品音色匹配器选出的最佳 voice 赋值给 utterance.voice
  const targetVoice = isChinese ? selectedBestZhVoice : selectedBestVoice;
  if (targetVoice) {
    utterance.voice = targetVoice;
  }

  // 适度放慢语速以保证优雅自然的口语听辨感
  utterance.rate = 0.9;

  // 绑定生命周期回调
  if (options?.onStart) {
    utterance.onstart = () => options.onStart?.();
  }

  utterance.onend = () => {
    options?.onEnd?.();
  };

  utterance.onerror = (e) => {
    // 忽略被主动 cancel() 打断产生的内部事件
    if (e.error === "canceled" || e.error === "interrupted") return;
    options?.onError?.(e);
  };

  // 执行原生高保真发声
  window.speechSynthesis.speak(utterance);
}

/**
 * 向后兼容原有的单词发音函数
 */
export function playWordAudio(text: string): void {
  playTTS(text);
}
