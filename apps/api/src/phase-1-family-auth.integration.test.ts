import type { DomainEvent } from '@familystar/shared';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { OutboxWriter, TransactionRunner } from './events/outbox.js';
import type {
  ChildAccountRepository,
  ChildAuthenticationState,
  ChildIdentity,
  ChildProfile,
  CreateChildRecord,
  UpdateChildRecord,
} from './family-auth/child-types.js';
import {
  ChildAccountService,
  ChildAuthenticationError,
  ChildLockedError,
} from './family-auth/child-service.js';
import { DEFAULT_LEVEL_CONFIGS, DEFAULT_TASK_TYPES } from './family-auth/constants.js';
import {
  FamilyInvitationService,
  FamilyParentLimitError,
  InvalidInvitationTokenError,
  InvitationCreatorRequiredError,
  InvitationExpiredError,
  InvitationUnavailableError,
} from './family-auth/invitation-service.js';
import { RedisChildLoginRateLimiter } from './family-auth/login-rate-limiter.js';
import type { PasswordHasher } from './family-auth/password.js';
import { FamilyAuthService, ParentEmailConflictError } from './family-auth/service.js';
import { RedisSessionStore } from './family-auth/session-store.js';
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
  FamilyAuthRepository,
  FamilyInitialization,
  FamilyInvitationRepository,
  InvitationCreation,
  ParentIdentity,
  RefreshInvitationInput,
  RevokeInvitationInput,
} from './family-auth/types.js';
import { createRedisKeyspace } from './infrastructure/redis/keys.js';
import type { RedisCommandPort } from './infrastructure/redis/primitives.js';

const NOW = new Date('2026-07-30T15:00:00.000Z');
const PARENT_PASSWORD = 'parent-pass-123';

type FamilyRecord = {
  id: string;
  familyCode: string;
  name: string;
  createdById: string;
  settings: Record<string, unknown>;
  emailConfigured: boolean;
};

type ParentRecord = ParentIdentity & { deletedAt: Date | null };

type InvitationRecord = {
  id: string;
  familyId: string;
  invitedById: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'expired';
};

type ChildRecord = ChildIdentity & { deletedAt: Date | null };

type FamilyAuthState = {
  families: FamilyRecord[];
  parents: ParentRecord[];
  invitations: InvitationRecord[];
  children: ChildRecord[];
  taskTypes: Array<{ familyId: string; code: string }>;
  levels: Array<{ familyId: string; level: number }>;
  outbox: DomainEvent[];
};

function createState(): FamilyAuthState {
  return {
    families: [],
    parents: [],
    invitations: [],
    children: [],
    taskTypes: [],
    levels: [],
    outbox: [],
  };
}

function cloneState(state: FamilyAuthState): FamilyAuthState {
  return {
    families: state.families.map((family) => ({
      ...family,
      settings: structuredClone(family.settings),
    })),
    parents: state.parents.map((parent) => ({
      ...parent,
      deletedAt: parent.deletedAt ? new Date(parent.deletedAt) : null,
    })),
    invitations: state.invitations.map((invitation) => ({
      ...invitation,
      expiresAt: new Date(invitation.expiresAt),
    })),
    children: state.children.map((child) => ({
      ...child,
      lockedUntil: child.lockedUntil ? new Date(child.lockedUntil) : null,
      deletedAt: child.deletedAt ? new Date(child.deletedAt) : null,
    })),
    taskTypes: state.taskTypes.map((taskType) => ({ ...taskType })),
    levels: state.levels.map((level) => ({ ...level })),
    outbox: [...state.outbox],
  };
}

function publicChild(child: ChildRecord): ChildProfile {
  return {
    id: child.id,
    familyId: child.familyId,
    nickname: child.nickname,
    credentialType: child.credentialType,
    gender: child.gender,
    birthday: child.birthday,
    grade: child.grade,
    avatarMediaId: child.avatarMediaId,
  };
}

