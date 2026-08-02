import type { Prisma, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { InvalidTaskError } from './task-service.js';
import { PrismaTaskRepository } from './prisma-task-repository.js';

describe('PrismaTaskRepository family boundaries', () => {
  it('validates a task type when it is updated without assignments', async () => {
    const transaction = {
      task: {
        findFirst: vi.fn().mockResolvedValue({ taskTypeId: 'type-current' }),
        update: vi.fn(),
      },
      taskType: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: vi.fn(async (work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
        work(transaction),
      ),
    } as unknown as PrismaClient;

    await expect(
      new PrismaTaskRepository(prisma).update('family-1', 'task-1', {
        taskTypeId: 'type-from-another-family',
      }),
    ).rejects.toBeInstanceOf(InvalidTaskError);
    expect(transaction.task.update).not.toHaveBeenCalled();
    expect(transaction.taskType.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'type-from-another-family',
        familyId: 'family-1',
        isEnabled: true,
        deletedAt: null,
      },
      select: { id: true },
    });
  });

  it('queries active tasks with only the current child assignment', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { task: { findMany } } as unknown as PrismaClient;

    await new PrismaTaskRepository(prisma).listForChild('family-1', 'child-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        familyId: 'family-1',
        status: 'ACTIVE',
        deletedAt: null,
        assignments: {
          some: { familyId: 'family-1', childId: 'child-1', deletedAt: null },
        },
      },
      include: {
        assignments: {
          where: { familyId: 'family-1', childId: 'child-1', deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });
});
