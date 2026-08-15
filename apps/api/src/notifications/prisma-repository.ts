import type { Prisma, PrismaClient } from '@prisma/client';

import type {
  NotificationEventRepository,
  NotificationRepository,
  StoredNotificationPreference,
} from './types.js';

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  content: true,
  targetType: true,
  targetId: true,
  targetUrl: true,
  readAt: true,
  createdAt: true,
} as const;

const preferenceSelect = {
  inAppEnabled: true,
  browserEnabled: true,
  typeSettings: true,
  quietHoursEnabled: true,
  quietHoursStart: true,
  quietHoursEnd: true,
} as const;

function preference(value: {
  inAppEnabled: boolean;
  browserEnabled: boolean;
  typeSettings: Prisma.JsonValue;
  quietHoursEnabled: boolean;
  quietHoursStart: Date | null;
  quietHoursEnd: Date | null;
}): StoredNotificationPreference {
  return value;
}

function typeEnabled(settings: Prisma.JsonValue, type: string): boolean {
  return (
    typeof settings !== 'object' ||
    settings === null ||
    Array.isArray(settings) ||
    (settings as Prisma.JsonObject)[type] !== false
  );
}

export class PrismaNotificationRepository
  implements NotificationRepository, NotificationEventRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: Parameters<NotificationRepository['list']>[0]) {
    return this.prisma.notification.findMany({
      where: {
        familyId: input.familyId,
        recipientId: input.recipientId,
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { lt: input.cursor.createdAt } },
                { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      select: notificationSelect,
    });
  }

  countUnread(familyId: string, recipientId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { familyId, recipientId, readAt: null },
    });
  }

  markRead(input: Parameters<NotificationRepository['markRead']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.notification.updateMany({
        where: {
          id: input.notificationId,
          familyId: input.familyId,
          recipientId: input.recipientId,
          readAt: null,
        },
        data: { readAt: input.readAt },
      });
      return transaction.notification.findFirst({
        where: {
          id: input.notificationId,
          familyId: input.familyId,
          recipientId: input.recipientId,
        },
        select: notificationSelect,
      });
    });
  }

  async markAllRead(input: Parameters<NotificationRepository['markAllRead']>[0]) {
    const result = await this.prisma.notification.updateMany({
      where: { familyId: input.familyId, recipientId: input.recipientId, readAt: null },
      data: { readAt: input.readAt },
    });
    return result.count;
  }

  async listActiveParentIds(familyId: string): Promise<readonly string[]> {
    return (
      await this.prisma.user.findMany({
        where: { familyId, role: 'PARENT', deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map(({ id }) => id);
  }

  async createFromEvent(input: Parameters<NotificationEventRepository['createFromEvent']>[0]) {
    if (input.recipientIds.length === 0) return 0;
    const recipients = await this.prisma.user.findMany({
      where: {
        id: { in: [...new Set(input.recipientIds)] },
        familyId: input.familyId,
        deletedAt: null,
      },
      select: {
        id: true,
        notificationPreference: { select: { inAppEnabled: true, typeSettings: true } },
      },
      orderBy: { id: 'asc' },
    });
    const enabledRecipients = recipients.filter(
      ({ notificationPreference: preferenceValue }) =>
        !preferenceValue ||
        (preferenceValue.inAppEnabled && typeEnabled(preferenceValue.typeSettings, input.type)),
    );
    if (enabledRecipients.length === 0) return 0;
    const created = await this.prisma.notification.createMany({
      data: enabledRecipients.map(({ id: recipientId }) => ({
        familyId: input.familyId,
        recipientId,
        type: input.type,
        title: input.title,
        content: input.content,
        targetType: input.targetType,
        targetId: input.targetId,
        targetUrl: input.targetUrl,
        sourceEventId: input.sourceEventId,
        sourceEventName: input.sourceEventName,
        createdAt: input.createdAt,
      })),
      skipDuplicates: true,
    });
    return created.count;
  }

  async findPreference(familyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, familyId, deletedAt: null },
      select: { id: true },
    });
    if (!user) return undefined;
    const found = await this.prisma.notificationPreference.findFirst({
      where: { familyId, userId },
      select: preferenceSelect,
    });
    return found ? preference(found) : null;
  }

  savePreference(input: Parameters<NotificationRepository['savePreference']>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { id: input.userId, familyId: input.familyId, deletedAt: null },
        select: { id: true },
      });
      if (!user) return null;
      const data = {
        familyId: input.familyId,
        inAppEnabled: input.preference.inAppEnabled,
        browserEnabled: input.preference.browserEnabled,
        typeSettings: input.preference.typeSettings as Prisma.InputJsonObject,
        quietHoursEnabled: input.preference.quietHoursEnabled,
        quietHoursStart: input.preference.quietHoursStart,
        quietHoursEnd: input.preference.quietHoursEnd,
      };
      const saved = await transaction.notificationPreference.upsert({
        where: { userId: input.userId },
        create: { ...data, userId: input.userId },
        update: data,
        select: preferenceSelect,
      });
      return preference(saved);
    });
  }
}
