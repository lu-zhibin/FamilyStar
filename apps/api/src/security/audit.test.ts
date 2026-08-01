import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaAuditWriter } from './audit.js';

describe('PrismaAuditWriter', () => {
  it('persists only the explicit audit allow-list', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const writer = new PrismaAuditWriter({ auditLog: { create } } as unknown as PrismaClient);
    const occurredAt = new Date('2026-07-31T12:00:00.000Z');

    await writer.write({
      familyId: '10000000-0000-4000-8000-000000000001',
      actorId: '20000000-0000-4000-8000-000000000001',
      action: 'post:/api/v1/family/tasks',
      entityType: 'family',
      requestId: 'request-1',
      outcome: 'SUCCESS',
      metadata: { method: 'POST', path: '/api/v1/family/tasks', status: 201 },
      occurredAt,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        familyId: '10000000-0000-4000-8000-000000000001',
        actorId: '20000000-0000-4000-8000-000000000001',
        action: 'post:/api/v1/family/tasks',
        entityType: 'family',
        requestId: 'request-1',
        outcome: 'SUCCESS',
        metadata: { method: 'POST', path: '/api/v1/family/tasks', status: 201 },
        occurredAt,
      },
    });
  });
});
