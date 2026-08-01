import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FAMILY_TIME_ZONE,
  DEFAULT_LEVEL_CONFIGS,
  DEFAULT_TASK_TYPES,
  resolveFamilyTimeZone,
} from './constants.js';
import type { PasswordHasher } from './password.js';
import {
  getPasswordHashCost,
  InvalidParentPasswordError,
  parentPasswordHasher,
} from './password.js';
import {
  FamilyAuthService,
  InvalidParentCredentialsError,
  ParentEmailConflictError,
} from './service.js';
import type {
  AuthSession,
  FamilyAuthRepository,
  FamilyInitialization,
  ParentIdentity,
  SessionStore,
} from './types.js';

const parent: ParentIdentity = {
  id: 'parent-1',
  familyId: 'family-1',
  nickname: 'Parent',
  email: 'parent@example.com',
  passwordHash: 'stored-hash',
};

function createHarness(existingParent: ParentIdentity | null = null) {
  const created: FamilyInitialization[] = [];
  const sessions: AuthSession[] = [];
  const repository: FamilyAuthRepository = {
    async createFamilyWithParent(input) {
      created.push(input);
      return { ...parent, email: input.email, passwordHash: input.passwordHash };
    },
    async findActiveParentByEmail() {
      return existingParent;
    },
  };
  const sessionStore: SessionStore = {
    async create(session) {
      sessions.push(session);
      return 'session-token';
    },
    async read() {
      return null;
    },
    async revokeSubject() {},
  };
  const passwords: PasswordHasher = {
    async hash() {
      return 'new-hash';
    },
    async verify(value, hash) {
      return value === 'correct-password' && hash === 'stored-hash';
    },
  };
  return {
    created,
    sessions,
    service: new FamilyAuthService(
      repository,
      sessionStore,
      passwords,
      () => new Date('2026-07-30T12:00:00.000Z'),
    ),
  };
}

describe('family auth defaults', () => {
  it('defines five task types and twenty monotonic levels', () => {
    expect(DEFAULT_TASK_TYPES.map((type) => type.code)).toEqual([
      'study',
      'sport',
      'chore',
      'habit',
      'custom',
    ]);
    expect(DEFAULT_LEVEL_CONFIGS).toHaveLength(20);
    expect(DEFAULT_LEVEL_CONFIGS.map((level) => level.pointsRequired)).toEqual(
      [...DEFAULT_LEVEL_CONFIGS]
        .map((level) => level.pointsRequired)
        .sort((left, right) => left - right),
    );
    expect(DEFAULT_LEVEL_CONFIGS.at(-1)?.pointsRequired).toBe(100_000);
  });

  it('keeps valid IANA zones and falls back for invalid values', () => {
    expect(resolveFamilyTimeZone('Europe/London')).toBe('Europe/London');
    expect(resolveFamilyTimeZone('Invalid/Zone')).toBe(DEFAULT_FAMILY_TIME_ZONE);
    expect(resolveFamilyTimeZone()).toBe(DEFAULT_FAMILY_TIME_ZONE);
  });
});

describe('parent password hashing', () => {
  it('creates cost 12 hashes and verifies them', async () => {
    const hash = await parentPasswordHasher.hash('twelve-chars-password');
    expect(getPasswordHashCost(hash)).toBe(12);
    await expect(parentPasswordHasher.verify('twelve-chars-password', hash)).resolves.toBe(true);
    await expect(parentPasswordHasher.verify('another-password', hash)).resolves.toBe(false);
  });

  it('rejects short and bcrypt-truncated passwords', async () => {
    await expect(parentPasswordHasher.hash('short')).rejects.toBeInstanceOf(
      InvalidParentPasswordError,
    );
    await expect(parentPasswordHasher.hash('密'.repeat(25))).rejects.toMatchObject({
      reason: 'too-long',
    });
  });
});

describe('FamilyAuthService', () => {
  it('normalizes registration and creates a session', async () => {
    const harness = createHarness();
    const result = await harness.service.register({
      familyName: '  Star Family  ',
      nickname: '  Parent  ',
      email: '  PARENT@Example.COM ',
      password: 'twelve-chars-password',
      timeZone: 'Invalid/Zone',
    });

    expect(harness.created[0]).toMatchObject({
      familyName: 'Star Family',
      nickname: 'Parent',
      email: 'parent@example.com',
      passwordHash: 'new-hash',
      settings: { timeZone: DEFAULT_FAMILY_TIME_ZONE },
    });
    expect(harness.sessions[0]).toEqual({
      subjectId: 'parent-1',
      familyId: 'family-1',
      role: 'parent',
      issuedAt: '2026-07-30T12:00:00.000Z',
    });
    expect(result.parent).toEqual({
      id: 'parent-1',
      familyId: 'family-1',
      nickname: 'Parent',
      email: 'parent@example.com',
    });
  });

  it('rejects duplicate email before persistence', async () => {
    const harness = createHarness(parent);
    await expect(
      harness.service.register({
        familyName: 'Family',
        nickname: 'Parent',
        email: parent.email,
        password: 'twelve-chars-password',
      }),
    ).rejects.toBeInstanceOf(ParentEmailConflictError);
    expect(harness.created).toHaveLength(0);
  });

  it('authenticates valid login and rejects invalid credentials', async () => {
    const harness = createHarness(parent);
    await expect(
      harness.service.login({ email: 'PARENT@example.com', password: 'correct-password' }),
    ).resolves.toMatchObject({ sessionToken: 'session-token' });
    await expect(
      harness.service.login({ email: parent.email, password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(InvalidParentCredentialsError);
    await expect(
      createHarness().service.login({ email: parent.email, password: 'correct-password' }),
    ).rejects.toBeInstanceOf(InvalidParentCredentialsError);
  });
});
