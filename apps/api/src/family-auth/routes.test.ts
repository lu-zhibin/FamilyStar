import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import type { InvitationOperations } from './invitation-service.js';
import type { PasswordHasher } from './password.js';
import { FamilyAuthService } from './service.js';
import type { FamilyAuthRepository, SessionStore } from './types.js';

function createService(sessionStore?: SessionStore): FamilyAuthService {
  const repository: FamilyAuthRepository = {
    async createFamilyWithParent(input) {
      return {
        id: 'parent-1',
        familyId: 'family-1',
        familyCode: '123456',
        nickname: input.nickname,
        email: input.email,
        passwordHash: input.passwordHash,
      };
    },
    async findActiveParentByEmail(email) {
      return email === 'parent@example.com'
        ? {
            id: 'parent-1',
            familyId: 'family-1',
            familyCode: '123456',
            nickname: 'Parent',
            email,
            passwordHash: 'hash',
          }
        : null;
    },
    async findActiveFamilyCodeById(familyId) {
      return familyId === 'family-1' ? '123456' : null;
    },
  };
  const sessions: SessionStore = sessionStore ?? {
    async create() {
      return 'opaque-session';
    },
    async read() {
      return null;
    },
    async revoke() {},
    async revokeSubject() {},
  };
  const passwords: PasswordHasher = {
    async hash() {
      return 'hash';
    },
    async verify(password) {
      return password === 'correct-password';
    },
  };
  return new FamilyAuthService(repository, sessions, passwords);
}

