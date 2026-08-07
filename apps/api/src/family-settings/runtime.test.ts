import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import type { AuthSession, SessionStore } from '../family-auth/types.js';
import type { AnalyticsOperations } from '../analytics/types.js';
import { FamilySettingsService } from './service.js';
import type { FamilySettingsRepository } from './types.js';

const sessionsByToken: Record<string, AuthSession> = {
  'family-1-token': {
    subjectId: 'parent-1',
    familyId: 'family-1',
    role: 'parent',
    issuedAt: '2026-08-08T00:00:00.000Z',
  },
  'family-2-token': {
    subjectId: 'parent-2',
    familyId: 'family-2',
    role: 'parent',
    issuedAt: '2026-08-08T00:00:00.000Z',
  },
};

describe('family module runtime access', () => {
  it('uses the same family-scoped read model for navigation reads and stable API 403 guards', async () => {
    const findActiveSettings = vi.fn(async (familyId: string) => ({
      settings: {
        retainedBusinessData: { rows: 12 },
        modules: { analytics: familyId === 'family-2' },
      },
      settingsVersion: 4,
      createdById: familyId === 'family-1' ? 'parent-1' : 'parent-2',
    }));
    const repository: FamilySettingsRepository = {
      findActiveSettings,
      updateActiveSettings: vi.fn(),
      findActiveProfile: vi.fn(),
      updateActiveProfile: vi.fn(),
    };
    const sessions: SessionStore = {
      create: vi.fn(),
      read: vi.fn(async (token) => sessionsByToken[token] ?? null),
      revoke: vi.fn(),
      revokeSubject: vi.fn(),
    };
    const familySettingsService = new FamilySettingsService({ repository, sessions });
    const getAnalytics = vi.fn(async () => ({
      range: {
        startDate: '2026-08-01',
        endDate: '2026-08-08',
        timeZone: 'Asia/Shanghai',
        dayCount: 8,
      },
      filters: { childId: null, taskId: null },
      overview: { scheduledCount: 0, completedCount: 0, completionRate: null, pointsEarned: 0 },
      pointsTrend: [],
      taskPerformance: [],
      levelDistribution: [],
    }));
    const analyticsOperations: AnalyticsOperations = {
      getAnalytics,
      getRankings: vi.fn(),
    };
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      familySettingsService,
      familyModuleStatus: familySettingsService,
      sessionStore: sessions,
      analyticsOperations,
    });

    const modulesResponse = await app.request('/api/v1/family/modules', {
      headers: { Cookie: 'familystar_session=family-1-token' },
    });
    expect(modulesResponse.status).toBe(200);
    expect(await modulesResponse.json()).toMatchObject({
      data: {
        modules: {
          version: 4,
          modules: expect.arrayContaining([
            expect.objectContaining({ id: 'tasks', enabled: true, configurable: false }),
            expect.objectContaining({ id: 'analytics', enabled: false, configurable: true }),
          ]),
        },
      },
    });

    const disabledResponse = await app.request(
      '/api/v1/family/analytics?start_date=2026-08-01&end_date=2026-08-08',
      { headers: { Cookie: 'familystar_session=family-1-token' } },
    );
    expect(disabledResponse.status).toBe(403);
    expect(await disabledResponse.json()).toMatchObject({
      error: { code: 'MODULE_DISABLED', message: 'This family module is disabled.' },
    });
    expect(getAnalytics).not.toHaveBeenCalled();

    const enabledResponse = await app.request(
      '/api/v1/family/analytics?start_date=2026-08-01&end_date=2026-08-08',
      { headers: { Cookie: 'familystar_session=family-2-token' } },
    );
    expect(enabledResponse.status).toBe(200);
    expect(getAnalytics).toHaveBeenCalledTimes(1);
    expect(findActiveSettings).toHaveBeenCalledWith('family-1');
    expect(findActiveSettings).toHaveBeenCalledWith('family-2');
  });
});
