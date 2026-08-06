import { describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import type { AuthSession, SessionStore } from './family-auth/types.js';
import { PointsReadService } from './points/service.js';
import type { PointsLedgerEntry, PointsReadRepository } from './points/types.js';

const familyA = '11111111-1111-4111-8111-111111111111';
const familyB = '22222222-2222-4222-8222-222222222222';
const childA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const childB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const familyALogs: readonly PointsLedgerEntry[] = [
  {
    id: '00000000-0000-4000-8000-000000000004',
    type: 'REFUND',
    businessType: 'redemption',
    businessId: '40000000-0000-4000-8000-000000000004',
    delta: 20,
    balanceBefore: 35,
    balanceAfter: 55,
    earnedTotalAfter: 55,
    remark: null,
    createdAt: new Date('2026-08-06T12:00:00.000Z'),
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    type: 'REDEEM',
    businessType: 'redemption',
    businessId: '40000000-0000-4000-8000-000000000003',
    delta: -20,
    balanceBefore: 55,
    balanceAfter: 35,
    earnedTotalAfter: 55,
    remark: null,
    createdAt: new Date('2026-08-06T12:00:00.000Z'),
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    type: 'MANUAL',
    businessType: 'manual_adjustment',
    businessId: '40000000-0000-4000-8000-000000000002',
    delta: 5,
    balanceBefore: 50,
    balanceAfter: 55,
    earnedTotalAfter: 55,
    remark: null,
    createdAt: new Date('2026-08-05T12:00:00.000Z'),
  },
  {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'EARN',
    businessType: 'check_in',
    businessId: '40000000-0000-4000-8000-000000000001',
    delta: 50,
    balanceBefore: 0,
    balanceAfter: 50,
    earnedTotalAfter: 50,
    remark: null,
    createdAt: new Date('2026-08-04T12:00:00.000Z'),
  },
];

function sessions(): SessionStore {
  const values: Readonly<Record<string, AuthSession>> = {
    'child-a': {
      subjectId: childA,
      familyId: familyA,
      role: 'child',
      issuedAt: '2026-08-06T00:00:00.000Z',
    },
    'child-b': {
      subjectId: childB,
      familyId: familyB,
      role: 'child',
      issuedAt: '2026-08-06T00:00:00.000Z',
    },
  };
  return {
    create: vi.fn(),
    read: vi.fn(async (token: string) => values[token] ?? null),
    revoke: vi.fn(),
    revokeSubject: vi.fn(),
  };
}

function repository(): PointsReadRepository {
  const logs = [
    ...familyALogs,
    {
      ...familyALogs[0]!,
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      createdAt: new Date('2026-08-07T12:00:00.000Z'),
    },
  ];
  return {
    findActiveChildSummary: vi.fn(async (familyId, childId) => {
      if (familyId === familyA && childId === childA) {
        return { userId: childA, pointsBalance: 55, pointsEarnedTotal: 55 };
      }
      if (familyId === familyB && childId === childB) {
        return { userId: childB, pointsBalance: 20, pointsEarnedTotal: 20 };
      }
      return null;
    }),
    findChildLogs: vi.fn(async ({ familyId, childId, cursor, limit }) => {
      if (familyId !== familyA || childId !== childA) return [];
      const visible = logs.filter((log) => {
        if (!familyALogs.some(({ id }) => id === log.id)) return false;
        if (!cursor) return true;
        return (
          log.createdAt < cursor.createdAt ||
          (log.createdAt.getTime() === cursor.createdAt.getTime() && log.id < cursor.id)
        );
      });
      return visible.slice(0, limit + 1);
    }),
  };
}

type LogsResponse = {
  data: {
    logs: Array<{
      id: string;
      delta: number;
      balance_before: number;
      balance_after: number;
      earned_total_after: number;
    }>;
    page: { has_more: boolean; next_cursor: string | null };
  };
};

describe('product completion read-model integration', () => {
  it('keeps paged ledger reads stable, family scoped, and balance conserving', async () => {
    const sessionStore = sessions();
    const pointsReadOperations = new PointsReadService({
      repository: repository(),
      sessions: sessionStore,
    });
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      sessionStore,
      pointsReadOperations,
    });
    const headers = { cookie: 'familystar_session=child-a' };

    const summaryResponse = await app.request('/api/v1/points/me', { headers });
    const summary = (await summaryResponse.json()) as {
      data: { points: { child_id: string; points_balance: number; points_earned_total: number } };
    };
    expect(summary.data.points).toEqual({
      child_id: childA,
      points_balance: 55,
      points_earned_total: 55,
    });

    const firstResponse = await app.request('/api/v1/points/me/logs?limit=2', { headers });
    const first = (await firstResponse.json()) as LogsResponse;
    expect(first.data.logs.map(({ id }) => id)).toEqual([
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000003',
    ]);
    expect(first.data.page.has_more).toBe(true);

    const cursor = encodeURIComponent(first.data.page.next_cursor ?? '');
    const secondPath = `/api/v1/points/me/logs?limit=2&cursor=${cursor}`;
    const second = (await (await app.request(secondPath, { headers })).json()) as LogsResponse;
    const repeated = (await (await app.request(secondPath, { headers })).json()) as LogsResponse;
    expect(repeated.data).toEqual(second.data);

    const allLogs = [...first.data.logs, ...second.data.logs];
    expect(new Set(allLogs.map(({ id }) => id)).size).toBe(familyALogs.length);
    expect(allLogs.map(({ id }) => id)).toEqual(familyALogs.map(({ id }) => id));
    for (let index = 0; index < allLogs.length - 1; index += 1) {
      expect(allLogs[index]!.balance_before).toBe(allLogs[index + 1]!.balance_after);
    }
    expect(allLogs[0]!.balance_after).toBe(summary.data.points.points_balance);
    expect(allLogs[0]!.earned_total_after).toBe(summary.data.points.points_earned_total);
    expect(allLogs.at(-1)!.balance_before + allLogs.reduce((sum, log) => sum + log.delta, 0)).toBe(
      summary.data.points.points_balance,
    );
  });
});
