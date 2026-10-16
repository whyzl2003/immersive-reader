// 沉浸式阅读器 PWA 离线外壳 Service Worker
const CACHE_NAME = "immersive-reader-shell-v1";

// 预缓存的核心静态资源外壳
const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/globe.svg",
];

// 安装阶段：预缓存核心静态外壳并立即激活
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 激活阶段：清理过期的旧版本缓存，并立即接管所有客户端
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 请求拦截阶段：分层自适应离线策略
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. 对于 API 数据接口与云端鉴权请求，绝不使用离线外壳缓存，直接透传走网络
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/cdn-cgi/")) {
    return;
  }

  // 2. 对于 HTML 页面导航请求（如刷新网页或从 iPad/手机桌面图标冷启动）：
  // 采用 Network-First 策略，若离线断网（如飞行模式）则平滑降级为已缓存的 App Shell，绝不白屏
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // 断网离线时回退读取缓存的页面外壳
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          const fallbackShell = await caches.match("/");
          return fallbackShell || new Response("离线模式：请先连接网络完成初次加载", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        })
    );
    return;
  }

  // 3. 对于静态前端构建资源（JS、CSS、字体、SVG图片等带有哈希或静态资源）：
  // 采用 Cache-First 策略，秒级响应，网络拉取后静默更新缓存
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(js|css|woff2?|svg|png|jpg|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        });
      })
    );
  }
});
