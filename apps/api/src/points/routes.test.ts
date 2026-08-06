import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { encodeCursor, InvalidPaginationError } from '../http/cursor.js';
import { PointsReadAccessError } from './service.js';
import type { PointsLedgerEntry, PointsReadOperations, PointsSummary } from './types.js';

const points: PointsSummary = {
  userId: '01989a58-c542-7abc-8def-0123456789ab',
  pointsBalance: 35,
  pointsEarnedTotal: 50,
};

const ledgerEntry: PointsLedgerEntry = {
  id: '01989a58-c542-7abc-8def-0123456789ac',
  type: 'EARN',
  businessType: 'check_in',
  businessId: '01989a58-c542-7abc-8def-0123456789ad',
  delta: 10,
  balanceBefore: 25,
  balanceAfter: 35,
  earnedTotalAfter: 50,
  remark: 'Completed reading',
  createdAt: new Date('2026-08-05T12:00:00.000Z'),
};

function operations(): PointsReadOperations {
  return {
    getMe: vi.fn().mockResolvedValue({ points }),
    getChild: vi.fn().mockResolvedValue({ points }),
    getMyLogs: vi.fn().mockResolvedValue({
      logs: [ledgerEntry],
      page: { next_cursor: null, has_more: false },
    }),
  };
}

describe('points read HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('returns child points in snake_case and renews the cookie', async () => {
    const pointsReadOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', pointsReadOperations });
    const response = await app.request('/api/v1/points/me', {
      headers: { cookie: 'familystar_session=child-session' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=child-session');
    expect(pointsReadOperations.getMe).toHaveBeenCalledWith({ sessionToken: 'child-session' });
    expect(await response.json()).toMatchObject({
      data: {
        points: {
          child_id: points.userId,
          points_balance: 35,
          points_earned_total: 50,
        },
      },
    });
  });

  it('passes the child path to the parent operation', async () => {
    const pointsReadOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', pointsReadOperations });
    const response = await app.request(`/api/v1/family/children/${points.userId}/points`, {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(200);
    expect(pointsReadOperations.getChild).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      childId: points.userId,
    });
  });

  it('rejects a malformed child path before calling the operation', async () => {
    const pointsReadOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', pointsReadOperations });
    const response = await app.request('/api/v1/family/children/not-a-uuid/points', {
      headers: { cookie: 'familystar_session=parent-session' },
    });

    expect(response.status).toBe(400);
    expect(pointsReadOperations.getChild).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('parses cursor paging and preserves immutable ledger fields', async () => {
    const pointsReadOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', pointsReadOperations });
    const position = { sortValue: ledgerEntry.createdAt.toISOString(), id: ledgerEntry.id };
    const cursor = encodeCursor(position);
    const response = await app.request(`/api/v1/points/me/logs?cursor=${cursor}&limit=5`, {
      headers: { cookie: 'familystar_session=child-session' },
    });

    expect(response.status).toBe(200);
    expect(pointsReadOperations.getMyLogs).toHaveBeenCalledWith({
      sessionToken: 'child-session',
      cursor: position,
      limit: 5,
    });
    expect(await response.json()).toMatchObject({
      data: {
        logs: [
          {
            id: ledgerEntry.id,
            type: 'EARN',
            business_type: 'check_in',
            business_id: ledgerEntry.businessId,
            delta: 10,
            balance_before: 25,
            balance_after: 35,
            earned_total_after: 50,
            remark: 'Completed reading',
            created_at: '2026-08-05T12:00:00.000Z',
          },
        ],
        page: { next_cursor: null, has_more: false },
      },
    });
  });

  it.each([
    ['/api/v1/points/me/logs?limit=0'],
    [
      `/api/v1/points/me/logs?cursor=${encodeCursor({
        sortValue: 'not-an-iso-time',
        id: ledgerEntry.id,
      })}`,
    ],
  ])('maps invalid pagination input on %s to INVALID_REQUEST', async (path) => {
    const pointsReadOperations = operations();
    if (path.includes('cursor=')) {
      vi.mocked(pointsReadOperations.getMyLogs).mockRejectedValueOnce(
        new InvalidPaginationError('The cursor is invalid.'),
      );
    }
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', pointsReadOperations });
    const response = await app.request(path, {
      headers: { cookie: 'familystar_session=child-session' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it.each([
    ['UNAUTHORIZED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
  ] as const)('maps %s to a stable HTTP error', async (code, status) => {
    const pointsReadOperations = operations();
    vi.mocked(pointsReadOperations.getMe).mockRejectedValue(
      new PointsReadAccessError(code, 'Denied.'),
    );
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', pointsReadOperations });
    const response = await app.request('/api/v1/points/me');

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });
});
