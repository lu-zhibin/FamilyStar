import {
  APP_SHELL_URLS,
  FAMILY_STAR_CACHE_PREFIX,
  SHELL_CACHE_NAME,
  STATIC_CACHE_NAME,
  classifyRequest,
  createPublicCacheRequest,
  isCacheableStaticResponse,
} from './sw-policy.js';
import {
  cacheFirstStatic,
  networkFirstNavigation,
  staleWhileRevalidateStatic,
} from './sw-runtime.js';

const applicationOrigin = self.location.origin;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE_NAME);
      await Promise.all(
        APP_SHELL_URLS.map(async (path) => {
          const request = createPublicCacheRequest(new Request(new URL(path, applicationOrigin)));
          const response = await fetch(request);
          if (!isCacheableStaticResponse(response, applicationOrigin)) {
            throw new Error(`Application shell response is not cacheable: ${path}`);
          }
          await cache.put(request, response);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(FAMILY_STAR_CACHE_PREFIX) &&
              cacheName !== SHELL_CACHE_NAME &&
              cacheName !== STATIC_CACHE_NAME,
          )
          .map((cacheName) => caches.delete(cacheName)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const strategy = classifyRequest(event.request, applicationOrigin);

  if (strategy === 'navigation') {
    event.respondWith(networkFirstNavigation(event.request, caches));
  } else if (strategy === 'cache-first') {
    event.respondWith(cacheFirstStatic(event.request, caches, applicationOrigin));
  } else if (strategy === 'stale-while-revalidate') {
    event.respondWith(
      staleWhileRevalidateStatic(event.request, caches, applicationOrigin, (promise) =>
        event.waitUntil(promise),
      ),
    );
  }
});
