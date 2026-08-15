import type { FamilyModulesReadModel, OptionalFamilyModuleId } from '@familystar/shared';

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
  settingsVersion: number;
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
  findActiveSettings(familyId: string): Promise<FamilySettingsRecord | null>;
  updateActiveSettings(
    familyId: string,
    expectedVersion: number,
    settings: Record<string, unknown>,
  ): Promise<boolean>;
  findActiveProfile(familyId: string, now: Date): Promise<FamilyProfileRecord | null>;
  updateActiveProfile(
    familyId: string,
    profile: {
      name?: string;
      settings?: Record<string, unknown>;
      expectedSettingsVersion?: number;
    },
  ): Promise<boolean>;
};

export type FamilySettingsRecord = {
  settings: Record<string, unknown>;
  settingsVersion: number;
  createdById: string | null;
};

export type FamilyModulePatch = Partial<Record<OptionalFamilyModuleId, boolean>>;

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
  getModules(input: { sessionToken?: string }): Promise<{ modules: FamilyModulesReadModel }>;
  updateModules(input: {
    sessionToken?: string;
    expectedVersion: number;
    modules: FamilyModulePatch;
  }): Promise<{ modules: FamilyModulesReadModel }>;
};

export type FamilySettingsDependencies = {
  repository: FamilySettingsRepository;
  sessions: SessionStore;
};

export type ParentFamilySession = AuthSession & { role: 'parent' };
