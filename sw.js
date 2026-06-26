/* Aracnário service worker — Phase 1: offline app shell.
   Bump CACHE when you change any precached file so clients update. */
const CACHE = 'aracnario-shell-v19';

/* Files that make up the app itself (not remote data/photos).
   src/* carry ?v= matching index.html so a version bump busts old copies. */
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './src/db.js?v=p14',
  './src/inat.js?v=p14',
  './src/adapt.js?v=p14',
  './src/sprites.js?v=p14',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll is atomic; if one fails nothing caches. Use individual puts so a
      // single missing optional file can't break the whole install.
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // App shell: cache-first, fall back to network and cache the result.
    e.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => caches.match('./index.html'))
      )
    );
  } else {
    // Remote data/photos (iNaturalist): network-first, cache for offline reuse.
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
