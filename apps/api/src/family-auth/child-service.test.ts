import { describe, expect, it } from 'vitest';

import type { PasswordHasher } from './password.js';
import {
  ChildAccountService,
  ChildAuthenticationError,
  ChildLockedError,
  ChildLoginRateLimitError,
  InvalidChildAvatarError,
  ParentSessionRequiredError,
} from './child-service.js';
import type {
  ChildAccountRepository,
  ChildIdentity,
  ChildProfile,
  CreateChildRecord,
  UpdateChildRecord,
} from './child-types.js';
import type { AuthSession, SessionStore } from './types.js';

const child: ChildIdentity = {
  id: 'child-1',
  familyId: 'family-1',
  nickname: 'Child',
  credentialType: 'pin',
  credentialHash: 'hash:1234',
  gender: 'female',
  birthday: '2018-05-20',
  grade: '一年级',
  avatarMediaId: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  version: 0,
};

function profile(identity: ChildIdentity): ChildProfile {
  return {
    id: identity.id,
    familyId: identity.familyId,
    nickname: identity.nickname,
    credentialType: identity.credentialType,
    gender: identity.gender,
    birthday: identity.birthday,
    grade: identity.grade,
    avatarMediaId: identity.avatarMediaId,
  };
}

function createHarness(
  options: {
    avatarReady?: boolean;
    existingChild?: ChildIdentity | null;
    rateLimitAllowed?: boolean;
    retryAfterSeconds?: number;
    clock?: () => Date;
  } = {},
) {
  const created: CreateChildRecord[] = [];
  const updated: UpdateChildRecord[] = [];
  const createdSessions: AuthSession[] = [];
  const revokedSubjects: string[] = [];
  let currentChild = options.existingChild === undefined ? { ...child } : options.existingChild;
  const repository: ChildAccountRepository = {
    async findActiveFamilyByCode(familyCode) {
      return familyCode === 'STARFAM001'
        ? { id: 'family-1', name: 'Star Family', familyCode }
        : null;
    },
    async listActiveChildren(familyId) {
      return familyId === child.familyId ? [profile(child)] : [];
    },
    async findActiveChild(familyId, childId) {
      return currentChild?.familyId === familyId && currentChild.id === childId
        ? { ...currentChild }
        : null;
    },
    async isReadyFamilyAvatar() {
      return options.avatarReady ?? false;
    },
    async createChild(input) {
      created.push(input);
      return { ...profile(child), ...input, id: child.id };
    },
    async updateChild(familyId, childId, input) {
      updated.push(input);
      if (!currentChild || familyId !== currentChild.familyId || childId !== currentChild.id) {
        return null;
      }
      currentChild = {
        ...currentChild,
        ...input,
        ...(input.credentialHash === undefined
          ? {}
          : { failedLoginAttempts: 0, lockedUntil: null, version: currentChild.version + 1 }),
      };
      return profile(currentChild);
    },
    async updateAuthenticationState(familyId, childId, expectedVersion, state) {
      if (
        !currentChild ||
        currentChild.familyId !== familyId ||
        currentChild.id !== childId ||
        currentChild.version !== expectedVersion
      ) {
        return false;
      }
      currentChild = { ...currentChild, ...state, version: currentChild.version + 1 };
      return true;
    },
    async softDeleteChild(familyId, childId) {
      return familyId === child.familyId && childId === child.id;
    },
  };
  const sessionByToken: Record<string, AuthSession> = {
    parent: {
      subjectId: 'parent-1',
      familyId: 'family-1',
      role: 'parent',
      issuedAt: '2026-07-30T12:00:00.000Z',
    },
    child: {
      subjectId: 'child-1',
      familyId: 'family-1',
      role: 'child',
      issuedAt: '2026-07-30T12:00:00.000Z',
    },
    other: {
      subjectId: 'parent-2',
      familyId: 'family-2',
      role: 'parent',
      issuedAt: '2026-07-30T12:00:00.000Z',
    },
  };
  const sessions: SessionStore = {
    async create(session) {
      createdSessions.push(session);
      return 'child-session-token';
    },
    async read(token) {
      return sessionByToken[token] ?? null;
    },
    async revokeSubject(subjectId) {
      revokedSubjects.push(subjectId);
    },
  };
  const passwords: PasswordHasher = {
    async hash(value) {
      return `hash:${value}`;
    },
    async verify(value, hash) {
      return hash === `hash:${value}`;
    },
  };
  return {
    created,
    createdSessions,
    revokedSubjects,
    service: new ChildAccountService(
      repository,
      sessions,
      passwords,
      {
        async consume() {
          return {
            allowed: options.rateLimitAllowed ?? true,
            retryAfterSeconds: options.retryAfterSeconds ?? 900,
          };
        },
      },
      options.clock ?? (() => new Date('2026-07-30T12:00:00.000Z')),
    ),
    updated,
  };
}

