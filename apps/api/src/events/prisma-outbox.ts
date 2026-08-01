import { createDomainEvent } from '@familystar/shared';
import type { DomainEvent, EventName, EventPayload } from '@familystar/shared';
import { Prisma, PrismaClient } from '@prisma/client';

import type {
  ClaimOutboxOptions,
  ClaimedOutboxEvent,
  OutboxRepository,
  OutboxWriter,
  TransactionRunner,
} from './outbox.js';

type ClaimedRow = {
  id: string;
  familyId: string;
  actorId: string | null;
  eventName: string;
  correlationId: string;
  payload: Prisma.JsonValue;
  occurredAt: Date;
  attempts: number;
};

export class OutboxLeaseLostError extends Error {
  constructor(readonly eventId: string) {
    super(`Outbox lease was lost for event ${eventId}.`);
    this.name = 'OutboxLeaseLostError';
  }
}

export class PrismaTransactionRunner implements TransactionRunner<Prisma.TransactionClient> {
  constructor(private readonly prisma: PrismaClient) {}

  run<Result>(work: (transaction: Prisma.TransactionClient) => Promise<Result>): Promise<Result> {
    return this.prisma.$transaction((transaction) => work(transaction));
  }
}

export class PrismaOutboxWriter implements OutboxWriter<Prisma.TransactionClient> {
  async append(transaction: Prisma.TransactionClient, event: DomainEvent): Promise<void> {
    await transaction.outboxEvent.create({
      data: {
        id: event.event_id,
        familyId: event.family_id,
        actorId: event.actor_id,
        eventName: event.event_name,
        correlationId: event.correlation_id,
        payload: event.payload as Prisma.InputJsonObject,
        occurredAt: new Date(event.occurred_at),
        availableAt: new Date(event.occurred_at),
      },
    });
  }
}

export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly prisma: PrismaClient) {}

  claimBatch(options: ClaimOutboxOptions): Promise<readonly ClaimedOutboxEvent[]> {
    const leaseExpiredBefore = new Date(options.now.getTime() - options.leaseMilliseconds);

    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<ClaimedRow[]>(Prisma.sql`
        WITH candidates AS (
          SELECT "id"
          FROM "outbox_events"
          WHERE "published_at" IS NULL
            AND "available_at" <= ${options.now}
            AND ("locked_at" IS NULL OR "locked_at" <= ${leaseExpiredBefore})
          ORDER BY "available_at", "created_at"
          FOR UPDATE SKIP LOCKED
          LIMIT ${options.batchSize}
        )
        UPDATE "outbox_events" AS event
        SET "locked_at" = ${options.now},
            "lock_owner" = ${options.workerId},
            "attempts" = event."attempts" + 1,
            "updated_at" = ${options.now}
        FROM candidates
        WHERE event."id" = candidates."id"
        RETURNING event."id",
                  event."family_id" AS "familyId",
                  event."actor_id" AS "actorId",
                  event."event_name" AS "eventName",
                  event."correlation_id" AS "correlationId",
                  event."payload",
                  event."occurred_at" AS "occurredAt",
                  event."attempts"
      `);

      return rows.map((row) =>
        Object.freeze({
          event: createDomainEvent({
            event_id: row.id,
            event_name: row.eventName as EventName,
            occurred_at: row.occurredAt.toISOString(),
            family_id: row.familyId,
            actor_id: row.actorId,
            correlation_id: row.correlationId,
            payload: row.payload as EventPayload,
          }),
          attempts: row.attempts,
        }),
      );
    });
  }

  async markPublished(eventId: string, workerId: string, publishedAt: Date): Promise<void> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, lockOwner: workerId, publishedAt: null },
      data: {
        publishedAt,
        lockedAt: null,
        lockOwner: null,
        lastError: null,
      },
    });
    this.requireLease(result.count, eventId);
  }

  async reschedule(
    eventId: string,
    workerId: string,
    availableAt: Date,
    errorCode: string,
  ): Promise<void> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, lockOwner: workerId, publishedAt: null },
      data: {
        availableAt,
        lockedAt: null,
        lockOwner: null,
        lastError: errorCode.slice(0, 80),
      },
    });
    this.requireLease(result.count, eventId);
  }

  private requireLease(updatedRows: number, eventId: string): void {
    if (updatedRows !== 1) {
      throw new OutboxLeaseLostError(eventId);
    }
  }
}
