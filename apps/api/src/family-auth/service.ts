import { randomInt } from 'node:crypto';

import { DEFAULT_FAMILY_SETTINGS, resolveFamilyTimeZone } from './constants.js';
import type { PasswordHasher } from './password.js';
import { validateParentPassword } from './password.js';
import type {
  AuthSession,
  FamilyAuthRepository,
  ParentIdentity,
  PublicParentIdentity,
  SessionStore,
} from './types.js';

const FAMILY_CODE_SPACE_SIZE = 1_000_000;
const FAMILY_CODE_LENGTH = 6;
const FAMILY_CODE_CREATE_ATTEMPTS = 10;

export function generateFamilyCode(): string {
  return randomInt(FAMILY_CODE_SPACE_SIZE).toString().padStart(FAMILY_CODE_LENGTH, '0');
}

export class FamilyCodeConflictError extends Error {
  constructor() {
    super('The generated family code is already in use.');
    this.name = 'FamilyCodeConflictError';
  }
}

export class InvalidAuthSessionError extends Error {
  constructor() {
    super('A valid session is required.');
    this.name = 'InvalidAuthSessionError';
  }
}

export class ParentEmailConflictError extends Error {
  constructor() {
    super('An active parent already uses this email address.');
    this.name = 'ParentEmailConflictError';
  }
}

export class InvalidParentCredentialsError extends Error {
  constructor() {
    super('Invalid email or password.');
    this.name = 'InvalidParentCredentialsError';
  }
}

export type AuthenticatedParent = {
  parent: PublicParentIdentity;
  sessionToken: string;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class FamilyAuthService {
  constructor(
    private readonly repository: FamilyAuthRepository,
    private readonly sessions: SessionStore,
    private readonly passwords: PasswordHasher,
    private readonly clock: () => Date = () => new Date(),
    private readonly familyCodeFactory: () => string = generateFamilyCode,
  ) {}

  async register(input: {
    familyName: string;
    nickname: string;
    email: string;
    password: string;
    timeZone?: string;
  }): Promise<AuthenticatedParent> {
    validateParentPassword(input.password);
    const email = normalizeEmail(input.email);
    if (await this.repository.findActiveParentByEmail(email)) {
      throw new ParentEmailConflictError();
    }

    const passwordHash = await this.passwords.hash(input.password);
    const timeZone = resolveFamilyTimeZone(input.timeZone);
    for (let attempt = 0; attempt < FAMILY_CODE_CREATE_ATTEMPTS; attempt += 1) {
      try {
        const parent = await this.repository.createFamilyWithParent({
          familyName: input.familyName.trim(),
          familyCode: this.familyCodeFactory(),
          nickname: input.nickname.trim(),
          email,
          passwordHash,
          settings: { ...DEFAULT_FAMILY_SETTINGS, timeZone },
        });
        return this.createAuthenticatedParent(parent);
      } catch (error) {
        if (error instanceof FamilyCodeConflictError && attempt + 1 < FAMILY_CODE_CREATE_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    throw new FamilyCodeConflictError();
  }

  async login(input: { email: string; password: string }): Promise<AuthenticatedParent> {
    const parent = await this.repository.findActiveParentByEmail(normalizeEmail(input.email));
    if (!parent || !(await this.passwords.verify(input.password, parent.passwordHash))) {
      throw new InvalidParentCredentialsError();
    }
    return this.createAuthenticatedParent(parent);
  }

  async getSession(session?: AuthSession): Promise<{
    role: AuthSession['role'];
    subjectId: string;
    familyId: string;
    familyCode: string;
  }> {
    if (!session) throw new InvalidAuthSessionError();
    const familyCode = await this.repository.findActiveFamilyCodeById(session.familyId);
    if (!familyCode) throw new InvalidAuthSessionError();
    return {
      role: session.role,
      subjectId: session.subjectId,
      familyId: session.familyId,
      familyCode,
    };
  }

  async logout(sessionToken: string): Promise<void> {
    await this.sessions.revoke(sessionToken);
  }

  private async createAuthenticatedParent(parent: ParentIdentity): Promise<AuthenticatedParent> {
    const sessionToken = await this.sessions.create({
      subjectId: parent.id,
      familyId: parent.familyId,
      role: 'parent',
      issuedAt: this.clock().toISOString(),
    });
    const publicParent: PublicParentIdentity = {
      id: parent.id,
      familyId: parent.familyId,
      familyCode: parent.familyCode,
      nickname: parent.nickname,
      email: parent.email,
    };
    return { parent: publicParent, sessionToken };
  }
}
