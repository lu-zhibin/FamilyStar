import { describe, expect, it } from 'vitest';

import {
  FAMILY_STAR_CACHE_PREFIX,
  PWA_CACHE_VERSION,
  SHELL_CACHE_NAME,
  STATIC_CACHE_NAME,
  classifyRequest,
  createPublicCacheRequest,
  isCacheableStaticResponse,
  isFamilyStarCacheName,
  obsoleteFamilyStarCacheNames,
} from '../public/sw-policy.js';

const origin = 'https://family.example';

function validatesCriteria(criteria: readonly string[]): string {
  return `[validatesCriteria: ${criteria.join(', ')}]`;
}

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
  it(`uses an explicit version and recognizes only FamilyStar caches ${validatesCriteria(['Requirement 11.2'])}`, () => {
    expect(PWA_CACHE_VERSION).toMatch(/^2026-08-task-12-1-v\d+$/);
    expect(isFamilyStarCacheName(`${FAMILY_STAR_CACHE_PREFIX}shell-old`)).toBe(true);
    expect(isFamilyStarCacheName('another-app-cache')).toBe(false);
  });

  it(`property: removes every obsolete FamilyStar cache while preserving active and foreign caches ${validatesCriteria(['Requirement 11.2'])}`, () => {
    for (let run = 0; run < 64; run += 1) {
      const oldShell = `${FAMILY_STAR_CACHE_PREFIX}shell-old-${run}`;
      const oldStatic = `${FAMILY_STAR_CACHE_PREFIX}static-old-${run}`;
      const foreign = `other-app-${run}`;
      const names = [foreign, STATIC_CACHE_NAME, oldStatic, SHELL_CACHE_NAME, oldShell].sort(
        (left, right) =>
          (left.charCodeAt(run % left.length) % 3) - (right.charCodeAt(run % right.length) % 3),
      );
      expect(obsoleteFamilyStarCacheNames(names).sort()).toEqual([oldShell, oldStatic].sort());
    }
  });

  it(`property: classifies same-origin GET navigation and static resources deterministically ${validatesCriteria(['Requirement 11.2'])}`, () => {
    expect(classifyRequest(request('/dashboard', { destination: 'document' }), origin)).toBe(
      'navigation',
    );
    expect(classifyRequest(request('/_next/static/chunks/app.js'), origin)).toBe('cache-first');
    expect(classifyRequest(request('/icons/familystar-192.svg'), origin)).toBe(
      'stale-while-revalidate',
    );
    for (let run = 0; run < 64; run += 1) {
      expect(classifyRequest(request(`/_next/static/chunks/${run}.js`), origin)).toBe(
        'cache-first',
      );
      expect(classifyRequest(request(`/icons/generated-${run}.svg`), origin)).toBe(
        'stale-while-revalidate',
      );
    }
  });

  it(`property: bypasses API, auth, private, writes, cross-origin, and authorized requests ${validatesCriteria(['Requirement 11.2'])}`, () => {
    expect(classifyRequest(request('/api/v1/auth/session'), origin)).toBe('bypass');
    expect(classifyRequest(request('/asset.js', { method: 'POST' }), origin)).toBe('bypass');
    expect(classifyRequest(new Request('https://cdn.example/asset.js'), origin)).toBe('bypass');
    expect(
      classifyRequest(
        request('/asset.js', { headers: { authorization: 'Bearer secret' } }),
        origin,
      ),
    ).toBe('bypass');
    for (let run = 0; run < 64; run += 1) {
      for (const prefix of ['/api', '/auth', '/private']) {
        expect(classifyRequest(request(`${prefix}/asset-${run}.js`), origin)).toBe('bypass');
      }
    }
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

  it(`property: caches only public successful same-origin responses without Set-Cookie ${validatesCriteria(['Requirement 11.2'])}`, () => {
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
    for (let run = 0; run < 64; run += 1) {
      expect(
        isCacheableStaticResponse(
          response(`${origin}/asset-${run}.js`, { headers: { 'set-cookie': `session=${run}` } }),
          origin,
        ),
      ).toBe(false);
    }
  });
});
