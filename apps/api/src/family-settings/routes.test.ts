import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import {
  FamilyCreatorRequiredError,
  FamilyModuleConflictError,
  FamilySettingsSessionRequiredError,
} from './service.js';
import type { FamilyProfile, FamilySettings, FamilySettingsOperations } from './types.js';
import { resolveFamilyModules } from './service.js';

const settings: FamilySettings = {
  timeZone: 'Asia/Shanghai',
  checkInDeadline: '23:59',
  makeupDays: 3,
  reviewTimeoutHours: 48,
  autoApproveQuota: 0,
  streakMultipliers: [
    { days: 3, multiplier: 1.5 },
    { days: 7, multiplier: 2 },
    { days: 14, multiplier: 3 },
    { days: 30, multiplier: 5 },
    { days: 60, multiplier: 8 },
    { days: 100, multiplier: 10 },
  ],
};

const profile: FamilyProfile = {
  id: 'family-1',
  name: '星星家',
  timeZone: 'Asia/Shanghai',
  parents: [
    {
      id: 'parent-1',
      nickname: '妈妈',
      email: 'parent@example.com',
      isCreator: true,
      joinedAt: new Date('2026-07-30T00:00:00.000Z'),
    },
  ],
  invitations: [
    {
      id: 'invite-1',
      email: 'second@example.com',
      status: 'pending',
      expiresAt: new Date('2026-08-10T00:00:00.000Z'),
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
    },
  ],
  permissions: { canUpdateName: true, canManageInvitations: true },
};

function operations(): FamilySettingsOperations {
  return {
    async get(input) {
      expect(input.sessionToken).toBe('parent-session');
      return { settings };
    },
    async update(input) {
      expect(input).toMatchObject({
        sessionToken: 'parent-session',
        settings: { makeupDays: 0, reviewTimeoutHours: 0 },
      });
      return { settings: { ...settings, ...input.settings } };
    },
    async getProfile(input) {
      expect(input.sessionToken).toBe('parent-session');
      return { profile };
    },
    async updateProfile(input) {
      expect(input).toMatchObject({
        sessionToken: 'parent-session',
        profile: { name: '新家庭', timeZone: 'Europe/Berlin' },
      });
      return { profile: { ...profile, name: '新家庭', timeZone: 'Europe/Berlin' } };
    },
    async listParents(input) {
      expect(input.sessionToken).toBe('parent-session');
      return {
        parents: profile.parents,
        invitations: profile.invitations,
        permissions: profile.permissions,
      };
    },
    async getModules(input) {
      expect(input.sessionToken).toBe('parent-session');
      return { modules: resolveFamilyModules({}, 0) };
    },
    async updateModules(input) {
      expect(input).toMatchObject({
        sessionToken: 'parent-session',
        expectedVersion: 0,
        modules: { rewards: false },
      });
      return { modules: resolveFamilyModules({ modules: input.modules }, 1) };
    },
  };
}

