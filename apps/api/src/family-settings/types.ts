import type { AuthSession, SessionStore } from '../family-auth/types.js';

export type StreakMultiplier = {
  days: number;
  multiplier: number;
};

export type FamilySettings = {
  timeZone: string;
  checkInDeadline: string;
  makeupDays: number;
  reviewTimeoutHours: number;
  autoApproveQuota: number;
  streakMultipliers: StreakMultiplier[];
};

export type FamilySettingsPatch = Partial<FamilySettings>;

export type FamilyParent = {
  id: string;
  nickname: string;
  email: string | null;
  isCreator: boolean;
  joinedAt: Date;
};

export type FamilyInvitationSummary = {
  id: string;
  email: string;
  status: 'pending' | 'expired';
  expiresAt: Date;
  createdAt: Date;
};

export type FamilyProfileRecord = {
  id: string;
  name: string;
  settings: Record<string, unknown>;
  createdById: string | null;
  parents: FamilyParent[];
  invitations: FamilyInvitationSummary[];
};

export type FamilyProfile = {
  id: string;
  name: string;
  timeZone: string;
  parents: FamilyParent[];
  invitations: FamilyInvitationSummary[];
  permissions: {
    canUpdateName: boolean;
    canManageInvitations: boolean;
  };
};

export type FamilyProfilePatch = {
  name?: string;
  timeZone?: string;
};

export type FamilySettingsRepository = {
  findActiveSettings(familyId: string): Promise<Record<string, unknown> | null>;
  updateActiveSettings(familyId: string, settings: Record<string, unknown>): Promise<boolean>;
  findActiveProfile(familyId: string, now: Date): Promise<FamilyProfileRecord | null>;
  updateActiveProfile(
    familyId: string,
    profile: { name?: string; settings?: Record<string, unknown> },
  ): Promise<boolean>;
};

export type FamilySettingsOperations = {
  get(input: { sessionToken?: string }): Promise<{ settings: FamilySettings }>;
  update(input: {
    sessionToken?: string;
    settings: FamilySettingsPatch;
  }): Promise<{ settings: FamilySettings }>;
  getProfile(input: { sessionToken?: string }): Promise<{ profile: FamilyProfile }>;
  updateProfile(input: {
    sessionToken?: string;
    profile: FamilyProfilePatch;
  }): Promise<{ profile: FamilyProfile }>;
  listParents(input: { sessionToken?: string }): Promise<{
    parents: FamilyParent[];
    invitations: FamilyInvitationSummary[];
    permissions: FamilyProfile['permissions'];
  }>;
};

export type FamilySettingsDependencies = {
  repository: FamilySettingsRepository;
  sessions: SessionStore;
};

export type ParentFamilySession = AuthSession & { role: 'parent' };
