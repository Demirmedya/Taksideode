const CACHE_NAME = 'taksideode-pos-v1';
const ASSETS = [
  '/surucu',
  '/css/style.css',
  '/images/logo.png',
  '/images/icon.png',
  '/socket.io/socket.io.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/') || e.request.url.includes('/socket.io/')) {
    return; // Canlı API ve Socket çağrılarını doğrudan ağdan yap
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
