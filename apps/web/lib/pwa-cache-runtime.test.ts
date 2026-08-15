import { describe, expect, it, vi } from 'vitest';

import {
  cacheFirstStatic,
  networkFirstNavigation,
  staleWhileRevalidateStatic,
} from '../public/sw-runtime.js';

const origin = 'https://family.example';

function validatesCriteria(criteria: readonly string[]): string {
  return `[validatesCriteria: ${criteria.join(', ')}]`;
}

function cacheStorage(cached?: Response) {
  const put = vi.fn().mockResolvedValue(undefined);
  return {
    storage: {
      match: vi.fn().mockResolvedValue(cached),
      open: vi.fn().mockResolvedValue({ put }),
    } as unknown as CacheStorage,
    put,
  };
}

function publicResponse(path: string) {
  const result = new Response(path);
  Object.defineProperty(result, 'url', { value: `${origin}${path}` });
  return result;
}

describe('PWA cache runtime', () => {
  it(`uses the network for navigation and returns the offline page after failure ${validatesCriteria(['Requirement 11.2'])}`, async () => {
    const online = publicResponse('/dashboard');
    const request = new Request(`${origin}/dashboard`, { credentials: 'include' });
    const first = cacheStorage();
    const fetcher = vi.fn().mockResolvedValue(online);

    await expect(networkFirstNavigation(request, first.storage, fetcher)).resolves.toBe(online);
    expect(fetcher).toHaveBeenCalledWith(request);
    expect(first.storage.open).not.toHaveBeenCalled();

    const offline = publicResponse('/offline');
    const second = cacheStorage(offline);
    await expect(
      networkFirstNavigation(
        request,
        second.storage,
        vi.fn().mockRejectedValue(new Error('offline')),
      ),
    ).resolves.toBe(offline);
    expect(second.storage.match).toHaveBeenCalledWith('/offline');
  });

  it(`serves hashed assets cache-first without a network request ${validatesCriteria(['Requirement 11.2'])}`, async () => {
    const cached = publicResponse('/_next/static/app.js');
    const { storage } = cacheStorage(cached);
    const fetcher = vi.fn();

    await expect(
      cacheFirstStatic(new Request(`${origin}/_next/static/app.js`), storage, origin, fetcher),
    ).resolves.toBe(cached);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it(`returns stale public assets while refreshing with a credential-free request ${validatesCriteria(['Requirement 11.2'])}`, async () => {
    const cached = publicResponse('/icons/familystar-192.svg');
    const fresh = publicResponse('/icons/familystar-192.svg');
    const { storage, put } = cacheStorage(cached);
    const fetcher = vi.fn().mockResolvedValue(fresh);
    const waitUntil = vi.fn();

    await expect(
      staleWhileRevalidateStatic(
        new Request(`${origin}/icons/familystar-192.svg`, { credentials: 'include' }),
        storage,
        origin,
        waitUntil,
        fetcher,
      ),
    ).resolves.toBe(cached);

    expect(waitUntil).toHaveBeenCalledOnce();
    const update = waitUntil.mock.calls[0]?.[0];
    expect(update).toBeDefined();
    await update;
    const fetchedRequest = fetcher.mock.calls[0]?.[0] as Request;
    expect(fetchedRequest.credentials).toBe('omit');
    expect(put).toHaveBeenCalledOnce();
  });
});
