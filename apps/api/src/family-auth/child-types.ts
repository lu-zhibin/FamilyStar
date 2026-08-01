export type ChildCredentialType = 'pin' | 'password';
export type ChildGender = 'male' | 'female';

export type ChildProfile = {
  id: string;
  familyId: string;
  nickname: string;
  credentialType: ChildCredentialType;
  gender: ChildGender;
  birthday: string | null;
  grade: string | null;
  avatarMediaId: string | null;
};

export type ChildIdentity = ChildProfile & {
  credentialHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  version: number;
};

export type ChildAuthenticationState = {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};

export type ChildLoginRateLimit = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export type ChildLoginRateLimiter = {
  consume(familyId: string, childId: string): Promise<ChildLoginRateLimit>;
};

export type CreateChildRecord = {
  familyId: string;
  nickname: string;
  credentialType: ChildCredentialType;
  credentialHash: string;
  gender: ChildGender;
  birthday: string | null;
  grade: string | null;
  avatarMediaId: string | null;
};

export type UpdateChildRecord = Partial<Omit<CreateChildRecord, 'familyId'>>;

export type ChildAccountRepository = {
  listActiveChildren(familyId: string): Promise<ChildProfile[]>;
  findActiveChild(familyId: string, childId: string): Promise<ChildIdentity | null>;
  isReadyFamilyAvatar(familyId: string, avatarMediaId: string): Promise<boolean>;
  createChild(input: CreateChildRecord): Promise<ChildProfile>;
  updateChild(
    familyId: string,
    childId: string,
    input: UpdateChildRecord,
  ): Promise<ChildProfile | null>;
  updateAuthenticationState(
    familyId: string,
    childId: string,
    expectedVersion: number,
    state: ChildAuthenticationState,
  ): Promise<boolean>;
  softDeleteChild(familyId: string, childId: string, deletedAt: Date): Promise<boolean>;
};
