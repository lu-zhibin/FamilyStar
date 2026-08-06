import { describe, expect, it, vi } from 'vitest';

import { InvalidQueryFilterError } from '../http/query-validation.js';
import { DashboardService, buildChildProgress } from './service.js';
import type { DashboardActivity, DashboardRepository } from './types.js';

const familyId = '01989a58-c542-7abc-8def-0123456789ab';
const childId = '01989a58-c542-7abc-8def-0123456789ac';

function repository(activity: readonly DashboardActivity[] = []): DashboardRepository {
  return {
    findFamilyContext: vi.fn().mockResolvedValue({
      timeZone: 'America/New_York',
      children: [
        { id: childId, nickname: '小星' },
        { id: '01989a58-c542-7abc-8def-0123456789ad', nickname: '小月' },
      ],
    }),
    findDailyProgressEntries: vi.fn().mockResolvedValue([
      { childId, status: 'APPROVED' },
      { childId, status: 'PENDING' },
    ]),
    findDailyEarnedPoints: vi.fn().mockResolvedValue(new Map([[childId, 18]])),
    findTodoCounts: vi.fn().mockResolvedValue({
      pendingReviews: 2,
      pendingRedemptions: 1,
      pendingFulfillments: 3,
    }),
    findRecentActivity: vi.fn().mockResolvedValue(activity),
  };
}

function sessions(role: 'parent' | 'child' = 'parent') {
  return {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue({
      subjectId: 'parent-1',
      familyId,
      role,
      issuedAt: '2026-08-06T00:00:00.000Z',
    }),
    revoke: vi.fn(),
    revokeSubject: vi.fn(),
  };
}

describe('DashboardService', () => {
  it('uses family day bounds and aggregates every active child', async () => {
    const dashboardRepository = repository();
    const service = new DashboardService({ repository: dashboardRepository, sessions: sessions() });

    const result = await service.get({ sessionToken: 'parent-session', date: '2026-03-08' });

    expect(dashboardRepository.findDailyEarnedPoints).toHaveBeenCalledWith({
      familyId,
      startAt: new Date('2026-03-08T05:00:00.000Z'),
      endAtExclusive: new Date('2026-03-09T04:00:00.000Z'),
    });
    expect(result.dashboard).toMatchObject({
      date: '2026-03-08',
      timeZone: 'America/New_York',
      children: [
        {
          childId,
          taskTotal: 2,
          completedCount: 1,
          pendingReviewCount: 1,
          pointsEarned: 18,
        },
        {
          nickname: '小月',
          taskTotal: 0,
          completedCount: 0,
          pendingReviewCount: 0,
          pointsEarned: 0,
        },
      ],
    });
  });

  it('sorts activity by server time and stable id', async () => {
    const occurredAt = new Date('2026-08-06T12:00:00.000Z');
    const makeActivity = (id: string, time = occurredAt): DashboardActivity => ({
      id,
      type: 'BADGE_AWARDED',
      occurredAt: time,
      actor: null,
      child: null,
      entityType: 'badge_award',
      entityId: id,
      targetUrl: '/levels',
      details: {},
    });
    const service = new DashboardService({
      repository: repository([
        makeActivity('badge:a'),
        makeActivity('badge:b'),
        makeActivity('badge:c', new Date('2026-08-07T00:00:00.000Z')),
      ]),
      sessions: sessions(),
    });

    const result = await service.get({ sessionToken: 'parent-session', date: '2026-08-06' });

    expect(result.dashboard.recentActivity.map(({ id }) => id)).toEqual([
      'badge:c',
      'badge:b',
      'badge:a',
    ]);
  });

  it.each([
    [undefined, 'parent', 'UNAUTHORIZED'],
    ['child-session', 'child', 'FORBIDDEN'],
  ] as const)('enforces parent access', async (token, role, code) => {
    const service = new DashboardService({ repository: repository(), sessions: sessions(role) });
    await expect(
      service.get({ ...(token ? { sessionToken: token } : {}), date: '2026-08-06' }),
    ).rejects.toMatchObject({ code });
  });

  it('rejects an invalid business date before aggregate reads', async () => {
    const dashboardRepository = repository();
    const service = new DashboardService({ repository: dashboardRepository, sessions: sessions() });
    await expect(
      service.get({ sessionToken: 'parent-session', date: '2026-02-30' }),
    ).rejects.toBeInstanceOf(InvalidQueryFilterError);
    expect(dashboardRepository.findDailyProgressEntries).not.toHaveBeenCalled();
  });
});

describe('buildChildProgress', () => {
  it('ignores entries outside the active child set', () => {
    expect(
      buildChildProgress(
        [{ id: childId, nickname: '小星' }],
        [{ childId: 'another-family-child', status: 'APPROVED' }],
        new Map(),
      ),
    ).toEqual([
      {
        childId,
        nickname: '小星',
        taskTotal: 0,
        completedCount: 0,
        pendingReviewCount: 0,
        pointsEarned: 0,
      },
    ]);
  });
});
