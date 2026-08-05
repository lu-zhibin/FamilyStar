import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FAMILY_SETTINGS } from '../family-auth/constants.js';
import type { AuthSession, SessionStore } from '../family-auth/types.js';
import {
  FamilyCreatorRequiredError,
  FamilySettingsNotFoundError,
  FamilySettingsService,
  FamilySettingsSessionRequiredError,
  InvalidFamilyProfileError,
  InvalidFamilySettingsError,
} from './service.js';
import type { FamilyProfileRecord, FamilySettingsRepository } from './types.js';

const parentSession: AuthSession = {
  subjectId: 'parent-1',
  familyId: 'family-1',
  role: 'parent',
  issuedAt: '2026-07-30T00:00:00.000Z',
};

const profile: FamilyProfileRecord = {
  id: 'family-1',
  name: '星星家',
  settings: { timeZone: 'Asia/Shanghai', broadcastEnabled: false },
  createdById: 'parent-1',
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
};

function dependencies(
  raw: Record<string, unknown> | null = {},
  familyProfile: FamilyProfileRecord | null = profile,
) {
  const repository: FamilySettingsRepository = {
    findActiveSettings: vi.fn().mockResolvedValue(raw),
    updateActiveSettings: vi.fn().mockResolvedValue(true),
    findActiveProfile: vi.fn().mockResolvedValue(familyProfile),
    updateActiveProfile: vi.fn().mockResolvedValue(true),
  };
  const sessions: SessionStore = {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue(parentSession),
    revoke: vi.fn(),
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

  it('returns a family profile and creator permissions from the active parent session', async () => {
    const service = new FamilySettingsService(dependencies());

    await expect(service.getProfile({ sessionToken: 'token' })).resolves.toEqual({
      profile: {
        id: 'family-1',
        name: '星星家',
        timeZone: 'Asia/Shanghai',
        parents: profile.parents,
        invitations: profile.invitations,
        permissions: { canUpdateName: true, canManageInvitations: true },
      },
    });
  });

  it('allows the creator to update the name and preserves unrelated settings', async () => {
    const deps = dependencies();
    const service = new FamilySettingsService(deps);

    await expect(
      service.updateProfile({
        sessionToken: 'token',
        profile: { name: ' 新家庭 ', timeZone: 'America/New_York' },
      }),
    ).resolves.toMatchObject({
      profile: { name: '新家庭', timeZone: 'America/New_York' },
    });
    expect(deps.repository.updateActiveProfile).toHaveBeenCalledWith('family-1', {
      name: '新家庭',
      settings: {
        timeZone: 'America/New_York',
        broadcastEnabled: false,
      },
    });
  });

  it('allows a co-parent to update the time zone and exposes restricted permissions', async () => {
    const deps = dependencies(undefined, { ...profile, createdById: 'another-parent' });
    const service = new FamilySettingsService(deps);

    await expect(
      service.updateProfile({ sessionToken: 'token', profile: { timeZone: 'Europe/Berlin' } }),
    ).resolves.toMatchObject({
      profile: {
        timeZone: 'Europe/Berlin',
        permissions: { canUpdateName: false, canManageInvitations: false },
      },
    });
  });

  it('rejects co-parent name updates and invalid profile patches', async () => {
    const coParentService = new FamilySettingsService(
      dependencies(undefined, { ...profile, createdById: 'another-parent' }),
    );
    await expect(
      coParentService.updateProfile({ sessionToken: 'token', profile: { name: '受限修改' } }),
    ).rejects.toBeInstanceOf(FamilyCreatorRequiredError);

    const service = new FamilySettingsService(dependencies());
    for (const invalidProfile of [{}, { name: ' ' }, { timeZone: 'Mars/Olympus' }]) {
      await expect(
        service.updateProfile({ sessionToken: 'token', profile: invalidProfile }),
      ).rejects.toBeInstanceOf(InvalidFamilyProfileError);
    }
  });

  it('lists parents and invitation summaries with the same family permissions', async () => {
    const service = new FamilySettingsService(dependencies());

    await expect(service.listParents({ sessionToken: 'token' })).resolves.toEqual({
      parents: profile.parents,
      invitations: profile.invitations,
      permissions: { canUpdateName: true, canManageInvitations: true },
    });
  });
});
