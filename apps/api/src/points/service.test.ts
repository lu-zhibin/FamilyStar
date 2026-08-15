import { decodeCursor } from '../http/cursor.js';
import type { AuthSession, SessionStore } from '../family-auth/types.js';
import { describe, expect, it, vi } from 'vitest';

import { PointsReadAccessError, PointsReadService } from './service.js';
import type { PointsLedgerEntry, PointsReadRepository, PointsSummary } from './types.js';

const summary: PointsSummary = {
  userId: '01989a58-c542-7abc-8def-0123456789ab',
  pointsBalance: 40,
  pointsEarnedTotal: 65,
};

const childSession: AuthSession = {
  subjectId: summary.userId,
  familyId: '01989a58-c542-7abc-8def-0123456789ac',
  role: 'child',
  issuedAt: '2026-08-05T00:00:00.000Z',
};

function entry(index: number): PointsLedgerEntry {
  return {
    id: `01989a58-c542-7abc-8def-${String(index).padStart(12, '0')}`,
    type: 'EARN',
    businessType: 'check_in',
    businessId: '01989a58-c542-7abc-8def-0123456789ad',
    delta: 5,
    balanceBefore: index,
    balanceAfter: index + 5,
    earnedTotalAfter: index + 5,
    remark: null,
    createdAt: new Date(`2026-08-05T00:00:0${index}.000Z`),
  };
}

function setup(
  session: AuthSession | null,
  found: PointsSummary | null = summary,
  logs: readonly PointsLedgerEntry[] = [],
) {
  const sessions: SessionStore = {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue(session),
    revoke: vi.fn(),
    revokeSubject: vi.fn(),
  };
  const repository: PointsReadRepository = {
    findActiveChildSummary: vi.fn().mockResolvedValue(found),
    findChildLogs: vi.fn().mockResolvedValue(logs),
  };
  return { service: new PointsReadService({ repository, sessions }), repository };
}

describe('PointsReadService', () => {
  it('lets a child read only the session subject summary', async () => {
    const { service, repository } = setup(childSession);

    await expect(service.getMe({ sessionToken: 'token' })).resolves.toEqual({ points: summary });
    expect(repository.findActiveChildSummary).toHaveBeenCalledWith(
      childSession.familyId,
      childSession.subjectId,
    );
    await expect(
      service.getChild({ sessionToken: 'token', childId: 'another-child' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets a parent read an active child only through the session family', async () => {
    const parentSession: AuthSession = { ...childSession, subjectId: 'parent-1', role: 'parent' };
    const { service, repository } = setup(parentSession);

    await expect(
      service.getChild({ sessionToken: 'token', childId: summary.userId }),
    ).resolves.toEqual({ points: summary });
    expect(repository.findActiveChildSummary).toHaveBeenCalledWith(
      parentSession.familyId,
      summary.userId,
    );
    await expect(service.getMe({ sessionToken: 'token' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns limit items and a cursor from the final visible log', async () => {
    const logs = [entry(3), entry(2), entry(1)];
    const { service, repository } = setup(childSession, summary, logs);

    const result = await service.getMyLogs({ sessionToken: 'token', cursor: null, limit: 2 });

    expect(result.logs).toEqual(logs.slice(0, 2));
    expect(result.page.has_more).toBe(true);
    expect(decodeCursor(result.page.next_cursor ?? '')).toEqual({
      sortValue: logs[1]?.createdAt.toISOString(),
      id: logs[1]?.id,
    });
    expect(repository.findChildLogs).toHaveBeenCalledWith({
      familyId: childSession.familyId,
      childId: childSession.subjectId,
      cursor: null,
      limit: 2,
    });
  });

  it('validates a canonical ISO timestamp and UUID in the decoded cursor', async () => {
    const { service, repository } = setup(childSession);
    const id = '01989a58-c542-7abc-8def-0123456789ab';

    await service.getMyLogs({
      sessionToken: 'token',
      cursor: { sortValue: '2026-08-05T12:00:00.000Z', id },
      limit: 20,
    });
    expect(repository.findChildLogs).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { createdAt: new Date('2026-08-05T12:00:00.000Z'), id } }),
    );
    await expect(
      service.getMyLogs({
        sessionToken: 'token',
        cursor: { sortValue: '2026-08-05T12:00:00Z', id },
        limit: 20,
      }),
    ).rejects.toMatchObject({ name: 'InvalidPaginationError' });
    await expect(
      service.getMyLogs({
        sessionToken: 'token',
        cursor: { sortValue: '2026-08-05T12:00:00.000Z', id: 'not-a-uuid' },
        limit: 20,
      }),
    ).rejects.toMatchObject({ name: 'InvalidPaginationError' });
  });

  it('returns stable unauthorized and scoped not-found errors', async () => {
    await expect(setup(null).service.getMe({})).rejects.toBeInstanceOf(PointsReadAccessError);
    await expect(
      setup(childSession, null).service.getMe({ sessionToken: 'token' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
