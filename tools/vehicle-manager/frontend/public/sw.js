const CACHE_NAME = 'vehicle-manager-v1';
const APP_SHELL = ['/', '/index.html'];

const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-192-maskable.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
];

// Same /api/ prefix vehicle-manager's nginx.conf proxies to its FastAPI
// backend — those calls must never be served from cache.
const NETWORK_FIRST_PATHS = ['/api/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for API calls
  if (NETWORK_FIRST_PATHS.some(path => url.pathname.startsWith(path))) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline', message: 'Network unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Network-first for the app shell (navigations + '/index.html') — Vite's
  // hashed JS/CSS filenames change on every build, but the shell's own URL
  // never does, so cache-first here would keep serving a stale index.html
  // (pointing at old bundle hashes) forever after a deploy. Fall back to the
  // cached shell only when offline.
  const isAppShell = event.request.mode === 'navigate' || APP_SHELL.some(a => url.pathname === a);
  if (isAppShell) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Cache-first for hashed static assets (safe — a content change means a new URL)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((response) => {
          if (event.request.method !== 'GET' || !response.ok) return response;

          const isStaticAsset =
            STATIC_ASSETS.some(a => url.pathname.endsWith(a)) ||
            /\.(js|css|woff2?|ttf|png|jpg|svg|ico)$/.test(url.pathname);

          if (isStaticAsset) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }

          return response;
        })
        .catch(() => {
          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        });
    })
  );
});
