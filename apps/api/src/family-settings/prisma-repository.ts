import type { Prisma, PrismaClient } from '@prisma/client';

import type { FamilySettingsRepository } from './types.js';

function asSettings(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class PrismaFamilySettingsRepository implements FamilySettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveSettings(familyId: string): Promise<Record<string, unknown> | null> {
    const family = await this.prisma.family.findFirst({
      where: { id: familyId, deletedAt: null },
      select: { settings: true },
    });
    return family ? asSettings(family.settings) : null;
  }

  async updateActiveSettings(
    familyId: string,
    settings: Record<string, unknown>,
  ): Promise<boolean> {
    const result = await this.prisma.family.updateMany({
      where: { id: familyId, deletedAt: null },
      data: { settings: settings as Prisma.InputJsonObject },
    });
    return result.count === 1;
  }
}
