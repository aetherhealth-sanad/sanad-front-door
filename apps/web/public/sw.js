// Sanad Offline Emergency Service Worker (AC-05.4, AC-05.6)
const CACHE_NAME = 'sanad-emergency-v1';
const ALLOWLISTED_PRECACHE = [
  '/urgent.html',
  '/favicon.svg',
  '/assets/images/medical_urgent_care_3d.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ALLOWLISTED_PRECACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // INVARIANT: Never cache or intercept any /api/* calls (AC-05.4)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // If a page cannot be reached offline, serve the already-cached static emergency page.
  // This does not cache or intercept API responses.
  if (event.request.method === 'GET' && event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/urgent.html').then((response) => response || Response.error()))
    );
    return;
  }

  // Precached static emergency pages
  if (event.request.method === 'GET' && ALLOWLISTED_PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request);
      })
    );
  }
});
