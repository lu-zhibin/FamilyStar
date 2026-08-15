import type { BadgeAward, BadgeProgress, BadgeTemplate, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

import {
  calculateStreakDays,
  conditionProgress,
  normalizeBadgeCondition,
  type BadgeMetrics,
} from './logic.js';
import { BadgeAccessError, BadgeConflictError } from './service.js';
import type {
  BadgeAwardRecord,
  BadgeCondition,
  BadgeProgressRecord,
  BadgeRepository,
  BadgeTemplateInput,
  BadgeTemplatePatch,
  BadgeTemplateRecord,
  BadgeWallItem,
} from './types.js';

function conditionJson(condition: BadgeCondition): Prisma.InputJsonObject {
  return condition.type === 'MANUAL'
    ? { type: condition.type }
    : { type: condition.type, target: condition.target };
}

function parseCondition(value: unknown): BadgeCondition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored badge condition is invalid.');
  }
  const condition = value as { type?: unknown; target?: unknown };
  return normalizeBadgeCondition(
    condition.type === 'MANUAL'
      ? { type: 'MANUAL' }
      : {
          type: condition.type as Exclude<BadgeCondition['type'], 'MANUAL'>,
          target: condition.target as number,
        },
  );
}

function templateRecord(value: BadgeTemplate): BadgeTemplateRecord {
  return {
    id: value.id,
    familyId: value.familyId,
    presetCode: value.presetCode,
    name: value.name,
    description: value.description,
    icon: value.icon,
    category: value.category,
    condition: parseCondition(value.condition),
    awardLevel: value.awardLevel,
    isVisible: value.isVisible,
    isEnabled: value.isEnabled,
    version: value.version,
    createdById: value.createdById,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function awardRecord(value: BadgeAward): BadgeAwardRecord {
  return {
    id: value.id,
    familyId: value.familyId,
    templateId: value.templateId,
    childId: value.childId,
    level: value.level,
    templateNameSnapshot: value.templateNameSnapshot,
    templateDescriptionSnapshot: value.templateDescriptionSnapshot,
    templateIconSnapshot: value.templateIconSnapshot,
    templateCategorySnapshot: value.templateCategorySnapshot,
    templateConditionSnapshot: parseCondition(value.templateConditionSnapshot),
    templateVersion: value.templateVersion,
    reason: value.reason,
    sourceEventId: value.sourceEventId,
    awardedById: value.awardedById,
    awardedAt: value.awardedAt,
  };
}

function progressRecord(value: BadgeProgress): BadgeProgressRecord {
  return {
    templateId: value.templateId,
    childId: value.childId,
    level: value.level,
    currentValue: value.currentValue,
    targetValue: value.targetValue,
    evaluatedAt: value.evaluatedAt,
  };
}

function conditionEquals(left: BadgeCondition, right: BadgeCondition): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class PrismaBadgeRepository implements BadgeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listTemplates(familyId: string): Promise<readonly BadgeTemplateRecord[]> {
    const templates = await this.prisma.badgeTemplate.findMany({
      where: { familyId, deletedAt: null },
      orderBy: [{ presetCode: 'asc' }, { createdAt: 'asc' }],
    });
    return templates.map(templateRecord);
  }

  async findRecentAwards(familyId: string, limit: number) {
    const awards = await this.prisma.badgeAward.findMany({
      where: { familyId },
      orderBy: [{ awardedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        templateId: true,
        templateNameSnapshot: true,
        awardedAt: true,
        child: { select: { id: true, nickname: true } },
        awardedBy: { select: { id: true, nickname: true, role: true } },
      },
    });
    return awards.map((award) => ({
      id: award.id,
      child: award.child,
      badgeId: award.templateId,
      badgeName: award.templateNameSnapshot,
      awardedAt: award.awardedAt,
      awardedBy: award.awardedBy,
    }));
  }

  async createTemplate(
    familyId: string,
    parentId: string,
    input: BadgeTemplateInput,
  ): Promise<BadgeTemplateRecord> {
    await this.requireActiveUser(familyId, parentId, 'PARENT');
    return templateRecord(
      await this.prisma.badgeTemplate.create({
        data: {
          familyId,
          name: input.name,
          description: input.description ?? null,
          icon: input.icon,
          category: input.category,
          conditionType: input.condition.type,
          condition: conditionJson(input.condition),
          awardLevel: input.awardLevel ?? 1,
          isVisible: input.isVisible ?? true,
          isEnabled: input.isEnabled ?? true,
          createdById: parentId,
        },
      }),
    );
  }

  updateTemplate(
    familyId: string,
    templateId: string,
    input: BadgeTemplatePatch,
  ): Promise<BadgeTemplateRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const template = await transaction.badgeTemplate.findFirst({
        where: { id: templateId, familyId, deletedAt: null },
      });
      if (!template) return null;

      const nextCondition = input.condition ?? parseCondition(template.condition);
      const nextAwardLevel = input.awardLevel ?? template.awardLevel;
      const changesAwardIdentity =
        !conditionEquals(parseCondition(template.condition), nextCondition) ||
        nextAwardLevel !== template.awardLevel;
      if (
        changesAwardIdentity &&
        (await transaction.badgeAward.count({ where: { familyId, templateId } })) > 0
      ) {
        throw new BadgeConflictError('An awarded badge condition or level cannot be changed.');
      }

      return templateRecord(
        await transaction.badgeTemplate.update({
          where: { id: template.id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(input.icon === undefined ? {} : { icon: input.icon }),
            ...(input.category === undefined ? {} : { category: input.category }),
            ...(input.condition === undefined
              ? {}
              : {
                  conditionType: input.condition.type,
                  condition: conditionJson(input.condition),
                }),
            ...(input.awardLevel === undefined ? {} : { awardLevel: input.awardLevel }),
            ...(input.isVisible === undefined ? {} : { isVisible: input.isVisible }),
            ...(input.isEnabled === undefined ? {} : { isEnabled: input.isEnabled }),
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  softDeleteTemplate(familyId: string, templateId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const template = await transaction.badgeTemplate.findFirst({
        where: { id: templateId, familyId, deletedAt: null },
        select: { id: true, presetCode: true },
      });
      if (!template) return false;
      if (template.presetCode) {
        throw new BadgeConflictError('A preset badge cannot be deleted.');
      }
      if ((await transaction.badgeAward.count({ where: { familyId, templateId } })) > 0) {
        throw new BadgeConflictError('An awarded badge template cannot be deleted.');
      }
      const updated = await transaction.badgeTemplate.updateMany({
        where: { id: templateId, familyId, deletedAt: null },
        data: { deletedAt: now, isEnabled: false, version: { increment: 1 } },
      });
      return updated.count === 1;
    });
  }

  awardManually(input: {
    familyId: string;
    parentId: string;
    childId: string;
    templateId: string;
    reason: string;
    now: Date;
  }): Promise<BadgeAwardRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const [parent, child, template] = await Promise.all([
        transaction.user.findFirst({
          where: { id: input.parentId, familyId: input.familyId, role: 'PARENT', deletedAt: null },
          select: { id: true },
        }),
        transaction.user.findFirst({
          where: { id: input.childId, familyId: input.familyId, role: 'CHILD', deletedAt: null },
          select: { id: true },
        }),
        transaction.badgeTemplate.findFirst({
          where: {
            id: input.templateId,
            familyId: input.familyId,
            conditionType: 'MANUAL',
            isEnabled: true,
            deletedAt: null,
          },
        }),
      ]);
      if (!parent) throw new BadgeAccessError('FORBIDDEN', 'The parent was not found.');
      if (!child) throw new BadgeAccessError('NOT_FOUND', 'The child was not found.');
      if (!template) {
        throw new BadgeAccessError('NOT_FOUND', 'The manual badge template was not found.');
      }

      await transaction.badgeAward.createMany({
        data: [
          this.awardData(template, input.childId, input.now, null, input.parentId, input.reason),
        ],
        skipDuplicates: true,
      });
      const award = await transaction.badgeAward.findUnique({
        where: {
          templateId_childId_level: {
            templateId: template.id,
            childId: input.childId,
            level: template.awardLevel,
          },
        },
      });
      if (!award || award.familyId !== input.familyId) {
        throw new Error('The manual badge award could not be recovered.');
      }
      await this.appendAwardEvent(transaction, award);
      return awardRecord(award);
    });
  }

  async getWall(familyId: string, childId: string): Promise<readonly BadgeWallItem[] | null> {
    const child = await this.prisma.user.findFirst({
      where: { id: childId, familyId, role: 'CHILD', deletedAt: null },
      select: { id: true },
    });
    if (!child) return null;
    const [templates, metrics] = await Promise.all([
      this.prisma.badgeTemplate.findMany({
        where: {
          familyId,
          OR: [
            { deletedAt: null, isEnabled: true, isVisible: true },
            { awards: { some: { familyId, childId } } },
          ],
        },
        include: {
          awards: { where: { familyId, childId }, orderBy: { awardedAt: 'asc' }, take: 1 },
          progress: { where: { familyId, childId }, take: 1 },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.readMetrics(this.prisma, familyId, childId),
    ]);
    if (!metrics) return null;
    return templates.map((value) => {
      const award = value.awards[0] ? awardRecord(value.awards[0]) : null;
      const currentTemplate = templateRecord(value);
      const condition = award?.templateConditionSnapshot ?? currentTemplate.condition;
      const persistedProgress = value.progress[0] ? progressRecord(value.progress[0]) : null;
      const liveProgress =
        condition.type === 'MANUAL'
          ? null
          : {
              templateId: value.id,
              childId,
              level: value.awardLevel,
              currentValue: conditionProgress(condition, metrics),
              targetValue: condition.target,
              evaluatedAt: persistedProgress?.evaluatedAt ?? value.updatedAt,
            };
      return {
        template: award
          ? {
              ...currentTemplate,
              name: award.templateNameSnapshot,
              description: award.templateDescriptionSnapshot,
              icon: award.templateIconSnapshot,
              category: award.templateCategorySnapshot,
              condition: award.templateConditionSnapshot,
              version: award.templateVersion,
            }
          : currentTemplate,
        award,
        progress: liveProgress,
      };
    });
  }

  async findEventChildIds(
    familyId: string,
    eventName: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<readonly string[]> {
    if (eventName === 'check-in.collaboration.completed.v1') {
      const roundId = payload.round_id;
      if (typeof roundId !== 'string') return [];
      const round = await this.prisma.collaborationRound.findFirst({
        where: { id: roundId, familyId, status: 'COMPLETED' },
        select: {
          participants: {
            where: { familyId, status: 'ACTIVE', child: { deletedAt: null, role: 'CHILD' } },
            select: { childId: true },
          },
        },
      });
      return round?.participants.map(({ childId }) => childId) ?? [];
    }
    return typeof payload.user_id === 'string' ? [payload.user_id] : [];
  }

  evaluateChild(input: {
    familyId: string;
    childId: string;
    sourceEventId: string;
    now: Date;
  }): Promise<{ evaluated: number; awarded: number }> {
    return this.prisma.$transaction(async (transaction) => {
      const [templates, metrics] = await Promise.all([
        transaction.badgeTemplate.findMany({
          where: {
            familyId: input.familyId,
            isEnabled: true,
            deletedAt: null,
            conditionType: { not: 'MANUAL' },
          },
        }),
        this.readMetrics(transaction, input.familyId, input.childId),
      ]);
      if (!metrics) return { evaluated: 0, awarded: 0 };

      const awards: Prisma.BadgeAwardCreateManyInput[] = [];
      for (const template of templates) {
        const condition = parseCondition(template.condition);
        if (condition.type === 'MANUAL') continue;
        const currentValue = conditionProgress(condition, metrics);
        await transaction.badgeProgress.upsert({
          where: {
            templateId_childId_level: {
              templateId: template.id,
              childId: input.childId,
              level: template.awardLevel,
            },
          },
          create: {
            familyId: input.familyId,
            templateId: template.id,
            childId: input.childId,
            level: template.awardLevel,
            currentValue,
            targetValue: condition.target,
            evaluatedAt: input.now,
          },
          update: { currentValue, targetValue: condition.target, evaluatedAt: input.now },
        });
        if (currentValue >= condition.target) {
          awards.push(
            this.awardData(template, input.childId, input.now, input.sourceEventId, null, null),
          );
        }
      }
      const created =
        awards.length === 0
          ? { count: 0 }
          : await transaction.badgeAward.createMany({ data: awards, skipDuplicates: true });
      if (created.count > 0) {
        const createdAwards = await transaction.badgeAward.findMany({
          where: {
            familyId: input.familyId,
            childId: input.childId,
            sourceEventId: input.sourceEventId,
          },
        });
        for (const award of createdAwards) await this.appendAwardEvent(transaction, award);
      }
      return { evaluated: templates.length, awarded: created.count };
    });
  }

  private async appendAwardEvent(
    transaction: Prisma.TransactionClient,
    award: BadgeAward,
  ): Promise<void> {
    await transaction.outboxEvent.createMany({
      data: [
        {
          id: award.id,
          familyId: award.familyId,
          actorId: award.awardedById,
          eventName: 'badges.award.created.v1',
          correlationId: award.id,
          payload: {
            award_id: award.id,
            template_id: award.templateId,
            child_id: award.childId,
            badge_name: award.templateNameSnapshot,
            level: award.level,
          },
          occurredAt: award.awardedAt,
          availableAt: award.awardedAt,
        },
      ],
      skipDuplicates: true,
    });
  }

  private awardData(
    template: BadgeTemplate,
    childId: string,
    awardedAt: Date,
    sourceEventId: string | null,
    awardedById: string | null,
    reason: string | null,
  ): Prisma.BadgeAwardCreateManyInput {
    return {
      familyId: template.familyId,
      templateId: template.id,
      childId,
      level: template.awardLevel,
      templateNameSnapshot: template.name,
      templateDescriptionSnapshot: template.description,
      templateIconSnapshot: template.icon,
      templateCategorySnapshot: template.category,
      templateConditionTypeSnapshot: template.conditionType,
      templateConditionSnapshot: template.condition as Prisma.InputJsonValue,
      templateVersion: template.version,
      reason,
      sourceEventId,
      awardedById,
      awardedAt,
    };
  }

  private async readMetrics(
    client: PrismaClient | Prisma.TransactionClient,
    familyId: string,
    childId: string,
  ): Promise<BadgeMetrics | null> {
    const [child, checkIns, collaborationSubmissions, collaborationRounds] = await Promise.all([
      client.user.findFirst({
        where: { id: childId, familyId, role: 'CHILD', deletedAt: null },
        select: { pointsEarnedTotal: true, currentLevel: true },
      }),
      client.checkIn.findMany({
        where: { familyId, childId, status: 'APPROVED', deletedAt: null },
        select: { checkDate: true },
      }),
      client.collaborationSubmission.count({
        where: { familyId, childId, status: 'APPROVED' },
      }),
      client.collaborationRound.findMany({
        where: {
          familyId,
          status: 'COMPLETED',
          participants: { some: { familyId, childId, status: 'ACTIVE' } },
        },
        select: { endDate: true },
      }),
    ]);
    if (!child) return null;
    return {
      taskCompletionCount: checkIns.length + collaborationSubmissions,
      streakDays: calculateStreakDays([
        ...checkIns.map(({ checkDate }) => checkDate),
        ...collaborationRounds.map(({ endDate }) => endDate),
      ]),
      totalPoints: child.pointsEarnedTotal,
      level: child.currentLevel,
      collaborationCount: collaborationRounds.length,
    };
  }

  private async requireActiveUser(
    familyId: string,
    userId: string,
    role: 'PARENT' | 'CHILD',
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, familyId, role, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new BadgeAccessError('FORBIDDEN', 'The badge actor was not found.');
  }
}
