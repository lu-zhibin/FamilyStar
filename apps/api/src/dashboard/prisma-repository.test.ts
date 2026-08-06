import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaDashboardRepository } from './prisma-repository.js';

describe('PrismaDashboardRepository progress isolation', () => {
  it('counts only due assignments and resolves solo and collaboration status', async () => {
    const taskAssignment = { findMany: vi.fn() };
    const checkIn = { findMany: vi.fn() };
    const collaborationRound = { findMany: vi.fn() };
    const prisma = { taskAssignment, checkIn, collaborationRound } as unknown as PrismaClient;
    const repository = new PrismaDashboardRepository(prisma);

    taskAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-solo',
        childId: 'child-1',
        customFrequency: null,
        task: { id: 'task-solo', collaborationMode: 'SOLO', frequency: { kind: 'daily' } },
      },
      {
        id: 'assignment-collab',
        childId: 'child-1',
        customFrequency: null,
        task: { id: 'task-collab', collaborationMode: 'COLLAB', frequency: { kind: 'daily' } },
      },
      {
        id: 'assignment-not-due',
        childId: 'child-1',
        customFrequency: null,
        task: {
          id: 'task-not-due',
          collaborationMode: 'SOLO',
          frequency: { kind: 'weekdays', weekdays: [5] },
        },
      },
    ]);
    checkIn.findMany.mockResolvedValue([
      { taskAssignmentId: 'assignment-solo', status: 'APPROVED' },
    ]);
    collaborationRound.findMany.mockResolvedValue([
      { taskId: 'task-collab', submissions: [{ childId: 'child-1', status: 'PENDING' }] },
    ]);

    await expect(
      repository.findDailyProgressEntries({ familyId: 'family-1', date: '2026-08-06' }),
    ).resolves.toEqual([
      { childId: 'child-1', status: 'APPROVED' },
      { childId: 'child-1', status: 'PENDING' },
    ]);
    expect(taskAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familyId: 'family-1',
          child: expect.objectContaining({ familyId: 'family-1' }),
          task: expect.objectContaining({ familyId: 'family-1' }),
        }),
      }),
    );
    expect(checkIn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familyId: 'family-1',
          taskAssignmentId: { in: ['assignment-solo'] },
        }),
      }),
    );
  });
});
