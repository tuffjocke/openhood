"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js so the app can be installed and works offline. Production builds only,
 * and not in the copy inside the npm package (NEXT_PUBLIC_OPENHOOD_LOCAL, scripts/build-npm.mjs):
 * the MCP server serves that one itself, and a cached copy would outlive a newer package.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_OPENHOOD_LOCAL === "1" || !("serviceWorker" in navigator)) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {});
  }, []);
  return null;
}
