import type { DomainEvent } from '@familystar/shared';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { GrowthRecordEventConsumer, InvalidGrowthRecordEventError } from './event-consumer.js';

const event: DomainEvent = {
  event_id: '10000000-0000-4000-8000-000000000001',
  event_name: 'check-in.entry.approved.v1',
  occurred_at: '2026-08-06T08:00:00.000Z',
  family_id: '20000000-0000-4000-8000-000000000001',
  actor_id: '30000000-0000-4000-8000-000000000001',
  correlation_id: '40000000-0000-4000-8000-000000000001',
  payload: {
    source_type: 'CHECK_IN',
    source_id: '40000000-0000-4000-8000-000000000001',
    child_id: '50000000-0000-4000-8000-000000000001',
    task_id: '60000000-0000-4000-8000-000000000001',
    task_name: '每日阅读',
    content_text: '完成第三章',
    occurred_on: '2026-08-06',
    points_earned: 15,
    media_ids: ['70000000-0000-4000-8000-000000000001'],
  },
};

function fixture(options: { existing?: boolean; createError?: unknown } = {}) {
  const findUnique = vi
    .fn()
    .mockResolvedValueOnce(options.existing ? { id: 'record-existing' } : null)
    .mockResolvedValue({ id: 'record-existing' });
  const transaction = {
    growthRecord: {
      findUnique,
      create: options.createError
        ? vi.fn().mockRejectedValue(options.createError)
        : vi.fn().mockResolvedValue({ id: 'record-created' }),
    },
    checkIn: {
      findFirst: vi.fn().mockResolvedValue({
        contentText: '完成第三章',
        checkDate: new Date('2026-08-06T00:00:00.000Z'),
        pointsEarned: 15,
        media: [{ mediaAssetId: '70000000-0000-4000-8000-000000000001' }],
      }),
    },
    collaborationSubmission: { findFirst: vi.fn() },
  };
  const outerFindUnique = vi.fn().mockResolvedValue({ id: 'record-existing' });
  const prisma = {
    $transaction: vi.fn(async (work) => work(transaction)),
    growthRecord: { findUnique: outerFindUnique },
  } as unknown as PrismaClient;
  return { consumer: new GrowthRecordEventConsumer(prisma), outerFindUnique, prisma, transaction };
}

describe('GrowthRecordEventConsumer', () => {
  it('projects an approved check-in snapshot with ordered media', async () => {
    const { consumer, transaction } = fixture();

    await expect(consumer.handle(event)).resolves.toBe('created');

    expect(transaction.growthRecord.create).toHaveBeenCalledWith({
      data: {
        familyId: event.family_id,
        childId: event.payload.child_id,
        taskId: event.payload.task_id,
        type: 'CHECK_IN',
        title: '每日阅读',
        contentText: '完成第三章',
        occurredOn: new Date('2026-08-06T00:00:00.000Z'),
        sourceType: 'CHECK_IN',
        sourceId: event.payload.source_id,
        pointsEarned: 15,
        media: {
          create: [
            {
              familyId: event.family_id,
              mediaAssetId: '70000000-0000-4000-8000-000000000001',
              sortOrder: 0,
            },
          ],
        },
      },
    });
  });

  it('returns the existing projection for a repeated source', async () => {
    const { consumer, transaction } = fixture({ existing: true });

    await expect(consumer.handle(event)).resolves.toBe('duplicate');
    expect(transaction.checkIn.findFirst).not.toHaveBeenCalled();
    expect(transaction.growthRecord.create).not.toHaveBeenCalled();
  });

  it('projects each approved collaboration submission from its immutable payload snapshot', async () => {
    const { consumer, transaction } = fixture();
    transaction.collaborationSubmission.findFirst.mockResolvedValue({
      contentText: '共同完成整理',
      media: [],
      round: {
        endDate: new Date('2026-08-06T00:00:00.000Z'),
        participants: [{ pointsEarned: 20 }],
      },
    });
    const collaborationEvent: DomainEvent = {
      ...event,
      correlation_id: '40000000-0000-4000-8000-000000000002',
      payload: {
        source_type: 'COLLABORATION_SUBMISSION',
        source_id: '40000000-0000-4000-8000-000000000002',
        child_id: '50000000-0000-4000-8000-000000000001',
        task_id: '60000000-0000-4000-8000-000000000001',
        task_name: '审批时的协作任务名称',
        content_text: '共同完成整理',
        occurred_on: '2026-08-06',
        points_earned: 20,
        media_ids: [],
      },
    };

    await expect(consumer.handle(collaborationEvent)).resolves.toBe('created');
    expect(transaction.growthRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'COLLABORATION_SUBMISSION',
          sourceId: '40000000-0000-4000-8000-000000000002',
          title: '审批时的协作任务名称',
          pointsEarned: 20,
        }),
      }),
    );
  });

  it('recovers a concurrent source-key conflict after transaction rollback', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.19.2',
    });
    const { consumer, outerFindUnique } = fixture({ createError: conflict });

    await expect(consumer.handle(event)).resolves.toBe('duplicate');
    expect(outerFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          familyId_sourceType_sourceId: {
            familyId: event.family_id,
            sourceType: 'CHECK_IN',
            sourceId: '40000000-0000-4000-8000-000000000001',
          },
        },
      }),
    );
  });

  it('rejects an event that disagrees with its family-scoped source', async () => {
    const { consumer, transaction } = fixture();
    transaction.checkIn.findFirst.mockResolvedValue(null);

    await expect(consumer.handle(event)).rejects.toBeInstanceOf(InvalidGrowthRecordEventError);
    expect(transaction.growthRecord.create).not.toHaveBeenCalled();
  });

  it('ignores unrelated events before parsing their payload', async () => {
    const { consumer, prisma } = fixture();

    await expect(
      consumer.handle({ ...event, event_name: 'points.balance.changed.v1', payload: {} }),
    ).resolves.toBe('ignored');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
