import type { Prisma, PrismaClient } from '@prisma/client';

export type AuditEntry = Readonly<{
  familyId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  businessKey?: string;
  requestId: string;
  outcome: 'SUCCESS' | 'FAILURE';
  metadata: Readonly<{ method: string; path: string; status: number }>;
  occurredAt: Date;
}>;

export type AuditWriter = {
  write(entry: AuditEntry): Promise<void>;
};

export class PrismaAuditWriter implements AuditWriter {
  constructor(private readonly prisma: PrismaClient) {}

  async write(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        familyId: entry.familyId,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        ...(entry.entityId === undefined ? {} : { entityId: entry.entityId }),
        ...(entry.businessKey === undefined ? {} : { businessKey: entry.businessKey }),
        requestId: entry.requestId,
        outcome: entry.outcome,
        metadata: entry.metadata as Prisma.InputJsonObject,
        occurredAt: entry.occurredAt,
      },
    });
  }
}
