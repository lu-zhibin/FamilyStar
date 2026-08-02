import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { requestContext } from '../http/request-context.js';
import type { AppEnvironment } from '../http/types.js';
import type { AuditWriter } from './audit.js';
import { createSecurityMiddleware } from './middleware.js';

const familyId = '10000000-0000-4000-8000-000000000001';
const actorId = '20000000-0000-4000-8000-000000000001';

function application(role: 'parent' | 'child', auditWriter?: AuditWriter) {
  const sessions = {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue({
      subjectId: actorId,
      familyId,
      role,
      issuedAt: '2026-07-31T00:00:00.000Z',
    }),
    revoke: vi.fn(),
    revokeSubject: vi.fn(),
  };
  const app = new Hono<AppEnvironment>();
  app.use('*', requestContext);
  app.use(
    '/api/*',
    createSecurityMiddleware({
      publicBaseUrl: 'http://localhost:3000',
      sessions,
      ...(auditWriter === undefined ? {} : { auditWriter }),
    }),
  );
  app.get('/api/v1/family/tasks', (context) =>
    context.json({ familyId: context.get('authSession')?.familyId }),
  );
  app.get('/api/v1/family/submission-reviews/pending', (context) =>
    context.json({ familyId: context.get('authSession')?.familyId }),
  );
  app.get('/api/v1/tasks/me', (context) =>
    context.json({ childId: context.get('authSession')?.subjectId }),
  );
  app.post('/api/v1/family/tasks', (context) => context.json({ ok: true }, 201));
  app.post('/api/v1/check-ins', (context) => context.json({ ok: true }, 201));
  app.get('/api/v1/auth/session', (context) =>
    context.json({ role: context.get('authSession')?.role }),
  );
  app.post('/api/v1/auth/child/family', (context) => context.json({ ok: true }));
  app.post('/api/v1/auth/child/login', (context) => context.json({ ok: true }));
  return { app, sessions };
}

const cookie = { Cookie: 'familystar_session=session-token' };

describe('security middleware', () => {
  it('injects the server-side family context for an authenticated parent', async () => {
    const { app } = application('parent');
    const response = await app.request('/api/v1/family/tasks', { headers: cookie });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ familyId });
  });

  it('protects session reads while leaving child family lookup and login public', async () => {
    const { app, sessions } = application('child');
    expect((await app.request('/api/v1/auth/session', { headers: cookie })).status).toBe(200);
    expect((await app.request('/api/v1/auth/session')).status).toBe(401);
    sessions.read.mockClear();

    expect(
      (
        await app.request('/api/v1/auth/child/family', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ family_code: '123456' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request('/api/v1/auth/child/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ family_code: '123456' }),
        })
      ).status,
    ).toBe(200);
    expect(sessions.read).not.toHaveBeenCalled();
  });

  it('rejects a missing session and a child accessing a parent route', async () => {
    const parent = application('parent');
    parent.sessions.read.mockResolvedValueOnce(null);
    expect((await parent.app.request('/api/v1/family/tasks', { headers: cookie })).status).toBe(
      401,
    );

    const child = application('child');
    expect((await child.app.request('/api/v1/family/tasks', { headers: cookie })).status).toBe(403);
    expect(
      (await child.app.request('/api/v1/family/submission-reviews/pending', { headers: cookie }))
        .status,
    ).toBe(403);
  });

  it('rejects a parent accessing a child-only route', async () => {
    const { app } = application('parent');
    const response = await app.request('/api/v1/check-ins', {
      method: 'POST',
      headers: { ...cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('allows only a child session to read current assignments', async () => {
    const child = application('child');
    expect((await child.app.request('/api/v1/tasks/me', { headers: cookie })).status).toBe(200);
    expect((await child.app.request('/api/v1/tasks/me')).status).toBe(401);

    const parent = application('parent');
    expect((await parent.app.request('/api/v1/tasks/me', { headers: cookie })).status).toBe(403);
    expect(
      (
        await child.app.request('/api/v1/tasks/me?family_id=another-family', {
          headers: cookie,
        })
      ).status,
    ).toBe(403);
  });

  it('rejects a forged family id from headers, query parameters or JSON', async () => {
    const { app } = application('parent');
    const headerResponse = await app.request('/api/v1/family/tasks', {
      headers: { ...cookie, 'X-Family-Id': 'another-family' },
    });
    const queryResponse = await app.request('/api/v1/family/tasks?family_id=another-family', {
      headers: cookie,
    });
    const bodyResponse = await app.request('/api/v1/family/tasks', {
      method: 'POST',
      headers: { ...cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ family_id: 'another-family' }),
    });

    expect([headerResponse.status, queryResponse.status, bodyResponse.status]).toEqual([
      403, 403, 403,
    ]);
  });

  it('rejects cross-site writes and permits the configured origin', async () => {
    const { app } = application('parent');
    const rejected = await app.request('/api/v1/family/tasks', {
      method: 'POST',
      headers: { ...cookie, Origin: 'https://attacker.example' },
    });
    const accepted = await app.request('/api/v1/family/tasks', {
      method: 'POST',
      headers: { ...cookie, Origin: 'http://localhost:3000' },
    });

    expect(rejected.status).toBe(403);
    expect(accepted.status).toBe(201);
  });

  it('writes allow-listed audit metadata for successful and failed writes', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const { app } = application('parent', { write });
    await app.request('/api/v1/family/tasks', {
      method: 'POST',
      headers: {
        ...cookie,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'business-key',
      },
      body: JSON.stringify({ password: 'must-never-be-audited' }),
    });
    await app.request('/api/v1/check-ins', {
      method: 'POST',
      headers: { ...cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        familyId,
        actorId,
        businessKey: 'business-key',
        outcome: 'SUCCESS',
        metadata: { method: 'POST', path: '/api/v1/family/tasks', status: 201 },
      }),
    );
    expect(write).toHaveBeenNthCalledWith(2, expect.objectContaining({ outcome: 'FAILURE' }));
    expect(JSON.stringify(write.mock.calls)).not.toContain('must-never-be-audited');
  });
});
