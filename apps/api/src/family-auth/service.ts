import { DEFAULT_FAMILY_SETTINGS, resolveFamilyTimeZone } from './constants.js';
import type { PasswordHasher } from './password.js';
import { validateParentPassword } from './password.js';
import type {
  FamilyAuthRepository,
  ParentIdentity,
  PublicParentIdentity,
  SessionStore,
} from './types.js';

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
    const parent = await this.repository.createFamilyWithParent({
      familyName: input.familyName.trim(),
      nickname: input.nickname.trim(),
      email,
      passwordHash,
      settings: { ...DEFAULT_FAMILY_SETTINGS, timeZone },
    });
    return this.createAuthenticatedParent(parent);
  }

  async login(input: { email: string; password: string }): Promise<AuthenticatedParent> {
    const parent = await this.repository.findActiveParentByEmail(normalizeEmail(input.email));
    if (!parent || !(await this.passwords.verify(input.password, parent.passwordHash))) {
      throw new InvalidParentCredentialsError();
    }
    return this.createAuthenticatedParent(parent);
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
      nickname: parent.nickname,
      email: parent.email,
    };
    return { parent: publicParent, sessionToken };
  }
}
