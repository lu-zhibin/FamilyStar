import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaPointsReadRepository } from './prisma-repository.js';

describe('PrismaPointsReadRepository', () => {
  it('reads an active child summary through the session family scope', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 'child-1',
      pointsBalance: 75,
      pointsEarnedTotal: 120,
    });
    const repository = new PrismaPointsReadRepository({
      user: { findFirst },
    } as unknown as PrismaClient);

    await expect(repository.findActiveChildSummary('family-1', 'child-1')).resolves.toEqual({
      userId: 'child-1',
      pointsBalance: 75,
      pointsEarnedTotal: 120,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'child-1', familyId: 'family-1', role: 'CHILD', deletedAt: null },
      select: { id: true, pointsBalance: true, pointsEarnedTotal: true },
    });
  });

  it('returns null for a soft-deleted or cross-family child', async () => {
    const repository = new PrismaPointsReadRepository({
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient);

    await expect(repository.findActiveChildSummary('family-1', 'child-2')).resolves.toBeNull();
  });

  it('queries limit plus one logs after a stable descending compound cursor', async () => {
    const createdAt = new Date('2026-08-05T12:00:00.000Z');
    const findMany = vi.fn().mockResolvedValue([
      {
        id: '01989a58-c542-7abc-8def-0123456789ab',
        type: 'EARN',
        businessType: 'check_in',
        businessId: '01989a58-c542-7abc-8def-0123456789ac',
        delta: 10,
        balanceBefore: 5,
        balanceAfter: 15,
        earnedTotalAfter: 20,
        remark: 'Great work',
        createdAt,
      },
    ]);
    const repository = new PrismaPointsReadRepository({
      pointsLog: { findMany },
    } as unknown as PrismaClient);
    const cursor = {
      createdAt,
      id: '01989a58-c542-7abc-8def-0123456789aa',
    };

    await expect(
      repository.findChildLogs({
        familyId: 'family-1',
        childId: 'child-1',
        cursor,
        limit: 20,
      }),
    ).resolves.toMatchObject([{ remark: 'Great work' }]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          familyId: 'family-1',
          userId: 'child-1',
          OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });

  it('returns an empty family-scoped page without weakening the query boundary', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaPointsReadRepository({
      pointsLog: { findMany },
    } as unknown as PrismaClient);

    await expect(
      repository.findChildLogs({
        familyId: 'family-1',
        childId: 'child-1',
        cursor: null,
        limit: 20,
      }),
    ).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId: 'family-1', userId: 'child-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });
});
