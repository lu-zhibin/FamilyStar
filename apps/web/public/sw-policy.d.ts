export type CacheStrategy = 'bypass' | 'navigation' | 'cache-first' | 'stale-while-revalidate';

export const PWA_CACHE_VERSION: string;
export const FAMILY_STAR_CACHE_PREFIX: string;
export const SHELL_CACHE_NAME: string;
export const STATIC_CACHE_NAME: string;
export const OFFLINE_URL: string;
export const APP_SHELL_URLS: readonly string[];
export function isFamilyStarCacheName(cacheName: string): boolean;
export function classifyRequest(request: Request, applicationOrigin: string): CacheStrategy;
export function createPublicCacheRequest(request: Request): Request;
export function isCacheableStaticResponse(
  response: Response | null | undefined,
  applicationOrigin: string,
): boolean;
