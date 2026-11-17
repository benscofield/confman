"use client";

import { useEffect } from "react";

export function PWARegister(): null {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Safe no-op. App still works online if registration fails.
    });
  }, []);

  return null;
}
