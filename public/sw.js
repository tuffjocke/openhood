/*
 * Openhood service worker: makes the app work offline (a garage or a field often has no signal).
 *
 * - Pages: network first, so updates arrive as soon as you're online; the cached copy when offline.
 * - Build assets (/_next/static, hashed and never changing) and fonts: cache first.
 * - On install we fetch the start page and pre-cache every asset it references, so the app works
 *   offline even if you never opened it twice.
 * Bump VERSION to throw away old caches.
 */
const VERSION = "v2";
const CACHE = `openhood-${VERSION}`;
const SCOPE = new URL(self.registration.scope).pathname; // e.g. "/openhood/"

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch(SCOPE, { cache: "no-cache" });
      await cache.put(SCOPE, res.clone());
      const html = await res.text();
      const assets = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((u) => u.includes("/_next/static/") || /\.(png|webmanifest)$/.test(u));
      await Promise.all([...new Set(assets)].map((u) => cache.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("openhood-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Pages: network first, fall back to cache (and to the start page for unknown routes).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(SCOPE)) || Response.error()),
    );
    return;
  }

  // Hashed build assets, icons and Google Fonts: cache first.
  const cacheFirst =
    (url.origin === location.origin && (url.pathname.includes("/_next/static/") || url.pathname.endsWith(".png"))) ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com";
  if (!cacheFirst) return;

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === "opaque") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
