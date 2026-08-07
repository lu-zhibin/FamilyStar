import { describe, expect, it } from 'vitest';

import {
  FAMILY_STAR_CACHE_PREFIX,
  PWA_CACHE_VERSION,
  classifyRequest,
  createPublicCacheRequest,
  isCacheableStaticResponse,
  isFamilyStarCacheName,
} from '../public/sw-policy.js';

const origin = 'https://family.example';

function request(path: string, options: RequestInit & { destination?: RequestDestination } = {}) {
  const result = new Request(new URL(path, origin), options);
  if (options.destination) {
    Object.defineProperty(result, 'destination', { value: options.destination });
  }
  return result;
}

function response(url: string, options: ResponseInit = {}) {
  const result = new Response('asset', { status: 200, ...options });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

describe('PWA cache policy', () => {
  it('uses an explicit version and recognizes only FamilyStar caches', () => {
    expect(PWA_CACHE_VERSION).toMatch(/^2026-08-task-12-1-v\d+$/);
    expect(isFamilyStarCacheName(`${FAMILY_STAR_CACHE_PREFIX}shell-old`)).toBe(true);
    expect(isFamilyStarCacheName('another-app-cache')).toBe(false);
  });

  it('routes navigation and static resources to their intended strategies', () => {
    expect(classifyRequest(request('/dashboard', { destination: 'document' }), origin)).toBe(
      'navigation',
    );
    expect(classifyRequest(request('/_next/static/chunks/app.js'), origin)).toBe('cache-first');
    expect(classifyRequest(request('/icons/familystar-192.svg'), origin)).toBe(
      'stale-while-revalidate',
    );
  });

  it('bypasses APIs, writes, cross-origin requests, and authorization-bearing requests', () => {
    expect(classifyRequest(request('/api/v1/auth/session'), origin)).toBe('bypass');
    expect(classifyRequest(request('/asset.js', { method: 'POST' }), origin)).toBe('bypass');
    expect(classifyRequest(new Request('https://cdn.example/asset.js'), origin)).toBe('bypass');
    expect(
      classifyRequest(
        request('/asset.js', { headers: { authorization: 'Bearer secret' } }),
        origin,
      ),
    ).toBe('bypass');
  });

  it('creates cookie-free cache requests and preserves only content negotiation', () => {
    const cacheRequest = createPublicCacheRequest(
      request('/asset.js', {
        credentials: 'include',
        headers: {
          accept: 'application/javascript',
          authorization: 'Bearer secret',
          cookie: 'familystar_session=secret',
          'x-private-value': 'secret',
        },
      }),
    );

    expect(cacheRequest.credentials).toBe('omit');
    expect(cacheRequest.headers.get('accept')).toBe('application/javascript');
    expect(cacheRequest.headers.has('authorization')).toBe(false);
    expect(cacheRequest.headers.has('cookie')).toBe(false);
    expect(cacheRequest.headers.has('x-private-value')).toBe(false);
  });

  it('caches only public, successful, same-origin static responses', () => {
    expect(isCacheableStaticResponse(response(`${origin}/asset.js`), origin)).toBe(true);
    expect(
      isCacheableStaticResponse(
        response(`${origin}/asset.js`, { headers: { 'cache-control': 'private, max-age=60' } }),
        origin,
      ),
    ).toBe(false);
    expect(
      isCacheableStaticResponse(
        response(`${origin}/asset.js`, { headers: { 'set-cookie': 'session=secret' } }),
        origin,
      ),
    ).toBe(false);
    expect(isCacheableStaticResponse(response('https://cdn.example/asset.js'), origin)).toBe(false);
  });
});
