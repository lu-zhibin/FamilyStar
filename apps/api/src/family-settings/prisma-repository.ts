import type { Prisma, PrismaClient } from '@prisma/client';

import type { FamilyProfileRecord, FamilySettingsRepository } from './types.js';

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

  async findActiveProfile(familyId: string, now: Date): Promise<FamilyProfileRecord | null> {
    const family = await this.prisma.family.findFirst({
      where: { id: familyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        settings: true,
        createdById: true,
        users: {
          where: { role: 'PARENT', deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, nickname: true, email: true, createdAt: true },
        },
        invitations: {
          where: { status: 'PENDING' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, email: true, expiresAt: true, createdAt: true },
        },
      },
    });
    if (!family) return null;
    return {
      id: family.id,
      name: family.name,
      settings: asSettings(family.settings),
      createdById: family.createdById,
      parents: family.users.map((parent) => ({
        ...parent,
        isCreator: parent.id === family.createdById,
        joinedAt: parent.createdAt,
      })),
      invitations: family.invitations.map((invitation) => ({
        ...invitation,
        status: invitation.expiresAt <= now ? 'expired' : 'pending',
      })),
    };
  }

  async updateActiveProfile(
    familyId: string,
    profile: { name?: string; settings?: Record<string, unknown> },
  ): Promise<boolean> {
    const result = await this.prisma.family.updateMany({
      where: { id: familyId, deletedAt: null },
      data: {
        ...(profile.name === undefined ? {} : { name: profile.name }),
        ...(profile.settings === undefined
          ? {}
          : { settings: profile.settings as Prisma.InputJsonObject }),
      },
    });
    return result.count === 1;
  }
}
