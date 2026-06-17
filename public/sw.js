const CACHE = "macro-os-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter((cacheName) => cacheName !== CACHE)
              .map((cacheName) => caches.delete(cacheName))
          )
        ),
      self.clients.claim(),
    ])
  );
});

// Keep app code and styles on the network so a deployment can never combine
// current markup with stale Tailwind CSS or JavaScript.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  if (req.mode === "navigate" || url.pathname.startsWith("/_next/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Cache stable image assets for the installed app.
  if (
    url.pathname.startsWith("/icons") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".svg")
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        });
      })
    );
  }
});
