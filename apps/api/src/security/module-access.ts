import type { AuthSession } from '../family-auth/types.js';

export const FAMILY_MODULE_KEYS = [
  'analytics',
  'growth-records',
  'levels',
  'rewards',
  'badges',
  'notifications',
] as const;

export type FamilyModuleKey = (typeof FAMILY_MODULE_KEYS)[number];

export type FamilyModuleStatusPort = {
  isEnabled(input: {
    session: Pick<AuthSession, 'familyId'>;
    module: FamilyModuleKey;
  }): Promise<boolean>;
};
