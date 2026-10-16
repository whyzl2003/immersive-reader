"use client";

import * as React from "react";

/**
 * PWA Service Worker 离线外壳自动注册组件
 */
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("[PWA] Service Worker 离线外壳注册成功，作用域:", registration.scope);
          })
          .catch((error) => {
            console.warn("[PWA] Service Worker 离线外壳注册失败:", error);
          });
      });
    }
  }, []);

  return null;
}