describe('family settings HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('returns settings in the public API shape and renews the session cookie', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService: operations(),
    });
    const response = await app.request('/api/v1/family/settings', {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=parent-session');
    expect(await response.json()).toMatchObject({
      data: {
        settings: {
          time_zone: 'Asia/Shanghai',
          check_in_deadline: '23:59',
          makeup_days: 3,
          streak_multipliers: settings.streakMultipliers,
        },
      },
    });
  });

  it('accepts a partial settings update', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService: operations(),
    });
    const response = await app.request('/api/v1/family/settings', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=parent-session',
      },
      body: JSON.stringify({ makeup_days: 0, review_timeout_hours: 0 }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { settings: { makeup_days: 0, review_timeout_hours: 0 } },
    });
  });

  it('rejects malformed updates before calling the service', async () => {
    const familySettingsService = operations();
    familySettingsService.update = vi.fn();
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService,
    });
    const response = await app.request('/api/v1/family/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ check_in_deadline: '24:00' }),
    });

    expect(response.status).toBe(400);
    expect(familySettingsService.update).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('maps missing parent authentication to unauthorized', async () => {
    const familySettingsService = operations();
    familySettingsService.get = async () => {
      throw new FamilySettingsSessionRequiredError();
    };
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService,
    });
    const response = await app.request('/api/v1/family/settings');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('returns the family profile, active parents, invitation summary, and permissions', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService: operations(),
    });
    const response = await app.request('/api/v1/family/profile', {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        profile: {
          id: 'family-1',
          name: '星星家',
          time_zone: 'Asia/Shanghai',
          parents: [{ id: 'parent-1', is_creator: true }],
          invitations: [{ id: 'invite-1', status: 'pending' }],
          permissions: { can_update_name: true, can_manage_invitations: true },
        },
      },
    });
  });

  it('accepts a creator profile update', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService: operations(),
    });
    const response = await app.request('/api/v1/family/profile', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=parent-session',
      },
      body: JSON.stringify({ name: '新家庭', time_zone: 'Europe/Berlin' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { profile: { name: '新家庭', time_zone: 'Europe/Berlin' } },
    });
  });

  it('returns active parents and invitations from the family scope', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService: operations(),
    });
    const response = await app.request('/api/v1/family/parents', {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        parents: [{ id: 'parent-1', joined_at: '2026-07-30T00:00:00.000Z' }],
        invitations: [{ id: 'invite-1', expires_at: '2026-08-10T00:00:00.000Z' }],
        permissions: { can_manage_invitations: true },
      },
    });
  });

  it('rejects malformed profile updates before calling the service', async () => {
    const familySettingsService = operations();
    familySettingsService.updateProfile = vi.fn();
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService,
    });
    const response = await app.request('/api/v1/family/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    expect(response.status).toBe(400);
    expect(familySettingsService.updateProfile).not.toHaveBeenCalled();
  });

  it('maps co-parent name restrictions to forbidden', async () => {
    const familySettingsService = operations();
    familySettingsService.updateProfile = async () => {
      throw new FamilyCreatorRequiredError();
    };
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService,
    });
    const response = await app.request('/api/v1/family/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '受限修改' }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('returns the shared module read model using the snake_case API envelope', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService: operations(),
    });
    const response = await app.request('/api/v1/family/modules', {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        modules: {
          version: 0,
          modules: expect.arrayContaining([
            {
              id: 'family-settings',
              category: 'core',
              enabled: true,
              configurable: false,
              dependencies: ['authentication'],
            },
          ]),
        },
      },
    });
  });

  it('accepts a versioned optional module patch', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService: operations(),
    });
    const response = await app.request('/api/v1/family/modules', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=parent-session',
      },
      body: JSON.stringify({ version: 0, modules: { rewards: false } }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        modules: {
          version: 1,
          modules: expect.arrayContaining([
            expect.objectContaining({ id: 'rewards', enabled: false }),
          ]),
        },
      },
    });
  });

  it('maps dependency and version failures to a stable conflict contract', async () => {
    const familySettingsService = operations();
    familySettingsService.updateModules = async () => {
      throw new FamilyModuleConflictError('DEPENDENCY_IN_USE', 'levels', ['rewards']);
    };
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', familySettingsService });
    const response = await app.request('/api/v1/family/modules', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 0, modules: { levels: false } }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'CONFLICT',
        details: {
          reason: 'DEPENDENCY_IN_USE',
          module: 'levels',
          dependencies: ['rewards'],
        },
      },
    });
  });

  it('rejects core module keys and empty module patches at the route boundary', async () => {
    const familySettingsService = operations();
    familySettingsService.updateModules = vi.fn();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', familySettingsService });

    for (const body of [
      { version: 0, modules: {} },
      { version: 0, modules: { tasks: false } },
      { version: -1, modules: { rewards: false } },
    ]) {
      const response = await app.request('/api/v1/family/modules', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
    }
    expect(familySettingsService.updateModules).not.toHaveBeenCalled();
  });
});
