import type { PasswordHasher } from './password.js';
import type { SessionStore } from './types.js';
import type {
  ChildAccountRepository,
  ChildCredentialType,
  ChildGender,
  ChildLoginRateLimiter,
  ChildProfile,
  UpdateChildRecord,
} from './child-types.js';
import { CHILD_LOCK_ATTEMPTS, CHILD_LOCK_MILLISECONDS } from './constants.js';

export class ChildAuthenticationError extends Error {
  constructor(message = 'A valid family session is required.') {
    super(message);
    this.name = 'ChildAuthenticationError';
  }
}

export class ChildLockedError extends ChildAuthenticationError {
  constructor(readonly remainingSeconds: number) {
    super('Child account is temporarily locked.');
    this.name = 'ChildLockedError';
  }
}

export class ChildLoginRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many child login attempts.');
    this.name = 'ChildLoginRateLimitError';
  }
}

export class ParentSessionRequiredError extends Error {
  constructor() {
    super('A valid parent session is required.');
    this.name = 'ParentSessionRequiredError';
  }
}

export class ChildNotFoundError extends Error {
  constructor() {
    super('The child profile was not found.');
    this.name = 'ChildNotFoundError';
  }
}

export class InvalidChildAvatarError extends Error {
  constructor() {
    super('The selected avatar is unavailable for this family.');
    this.name = 'InvalidChildAvatarError';
  }
}

export class InvalidChildCredentialError extends Error {
  constructor(readonly reason: 'invalid-pin' | 'invalid-password' | 'too-long') {
    const messages = {
      'invalid-pin': 'PIN must contain 4 to 6 digits.',
      'invalid-password': 'Password must contain at least 6 characters and one letter.',
      'too-long': 'Credential exceeds the bcrypt byte limit.',
    } as const;
    super(messages[reason]);
    this.name = 'InvalidChildCredentialError';
  }
}

export type ChildProfileInput = {
  nickname: string;
  credentialType: ChildCredentialType;
  credential: string;
  gender: ChildGender;
  birthday?: string | null;
  grade?: string | null;
  avatarMediaId?: string | null;
};

export type ChildProfileUpdate = {
  nickname?: string;
  credentialType?: ChildCredentialType;
  credential?: string;
  gender?: ChildGender;
  birthday?: string | null;
  grade?: string | null;
  avatarMediaId?: string | null;
};

