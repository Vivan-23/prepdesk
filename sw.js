const CACHE = "prepdesk-shell-v9";
const APP_FILES = ["./", "./index.html", "./styles.css?v=20261112-reading1", "./app.js?v=20261112-reading1", "./manifest.webmanifest", "./icon.svg", "./data/quant.json?v=20261105-audited4", "./data/reasoning.json?v=20261105-audited4", "./data/verbal.json?v=20261105-audited4", "./data/interview_prompts.json?v=20261105-interview1"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("prepdesk-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request)).then(cached => {
    if (cached) return cached;
    return fetch(event.request).then(response => {
      if (response.ok && (url.pathname.includes("/data/images/") || url.pathname.endsWith(".svg"))) {
        const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    });
  }));
});
