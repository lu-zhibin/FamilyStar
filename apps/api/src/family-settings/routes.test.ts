import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { FamilySettingsSessionRequiredError } from './service.js';
import type { FamilySettings, FamilySettingsOperations } from './types.js';

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
});
