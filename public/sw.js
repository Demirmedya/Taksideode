// TaksideÖde Service Worker - Otomatik Temizleme & Cache Bypass
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Her zaman doğrudan canlı sunucudan çek
  e.respondWith(fetch(e.request));
});