describe('ChildAccountService', () => {
  it('creates a normalized child profile with a hashed PIN and family avatar', async () => {
    const harness = createHarness({ avatarReady: true });
    await expect(
      harness.service.create({
        sessionToken: 'parent',
        nickname: '  Little Star  ',
        credentialType: 'pin',
        credential: '1234',
        gender: 'female',
        birthday: '2018-05-20',
        grade: '  一年级  ',
        avatarMediaId: 'avatar-1',
      }),
    ).resolves.toMatchObject({ child: { id: 'child-1' } });

    expect(harness.created).toEqual([
      {
        familyId: 'family-1',
        nickname: 'Little Star',
        credentialType: 'pin',
        credentialHash: 'hash:1234',
        gender: 'female',
        birthday: '2018-05-20',
        grade: '一年级',
        avatarMediaId: 'avatar-1',
      },
    ]);
  });

  it('enforces PIN, password, bcrypt byte, and avatar boundaries', async () => {
    const service = createHarness().service;
    const base = {
      sessionToken: 'parent',
      nickname: 'Child',
      gender: 'male' as const,
    };
    await expect(
      service.create({ ...base, credentialType: 'pin', credential: '12ab' }),
    ).rejects.toMatchObject({ reason: 'invalid-pin' });
    await expect(
      service.create({ ...base, credentialType: 'password', credential: '123456' }),
    ).rejects.toMatchObject({ reason: 'invalid-password' });
    await expect(
      service.create({ ...base, credentialType: 'password', credential: '密'.repeat(25) }),
    ).rejects.toMatchObject({ reason: 'too-long' });
    await expect(
      service.create({
        ...base,
        credentialType: 'pin',
        credential: '1234',
        avatarMediaId: 'foreign-avatar',
      }),
    ).rejects.toBeInstanceOf(InvalidChildAvatarError);
  });

  it('requires a parent session for profile management', async () => {
    const service = createHarness().service;
    await expect(service.list({ sessionToken: 'child' })).rejects.toBeInstanceOf(
      ParentSessionRequiredError,
    );
    await expect(service.list({})).rejects.toBeInstanceOf(ParentSessionRequiredError);
  });

  it('updates profiles, resets credentials, and soft deletes within the family', async () => {
    const harness = createHarness();
    await expect(
      harness.service.update({
        sessionToken: 'parent',
        childId: child.id,
        nickname: 'Older Child',
        credentialType: 'password',
        credential: 'secretA',
        grade: '',
      }),
    ).resolves.toMatchObject({ child: { nickname: 'Older Child', credentialType: 'password' } });
    expect(harness.updated[0]).toMatchObject({
      nickname: 'Older Child',
      credentialType: 'password',
      credentialHash: 'hash:secretA',
      grade: null,
    });
    expect(harness.revokedSubjects).toEqual([child.id]);
    await expect(
      harness.service.remove({ sessionToken: 'parent', childId: child.id }),
    ).resolves.toEqual({ childId: child.id });
    expect(harness.revokedSubjects).toEqual([child.id, child.id]);
  });

  it('lists family switch targets and creates a child session after credential verification', async () => {
    const harness = createHarness();
    await expect(harness.service.listSwitchTargets({ sessionToken: 'child' })).resolves.toEqual({
      children: [profile(child)],
    });
    await expect(
      harness.service.switchToChild({
        sessionToken: 'parent',
        childId: child.id,
        credential: '1234',
      }),
    ).resolves.toMatchObject({ child: { id: child.id }, sessionToken: 'child-session-token' });
    expect(harness.createdSessions).toEqual([
      {
        subjectId: child.id,
        familyId: child.familyId,
        role: 'child',
        issuedAt: '2026-07-30T12:00:00.000Z',
      },
    ]);
    await expect(
      harness.service.switchToChild({
        sessionToken: 'other',
        childId: child.id,
        credential: '1234',
      }),
    ).rejects.toBeInstanceOf(ChildAuthenticationError);
    await expect(
      harness.service.switchToChild({
        sessionToken: 'parent',
        childId: child.id,
        credential: 'wrong',
      }),
    ).rejects.toBeInstanceOf(ChildAuthenticationError);
  });

  it('finds a family with limited public child profiles and logs in through the shared flow', async () => {
    const harness = createHarness();
    await expect(harness.service.findFamily({ familyCode: ' starfAM001 ' })).resolves.toEqual({
      family: { name: 'Star Family', familyCode: 'STARFAM001' },
      children: [
        {
          id: child.id,
          nickname: child.nickname,
          grade: child.grade,
          avatarMediaId: child.avatarMediaId,
        },
      ],
    });
    await expect(
      harness.service.login({
        familyCode: 'STARFAM001',
        childId: child.id,
        credential: '1234',
      }),
    ).resolves.toMatchObject({ child: { id: child.id }, sessionToken: 'child-session-token' });
    await expect(
      harness.service.login({
        familyCode: 'UNKNOWN001',
        childId: child.id,
        credential: '1234',
      }),
    ).rejects.toBeInstanceOf(ChildAuthenticationError);
  });

  it('locks a child for fifteen minutes after five consecutive failures', async () => {
    const harness = createHarness();
    const input = { sessionToken: 'parent', childId: child.id, credential: 'wrong' };

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(harness.service.switchToChild(input)).rejects.toMatchObject({
        name: 'ChildAuthenticationError',
      });
    }
    await expect(harness.service.switchToChild(input)).rejects.toMatchObject({
      name: 'ChildLockedError',
      remainingSeconds: 900,
    });
    await expect(harness.service.switchToChild(input)).rejects.toBeInstanceOf(ChildLockedError);
  });

  it('clears failures on success and restarts counting after an expired lock', async () => {
    const now = new Date('2026-07-30T12:00:00.000Z');
    const harness = createHarness({
      existingChild: {
        ...child,
        failedLoginAttempts: 5,
        lockedUntil: new Date('2026-07-30T11:59:59.000Z'),
        version: 4,
      },
      clock: () => now,
    });

    await expect(
      harness.service.switchToChild({
        sessionToken: 'parent',
        childId: child.id,
        credential: 'wrong',
      }),
    ).rejects.toBeInstanceOf(ChildAuthenticationError);
    await expect(
      harness.service.switchToChild({
        sessionToken: 'parent',
        childId: child.id,
        credential: '1234',
      }),
    ).resolves.toMatchObject({ child: { id: child.id } });
  });

  it('rejects child login attempts beyond the fixed-window rate limit', async () => {
    const harness = createHarness({ rateLimitAllowed: false, retryAfterSeconds: 321 });
    await expect(
      harness.service.switchToChild({
        sessionToken: 'parent',
        childId: child.id,
        credential: '1234',
      }),
    ).rejects.toMatchObject({
      name: 'ChildLoginRateLimitError',
      retryAfterSeconds: 321,
    });
    await expect(
      harness.service.switchToChild({
        sessionToken: 'parent',
        childId: child.id,
        credential: '1234',
      }),
    ).rejects.toBeInstanceOf(ChildLoginRateLimitError);
  });

  it('changes the current password and revokes all child sessions', async () => {
    const harness = createHarness({
      existingChild: { ...child, credentialType: 'password', credentialHash: 'hash:oldSecret' },
    });

    await expect(
      harness.service.changeOwnPassword({
        sessionToken: 'child',
        currentPassword: 'oldSecret',
        newPassword: 'newSecret',
      }),
    ).resolves.toEqual({ childId: child.id });
    expect(harness.updated).toContainEqual({
      credentialType: 'password',
      credentialHash: 'hash:newSecret',
    });
    expect(harness.revokedSubjects).toEqual([child.id]);
  });

  it('rejects password changes from a parent, PIN account, or wrong current password', async () => {
    await expect(
      createHarness().service.changeOwnPassword({
        sessionToken: 'parent',
        currentPassword: '1234',
        newPassword: 'newSecret',
      }),
    ).rejects.toBeInstanceOf(ChildAuthenticationError);
    await expect(
      createHarness().service.changeOwnPassword({
        sessionToken: 'child',
        currentPassword: '1234',
        newPassword: 'newSecret',
      }),
    ).rejects.toBeInstanceOf(ChildAuthenticationError);
    await expect(
      createHarness({
        existingChild: { ...child, credentialType: 'password', credentialHash: 'hash:oldSecret' },
      }).service.changeOwnPassword({
        sessionToken: 'child',
        currentPassword: 'wrong',
        newPassword: 'newSecret',
      }),
    ).rejects.toBeInstanceOf(ChildAuthenticationError);
  });
});
