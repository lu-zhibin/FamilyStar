import type { Prisma, PrismaClient } from '@prisma/client';

import { normalizeFamilySettings } from '../family-settings/service.js';
import type { LevelJson, LevelRepository } from './types.js';

function json(value: Prisma.JsonValue | null): LevelJson | null {
  return value as LevelJson | null;
}

export class PrismaLevelRepository implements LevelRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveChildLevel(familyId: string, childId: string) {
    const child = await this.prisma.user.findFirst({
      where: { id: childId, familyId, role: 'CHILD', deletedAt: null },
      select: {
        id: true,
        pointsEarnedTotal: true,
        currentLevel: true,
        family: {
          select: {
            settings: true,
            levelConfigs: { orderBy: { level: 'asc' } },
          },
        },
      },
    });
    if (!child) return null;
    const settings = normalizeFamilySettings(child.family.settings as Record<string, unknown>);
    return {
      userId: child.id,
      pointsEarnedTotal: child.pointsEarnedTotal,
      currentLevel: child.currentLevel,
      familyAutoApproveQuota: settings.autoApproveQuota,
      configurations: child.family.levelConfigs.map((configuration) => ({
        level: configuration.level,
        name: configuration.name,
        icon: configuration.icon,
        pointsRequired: configuration.pointsRequired,
        discount: configuration.discount.toNumber(),
        autoApproveQuota: configuration.autoApproveQuota,
        wishSlots: configuration.wishSlots,
        extraDimensions: json(configuration.extraDimensions),
      })),
    };
  }
}
