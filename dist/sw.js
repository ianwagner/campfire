const CACHE_NAME = 'campfire-cache-v2';
const URLS_TO_CACHE = [
  '/',
  '/manifest.json',
  'https://firebasestorage.googleapis.com/v0/b/tak-campfire-main/o/Campfire%2Fsite-logo%2Ffav.png?alt=media&token=4e20a333-5189-4b25-82a7-2901688c8838',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
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
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((response) => response || fetch(request))
    );
  }
});
