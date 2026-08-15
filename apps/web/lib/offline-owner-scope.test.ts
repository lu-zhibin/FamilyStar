import { describe, expect, it, vi } from 'vitest';

import {
  ownerScopeFromSession,
  readOfflineOwnerScope,
  storeOfflineOwnerScope,
} from './offline-owner-scope';

describe('offline owner scope', () => {
  it('derives and stores only family and child ownership from a child session', () => {
    const setItem = vi.fn();
    const owner = ownerScopeFromSession({
      role: 'child',
      subject_id: 'child-1',
      family_id: 'family-1',
      family_code: 'ABC123',
    });

    storeOfflineOwnerScope({ setItem }, owner!);

    expect(owner).toEqual({ familyId: 'family-1', childId: 'child-1' });
    expect(setItem).toHaveBeenCalledWith(
      'familystar_offline_owner_scope_v2',
      '{"familyId":"family-1","childId":"child-1"}',
    );
  });

  it('rejects parent and malformed stored identities', () => {
    expect(
      ownerScopeFromSession({
        role: 'parent',
        subject_id: 'parent-1',
        family_id: 'family-1',
        family_code: 'ABC123',
      }),
    ).toBeNull();
    expect(readOfflineOwnerScope({ getItem: () => '{"childId":"child-1"}' })).toBeNull();
  });
});
