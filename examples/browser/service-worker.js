// Service Worker for PDQ WASM Browser Example
// Provides offline functionality and caching for better performance

const CACHE_NAME = 'pdq-wasm-browser-v1';
const urlsToCache = [
  './',
  './index.html',
  '../../dist/esm/index.js',
  '../../wasm/pdq.wasm'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force the waiting service worker to become the active service worker,
        // but only after successful caching
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Cache failed:', error);
        throw error;
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Take control of all pages immediately after cleaning up old caches
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        console.log('[Service Worker] Serving from cache:', event.request.url);
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(event.request);
        // Check if we received a valid response before caching
        if (networkResponse && networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          // Wait for the cache operation to complete to ensure data integrity.
          // We wrap this in a try/catch to prevent a cache failure from breaking the network response.
          try {
            await cache.put(event.request, responseToCache);
            console.log('[Service Worker] Caching new resource:', event.request.url);
          } catch (error) {
            console.error('[Service Worker] Failed to cache resource:', event.request.url, error);
            if (error.name === 'QuotaExceededError') {
              console.error('[Service Worker] Cache quota exceeded');
            }
          }
        }
        return networkResponse;
      } catch (error) {
        console.error('[Service Worker] Fetch failed:', error);
        // You could return a custom offline page here
        throw error;
      }
    })()
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
