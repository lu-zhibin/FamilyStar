import {
  CORE_FAMILY_MODULE_IDS,
  FAMILY_MODULE_DEFINITIONS,
  OPTIONAL_FAMILY_MODULE_IDS,
  type OptionalFamilyModuleId,
} from '@familystar/shared';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FAMILY_SETTINGS } from '../family-auth/constants.js';
import type { AuthSession, SessionStore } from '../family-auth/types.js';
import {
  FamilyCreatorRequiredError,
  FamilyModuleConflictError,
  FamilySettingsNotFoundError,
  FamilySettingsService,
  FamilySettingsSessionRequiredError,
  InvalidFamilyProfileError,
  InvalidFamilySettingsError,
  resolveFamilyModules,
} from './service.js';
import type { FamilyProfileRecord, FamilySettingsRepository } from './types.js';

const parentSession: AuthSession = {
  subjectId: 'parent-1',
  familyId: 'family-1',
  role: 'parent',
  issuedAt: '2026-07-30T00:00:00.000Z',
};

const MODULE_PROPERTY_RUNS = 128;

function validatesCriteria(criteria: readonly string[]): string {
  return `[validatesCriteria: ${criteria.join(', ')}]`;
}

function generatedFlag(run: number, salt: number): boolean {
  let value = Math.imul(run + 1, 0x45d9f3b) ^ Math.imul(salt + 1, 0x27d4eb2d);
  value ^= value >>> 16;
  return (value & 1) === 1;
}

function legalOptionalModuleStates(run: number): Record<OptionalFamilyModuleId, boolean> {
  const levels = generatedFlag(run, 0);
  return {
    levels,
    analytics: levels && generatedFlag(run, 1),
    'growth-records': generatedFlag(run, 2),
    rewards: levels && generatedFlag(run, 3),
    badges: levels && generatedFlag(run, 4),
    notifications: generatedFlag(run, 5),
  };
}

