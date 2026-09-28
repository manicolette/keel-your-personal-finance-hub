// Minimal service worker for Keel — registered only in production (see src/lib/register-sw.ts).
// Satisfies PWA installability. Uses network-first for navigations so updates
// are picked up immediately; caches same-origin static assets for a warm start.
const VERSION = "keel-v2";
const ASSET_CACHE = `${VERSION}-assets`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) =>
      cache.addAll(["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache server functions, API routes, or auth flows.
  if (
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/unlock")
  ) {
    return;
  }

  // Navigations: network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/").then((r) => r || Response.error()))
    );
    return;
  }

  // Static assets: cache-first with background refresh.
  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const fetchAndUpdate = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || fetchAndUpdate;
    })
  );
});

// Phone notifications. Pushes arrive empty; ask Keel what to say, then show it.
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let msg = { title: "Keel", body: "Open Keel to see today's reminder.", url: "/home" };
      try {
        const res = await fetch("/api/push-digest", { credentials: "same-origin", cache: "no-store" });
        if (res.ok) msg = { ...msg, ...(await res.json()) };
      } catch (e) {
        // Offline: fall back to the generic text above.
      }
      await self.registration.showNotification(msg.title, {
        body: msg.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "keel-daily",
        renotify: true,
        data: { url: msg.url },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/home";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if ("focus" in w) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
