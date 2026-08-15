import { describe, expect, it, vi } from 'vitest';

import { readPortalSession } from './server-auth';

describe('readPortalSession', () => {
  it('reads the trusted role from the internal session endpoint without caching', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            role: 'parent',
            subject_id: 'parent-1',
            family_id: 'family-1',
            family_code: '012345',
          },
          meta: { request_id: 'request-1', timestamp: '2026-08-01T00:00:00.000Z' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(readPortalSession('opaque-token', fetcher)).resolves.toMatchObject({
      role: 'parent',
      family_code: '012345',
    });
    expect(fetcher).toHaveBeenCalledWith('http://localhost:3001/api/v1/auth/session', {
      cache: 'no-store',
      headers: { Cookie: 'familystar_session=opaque-token' },
    });
  });

  it('treats rejected and unavailable session checks as unauthenticated', async () => {
    const unauthorized = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const unavailable = vi.fn<typeof fetch>().mockRejectedValue(new Error('unavailable'));

    await expect(readPortalSession('expired', unauthorized)).resolves.toBeNull();
    await expect(readPortalSession('expired', unavailable)).resolves.toBeNull();
  });
});
