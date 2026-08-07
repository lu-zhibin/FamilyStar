import type { SessionIdentity } from './auth';
import type { OfflineOwnerScope } from './offline-check-in-repository';

const STORAGE_KEY = 'familystar_offline_owner_scope_v2';

export function ownerScopeFromSession(session: SessionIdentity): OfflineOwnerScope | null {
  return session.role === 'child'
    ? { familyId: session.family_id, childId: session.subject_id }
    : null;
}

export function readOfflineOwnerScope(storage: Pick<Storage, 'getItem'>): OfflineOwnerScope | null {
  try {
    const value = JSON.parse(
      storage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<OfflineOwnerScope> | null;
    return value && typeof value.familyId === 'string' && typeof value.childId === 'string'
      ? { familyId: value.familyId, childId: value.childId }
      : null;
  } catch {
    return null;
  }
}

export function storeOfflineOwnerScope(
  storage: Pick<Storage, 'setItem'>,
  owner: OfflineOwnerScope,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(owner));
}
