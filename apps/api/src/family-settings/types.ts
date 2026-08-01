import type { SessionStore } from '../family-auth/types.js';

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

export type FamilySettingsRepository = {
  findActiveSettings(familyId: string): Promise<Record<string, unknown> | null>;
  updateActiveSettings(familyId: string, settings: Record<string, unknown>): Promise<boolean>;
};

export type FamilySettingsOperations = {
  get(input: { sessionToken?: string }): Promise<{ settings: FamilySettings }>;
  update(input: {
    sessionToken?: string;
    settings: FamilySettingsPatch;
  }): Promise<{ settings: FamilySettings }>;
};

export type FamilySettingsDependencies = {
  repository: FamilySettingsRepository;
  sessions: SessionStore;
};
