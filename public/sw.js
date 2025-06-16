const CACHE_NAME = 'campfire-cache-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://firebasestorage.googleapis.com/v0/b/tak-campfire-main/o/Campfire%2Fsite-logo%2Ffav.png?alt=media&token=4e20a333-5189-4b25-82a7-2901688c8838'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await Promise.all(
          URLS_TO_CACHE.map(async (url) => {
            try {
              const resp = await fetch(new Request(url, { mode: 'no-cors' }));
              await cache.put(url, resp);
            } catch (err) {
              console.warn('SW cache failed:', url, err);
            }
          })
        );
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