const profile: FamilyProfileRecord = {
  id: 'family-1',
  name: '星星家',
  settings: { timeZone: 'Asia/Shanghai', broadcastEnabled: false },
  settingsVersion: 0,
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
    findActiveSettings: vi
      .fn()
      .mockResolvedValue(
        raw === null ? null : { settings: raw, settingsVersion: 0, createdById: 'parent-1' },
      ),
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
  it(`property: legal generated module states keep core modules enabled and every enabled dependency satisfied ${validatesCriteria(['Requirement 12.1', 'Correctness Property 7'])}`, () => {
    for (let run = 0; run < MODULE_PROPERTY_RUNS; run += 1) {
      const readModel = resolveFamilyModules({ modules: legalOptionalModuleStates(run) }, run);
      const enabled = new Set(
        readModel.modules.filter((module) => module.enabled).map((module) => module.id),
      );

      expect(CORE_FAMILY_MODULE_IDS.every((moduleId) => enabled.has(moduleId))).toBe(true);
      for (const module of readModel.modules.filter((item) => item.enabled)) {
        expect(module.dependencies.every((dependency) => enabled.has(dependency))).toBe(true);
      }
      expect(readModel.modules.map(({ id }) => id)).toEqual(
        FAMILY_MODULE_DEFINITIONS.map(({ id }) => id),
      );
    }
  });

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
      0,
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
      expectedSettingsVersion: 0,
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

  it('uses only the authenticated family when reading a profile', async () => {
    const deps = dependencies();
    vi.mocked(deps.sessions.read).mockResolvedValue({ ...parentSession, familyId: 'family-2' });
    vi.mocked(deps.repository.findActiveProfile).mockImplementation(async (familyId) =>
      familyId === 'family-1' ? profile : null,
    );

    await expect(
      new FamilySettingsService(deps).getProfile({ sessionToken: 'family-2-token' }),
    ).rejects.toBeInstanceOf(FamilySettingsNotFoundError);
    expect(deps.repository.findActiveProfile).toHaveBeenCalledWith('family-2', expect.any(Date));
  });

  it('returns one complete module read model to parent and child sessions', async () => {
    const deps = dependencies({ modules: { rewards: false } });
    vi.mocked(deps.sessions.read).mockResolvedValue({ ...parentSession, role: 'child' });

    const result = await new FamilySettingsService(deps).getModules({ sessionToken: 'token' });

    expect(result.modules.version).toBe(0);
    expect(result.modules.modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'authentication', enabled: true, configurable: false }),
        expect.objectContaining({ id: 'tasks', enabled: true, configurable: false }),
        expect.objectContaining({ id: 'points', enabled: true, configurable: false }),
        expect.objectContaining({ id: 'rewards', enabled: false, configurable: true }),
      ]),
    );
  });

  it('updates optional modules atomically while preserving unrelated settings and data', async () => {
    const deps = dependencies({
      modules: { analytics: true, levels: true, rewards: true, badges: true },
      retainedBusinessMarker: { rewardCount: 4 },
    });

    await expect(
      new FamilySettingsService(deps).updateModules({
        sessionToken: 'token',
        expectedVersion: 0,
        modules: { analytics: false, rewards: false, badges: false, levels: false },
      }),
    ).resolves.toMatchObject({
      modules: {
        version: 1,
        modules: expect.arrayContaining([
          expect.objectContaining({ id: 'levels', enabled: false }),
          expect.objectContaining({ id: 'rewards', enabled: false }),
        ]),
      },
    });
    expect(deps.repository.updateActiveSettings).toHaveBeenCalledWith(
      'family-1',
      0,
      expect.objectContaining({
        retainedBusinessMarker: { rewardCount: 4 },
        modules: expect.objectContaining({ levels: false, rewards: false }),
      }),
    );
  });

  it(`property: disabling and re-enabling modules changes only settings and preserves business data ${validatesCriteria(['Requirement 12.1', 'Requirement 12.2', 'Correctness Property 7'])}`, async () => {
    for (let run = 0; run < 64; run += 1) {
      const retainedBusinessData = {
        rewards: [{ id: `reward-${run}`, stock: run * 3 }],
        records: [{ id: `record-${run}`, value: generatedFlag(run, 6) }],
      };
      let record = {
        settings: {
          modules: legalOptionalModuleStates(run),
          retainedBusinessData,
          unrelatedSetting: `setting-${run}`,
        } as Record<string, unknown>,
        settingsVersion: 0,
        createdById: parentSession.subjectId,
      };
      const repository: FamilySettingsRepository = {
        findActiveSettings: vi.fn(async () => record),
        updateActiveSettings: vi.fn(async (_familyId, expectedVersion, settings) => {
          if (expectedVersion !== record.settingsVersion) return false;
          record = { ...record, settings, settingsVersion: record.settingsVersion + 1 };
          return true;
        }),
        findActiveProfile: vi.fn(),
        updateActiveProfile: vi.fn(),
      };
      const sessions = dependencies().sessions;
      const service = new FamilySettingsService({ repository, sessions });
      const disabled = Object.fromEntries(
        OPTIONAL_FAMILY_MODULE_IDS.map((moduleId) => [moduleId, false]),
      ) as Record<OptionalFamilyModuleId, boolean>;
      const enabled = Object.fromEntries(
        OPTIONAL_FAMILY_MODULE_IDS.map((moduleId) => [moduleId, true]),
      ) as Record<OptionalFamilyModuleId, boolean>;

      await service.updateModules({ sessionToken: 'token', expectedVersion: 0, modules: disabled });
      await service.updateModules({ sessionToken: 'token', expectedVersion: 1, modules: enabled });

      expect(record.settings.retainedBusinessData).toBe(retainedBusinessData);
      expect(record.settings).toMatchObject({
        retainedBusinessData,
        unrelatedSetting: `setting-${run}`,
        modules: enabled,
      });
    }
  });

  it('returns stable conflicts for missing and in-use dependencies', async () => {
    const disabledDependencies = dependencies({
      modules: { analytics: false, levels: false, rewards: false, badges: false },
    });
    await expect(
      new FamilySettingsService(disabledDependencies).updateModules({
        sessionToken: 'token',
        expectedVersion: 0,
        modules: { rewards: true },
      }),
    ).rejects.toMatchObject({
      reason: 'MISSING_DEPENDENCY',
      moduleId: 'rewards',
      dependencies: ['levels'],
    });

    await expect(
      new FamilySettingsService(dependencies()).updateModules({
        sessionToken: 'token',
        expectedVersion: 0,
        modules: { levels: false },
      }),
    ).rejects.toMatchObject({
      reason: 'DEPENDENCY_IN_USE',
      moduleId: 'levels',
      dependencies: ['analytics', 'rewards', 'badges'],
    });
  });

  it('requires the creator and protects module updates with the settings version', async () => {
    const coParent = dependencies();
    vi.mocked(coParent.repository.findActiveSettings).mockResolvedValue({
      settings: {},
      settingsVersion: 0,
      createdById: 'another-parent',
    });
    await expect(
      new FamilySettingsService(coParent).updateModules({
        sessionToken: 'token',
        expectedVersion: 0,
        modules: { notifications: false },
      }),
    ).rejects.toBeInstanceOf(FamilyCreatorRequiredError);

    await expect(
      new FamilySettingsService(dependencies()).updateModules({
        sessionToken: 'token',
        expectedVersion: 1,
        modules: { notifications: false },
      }),
    ).rejects.toBeInstanceOf(FamilyModuleConflictError);
  });

  it('resolves API module status from the authenticated family only', async () => {
    const deps = dependencies();
    vi.mocked(deps.repository.findActiveSettings).mockImplementation(async (familyId) => ({
      settings: { modules: { analytics: familyId === 'family-1' } },
      settingsVersion: 0,
      createdById: 'parent-1',
    }));
    const service = new FamilySettingsService(deps);

    await expect(
      service.isEnabled({ session: { familyId: 'family-1' }, module: 'analytics' }),
    ).resolves.toBe(true);
    await expect(
      service.isEnabled({ session: { familyId: 'family-2' }, module: 'analytics' }),
    ).resolves.toBe(false);
    expect(deps.repository.findActiveSettings).toHaveBeenNthCalledWith(1, 'family-1');
    expect(deps.repository.findActiveSettings).toHaveBeenNthCalledWith(2, 'family-2');
  });

  it(`property: module reads and updates stay within the authenticated family ${validatesCriteria(['Requirement 12.1', 'Requirement 12.2', 'Correctness Property 1'])}`, async () => {
    for (let run = 0; run < 64; run += 1) {
      const familyOne = `family-a-${run}`;
      const familyTwo = `family-b-${run}`;
      const records = new Map([
        [
          familyOne,
          {
            settings: { modules: { notifications: true }, marker: `a-${run}` },
            settingsVersion: 0,
            createdById: `parent-a-${run}`,
          },
        ],
        [
          familyTwo,
          {
            settings: { modules: { notifications: true }, marker: `b-${run}` },
            settingsVersion: 0,
            createdById: `parent-b-${run}`,
          },
        ],
      ]);
      const sessions = dependencies().sessions;
      vi.mocked(sessions.read).mockImplementation(async (token) =>
        token === 'family-a-token'
          ? {
              ...parentSession,
              subjectId: `parent-a-${run}`,
              familyId: familyOne,
            }
          : null,
      );
      const repository: FamilySettingsRepository = {
        findActiveSettings: vi.fn(async (familyId) => records.get(familyId) ?? null),
        updateActiveSettings: vi.fn(async (familyId, expectedVersion, settings) => {
          const current = records.get(familyId);
          if (!current || current.settingsVersion !== expectedVersion) return false;
          records.set(familyId, {
            ...current,
            settings,
            settingsVersion: current.settingsVersion + 1,
          });
          return true;
        }),
        findActiveProfile: vi.fn(),
        updateActiveProfile: vi.fn(),
      };
      const service = new FamilySettingsService({ repository, sessions });

      await service.updateModules({
        sessionToken: 'family-a-token',
        expectedVersion: 0,
        modules: { notifications: false },
      });

      expect(records.get(familyOne)?.settings).toMatchObject({
        marker: `a-${run}`,
        modules: { notifications: false },
      });
      expect(records.get(familyTwo)).toEqual({
        settings: { modules: { notifications: true }, marker: `b-${run}` },
        settingsVersion: 0,
        createdById: `parent-b-${run}`,
      });
      await expect(
        service.isEnabled({ session: { familyId: familyTwo }, module: 'notifications' }),
      ).resolves.toBe(true);
    }
  });
});
