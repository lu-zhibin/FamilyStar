import { describe, expect, it } from 'vitest';

import {
  resolveRouteAccessPolicy,
  ROUTE_ACCESS_POLICIES,
  type RequiredRole,
} from './access-policy.js';

describe('route access policy', () => {
  it.each([
    ['GET', '/api/v1/family/profile', 'parent'],
    ['PATCH', '/api/v1/family/profile', 'parent'],
    ['GET', '/api/v1/family/parents', 'parent'],
    ['POST', '/api/v1/family/invitations/invitation-id/resend', 'parent'],
    ['DELETE', '/api/v1/family/invitations/invitation-id', 'parent'],
    ['GET', '/api/v1/family/dashboard', 'parent'],
    ['GET', '/api/v1/family/analytics', 'parent'],
    ['GET', '/api/v1/rankings', 'authenticated'],
    ['GET', '/api/v1/points/me', 'child'],
    ['GET', '/api/v1/points/me/logs', 'child'],
    ['GET', '/api/v1/family/children/child-id/points', 'parent'],
    ['GET', '/api/v1/check-ins/me/history', 'child'],
    ['GET', '/api/v1/family/check-ins/history', 'parent'],
    ['POST', '/api/v1/media/access-urls', 'authenticated'],
  ] satisfies ReadonlyArray<readonly [string, string, RequiredRole]>)(
    'assigns %s %s to %s',
    (method, path, role) => {
      expect(resolveRouteAccessPolicy(method, path)?.role).toBe(role);
    },
  );

  it.each([
    ['GET', '/api/v1'],
    ['GET', '/api/v1/health'],
    ['POST', '/api/v1/auth/parent/register'],
    ['POST', '/api/v1/auth/parent/login'],
    ['POST', '/api/v1/auth/parent/invitations/accept'],
    ['POST', '/api/v1/auth/child/family'],
    ['POST', '/api/v1/auth/child/login'],
  ])('keeps %s %s public', (method, path) => {
    expect(resolveRouteAccessPolicy(method, path)).toBeNull();
  });

  it('requires authentication for an unregistered versioned route', () => {
    expect(resolveRouteAccessPolicy('GET', '/api/v1/future-capability')).toMatchObject({
      role: 'authenticated',
    });
  });

  it('registers an explicit GET policy for parent child-points reads', () => {
    expect(
      ROUTE_ACCESS_POLICIES.some(
        (policy) =>
          policy.role === 'parent' &&
          policy.methods.length === 1 &&
          policy.methods[0] === 'GET' &&
          policy.path.test('/api/v1/family/children/child-id/points'),
      ),
    ).toBe(true);
  });

  it('property: arbitrary unregistered versioned paths never become public', () => {
    for (let index = 0; index < 100; index += 1) {
      const path = `/api/v1/future-${index}/resource-${index}`;
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        expect(resolveRouteAccessPolicy(method, path)?.role).toBe('authenticated');
      }
    }
  });

  it('uses exact methods for public and role-specific routes', () => {
    expect(resolveRouteAccessPolicy('DELETE', '/api/v1/health')?.role).toBe('authenticated');
    expect(resolveRouteAccessPolicy('POST', '/api/v1/tasks/me')?.role).toBe('authenticated');
    expect(resolveRouteAccessPolicy('GET', '/api/v1/auth/child/password')?.role).toBe(
      'authenticated',
    );
  });

  it.each([
    ['GET', '/api/v1/family/analytics', 'analytics'],
    ['GET', '/api/v1/check-ins/me/history', 'growth-records'],
    ['GET', '/api/v1/levels/me', 'levels'],
    ['GET', '/api/v1/rewards', 'rewards'],
    ['GET', '/api/v1/badges/me', 'badges'],
    ['GET', '/api/v1/notifications', 'notifications'],
  ])('binds %s %s to the %s module', (method, path, module) => {
    expect(resolveRouteAccessPolicy(method, path)?.module).toBe(module);
  });
});
