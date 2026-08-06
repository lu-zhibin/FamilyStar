import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaMediaAccessRepository } from './access-prisma-repository.js';

describe('PrismaMediaAccessRepository', () => {
  it('restricts the whole candidate set to same-family READY undeleted assets', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new PrismaMediaAccessRepository({
      mediaAsset: { findMany },
    } as unknown as PrismaClient);
    const ids = ['11111111-1111-4111-8111-111111111111'];
    await repository.findReadyAssets('family-1', ids);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ids },
        familyId: 'family-1',
        uploadStatus: 'READY',
        deletedAt: null,
      },
      select: { id: true, objectKey: true },
    });
  });
});
