import type { PrismaClient } from '@prisma/client';

import type { PointsReadRepository } from './types.js';

export class PrismaPointsReadRepository implements PointsReadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveChildSummary(familyId: string, childId: string) {
    const child = await this.prisma.user.findFirst({
      where: { id: childId, familyId, role: 'CHILD', deletedAt: null },
      select: { id: true, pointsBalance: true, pointsEarnedTotal: true },
    });
    if (!child) return null;
    return {
      userId: child.id,
      pointsBalance: child.pointsBalance,
      pointsEarnedTotal: child.pointsEarnedTotal,
    };
  }

  async findChildLogs(input: {
    familyId: string;
    childId: string;
    cursor: Readonly<{ createdAt: Date; id: string }> | null;
    limit: number;
  }) {
    return this.prisma.pointsLog.findMany({
      where: {
        familyId: input.familyId,
        userId: input.childId,
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { lt: input.cursor.createdAt } },
                { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      select: {
        id: true,
        type: true,
        businessType: true,
        businessId: true,
        delta: true,
        balanceBefore: true,
        balanceAfter: true,
        earnedTotalAfter: true,
        remark: true,
        createdAt: true,
      },
    });
  }
}
