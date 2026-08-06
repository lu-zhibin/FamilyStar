import type { DomainEvent } from '@familystar/shared';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { CHECK_IN_APPROVED_EVENT } from '../check-ins/events.js';

const payloadSchema = z
  .object({
    source_type: z.enum(['CHECK_IN', 'COLLABORATION_SUBMISSION']),
    source_id: z.string().uuid(),
    child_id: z.string().uuid(),
    task_id: z.string().uuid(),
    task_name: z.string().trim().min(1).max(120),
    content_text: z.string().max(10_000).nullable(),
    occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    points_earned: z.number().int().nonnegative(),
    media_ids: z.array(z.string().uuid()).max(10),
  })
  .strict()
  .refine((payload) => new Set(payload.media_ids).size === payload.media_ids.length);

type ApprovalPayload = z.infer<typeof payloadSchema>;

export class InvalidGrowthRecordEventError extends Error {
  constructor() {
    super('The approved check-in event is invalid.');
    this.name = 'InvalidGrowthRecordEventError';
  }
}

function mediaIds(media: readonly { mediaAssetId: string }[]): readonly string[] {
  return media.map(({ mediaAssetId }) => mediaAssetId);
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class GrowthRecordEventConsumer {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: DomainEvent): Promise<'created' | 'duplicate' | 'ignored'> {
    if (event.event_name !== CHECK_IN_APPROVED_EVENT) return 'ignored';
    const parsed = payloadSchema.safeParse(event.payload);
    if (!parsed.success || event.correlation_id !== parsed.data.source_id) {
      throw new InvalidGrowthRecordEventError();
    }
    const payload = parsed.data;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const key = {
          familyId_sourceType_sourceId: {
            familyId: event.family_id,
            sourceType: payload.source_type,
            sourceId: payload.source_id,
          },
        };
        if (await transaction.growthRecord.findUnique({ where: key, select: { id: true } })) {
          return 'duplicate';
        }
        await this.validateSource(transaction, event.family_id, payload);
        await transaction.growthRecord.create({
          data: {
            familyId: event.family_id,
            childId: payload.child_id,
            taskId: payload.task_id,
            type: 'CHECK_IN',
            title: payload.task_name,
            contentText: payload.content_text,
            occurredOn: new Date(`${payload.occurred_on}T00:00:00.000Z`),
            sourceType: payload.source_type,
            sourceId: payload.source_id,
            pointsEarned: payload.points_earned,
            media: {
              create: payload.media_ids.map((mediaAssetId, sortOrder) => ({
                familyId: event.family_id,
                mediaAssetId,
                sortOrder,
              })),
            },
          },
        });
        return 'created';
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.growthRecord.findUnique({
          where: {
            familyId_sourceType_sourceId: {
              familyId: event.family_id,
              sourceType: payload.source_type,
              sourceId: payload.source_id,
            },
          },
          select: { id: true },
        });
        if (duplicate) return 'duplicate';
      }
      throw error;
    }
  }

  private async validateSource(
    transaction: Prisma.TransactionClient,
    familyId: string,
    payload: ApprovalPayload,
  ): Promise<void> {
    const expectedDate = new Date(`${payload.occurred_on}T00:00:00.000Z`).getTime();
    if (payload.source_type === 'CHECK_IN') {
      const source = await transaction.checkIn.findFirst({
        where: {
          id: payload.source_id,
          familyId,
          childId: payload.child_id,
          taskId: payload.task_id,
          status: 'APPROVED',
        },
        select: {
          contentText: true,
          checkDate: true,
          pointsEarned: true,
          media: { orderBy: { sortOrder: 'asc' }, select: { mediaAssetId: true } },
        },
      });
      if (
        !source ||
        source.contentText !== payload.content_text ||
        source.checkDate.getTime() !== expectedDate ||
        source.pointsEarned !== payload.points_earned ||
        !sameValues(mediaIds(source.media), payload.media_ids)
      ) {
        throw new InvalidGrowthRecordEventError();
      }
      return;
    }

    const source = await transaction.collaborationSubmission.findFirst({
      where: {
        id: payload.source_id,
        familyId,
        childId: payload.child_id,
        status: 'APPROVED',
        round: { taskId: payload.task_id },
      },
      select: {
        contentText: true,
        media: { orderBy: { sortOrder: 'asc' }, select: { mediaAssetId: true } },
        round: {
          select: {
            endDate: true,
            participants: {
              where: { childId: payload.child_id, status: 'ACTIVE' },
              select: { pointsEarned: true },
            },
          },
        },
      },
    });
    if (
      !source ||
      source.contentText !== payload.content_text ||
      source.round.endDate.getTime() !== expectedDate ||
      source.round.participants[0]?.pointsEarned !== payload.points_earned ||
      !sameValues(mediaIds(source.media), payload.media_ids)
    ) {
      throw new InvalidGrowthRecordEventError();
    }
  }
}
