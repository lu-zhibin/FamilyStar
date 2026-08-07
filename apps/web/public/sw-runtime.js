import {
  STATIC_CACHE_NAME,
  createPublicCacheRequest,
  isCacheableStaticResponse,
} from './sw-policy.js';

export async function networkFirstNavigation(request, cacheStorage, fetcher = fetch) {
  try {
    return await fetcher(request);
  } catch {
    return (await cacheStorage.match('/offline')) ?? Response.error();
  }
}

async function fetchAndCacheStatic(request, cacheStorage, applicationOrigin, fetcher) {
  const cacheRequest = createPublicCacheRequest(request);
  const response = await fetcher(cacheRequest);

  if (isCacheableStaticResponse(response, applicationOrigin)) {
    const cache = await cacheStorage.open(STATIC_CACHE_NAME);
    await cache.put(cacheRequest, response.clone());
  }

  return response;
}

export async function cacheFirstStatic(request, cacheStorage, applicationOrigin, fetcher = fetch) {
  const cacheRequest = createPublicCacheRequest(request);
  const cached = await cacheStorage.match(cacheRequest);
  return cached ?? (await fetchAndCacheStatic(request, cacheStorage, applicationOrigin, fetcher));
}

export async function staleWhileRevalidateStatic(
  request,
  cacheStorage,
  applicationOrigin,
  waitUntil,
  fetcher = fetch,
) {
  const cacheRequest = createPublicCacheRequest(request);
  const cached = await cacheStorage.match(cacheRequest);
  const update = fetchAndCacheStatic(request, cacheStorage, applicationOrigin, fetcher);

  if (cached) {
    waitUntil(update.catch(() => undefined));
    return cached;
  }

  return update;
}
