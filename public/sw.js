/* Git MD Viewer application-shell service worker. */
const CACHE_VERSION = `git-md-viewer-shell-${new URL(self.location.href).searchParams.get('version') || 'dev'}`;
const APP_BASE_URL = self.registration.scope;
const appUrl = (path = '') => new URL(path, APP_BASE_URL).href;
const APP_SHELL = ['', 'index.html', 'manifest.webmanifest', 'icons/git-md-viewer.svg', 'icons/git-md-viewer-192.png', 'icons/git-md-viewer-512.png'].map(appUrl);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('git-md-viewer-') && key !== CACHE_VERSION).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    const urls = event.data.urls.filter((value) => {
      try { return new URL(value, self.location.origin).origin === self.location.origin; } catch { return false; }
    });
    event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(urls)));
  }
});

function cacheable(response) {
  return response && response.status === 200 && response.type === 'basic';
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      cache.put(request, response.clone());
      cache.put(appUrl('index.html'), response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match(appUrl('index.html'))) || (await cache.match(appUrl()));
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Repository content and API requests may be authenticated. Cache only this app's shell and static assets.
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (['script', 'style', 'image', 'font', 'manifest', 'worker'].includes(request.destination)) event.respondWith(cacheFirstAsset(request));
});