class MemoryFamilyStore
  implements
    FamilyAuthRepository,
    FamilyInvitationRepository<FamilyAuthState>,
    ChildAccountRepository,
    TransactionRunner<FamilyAuthState>,
    OutboxWriter<FamilyAuthState>
{
  private state = createState();
  private nextId = 1;

  constructor(private readonly failFamilyInitialization = false) {}

  snapshot(): Readonly<FamilyAuthState> {
    return cloneState(this.state);
  }

  setEmailConfigured(familyId: string): void {
    const family = this.state.families.find((candidate) => candidate.id === familyId);
    if (!family) throw new Error('Family not found');
    family.emailConfigured = true;
  }

  async run<Result>(work: (transaction: FamilyAuthState) => Promise<Result>): Promise<Result> {
    const transaction = cloneState(this.state);
    const result = await work(transaction);
    this.state = transaction;
    return result;
  }

  async append(transaction: FamilyAuthState, event: DomainEvent): Promise<void> {
    transaction.outbox.push(event);
  }

  async findActiveParentByEmail(email: string): Promise<ParentIdentity | null> {
    const parent = this.state.parents.find(
      (candidate) => candidate.deletedAt === null && candidate.email.toLowerCase() === email,
    );
    return parent ? this.parentIdentity(parent) : null;
  }

  async findActiveFamilyCodeById(familyId: string): Promise<string | null> {
    return this.state.families.find((family) => family.id === familyId)?.familyCode ?? null;
  }

  async createFamilyWithParent(input: FamilyInitialization): Promise<ParentIdentity> {
    return this.run(async (transaction) => {
      if (
        transaction.parents.some(
          (parent) => parent.deletedAt === null && parent.email.toLowerCase() === input.email,
        )
      ) {
        throw new ParentEmailConflictError();
      }
      const familyId = this.id();
      const parentId = this.id();
      const parent: ParentRecord = {
        id: parentId,
        familyId,
        familyCode: input.familyCode,
        nickname: input.nickname,
        email: input.email,
        passwordHash: input.passwordHash,
        deletedAt: null,
      };
      transaction.families.push({
        id: familyId,
        familyCode: input.familyCode,
        name: input.familyName,
        createdById: parentId,
        settings: structuredClone(input.settings),
        emailConfigured: false,
      });
      transaction.parents.push(parent);
      transaction.taskTypes.push(...DEFAULT_TASK_TYPES.map(({ code }) => ({ familyId, code })));
      if (this.failFamilyInitialization) throw new Error('level initialization failed');
      transaction.levels.push(...DEFAULT_LEVEL_CONFIGS.map(({ level }) => ({ familyId, level })));
      return this.parentIdentity(parent);
    });
  }

  async createOrRefresh(
    transaction: FamilyAuthState,
    input: CreateInvitationInput,
  ): Promise<InvitationCreation> {
    const family = transaction.families.find((candidate) => candidate.id === input.familyId);
    if (!family || family.createdById !== input.actorId) {
      throw new InvitationCreatorRequiredError();
    }
    const activeParents = transaction.parents.filter(
      (parent) => parent.familyId === input.familyId && parent.deletedAt === null,
    );
    if (activeParents.length >= 2) throw new FamilyParentLimitError();
    if (
      transaction.parents.some(
        (parent) => parent.deletedAt === null && parent.email.toLowerCase() === input.email,
      )
    ) {
      throw new ParentEmailConflictError();
    }

    let invitation = transaction.invitations.find(
      (candidate) =>
        candidate.familyId === input.familyId &&
        candidate.email.toLowerCase() === input.email &&
        candidate.status === 'pending',
    );
    if (invitation) {
      invitation.tokenHash = input.tokenHash;
      invitation.expiresAt = new Date(input.expiresAt);
    } else {
      invitation = {
        id: this.id(),
        familyId: input.familyId,
        invitedById: input.actorId,
        email: input.email,
        tokenHash: input.tokenHash,
        expiresAt: new Date(input.expiresAt),
        status: 'pending',
      };
      transaction.invitations.push(invitation);
    }
    return {
      invitation: {
        id: invitation.id,
        familyId: invitation.familyId,
        invitedById: invitation.invitedById,
        email: invitation.email,
        expiresAt: new Date(invitation.expiresAt),
      },
      emailConfigured: family.emailConfigured,
    };
  }

  async refresh(
    transaction: FamilyAuthState,
    input: RefreshInvitationInput,
  ): Promise<InvitationCreation> {
    const family = transaction.families.find((candidate) => candidate.id === input.familyId);
    if (!family || family.createdById !== input.actorId) {
      throw new InvitationCreatorRequiredError();
    }
    const invitation = transaction.invitations.find(
      (candidate) => candidate.id === input.invitationId && candidate.familyId === input.familyId,
    );
    if (!invitation || invitation.status !== 'pending') throw new InvitationUnavailableError();
    if (invitation.expiresAt <= input.now) throw new InvitationExpiredError();
    invitation.tokenHash = input.tokenHash;
    invitation.expiresAt = new Date(input.expiresAt);
    invitation.invitedById = input.actorId;
    return {
      invitation: {
        id: invitation.id,
        familyId: invitation.familyId,
        invitedById: invitation.invitedById,
        email: invitation.email,
        expiresAt: new Date(invitation.expiresAt),
      },
      emailConfigured: family.emailConfigured,
    };
  }

  async revoke(
    transaction: FamilyAuthState,
    input: RevokeInvitationInput,
  ): Promise<{ id: string }> {
    const family = transaction.families.find((candidate) => candidate.id === input.familyId);
    if (!family || family.createdById !== input.actorId) {
      throw new InvitationCreatorRequiredError();
    }
    const invitation = transaction.invitations.find(
      (candidate) => candidate.id === input.invitationId && candidate.familyId === input.familyId,
    );
    if (!invitation || invitation.status === 'accepted') throw new InvitationUnavailableError();
    invitation.status = 'expired';
    return { id: invitation.id };
  }

  async accept(
    transaction: FamilyAuthState,
    input: AcceptInvitationInput,
  ): Promise<ParentIdentity> {
    const invitation = transaction.invitations.find(
      (candidate) => candidate.tokenHash === input.tokenHash,
    );
    if (!invitation) throw new InvalidInvitationTokenError();
    if (invitation.status !== 'pending') throw new InvitationUnavailableError();
    if (invitation.expiresAt.getTime() <= input.now.getTime()) {
      throw new InvitationExpiredError();
    }
    const activeParents = transaction.parents.filter(
      (parent) => parent.familyId === invitation.familyId && parent.deletedAt === null,
    );
    if (activeParents.length >= 2) throw new FamilyParentLimitError();
    if (
      transaction.parents.some(
        (parent) =>
          parent.deletedAt === null &&
          parent.email.toLowerCase() === invitation.email.toLowerCase(),
      )
    ) {
      throw new ParentEmailConflictError();
    }
    const family = transaction.families.find((candidate) => candidate.id === invitation.familyId);
    if (!family) throw new InvitationUnavailableError();
    const parent: ParentRecord = {
      id: this.id(),
      familyId: invitation.familyId,
      familyCode: family.familyCode,
      nickname: input.nickname,
      email: invitation.email,
      passwordHash: input.passwordHash,
      deletedAt: null,
    };
    transaction.parents.push(parent);
    invitation.status = 'accepted';
    return this.parentIdentity(parent);
  }

  async listActiveChildren(familyId: string): Promise<ChildProfile[]> {
    return this.state.children
      .filter((child) => child.familyId === familyId && child.deletedAt === null)
      .map(publicChild);
  }

  async findActiveFamilyByCode(familyCode: string) {
    const family = this.state.families.find((candidate) => candidate.familyCode === familyCode);
    return family ? { id: family.id, name: family.name, familyCode: family.familyCode } : null;
  }

  async findActiveChild(familyId: string, childId: string): Promise<ChildIdentity | null> {
    const child = this.state.children.find(
      (candidate) =>
        candidate.familyId === familyId && candidate.id === childId && candidate.deletedAt === null,
    );
    if (!child) return null;
    return {
      id: child.id,
      familyId: child.familyId,
      nickname: child.nickname,
      credentialType: child.credentialType,
      credentialHash: child.credentialHash,
      gender: child.gender,
      birthday: child.birthday,
      grade: child.grade,
      avatarMediaId: child.avatarMediaId,
      failedLoginAttempts: child.failedLoginAttempts,
      lockedUntil: child.lockedUntil ? new Date(child.lockedUntil) : null,
      version: child.version,
    };
  }

  async isReadyFamilyAvatar(): Promise<boolean> {
    return false;
  }

  async createChild(input: CreateChildRecord): Promise<ChildProfile> {
    const child: ChildRecord = {
      ...input,
      id: this.id(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      version: 0,
      deletedAt: null,
    };
    this.state.children.push(child);
    return publicChild(child);
  }

  async updateChild(
    familyId: string,
    childId: string,
    input: UpdateChildRecord,
  ): Promise<ChildProfile | null> {
    const child = this.state.children.find(
      (candidate) =>
        candidate.familyId === familyId && candidate.id === childId && candidate.deletedAt === null,
    );
    if (!child) return null;
    Object.assign(child, input);
    return publicChild(child);
  }

  async updateAuthenticationState(
    familyId: string,
    childId: string,
    expectedVersion: number,
    state: ChildAuthenticationState,
  ): Promise<boolean> {
    const child = this.state.children.find(
      (candidate) =>
        candidate.familyId === familyId &&
        candidate.id === childId &&
        candidate.deletedAt === null &&
        candidate.version === expectedVersion,
    );
    if (!child) return false;
    child.failedLoginAttempts = state.failedLoginAttempts;
    child.lockedUntil = state.lockedUntil ? new Date(state.lockedUntil) : null;
    child.version += 1;
    return true;
  }

  async softDeleteChild(familyId: string, childId: string, deletedAt: Date): Promise<boolean> {
    const child = this.state.children.find(
      (candidate) =>
        candidate.familyId === familyId && candidate.id === childId && candidate.deletedAt === null,
    );
    if (!child) return false;
    child.deletedAt = new Date(deletedAt);
    return true;
  }

  private id(): string {
    const suffix = String(this.nextId).padStart(12, '0');
    const id = `00000000-0000-4000-8000-${suffix}`;
    this.nextId += 1;
    return id;
  }

  private parentIdentity(parent: ParentRecord): ParentIdentity {
    return {
      id: parent.id,
      familyId: parent.familyId,
      familyCode: parent.familyCode,
      nickname: parent.nickname,
      email: parent.email,
      passwordHash: parent.passwordHash,
    };
  }
}

class MemoryRedis implements RedisCommandPort {
  private readonly values = new Map<string, string>();

  async sendCommand(arguments_: readonly string[]): Promise<unknown> {
    const [command, key, value] = arguments_;
    if (!command || !key) throw new Error('Invalid Redis command');
    if (command === 'GET') return this.values.get(key) ?? null;
    if (command === 'SET') {
      if (value === undefined) throw new Error('SET requires a value');
      this.values.set(key, value);
      return 'OK';
    }
    if (command === 'DEL') return this.values.delete(key) ? 1 : 0;
    if (command === 'EXPIRE') return this.values.has(key) ? 1 : 0;
    if (command === 'INCR') {
      const incremented = Number(this.values.get(key) ?? '0') + 1;
      this.values.set(key, String(incremented));
      return incremented;
    }
    if (command === 'EVAL') {
      const rateLimitKey = arguments_[3];
      const windowSeconds = arguments_[4];
      if (!rateLimitKey || !windowSeconds) throw new Error('Invalid rate-limit command');
      const consumed = Number(this.values.get(rateLimitKey) ?? '0') + 1;
      this.values.set(rateLimitKey, String(consumed));
      return [consumed, Number(windowSeconds)];
    }
    throw new Error(`Unsupported Redis command: ${command}`);
  }
}

const passwordHasher: PasswordHasher = {
  async hash(value) {
    return `hash:${value}`;
  },
  async verify(value, hash) {
    return hash === `hash:${value}`;
  },
};

function createServices(store = new MemoryFamilyStore()) {
  const redis = new MemoryRedis();
  const keyspace = createRedisKeyspace('familystar_stage3_test');
  let sessionSequence = 0;
  const sessions = new RedisSessionStore(
    redis,
    keyspace,
    () => `session-${(sessionSequence += 1)}`,
  );
  const auth = new FamilyAuthService(store, sessions, passwordHasher, () => new Date(NOW));
  const children = new ChildAccountService(
    store,
    sessions,
    passwordHasher,
    new RedisChildLoginRateLimiter(redis, keyspace),
    () => new Date(NOW),
  );
  return { store, sessions, auth, children };
}

async function registerFamily(auth: FamilyAuthService) {
  return auth.register({
    familyName: 'Star Family',
    nickname: 'Parent One',
    email: 'parent@example.com',
    password: PARENT_PASSWORD,
    timeZone: 'Asia/Shanghai',
  });
}

async function createChild(children: ChildAccountService, parentSession: string) {
  return children.create({
    sessionToken: parentSession,
    nickname: 'Child One',
    credentialType: 'pin',
    credential: '1234',
    gender: 'female',
  });
}

describe('Phase 1 family authentication integration', () => {
  it('rolls back every family initialization record when a default write fails', async () => {
    const store = new MemoryFamilyStore(true);
    const { auth } = createServices(store);

    await expect(registerFamily(auth)).rejects.toThrow('level initialization failed');

    const state = store.snapshot();
    expect(state.families).toEqual([]);
    expect(state.parents).toEqual([]);
    expect(state.taskTypes).toEqual([]);
    expect(state.levels).toEqual([]);
  });

  it('commits a verified-email invitation with its Outbox event and accepts a second parent', async () => {
    const { store, sessions, auth } = createServices();
    const firstParent = await registerFamily(auth);
    store.setEmailConfigured(firstParent.parent.familyId);
    const invitationToken = 'second-parent-invitation-token';
    const invitations = new FamilyInvitationService(
      store,
      store,
      store,
      sessions,
      passwordHasher,
      'https://familystar.example',
      () => new Date(NOW),
      () => invitationToken,
    );

    const created = await invitations.create({
      sessionToken: firstParent.sessionToken,
      email: 'second@example.com',
      correlationId: 'stage-3-integration',
    });
    const afterCreate = store.snapshot();

    expect(created.delivery).toBe('email');
    expect(afterCreate.invitations).toHaveLength(1);
    expect(afterCreate.outbox).toHaveLength(1);
    expect(afterCreate.outbox[0]).toMatchObject({
      family_id: firstParent.parent.familyId,
      actor_id: firstParent.parent.id,
      correlation_id: 'stage-3-integration',
    });
    expect(afterCreate.invitations[0]?.tokenHash).toBe(
      createHash('sha256').update(invitationToken).digest('hex'),
    );

    const accepted = await invitations.accept({
      token: invitationToken,
      nickname: 'Parent Two',
      password: 'second-parent-123',
    });
    const afterAccept = store.snapshot();
    expect(accepted.parent.familyId).toBe(firstParent.parent.familyId);
    expect(afterAccept.parents).toHaveLength(2);
    expect(afterAccept.invitations[0]?.status).toBe('accepted');
    await expect(sessions.read(accepted.sessionToken)).resolves.toMatchObject({
      subjectId: accepted.parent.id,
      familyId: firstParent.parent.familyId,
      role: 'parent',
    });
  });

  it('persists five failed PIN attempts and locks only that child for fifteen minutes', async () => {
    const { store, auth, children } = createServices();
    const parent = await registerFamily(auth);
    const { child } = await createChild(children, parent.sessionToken);

    for (let attempt = 1; attempt < 5; attempt += 1) {
      await expect(
        children.switchToChild({
          sessionToken: parent.sessionToken,
          childId: child.id,
          credential: '9999',
        }),
      ).rejects.toBeInstanceOf(ChildAuthenticationError);
    }
    await expect(
      children.switchToChild({
        sessionToken: parent.sessionToken,
        childId: child.id,
        credential: '9999',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ChildLockedError>>({ remainingSeconds: 900 }),
    );

    const lockedChild = store.snapshot().children[0];
    expect(lockedChild).toMatchObject({
      id: child.id,
      failedLoginAttempts: 5,
      version: 5,
      lockedUntil: new Date('2026-07-30T15:15:00.000Z'),
    });
  });

  it('revokes an existing child session after a credential change and preserves a new session', async () => {
    const { sessions, auth, children } = createServices();
    const parent = await registerFamily(auth);
    const { child } = await createChild(children, parent.sessionToken);
    const firstLogin = await children.switchToChild({
      sessionToken: parent.sessionToken,
      childId: child.id,
      credential: '1234',
    });
    await expect(sessions.read(firstLogin.sessionToken)).resolves.toMatchObject({
      subjectId: child.id,
      role: 'child',
    });

    await children.update({
      sessionToken: parent.sessionToken,
      childId: child.id,
      credential: '5678',
    });
    await expect(sessions.read(firstLogin.sessionToken)).resolves.toBeNull();

    const secondLogin = await children.switchToChild({
      sessionToken: parent.sessionToken,
      childId: child.id,
      credential: '5678',
    });
    await expect(sessions.read(secondLogin.sessionToken)).resolves.toMatchObject({
      subjectId: child.id,
      familyId: child.familyId,
      role: 'child',
    });
  });
});
