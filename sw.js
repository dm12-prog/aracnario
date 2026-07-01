/* Aracnário service worker (v2) — offline-first app shell.
   The whole catalogue is embedded in catalogue.js, so once the shell is cached
   the app works fully offline with no data fetch. Only photos are remote.
   Bump CACHE when you change any precached file so clients update. */
const CACHE = 'aracnario-v2-2';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './catalogue.js',
  './src/db.js',
  './src/adapt.js',
  './src/sprites.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
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
    // Remote photos (iNaturalist): network-first, cache for offline reuse.
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
