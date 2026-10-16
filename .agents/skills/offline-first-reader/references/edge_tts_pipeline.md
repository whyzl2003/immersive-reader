# 微软 Edge Neural TTS 语音管道指南 (Edge TTS Pipeline Guide)

本参考文档规定了在纯前端 Web 环境中，直连微软 Edge ReadAloud WebSocket 接口获取 24kHz 高保真 MP3 音频流、计算 Sec-MS-GEC 防刷签名，以及利用“分句切片 + 管道并发预加载”实现长段落零延迟听书的实现标准。

---

## 1. 协议规范与端点配置

- **WSS 端点**：`wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1`
- **常量配置**：
  - `TrustedClientToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"`
  - `OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"`
  - `DEFAULT_VOICE = "en-US-AvaMultilingualNeural"`
  - `CHROMIUM_FULL_VERSION = "143.0.3650.75"`

---

## 2. 纯前端 Sec-MS-GEC 防刷鉴权算法

微软在 2024 年加入了对连接时间戳的校验。在纯前端无 Node 模块的环境中，使用 Web Crypto 实现：

```typescript
export async function generateSecMsGec(): Promise<string> {
  const WIN_EPOCH = 11644473600;
  const S_TO_NS = 1e9;

  let ticks = Date.now() / 1000;
  ticks += WIN_EPOCH;
  ticks -= ticks % 300; // 向下对齐 5 分钟 (300 秒)
  ticks *= S_TO_NS / 100; // 转为 100 纳秒间隔 (Windows File Time)

  const strToHash = `${Math.floor(ticks)}${TRUSTED_CLIENT_TOKEN}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(strToHash);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
```

---

## 3. 长段落“分句切片 + 管道并发预加载”架构

### 痛点根因
长段落单次发送 SSML 会超出微软 WebSocket 缓冲区上限导致断流或超时；激进熔断又会被移动端的手势自动播放策略拦截。

### 核心实现流程

```
[ 长文本段落 ] ──> 按 [.!?;\n] 安全拆分 ──> [ 句0, 句1, 句2, ... ]
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   [ 请求句0 音频 ]               [ 句0 就绪立即播 ]
        │                                 │ (边播边并发预拉取)
        ▼                                 ▼
   [ 句0 播完瞬间 ] <───────────── [ 句1 音频已就绪 ]
        │                                 │
        ▼                                 ▼
   [ 句1 瞬间无缝接力 ] <─────────── [ 句2 音频后台拉取 ]
```

### 队列核心伪代码
```typescript
let nextAudioPromise: Promise<{ audio: HTMLAudioElement; blobUrl: string }> | null = null;

for (let i = 0; i < sentences.length; i++) {
  if (sessionId !== currentSessionId) return;

  // 1. 获取当前句音频（第 0 句即时拉取，后续句子消费预加载 Promise）
  const result = i === 0
    ? await synthesizeSingleSentence(sentences[0], voice, 6000, sessionId)
    : (nextAudioPromise ? await nextAudioPromise : await synthesizeSingleSentence(sentences[i], voice, 6000, sessionId));

  // 2. 管道并发预加载下一句
  if (i + 1 < sentences.length) {
    nextAudioPromise = synthesizeSingleSentence(sentences[i + 1], voice, 6000, sessionId);
  }

  // 3. 播放当前句子并等待 onended 触发
  await playAudioSentence(result.audio, result.blobUrl, {
    isFirst: i === 0,
    isLast: i === sentences.length - 1,
    sessionId,
  });
}
```

---

## 4. 会话隔离与全局打断 (Anti-Crosstalk)

- 全局维护 `currentSessionId` 与活跃 WebSocket 集合 `activeWebSockets: Set<WebSocket>`；
- 点击暂停键或切换到新段落时，立即执行：
  ```typescript
  export function stopEdgeTTS(): void {
    currentSessionId++; // 会话失效，所有后台 await 瞬间注销
    activeWebSockets.forEach(ws => { try { ws.close(); } catch {} });
    activeWebSockets.clear();
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio = null;
    }
  }
  ```
- 绝对杜绝串音与后台野请求。
