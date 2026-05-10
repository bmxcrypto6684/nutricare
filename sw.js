const CACHE_NAME = 'nutricare-v23';

// Detecta base path automaticamente (funciona em subpastas tipo /nutricare/)
const BASE = self.location.pathname.replace(/sw\.js$/, '');

const STATIC_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'style.css',
  BASE + 'manifest.json',
  BASE + 'favicon.png',
  BASE + 'icons/icon-192.svg',
  BASE + 'icons/icon-512.svg'
];

const CDN_CACHE = 'nutricare-cdn-v1';
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'
];

const API_CACHE = 'nutricare-api-v1';

// ---- Instalação: cache dos assets estáticos ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ---- Ativação: limpar caches antigos ----
self.addEventListener('activate', event => {
  const validCaches = [CACHE_NAME, CDN_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !validCaches.includes(k)).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ---- Fetch: estratégia híbrida ----
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-first (GET only)
  if (url.pathname.startsWith(BASE + 'api/')) {
    if (request.method === 'GET') {
      event.respondWith(networkFirst(request));
    }
    return;
  }

  // CDN assets: cache-first
  if (CDN_URLS.some(cdnUrl => request.url.startsWith(cdnUrl))) {
    event.respondWith(cdnFirst(request));
    return;
  }

  // Static assets: cache-first (exceto script.js que NUNCA é cacheado)
  if (url.pathname.includes('script.js')) {
    return; // Browser gerencia sem SW — usa ?v= cache buster do HTML
  }
  event.respondWith(cacheFirst(request));
});

// ---- Estratégias ----
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return caches.match(BASE);
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ success: false, error: 'offline', data: null }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cdnFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CDN_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('', { status: 503 });
  }
}
