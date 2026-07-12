const CACHE_NAME = 'paint-quantity-shell-20260712-1';
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./app-01.js",
  "./app-02.js",
  "./app-03.js",
  "./app-04.js",
  "./app-05.js",
  "./app-06.js",
  "./app-07.js",
  "./app-08.js",
  "./app-09.js",
  "./app-10.js",
  "./app-11.js",
  "./app-12.js",
  "./register-sw.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
