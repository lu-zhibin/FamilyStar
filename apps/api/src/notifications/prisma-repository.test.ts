import type { NotificationType, PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaNotificationRepository } from './prisma-repository.js';

const familyId = '01989a58-c542-7abc-8def-0123456789ac';
const recipientId = '01989a58-c542-7abc-8def-0123456789ab';

describe('PrismaNotificationRepository', () => {
  it('queries limit plus one notifications after a descending compound cursor', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaNotificationRepository({
      notification: { findMany },
    } as unknown as PrismaClient);
    const cursor = {
      createdAt: new Date('2026-08-07T10:00:00.000Z'),
      id: '01989a58-c542-7abc-8def-0123456789ad',
    };

    await repository.list({ familyId, recipientId, cursor, limit: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          familyId,
          recipientId,
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });

  it('counts unread notifications inside both family and recipient boundaries', async () => {
    const count = vi.fn().mockResolvedValue(3);
    const repository = new PrismaNotificationRepository({
      notification: { count },
    } as unknown as PrismaClient);

    await expect(repository.countUnread(familyId, recipientId)).resolves.toBe(3);
    expect(count).toHaveBeenCalledWith({ where: { familyId, recipientId, readAt: null } });
  });

  it('marks one notification idempotently and then reads only the scoped record', async () => {
    const record = { id: 'notification-1', readAt: new Date('2026-08-07T12:00:00.000Z') };
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findFirst = vi.fn().mockResolvedValue(record);
    const transaction = { notification: { updateMany, findFirst } };
    const repository = new PrismaNotificationRepository({
      $transaction: vi.fn(async (work) => work(transaction)),
    } as unknown as PrismaClient);
    const readAt = new Date('2026-08-07T12:00:00.000Z');

    await expect(
      repository.markRead({ familyId, recipientId, notificationId: 'notification-1', readAt }),
    ).resolves.toBe(record);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'notification-1', familyId, recipientId, readAt: null },
      data: { readAt },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'notification-1', familyId, recipientId } }),
    );
  });

  it('marks every unread notification idempotently within the same scope', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const repository = new PrismaNotificationRepository({
      notification: { updateMany },
    } as unknown as PrismaClient);
    const readAt = new Date('2026-08-07T12:00:00.000Z');

    await expect(repository.markAllRead({ familyId, recipientId, readAt })).resolves.toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { familyId, recipientId, readAt: null },
      data: { readAt },
    });
  });

  it('property: repeated single and all-read writes preserve the first timestamp and then update zero rows', async () => {
    const rows = [
      { id: 'one', familyId, recipientId, readAt: null as Date | null },
      { id: 'two', familyId, recipientId, readAt: null as Date | null },
      { id: 'other-family', familyId: 'family-other', recipientId, readAt: null as Date | null },
    ];
    const notification = {
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0;
        for (const row of rows) {
          if (
            (where.id === undefined || row.id === where.id) &&
            row.familyId === where.familyId &&
            row.recipientId === where.recipientId &&
            row.readAt === null
          ) {
            row.readAt = data.readAt;
            count += 1;
          }
        }
        return { count };
      }),
      findFirst: vi.fn(async ({ where }) =>
        rows.find(
          (row) =>
            row.id === where.id &&
            row.familyId === where.familyId &&
            row.recipientId === where.recipientId,
        ),
      ),
    };
    const repository = new PrismaNotificationRepository({
      notification,
      $transaction: vi.fn(async (work) => work({ notification })),
    } as unknown as PrismaClient);
    const firstReadAt = new Date('2026-08-07T12:00:00.000Z');
    const replayReadAt = new Date('2026-08-07T13:00:00.000Z');

    await repository.markRead({
      familyId,
      recipientId,
      notificationId: 'one',
      readAt: firstReadAt,
    });
    await repository.markRead({
      familyId,
      recipientId,
      notificationId: 'one',
      readAt: replayReadAt,
    });
    await expect(
      repository.markAllRead({ familyId, recipientId, readAt: firstReadAt }),
    ).resolves.toBe(1);
    await expect(
      repository.markAllRead({ familyId, recipientId, readAt: replayReadAt }),
    ).resolves.toBe(0);

    expect(rows).toEqual([
      expect.objectContaining({ id: 'one', readAt: firstReadAt }),
      expect.objectContaining({ id: 'two', readAt: firstReadAt }),
      expect.objectContaining({ id: 'other-family', readAt: null }),
    ]);
  });

  it('distinguishes an inactive recipient from a missing preference', async () => {
    const userFindFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: recipientId });
    const preferenceFindFirst = vi.fn().mockResolvedValue(null);
    const repository = new PrismaNotificationRepository({
      user: { findFirst: userFindFirst },
      notificationPreference: { findFirst: preferenceFindFirst },
    } as unknown as PrismaClient);

    await expect(repository.findPreference(familyId, recipientId)).resolves.toBeUndefined();
    await expect(repository.findPreference(familyId, recipientId)).resolves.toBeNull();
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: recipientId, familyId, deletedAt: null },
      select: { id: true },
    });
    expect(preferenceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId, userId: recipientId } }),
    );
  });

  it('upserts a preference only after verifying active family membership', async () => {
    const userFindFirst = vi.fn().mockResolvedValue({ id: recipientId });
    const saved = {
      inAppEnabled: false,
      browserEnabled: true,
      typeSettings: { REVIEW: false },
      quietHoursEnabled: false,
      quietHoursStart: null,
      quietHoursEnd: null,
    };
    const upsert = vi.fn().mockResolvedValue(saved);
    const transaction = {
      user: { findFirst: userFindFirst },
      notificationPreference: { upsert },
    };
    const repository = new PrismaNotificationRepository({
      $transaction: vi.fn(async (work) => work(transaction)),
    } as unknown as PrismaClient);

    await expect(
      repository.savePreference({ familyId, userId: recipientId, preference: saved }),
    ).resolves.toEqual(saved);
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { id: recipientId, familyId, deletedAt: null },
      select: { id: true },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: recipientId },
        create: expect.objectContaining({ familyId, userId: recipientId }),
        update: expect.objectContaining({ familyId, inAppEnabled: false }),
      }),
    );
  });

  it('writes only active recipients with enabled in-app and type preferences', async () => {
    const userFindMany = vi.fn().mockResolvedValue([
      { id: 'enabled', notificationPreference: null },
      {
        id: 'in-app-disabled',
        notificationPreference: { inAppEnabled: false, typeSettings: {} },
      },
      {
        id: 'type-disabled',
        notificationPreference: { inAppEnabled: true, typeSettings: { BADGE: false } },
      },
    ]);
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaNotificationRepository({
      user: { findMany: userFindMany },
      notification: { createMany },
    } as unknown as PrismaClient);

    await expect(
      repository.createFromEvent({
        familyId,
        recipientIds: ['enabled', 'in-app-disabled', 'type-disabled', 'cross-family'],
        type: 'BADGE',
        title: 'Badge awarded',
        content: 'A badge was awarded.',
        targetType: 'BADGE_AWARD',
        targetId: null,
        targetUrl: '/badges',
        sourceEventId: '01989a58-c542-7abc-8def-0123456789ad',
        sourceEventName: 'badges.award.created.v1',
        createdAt: new Date('2026-08-07T12:00:00.000Z'),
      }),
    ).resolves.toBe(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ recipientId: 'enabled', familyId, type: 'BADGE' })],
      skipDuplicates: true,
    });
  });

  it('property: the master switch and every one of seven type switches suppress event writes', async () => {
    const types: readonly NotificationType[] = [
      'REVIEW',
      'POINTS',
      'LEVEL',
      'REDEMPTION',
      'WISH',
      'BADGE',
      'INVITATION',
    ];
    for (const type of types) {
      for (const notificationPreference of [
        { inAppEnabled: false, typeSettings: {} },
        { inAppEnabled: true, typeSettings: { [type]: false } },
      ]) {
        const createMany = vi.fn();
        const repository = new PrismaNotificationRepository({
          user: {
            findMany: vi.fn().mockResolvedValue([{ id: recipientId, notificationPreference }]),
          },
          notification: { createMany },
        } as unknown as PrismaClient);
        await expect(
          repository.createFromEvent({
            familyId,
            recipientIds: [recipientId],
            type,
            title: 'Notification',
            content: 'Content',
            targetType: 'TARGET',
            targetId: null,
            targetUrl: '/notifications',
            sourceEventId: '01989a58-c542-7abc-8def-0123456789ad',
            sourceEventName: 'event.v1',
            createdAt: new Date('2026-08-07T12:00:00.000Z'),
          }),
        ).resolves.toBe(0);
        expect(createMany).not.toHaveBeenCalled();
      }
    }
  });

  it('property: event replay creates one row per active same-family recipient', async () => {
    const activeRecipients = new Set(['recipient-a', 'recipient-b']);
    const stored = new Set<string>();
    const repository = new PrismaNotificationRepository({
      user: {
        findMany: vi.fn(async ({ where }: { where: { id: { in: readonly string[] } } }) =>
          [...new Set(where.id.in)]
            .filter((id) => activeRecipients.has(id))
            .map((id) => ({ id, notificationPreference: null })),
        ),
      },
      notification: {
        createMany: vi.fn(async ({ data }) => {
          let count = 0;
          for (const row of data) {
            const key = `${row.sourceEventId}:${row.recipientId}`;
            if (stored.has(key)) continue;
            stored.add(key);
            count += 1;
          }
          return { count };
        }),
      },
    } as unknown as PrismaClient);
    const write = {
      familyId,
      recipientIds: ['recipient-a', 'recipient-b', 'cross-family'],
      type: 'BADGE' as const,
      title: 'Badge awarded',
      content: 'A badge was awarded.',
      targetType: 'BADGE_AWARD',
      targetId: null,
      targetUrl: '/badges',
      sourceEventId: '01989a58-c542-7abc-8def-0123456789ad',
      sourceEventName: 'badges.award.created.v1',
      createdAt: new Date('2026-08-07T12:00:00.000Z'),
    };

    const results = await Promise.all(
      Array.from({ length: 16 }, () => repository.createFromEvent(write)),
    );

    expect(results.reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(stored).toEqual(
      new Set([`${write.sourceEventId}:recipient-a`, `${write.sourceEventId}:recipient-b`]),
    );
  });

  it('lists active family parents in stable order', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'parent-1' }, { id: 'parent-2' }]);
    const repository = new PrismaNotificationRepository({
      user: { findMany },
    } as unknown as PrismaClient);

    await expect(repository.listActiveParentIds(familyId)).resolves.toEqual([
      'parent-1',
      'parent-2',
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { familyId, role: 'PARENT', deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
  });
});
