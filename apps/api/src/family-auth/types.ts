export type ParentIdentity = {
  id: string;
  familyId: string;
  familyCode: string;
  nickname: string;
  email: string;
  passwordHash: string;
};

export type PublicParentIdentity = Omit<ParentIdentity, 'passwordHash'>;

export type FamilyInitialization = {
  familyName: string;
  familyCode: string;
  nickname: string;
  email: string;
  passwordHash: string;
  settings: Record<string, unknown>;
};

export type FamilyAuthRepository = {
  createFamilyWithParent(input: FamilyInitialization): Promise<ParentIdentity>;
  findActiveParentByEmail(email: string): Promise<ParentIdentity | null>;
  findActiveFamilyCodeById(familyId: string): Promise<string | null>;
};

export type AuthSession = {
  subjectId: string;
  familyId: string;
  role: 'parent' | 'child';
  issuedAt: string;
};

export type SessionStore = {
  create(session: AuthSession): Promise<string>;
  read(token: string): Promise<AuthSession | null>;
  revokeSubject(subjectId: string): Promise<void>;
};

export type FamilyInvitation = {
  id: string;
  familyId: string;
  invitedById: string;
  email: string;
  expiresAt: Date;
};

export type CreateInvitationInput = {
  actorId: string;
  familyId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
};

export type InvitationCreation = {
  invitation: FamilyInvitation;
  emailConfigured: boolean;
};

export type AcceptInvitationInput = {
  tokenHash: string;
  nickname: string;
  passwordHash: string;
  now: Date;
};

export type FamilyInvitationRepository<Transaction> = {
  createOrRefresh(
    transaction: Transaction,
    input: CreateInvitationInput,
  ): Promise<InvitationCreation>;
  accept(transaction: Transaction, input: AcceptInvitationInput): Promise<ParentIdentity>;
};
