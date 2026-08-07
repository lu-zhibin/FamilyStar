'use client';

import type { FamilyModulesReadModel } from '@familystar/shared';
import { useCallback, useEffect, useState } from 'react';

import type { FamilyModulesLoadState } from '../lib/family-modules';

type PortalApi = <T>(path: string, init?: RequestInit) => Promise<T>;

export const FAMILY_MODULES_UPDATED_EVENT = 'familystar:family-modules-updated';

export function publishFamilyModules(readModel: FamilyModulesReadModel): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FAMILY_MODULES_UPDATED_EVENT, { detail: readModel }));
}

export function useFamilyModules(api: PortalApi, initial?: FamilyModulesReadModel) {
  const [readModel, setReadModel] = useState<FamilyModulesReadModel | null>(initial ?? null);
  const [state, setState] = useState<FamilyModulesLoadState>(initial ? 'live' : 'loading');

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ modules: FamilyModulesReadModel }>('/family/modules');
      setReadModel(data.modules);
      setState('live');
      return data.modules;
    } catch (error) {
      setState('error');
      throw error;
    }
  }, [api]);

  useEffect(() => {
    if (!initial) void refresh().catch(() => undefined);
  }, [initial, refresh]);

  useEffect(() => {
    function update(event: Event) {
      const detail = (event as CustomEvent<FamilyModulesReadModel>).detail;
      if (detail) {
        setReadModel(detail);
        setState('live');
      }
    }
    window.addEventListener(FAMILY_MODULES_UPDATED_EVENT, update);
    return () => window.removeEventListener(FAMILY_MODULES_UPDATED_EVENT, update);
  }, []);

  return { readModel, state, refresh };
}
