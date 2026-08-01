import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FAMILY_SETTINGS } from '../family-auth/constants.js';
import type { AuthSession, SessionStore } from '../family-auth/types.js';
import {
  FamilySettingsNotFoundError,
  FamilySettingsService,
  FamilySettingsSessionRequiredError,
  InvalidFamilySettingsError,
} from './service.js';
import type { FamilySettingsRepository } from './types.js';

const parentSession: AuthSession = {
  subjectId: 'parent-1',
  familyId: 'family-1',
  role: 'parent',
  issuedAt: '2026-07-30T00:00:00.000Z',
};

function dependencies(raw: Record<string, unknown> | null = {}) {
  const repository: FamilySettingsRepository = {
    findActiveSettings: vi.fn().mockResolvedValue(raw),
    updateActiveSettings: vi.fn().mockResolvedValue(true),
  };
  const sessions: SessionStore = {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue(parentSession),
    revokeSubject: vi.fn(),
  };
  return { repository, sessions };
}

describe('FamilySettingsService', () => {
  it('returns complete defaults for a family with empty settings', async () => {
    const service = new FamilySettingsService(dependencies());

    await expect(service.get({ sessionToken: 'token' })).resolves.toEqual({
      settings: {
        timeZone: DEFAULT_FAMILY_SETTINGS.timeZone,
        checkInDeadline: '23:59',
        makeupDays: 3,
        reviewTimeoutHours: 48,
        autoApproveQuota: 0,
        streakMultipliers: DEFAULT_FAMILY_SETTINGS.streakMultipliers,
      },
    });
  });

  it('updates only submitted fields and preserves unrelated family settings', async () => {
    const deps = dependencies({ makeupDays: 2, broadcastEnabled: false });
    const service = new FamilySettingsService(deps);

    await expect(
      service.update({
        sessionToken: 'token',
        settings: { timeZone: 'America/New_York', reviewTimeoutHours: 0 },
      }),
    ).resolves.toMatchObject({
      settings: { timeZone: 'America/New_York', makeupDays: 2, reviewTimeoutHours: 0 },
    });
    expect(deps.repository.updateActiveSettings).toHaveBeenCalledWith(
      'family-1',
      expect.objectContaining({ broadcastEnabled: false, makeupDays: 2, reviewTimeoutHours: 0 }),
    );
  });

  it('rejects child sessions and missing families', async () => {
    const childDeps = dependencies();
    vi.mocked(childDeps.sessions.read).mockResolvedValue({ ...parentSession, role: 'child' });
    await expect(
      new FamilySettingsService(childDeps).get({ sessionToken: 'token' }),
    ).rejects.toBeInstanceOf(FamilySettingsSessionRequiredError);

    await expect(
      new FamilySettingsService(dependencies(null)).get({ sessionToken: 'token' }),
    ).rejects.toBeInstanceOf(FamilySettingsNotFoundError);
  });

  it('rejects invalid time zones, numeric values, deadlines, and streak tiers', async () => {
    const service = new FamilySettingsService(dependencies());
    const invalidSettings = [
      { timeZone: 'Mars/Olympus' },
      { makeupDays: -1 },
      { reviewTimeoutHours: 1.5 },
      { checkInDeadline: '24:00' },
      { streakMultipliers: [{ days: 3, multiplier: 1.5 }] },
      {},
    ];

    for (const settings of invalidSettings) {
      await expect(service.update({ sessionToken: 'token', settings })).rejects.toBeInstanceOf(
        InvalidFamilySettingsError,
      );
    }
  });
});