describe('family auth HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('registers a parent and sets an HttpOnly session cookie', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familyAuthService: createService(),
    });
    const response = await app.request('/api/v1/auth/parent/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        family_name: 'Star Family',
        nickname: 'Parent',
        email: 'new@example.com',
        password: 'twelve-chars-password',
        time_zone: 'Asia/Shanghai',
      }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=opaque-session');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(await response.json()).toMatchObject({
      success: true,
      data: { parent: { familyId: 'family-1', familyCode: '123456' } },
    });
  });

  it('returns stable input and credential failures', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familyAuthService: createService(),
    });
    const invalid = await app.request('/api/v1/auth/parent/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(invalid.status).toBe(400);

    const unauthorized = await app.request('/api/v1/auth/parent/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'parent@example.com', password: 'wrong-password' }),
    });
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('creates a copyable invitation from the parent session cookie', async () => {
    const invitations: InvitationOperations = {
      async create(input) {
        expect(input).toMatchObject({
          sessionToken: 'parent-session',
          email: 'second@example.com',
        });
        return {
          invitation: {
            id: 'invitation-1',
            email: input.email,
            expiresAt: '2026-08-06T12:00:00.000Z',
          },
          delivery: 'copy-link',
          invitationLink: 'http://localhost:3000/invite?token=opaque-token',
        };
      },
      async accept() {
        throw new Error('Unexpected acceptance call.');
      },
      async resend() {
        throw new Error('Unexpected resend call.');
      },
      async revoke() {
        throw new Error('Unexpected revoke call.');
      },
    };
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familyAuthService: createService(),
      invitationService: invitations,
    });
    const response = await app.request('/api/v1/auth/parent/invitations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=parent-session',
      },
      body: JSON.stringify({ email: 'second@example.com' }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=parent-session');
    expect(await response.json()).toMatchObject({
      success: true,
      data: { delivery: 'copy-link', invitationLink: expect.stringContaining('/invite?token=') },
    });
  });

  it('accepts an invitation and sets the new parent session cookie', async () => {
    const invitations: InvitationOperations = {
      async create() {
        throw new Error('Unexpected creation call.');
      },
      async accept(input) {
        expect(input).toEqual({
          token: 'a'.repeat(32),
          nickname: 'Second Parent',
          password: 'twelve-chars-password',
        });
        return {
          parent: {
            id: 'parent-2',
            familyId: 'family-1',
            familyCode: '123456',
            nickname: input.nickname,
            email: 'second@example.com',
          },
          sessionToken: 'second-parent-session',
        };
      },
      async resend() {
        throw new Error('Unexpected resend call.');
      },
      async revoke() {
        throw new Error('Unexpected revoke call.');
      },
    };
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familyAuthService: createService(),
      invitationService: invitations,
    });
    const response = await app.request('/api/v1/auth/parent/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: 'a'.repeat(32),
        nickname: 'Second Parent',
        password: 'twelve-chars-password',
      }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain(
      'familystar_session=second-parent-session',
    );
    expect(await response.json()).toMatchObject({
      success: true,
      data: { parent: { id: 'parent-2', familyId: 'family-1' } },
    });
  });

  it('resends and revokes a family invitation from the creator session', async () => {
    const invitationId = '00000000-0000-4000-8000-000000000003';
    const invitations: InvitationOperations = {
      async create() {
        throw new Error('Unexpected creation call.');
      },
      async accept() {
        throw new Error('Unexpected acceptance call.');
      },
      async resend(input) {
        expect(input).toMatchObject({
          sessionToken: 'parent-session',
          invitationId,
        });
        return {
          invitation: {
            id: invitationId,
            email: 'second@example.com',
            expiresAt: '2026-08-12T12:00:00.000Z',
          },
          delivery: 'email',
        };
      },
      async revoke(input) {
        expect(input).toEqual({ sessionToken: 'parent-session', invitationId });
        return { invitation: { id: invitationId, status: 'expired' } };
      },
    };
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familyAuthService: createService(),
      invitationService: invitations,
    });
    const headers = { cookie: 'familystar_session=parent-session' };

    const resend = await app.request(`/api/v1/family/invitations/${invitationId}/resend`, {
      method: 'POST',
      headers,
    });
    expect(resend.status).toBe(200);
    expect(resend.headers.get('set-cookie')).toContain('familystar_session=parent-session');
    expect(await resend.json()).toMatchObject({
      data: { delivery: 'email', invitation: { id: invitationId } },
    });

    const revoke = await app.request(`/api/v1/family/invitations/${invitationId}`, {
      method: 'DELETE',
      headers,
    });
    expect(revoke.status).toBe(200);
    expect(await revoke.json()).toMatchObject({
      data: { invitation: { id: invitationId, status: 'expired' } },
    });
  });

  it('rejects malformed invitation management identifiers', async () => {
    const invitations: InvitationOperations = {
      create: vi.fn(),
      accept: vi.fn(),
      resend: vi.fn(),
      revoke: vi.fn(),
    };
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familyAuthService: createService(),
      invitationService: invitations,
    });

    const response = await app.request('/api/v1/family/invitations/not-a-uuid/resend', {
      method: 'POST',
    });
    expect(response.status).toBe(400);
    expect(invitations.resend).not.toHaveBeenCalled();
  });

  it('reads and rolls a valid session cookie', async () => {
    const sessionStore: SessionStore = {
      async create() {
        return 'opaque-session';
      },
      async read(token) {
        return token === 'opaque-session'
          ? {
              subjectId: 'parent-1',
              familyId: 'family-1',
              role: 'parent',
              issuedAt: '2026-08-01T00:00:00.000Z',
            }
          : null;
      },
      async revoke() {},
      async revokeSubject() {},
    };
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familyAuthService: createService(sessionStore),
      sessionStore,
    });

    const response = await app.request('/api/v1/auth/session', {
      headers: { cookie: 'familystar_session=opaque-session' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=opaque-session');
    expect(await response.json()).toMatchObject({
      data: {
        role: 'parent',
        subject_id: 'parent-1',
        family_id: 'family-1',
        family_code: '123456',
      },
    });
    expect((await app.request('/api/v1/auth/session')).status).toBe(401);
  });

  it('revokes the current session and clears its cookie on logout', async () => {
    const revoke = vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined);
    const sessionStore: SessionStore = {
      async create() {
        return 'opaque-session';
      },
      async read(token) {
        return token === 'opaque-session'
          ? {
              subjectId: 'parent-1',
              familyId: 'family-1',
              role: 'parent',
              issuedAt: '2026-08-01T00:00:00.000Z',
            }
          : null;
      },
      revoke,
      async revokeSubject() {},
    };
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familyAuthService: createService(sessionStore),
      sessionStore,
    });

    const response = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        cookie: 'familystar_session=opaque-session',
        origin: 'http://localhost:3000',
      },
    });

    expect(response.status).toBe(200);
    expect(revoke).toHaveBeenCalledWith('opaque-session');
    expect(response.headers.get('set-cookie')).toContain('familystar_session=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(await response.json()).toMatchObject({ data: { logged_out: true } });
  });
});
