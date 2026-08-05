const CACHE_PREFIX = 'prime-catalogo-static-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const INDEX_URL = '/index.html';
const STATIC_ASSETS = [
  INDEX_URL,
  '/manifest.webmanifest',
  '/logo-prime-dark.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];
const STATIC_ASSET_PATHS = new Set(STATIC_ASSETS);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(INDEX_URL, response.clone());
      } catch (error) {
        console.warn('[PWA] Não foi possível atualizar o HTML em cache:', error.message);
      }
    }
    return response;
  } catch (error) {
    const cachedIndex = await caches.match(INDEX_URL);
    if (cachedIndex) return cachedIndex;
    return new Response('Catálogo indisponível sem conexão.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }
}

async function cacheFirstStaticAsset(request) {
  const cachedResponse = await caches.match(request, { ignoreSearch: true });
  if (cachedResponse) return cachedResponse;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    } catch (error) {
      console.warn('[PWA] Não foi possível armazenar o asset local:', error.message);
    }
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('Authorization')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (STATIC_ASSET_PATHS.has(url.pathname)) {
    event.respondWith(cacheFirstStaticAsset(request));
  }
});