export type ChildAccountOperations = {
  list(input: { sessionToken?: string }): Promise<{ children: ChildProfile[] }>;
  create(input: { sessionToken?: string } & ChildProfileInput): Promise<{ child: ChildProfile }>;
  update(
    input: { sessionToken?: string; childId: string } & ChildProfileUpdate,
  ): Promise<{ child: ChildProfile }>;
  remove(input: { sessionToken?: string; childId: string }): Promise<{ childId: string }>;
  listSwitchTargets(input: { sessionToken?: string }): Promise<{ children: ChildProfile[] }>;
  switchToChild(input: {
    sessionToken?: string;
    childId: string;
    credential: string;
  }): Promise<{ child: ChildProfile; sessionToken: string }>;
  changeOwnPassword(input: {
    sessionToken?: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ childId: string }>;
};

function validateCredential(type: ChildCredentialType, credential: string): void {
  if (type === 'pin') {
    if (!/^\d{4,6}$/.test(credential)) throw new InvalidChildCredentialError('invalid-pin');
  } else if (credential.length < 6 || !/\p{L}/u.test(credential)) {
    throw new InvalidChildCredentialError('invalid-password');
  }
  if (Buffer.byteLength(credential, 'utf8') > 72) {
    throw new InvalidChildCredentialError('too-long');
  }
}

function trimNullable(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export class ChildAccountService implements ChildAccountOperations {
  constructor(
    private readonly repository: ChildAccountRepository,
    private readonly sessions: SessionStore,
    private readonly passwords: PasswordHasher,
    private readonly loginRateLimiter: ChildLoginRateLimiter,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(input: { sessionToken?: string }): Promise<{ children: ChildProfile[] }> {
    const session = await this.requireParent(input.sessionToken);
    return { children: await this.repository.listActiveChildren(session.familyId) };
  }

  async create(
    input: { sessionToken?: string } & ChildProfileInput,
  ): Promise<{ child: ChildProfile }> {
    const session = await this.requireParent(input.sessionToken);
    validateCredential(input.credentialType, input.credential);
    await this.validateAvatar(session.familyId, input.avatarMediaId);
    const child = await this.repository.createChild({
      familyId: session.familyId,
      nickname: input.nickname.trim(),
      credentialType: input.credentialType,
      credentialHash: await this.passwords.hash(input.credential),
      gender: input.gender,
      birthday: input.birthday ?? null,
      grade: trimNullable(input.grade) ?? null,
      avatarMediaId: input.avatarMediaId ?? null,
    });
    return { child };
  }

  async update(
    input: { sessionToken?: string; childId: string } & ChildProfileUpdate,
  ): Promise<{ child: ChildProfile }> {
    const session = await this.requireParent(input.sessionToken);
    const current = await this.repository.findActiveChild(session.familyId, input.childId);
    if (!current) throw new ChildNotFoundError();
    await this.validateAvatar(session.familyId, input.avatarMediaId);

    const update: UpdateChildRecord = {};
    if (input.nickname !== undefined) update.nickname = input.nickname.trim();
    if (input.gender !== undefined) update.gender = input.gender;
    if (input.birthday !== undefined) update.birthday = input.birthday;
    if (input.grade !== undefined) update.grade = trimNullable(input.grade) ?? null;
    if (input.avatarMediaId !== undefined) update.avatarMediaId = input.avatarMediaId;
    if (input.credential !== undefined || input.credentialType !== undefined) {
      if (input.credential === undefined) throw new InvalidChildCredentialError('invalid-password');
      const credentialType = input.credentialType ?? current.credentialType;
      validateCredential(credentialType, input.credential);
      update.credentialType = credentialType;
      update.credentialHash = await this.passwords.hash(input.credential);
    }

    const child = await this.repository.updateChild(session.familyId, input.childId, update);
    if (!child) throw new ChildNotFoundError();
    if (update.credentialHash !== undefined) await this.sessions.revokeSubject(input.childId);
    return { child };
  }

  async remove(input: { sessionToken?: string; childId: string }): Promise<{ childId: string }> {
    const session = await this.requireParent(input.sessionToken);
    const deleted = await this.repository.softDeleteChild(
      session.familyId,
      input.childId,
      this.clock(),
    );
    if (!deleted) throw new ChildNotFoundError();
    await this.sessions.revokeSubject(input.childId);
    return { childId: input.childId };
  }

  async listSwitchTargets(input: { sessionToken?: string }): Promise<{ children: ChildProfile[] }> {
    const session = await this.requireFamilySession(input.sessionToken);
    return { children: await this.repository.listActiveChildren(session.familyId) };
  }

  async switchToChild(input: {
    sessionToken?: string;
    childId: string;
    credential: string;
  }): Promise<{ child: ChildProfile; sessionToken: string }> {
    const session = await this.requireFamilySession(input.sessionToken);
    const rateLimit = await this.loginRateLimiter.consume(session.familyId, input.childId);
    if (!rateLimit.allowed) throw new ChildLoginRateLimitError(rateLimit.retryAfterSeconds);

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const now = this.clock();
      const child = await this.repository.findActiveChild(session.familyId, input.childId);
      if (!child) throw new ChildAuthenticationError('Invalid child profile or credential.');
      if (child.lockedUntil && child.lockedUntil > now) {
        throw new ChildLockedError(this.remainingLockSeconds(child.lockedUntil, now));
      }

      const credentialMatches = await this.passwords.verify(input.credential, child.credentialHash);
      const previousFailures = child.lockedUntil ? 0 : child.failedLoginAttempts;
      const failedLoginAttempts = credentialMatches ? 0 : previousFailures + 1;
      const lockedUntil =
        !credentialMatches && failedLoginAttempts >= CHILD_LOCK_ATTEMPTS
          ? new Date(now.getTime() + CHILD_LOCK_MILLISECONDS)
          : null;
      const updated = await this.repository.updateAuthenticationState(
        child.familyId,
        child.id,
        child.version,
        { failedLoginAttempts, lockedUntil },
      );
      if (!updated) continue;
      if (!credentialMatches) {
        if (lockedUntil) throw new ChildLockedError(this.remainingLockSeconds(lockedUntil, now));
        throw new ChildAuthenticationError('Invalid child profile or credential.');
      }

      const sessionToken = await this.sessions.create({
        subjectId: child.id,
        familyId: child.familyId,
        role: 'child',
        issuedAt: now.toISOString(),
      });
      return {
        child: {
          id: child.id,
          familyId: child.familyId,
          nickname: child.nickname,
          credentialType: child.credentialType,
          gender: child.gender,
          birthday: child.birthday,
          grade: child.grade,
          avatarMediaId: child.avatarMediaId,
        },
        sessionToken,
      };
    }
    throw new Error('Child authentication state could not be updated.');
  }

  async changeOwnPassword(input: {
    sessionToken?: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ childId: string }> {
    const session = await this.requireChild(input.sessionToken);
    const child = await this.repository.findActiveChild(session.familyId, session.subjectId);
    if (!child || child.credentialType !== 'password') throw new ChildAuthenticationError();
    if (!(await this.passwords.verify(input.currentPassword, child.credentialHash))) {
      throw new ChildAuthenticationError('Invalid child profile or credential.');
    }
    validateCredential('password', input.newPassword);
    const updated = await this.repository.updateChild(session.familyId, session.subjectId, {
      credentialType: 'password',
      credentialHash: await this.passwords.hash(input.newPassword),
    });
    if (!updated) throw new ChildNotFoundError();
    await this.sessions.revokeSubject(session.subjectId);
    return { childId: session.subjectId };
  }

  private async requireParent(token?: string) {
    const session = token ? await this.sessions.read(token) : null;
    if (!session || session.role !== 'parent') throw new ParentSessionRequiredError();
    return session;
  }

  private async requireFamilySession(token?: string) {
    const session = token ? await this.sessions.read(token) : null;
    if (!session) throw new ChildAuthenticationError();
    return session;
  }

  private async requireChild(token?: string) {
    const session = token ? await this.sessions.read(token) : null;
    if (!session || session.role !== 'child') throw new ChildAuthenticationError();
    return session;
  }

  private async validateAvatar(familyId: string, avatarMediaId?: string | null): Promise<void> {
    if (
      avatarMediaId !== undefined &&
      avatarMediaId !== null &&
      !(await this.repository.isReadyFamilyAvatar(familyId, avatarMediaId))
    ) {
      throw new InvalidChildAvatarError();
    }
  }

  private remainingLockSeconds(lockedUntil: Date, now: Date): number {
    return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000));
  }
}
