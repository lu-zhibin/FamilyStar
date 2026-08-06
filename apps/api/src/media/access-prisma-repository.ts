import type { PrismaClient } from '@prisma/client';

import type { MediaAccessRepository } from './access-types.js';

export class PrismaMediaAccessRepository implements MediaAccessRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findReadyAssets(familyId: string, mediaIds: readonly string[]) {
    return this.prisma.mediaAsset.findMany({
      where: {
        id: { in: [...mediaIds] },
        familyId,
        uploadStatus: 'READY',
        deletedAt: null,
      },
      select: { id: true, objectKey: true },
    });
  }
}
