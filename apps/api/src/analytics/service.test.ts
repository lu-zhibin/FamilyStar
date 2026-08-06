import { describe, expect, it, vi } from 'vitest';

import { AnalyticsService } from './service.js';
import type { AnalyticsRepository } from './types.js';

const familyId = '01989a58-c542-7abc-8def-0123456789ab';
const firstChild = '01989a58-c542-7abc-8def-0123456789ac';
const secondChild = '01989a58-c542-7abc-8def-0123456789ad';
const taskId = '01989a58-c542-7abc-8def-0123456789ae';

function repository(): AnalyticsRepository {
  return {
    findFamilyContext: vi.fn().mockResolvedValue({
      timeZone: 'America/New_York',
      children: [
        {
          id: firstChild,
          nickname: 'First',
          currentLevel: 3,
          pointsBalance: 50,
          pointsEarnedTotal: 100,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: secondChild,
          nickname: 'Second',
          currentLevel: 3,
          pointsBalance: 40,
          pointsEarnedTotal: 90,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ],
    }),
    taskExists: vi.fn().mockResolvedValue(true),
    aggregateAnalytics: vi.fn().mockResolvedValue({
      scheduledCount: 0,
      completedCount: 0,
      pointsEarned: 0,
      pointsTrend: [],
      taskPerformance: [],
      levelDistribution: [],
    }),
    findRankingCandidates: vi.fn().mockResolvedValue([
      {
        childId: firstChild,
        nickname: 'First',
        currentLevel: 3,
        pointsBalance: 50,
        pointsEarnedTotal: 100,
        periodBalance: 5,
        periodEarned: 10,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        childId: secondChild,
        nickname: 'Second',
        currentLevel: 3,
        pointsBalance: 40,
        pointsEarnedTotal: 90,
        periodBalance: 5,
        periodEarned: 10,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        childId: '01989a58-c542-7abc-8def-0123456789af',
        nickname: 'Third',
        currentLevel: 2,
        pointsBalance: 40,
        pointsEarnedTotal: 90,
        periodBalance: 1,
        periodEarned: 50,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    ]),
  };
}

function sessions(role: 'parent' | 'child' = 'parent', subjectId = 'parent-1') {
  return {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue({
      subjectId,
      familyId,
      role,
      issuedAt: '2026-08-06T00:00:00.000Z',
    }),
    revoke: vi.fn(),
    revokeSubject: vi.fn(),
  };
}

describe('AnalyticsService', () => {
  it('returns a null rate for an empty denominator and uses DST-aware bounds', async () => {
    const source = repository();
    const service = new AnalyticsService({ repository: source, sessions: sessions() });
    const result = await service.getAnalytics({
      sessionToken: 'parent',
      childId: firstChild,
      taskId,
      startDate: '2026-03-08',
      endDate: '2026-03-08',
    });
    expect(result.overview.completionRate).toBeNull();
    expect(source.aggregateAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId,
        childId: firstChild,
        taskId,
        startAt: new Date('2026-03-08T05:00:00.000Z'),
        endAtExclusive: new Date('2026-03-09T04:00:00.000Z'),
      }),
    );
  });

  it('enforces parent analytics access and family-owned filters', async () => {
    const source = repository();
    const childService = new AnalyticsService({ repository: source, sessions: sessions('child') });
    await expect(
      childService.getAnalytics({
        sessionToken: 'child',
        startDate: '2026-08-01',
        endDate: '2026-08-06',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const parentService = new AnalyticsService({ repository: source, sessions: sessions() });
    await expect(
      parentService.getAnalytics({
        sessionToken: 'parent',
        childId: '01989a58-c542-7abc-8def-0123456789ff',
        startDate: '2026-08-01',
        endDate: '2026-08-06',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('uses competition ranks and period earned as the level tie-breaker', async () => {
    const service = new AnalyticsService({
      repository: repository(),
      sessions: sessions('child', secondChild),
      now: () => new Date('2026-08-06T16:00:00.000Z'),
    });
    const result = await service.getRankings({
      sessionToken: 'child',
      metric: 'level',
      period: 'week',
    });
    expect(result.range).toEqual({
      startDate: '2026-08-03',
      endDate: '2026-08-06',
      timeZone: 'America/New_York',
    });
    expect(
      result.items.map(({ rank, childId, isCurrentUser }) => ({ rank, childId, isCurrentUser })),
    ).toEqual([
      { rank: 1, childId: firstChild, isCurrentUser: false },
      { rank: 1, childId: secondChild, isCurrentUser: true },
      { rank: 3, childId: '01989a58-c542-7abc-8def-0123456789af', isCurrentUser: false },
    ]);
  });
});
