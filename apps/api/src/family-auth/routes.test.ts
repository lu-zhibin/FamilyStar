import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import type { InvitationOperations } from './invitation-service.js';
import type { PasswordHasher } from './password.js';
import { FamilyAuthService } from './service.js';
import type { FamilyAuthRepository, SessionStore } from './types.js';

function createService(): FamilyAuthService {
  const repository: FamilyAuthRepository = {
    async createFamilyWithParent(input) {
      return {
        id: 'parent-1',
        familyId: 'family-1',
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
            nickname: 'Parent',
            email,
            passwordHash: 'hash',
          }
        : null;
    },
  };
  const sessions: SessionStore = {
    async create() {
      return 'opaque-session';
    },
    async read() {
      return null;
    },
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
      data: { parent: { familyId: 'family-1' } },
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
            nickname: input.nickname,
            email: 'second@example.com',
          },
          sessionToken: 'second-parent-session',
        };
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
});
