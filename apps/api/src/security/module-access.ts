import type { OptionalFamilyModuleId } from '@familystar/shared';

import type { AuthSession } from '../family-auth/types.js';

export type FamilyModuleKey = OptionalFamilyModuleId;

export type FamilyModuleStatusPort = {
  isEnabled(input: {
    session: Pick<AuthSession, 'familyId'>;
    module: FamilyModuleKey;
  }): Promise<boolean>;
};
