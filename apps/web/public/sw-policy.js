export const PWA_CACHE_VERSION = '2026-08-task-12-1-v1';
export const FAMILY_STAR_CACHE_PREFIX = 'familystar-pwa-';
export const SHELL_CACHE_NAME = `${FAMILY_STAR_CACHE_PREFIX}shell-${PWA_CACHE_VERSION}`;
export const STATIC_CACHE_NAME = `${FAMILY_STAR_CACHE_PREFIX}static-${PWA_CACHE_VERSION}`;
export const OFFLINE_URL = '/offline';
export const APP_SHELL_URLS = Object.freeze([
  '/',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/familystar-192.svg',
  '/icons/familystar-512.svg',
]);

export function isFamilyStarCacheName(cacheName) {
  return cacheName.startsWith(FAMILY_STAR_CACHE_PREFIX);
}

export function obsoleteFamilyStarCacheNames(cacheNames) {
  return cacheNames.filter(
    (cacheName) =>
      isFamilyStarCacheName(cacheName) &&
      cacheName !== SHELL_CACHE_NAME &&
      cacheName !== STATIC_CACHE_NAME,
  );
}

export function classifyRequest(request, applicationOrigin) {
  if (request.method !== 'GET') return 'bypass';

  const url = new URL(request.url);
  if (
    url.origin !== applicationOrigin ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/auth' ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/private' ||
    url.pathname.startsWith('/private/')
  ) {
    return 'bypass';
  }

  if (request.headers.has('authorization')) return 'bypass';
  if (request.mode === 'navigate' || request.destination === 'document') return 'navigation';
  if (url.pathname.startsWith('/_next/static/')) return 'cache-first';

  const staticDestination = ['font', 'image', 'script', 'style', 'worker'].includes(
    request.destination,
  );
  const staticPath =
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/sw.js' ||
    url.pathname === '/sw-policy.js' ||
    url.pathname === '/sw-runtime.js' ||
    /\.(?:css|ico|js|png|svg|webp|woff2?)$/i.test(url.pathname);

  return staticDestination || staticPath ? 'stale-while-revalidate' : 'bypass';
}

export function createPublicCacheRequest(request) {
  const headers = new Headers();
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);

  return new Request(request.url, {
    method: 'GET',
    headers,
    credentials: 'omit',
    mode: 'same-origin',
    redirect: 'follow',
  });
}

export function isCacheableStaticResponse(response, applicationOrigin) {
  if (!response || !response.ok || response.status !== 200 || response.redirected) return false;
  if (response.type === 'opaque' || new URL(response.url).origin !== applicationOrigin)
    return false;

  const cacheControl = response.headers.get('cache-control')?.toLowerCase() ?? '';
  if (/(?:^|,)\s*(?:no-store|private)(?:\s|,|$)/.test(cacheControl)) return false;
  if (response.headers.has('set-cookie') || response.headers.get('vary')?.trim() === '*')
    return false;
  return true;
}
