import type { PrismaClient } from '@prisma/client';

import type { ThemeRepository } from './types.js';

const subjectSelect = {
  id: true,
  currentLevel: true,
  selectedTheme: true,
} as const;

export class PrismaThemeRepository implements ThemeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveChild(familyId: string, childId: string) {
    const child = await this.prisma.user.findFirst({
      where: { id: childId, familyId, role: 'CHILD', deletedAt: null },
      select: subjectSelect,
    });
    return child
      ? {
          childId: child.id,
          currentLevel: child.currentLevel,
          selectedTheme: child.selectedTheme,
        }
      : null;
  }

  async saveSelection(input: Parameters<ThemeRepository['saveSelection']>[0]) {
    const result = await this.prisma.user.updateMany({
      where: {
        id: input.childId,
        familyId: input.familyId,
        role: 'CHILD',
        deletedAt: null,
        currentLevel: { gte: input.minimumLevel },
      },
      data: { selectedTheme: input.themeKey },
    });
    return result.count === 1;
  }
}
