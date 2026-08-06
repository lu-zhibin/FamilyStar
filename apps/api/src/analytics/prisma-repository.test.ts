import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaAnalyticsRepository } from './prisma-repository.js';

const familyId = '01989a58-c542-7abc-8def-0123456789ab';
const childId = '01989a58-c542-7abc-8def-0123456789ac';
const soloTaskId = '01989a58-c542-7abc-8def-0123456789ad';
const collaborationTaskId = '01989a58-c542-7abc-8def-0123456789ae';

function prisma() {
  return {
    family: { findFirst: vi.fn() },
    task: { count: vi.fn() },
    taskAssignment: { findMany: vi.fn() },
    checkIn: { findMany: vi.fn() },
    collaborationRound: { findMany: vi.fn() },
    pointsLog: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  };
}

describe('PrismaAnalyticsRepository', () => {
  it('counts solo dates and collaboration rounds once within the family', async () => {
    const client = prisma();
    client.taskAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        childId,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: null,
        customFrequency: null,
        task: {
          id: soloTaskId,
          name: 'Read',
          frequency: { kind: 'daily' },
          collaborationMode: 'SOLO',
        },
      },
      {
        id: 'assignment-2',
        childId,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: null,
        customFrequency: null,
        task: {
          id: collaborationTaskId,
          name: 'Clean',
          frequency: { kind: 'daily' },
          collaborationMode: 'COLLAB',
        },
      },
    ]);
    client.checkIn.findMany.mockResolvedValue([
      {
        id: 'check-in-1',
        taskId: soloTaskId,
        childId,
        checkDate: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);
    client.collaborationRound.findMany.mockResolvedValue([
      {
        id: 'round-1',
        taskId: collaborationTaskId,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-07T00:00:00.000Z'),
        task: { name: 'Clean' },
        submissions: [{ childId }],
      },
    ]);
    client.pointsLog.findMany.mockResolvedValue([
      {
        userId: childId,
        type: 'EARN',
        businessType: 'check_in',
        businessId: 'check-in-1',
        delta: 5,
        createdAt: new Date('2026-08-01T12:00:00.000Z'),
      },
    ]);
    client.user.findMany.mockResolvedValue([{ currentLevel: 2 }]);
    const repository = new PrismaAnalyticsRepository(client as unknown as PrismaClient);

    const result = await repository.aggregateAnalytics({
      familyId,
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      startAt: new Date('2026-08-01T00:00:00.000Z'),
      endAtExclusive: new Date('2026-08-02T00:00:00.000Z'),
      timeZone: 'UTC',
    });

    expect(result).toMatchObject({
      scheduledCount: 2,
      completedCount: 2,
      pointsEarned: 5,
      levelDistribution: [{ level: 2, childCount: 1 }],
    });
    expect(client.taskAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familyId }) }),
    );
    expect(client.checkIn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familyId }) }),
    );
    expect(client.collaborationRound.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familyId }) }),
    );
    expect(client.pointsLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familyId }) }),
    );
  });

  it('computes period balance and earned totals from isolated logs', async () => {
    const client = prisma();
    client.user.findMany.mockResolvedValue([
      {
        id: childId,
        nickname: 'Star',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        currentLevel: 2,
        pointsBalance: 10,
        pointsEarnedTotal: 30,
      },
    ]);
    client.pointsLog.findMany.mockResolvedValue([
      { userId: childId, type: 'EARN', delta: 10 },
      { userId: childId, type: 'REDEEM', delta: -4 },
      { userId: childId, type: 'MANUAL', delta: 2 },
      { userId: childId, type: 'MANUAL', delta: -1 },
    ]);
    const repository = new PrismaAnalyticsRepository(client as unknown as PrismaClient);
    const result = await repository.findRankingCandidates({
      familyId,
      startAt: new Date('2026-08-01T00:00:00.000Z'),
      endAtExclusive: new Date('2026-08-08T00:00:00.000Z'),
    });
    expect(result[0]).toMatchObject({ periodBalance: 7, periodEarned: 12 });
    expect(client.pointsLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familyId,
          user: { familyId, role: 'CHILD', deletedAt: null },
        }),
      }),
    );
  });
});
