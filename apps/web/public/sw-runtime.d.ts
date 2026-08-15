type CacheStorageLike = Pick<CacheStorage, 'match' | 'open'>;

export function networkFirstNavigation(
  request: Request,
  cacheStorage: CacheStorageLike,
  fetcher?: typeof fetch,
): Promise<Response>;
export function cacheFirstStatic(
  request: Request,
  cacheStorage: CacheStorageLike,
  applicationOrigin: string,
  fetcher?: typeof fetch,
): Promise<Response>;
export function staleWhileRevalidateStatic(
  request: Request,
  cacheStorage: CacheStorageLike,
  applicationOrigin: string,
  waitUntil: (promise: Promise<unknown>) => void,
  fetcher?: typeof fetch,
): Promise<Response>;
