import type { PrismaClient } from '@prisma/client';

import { familyCalendarDate } from '../http/query-validation.js';
import { isScheduledOnDate } from '../tasks/frequency.js';
import type { TaskFrequency } from '../tasks/types.js';
import type { AnalyticsRepository, TaskPerformance } from './types.js';

function calendarDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  while (current.toISOString().slice(0, 10) <= endDate) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function rate(completed: number, scheduled: number): number | null {
  return scheduled === 0 ? null : Number((completed / scheduled).toFixed(4));
}

export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findFamilyContext(familyId: string) {
    const family = await this.prisma.family.findFirst({
      where: { id: familyId, deletedAt: null },
      select: {
        settings: true,
        users: {
          where: { role: 'CHILD', deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            nickname: true,
            currentLevel: true,
            pointsBalance: true,
            pointsEarnedTotal: true,
            createdAt: true,
          },
        },
      },
    });
    if (!family) return null;
    const settings =
      family.settings && typeof family.settings === 'object' && !Array.isArray(family.settings)
        ? (family.settings as Record<string, unknown>)
        : {};
    return {
      timeZone: typeof settings.timeZone === 'string' ? settings.timeZone : 'Asia/Shanghai',
      children: family.users,
    };
  }

  async taskExists(familyId: string, taskId: string) {
    return (
      (await this.prisma.task.count({
        where: { id: taskId, familyId, deletedAt: null },
      })) > 0
    );
  }

  async aggregateAnalytics(input: Parameters<AnalyticsRepository['aggregateAnalytics']>[0]) {
    const startBusinessDate = new Date(`${input.startDate}T00:00:00.000Z`);
    const endBusinessDate = new Date(`${input.endDate}T00:00:00.000Z`);
    const assignmentWhere = {
      familyId: input.familyId,
      deletedAt: null,
      startDate: { lte: endBusinessDate },
      OR: [{ endDate: null }, { endDate: { gte: startBusinessDate } }],
      ...(input.childId === undefined ? {} : { childId: input.childId }),
      child: { familyId: input.familyId, role: 'CHILD' as const, deletedAt: null },
      task: {
        familyId: input.familyId,
        status: 'ACTIVE' as const,
        deletedAt: null,
        ...(input.taskId === undefined ? {} : { id: input.taskId }),
      },
    };
    const assignments = await this.prisma.taskAssignment.findMany({
      where: assignmentWhere,
      select: {
        id: true,
        childId: true,
        startDate: true,
        endDate: true,
        customFrequency: true,
        task: { select: { id: true, name: true, frequency: true, collaborationMode: true } },
      },
      orderBy: [{ taskId: 'asc' }, { childId: 'asc' }, { id: 'asc' }],
    });
    const dates = calendarDates(input.startDate, input.endDate);
    const opportunities = new Map<
      string,
      Readonly<{
        taskId: string;
        taskName: string;
        childId?: string;
        date: string;
        mode: 'SOLO' | 'COLLAB';
      }>
    >();
    for (const assignment of assignments) {
      if (assignment.task.collaborationMode === 'COLLAB') continue;
      const activeStart = assignment.startDate.toISOString().slice(0, 10);
      const activeEnd = assignment.endDate?.toISOString().slice(0, 10) ?? input.endDate;
      for (const date of dates) {
        if (date < activeStart || date > activeEnd) continue;
        const frequency = (assignment.customFrequency ??
          assignment.task.frequency) as TaskFrequency;
        if (!isScheduledOnDate(frequency, date)) continue;
        const childKey = assignment.childId;
        const key = `${assignment.task.id}:${date}:${childKey}`;
        opportunities.set(key, {
          taskId: assignment.task.id,
          taskName: assignment.task.name,
          ...(childKey ? { childId: childKey } : {}),
          date,
          mode: assignment.task.collaborationMode,
        });
      }
    }

    const [solo, rounds, points, children] = await Promise.all([
      this.prisma.checkIn.findMany({
        where: {
          familyId: input.familyId,
          deletedAt: null,
          status: 'APPROVED',
          checkDate: { gte: startBusinessDate, lte: endBusinessDate },
          ...(input.childId === undefined ? {} : { childId: input.childId }),
          ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        },
        select: { id: true, taskId: true, childId: true, checkDate: true },
      }),
      this.prisma.collaborationRound.findMany({
        where: {
          familyId: input.familyId,
          startDate: { lte: endBusinessDate },
          endDate: { gte: startBusinessDate },
          ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
          ...(input.childId === undefined
            ? {}
            : {
                participants: {
                  some: { familyId: input.familyId, childId: input.childId, status: 'ACTIVE' },
                },
              }),
        },
        select: {
          id: true,
          taskId: true,
          startDate: true,
          endDate: true,
          task: { select: { name: true } },
          submissions: {
            where: {
              familyId: input.familyId,
              status: 'APPROVED',
              ...(input.childId === undefined ? {} : { childId: input.childId }),
            },
            select: { childId: true },
          },
        },
      }),
      this.prisma.pointsLog.findMany({
        where: {
          familyId: input.familyId,
          createdAt: { gte: input.startAt, lt: input.endAtExclusive },
          OR: [{ type: 'EARN' }, { type: 'MANUAL', delta: { gt: 0 } }],
          ...(input.childId === undefined ? {} : { userId: input.childId }),
          user: { familyId: input.familyId, role: 'CHILD', deletedAt: null },
        },
        select: {
          userId: true,
          type: true,
          businessType: true,
          businessId: true,
          delta: true,
          createdAt: true,
        },
      }),
      this.prisma.user.findMany({
        where: {
          familyId: input.familyId,
          role: 'CHILD',
          deletedAt: null,
          ...(input.childId === undefined ? {} : { id: input.childId }),
        },
        select: { currentLevel: true },
      }),
    ]);

    const completed = new Set<string>();
    for (const item of solo) {
      const key = `${item.taskId}:${item.checkDate.toISOString().slice(0, 10)}:${item.childId}`;
      if (opportunities.has(key)) completed.add(key);
    }
    for (const round of rounds) {
      const key = `round:${round.id}:${input.childId ?? ''}`;
      opportunities.set(key, {
        taskId: round.taskId,
        taskName: round.task.name,
        ...(input.childId === undefined ? {} : { childId: input.childId }),
        date: round.endDate.toISOString().slice(0, 10),
        mode: 'COLLAB',
      });
      if (round.submissions.length > 0) completed.add(key);
    }

    const taskTotals = new Map<string, { name: string; scheduled: number; completed: number }>();
    for (const [key, item] of opportunities) {
      const total = taskTotals.get(item.taskId) ?? {
        name: item.taskName,
        scheduled: 0,
        completed: 0,
      };
      total.scheduled += 1;
      if (completed.has(key)) total.completed += 1;
      taskTotals.set(item.taskId, total);
    }
    const taskPerformance: TaskPerformance[] = [...taskTotals.entries()]
      .map(([taskId, total]) => ({
        taskId,
        taskName: total.name,
        scheduledCount: total.scheduled,
        completedCount: total.completed,
        completionRate: rate(total.completed, total.scheduled),
      }))
      .sort(
        (left, right) =>
          (right.completionRate ?? -1) - (left.completionRate ?? -1) ||
          right.completedCount - left.completedCount ||
          left.taskName.localeCompare(right.taskName) ||
          left.taskId.localeCompare(right.taskId),
      );

    let filteredPoints = points;
    if (input.taskId) {
      const soloIds = new Set(
        solo.filter(({ taskId }) => taskId === input.taskId).map(({ id }) => id),
      );
      const roundIds = new Set(
        rounds.filter(({ taskId }) => taskId === input.taskId).map(({ id }) => id),
      );
      filteredPoints = points.filter(
        (point) =>
          point.type === 'EARN' &&
          ((point.businessType === 'check_in' && soloIds.has(point.businessId)) ||
            (point.businessType === 'collaboration_round' && roundIds.has(point.businessId))),
      );
    }
    const trend = new Map(dates.map((date) => [date, 0]));
    for (const point of filteredPoints) {
      const date = familyCalendarDate(point.createdAt, input.timeZone);
      if (trend.has(date)) trend.set(date, (trend.get(date) ?? 0) + point.delta);
    }
    const levels = new Map<number, number>();
    for (const child of children)
      levels.set(child.currentLevel, (levels.get(child.currentLevel) ?? 0) + 1);
    return {
      scheduledCount: opportunities.size,
      completedCount: completed.size,
      pointsEarned: filteredPoints.reduce((sum, point) => sum + point.delta, 0),
      pointsTrend: [...trend].map(([date, pointsEarned]) => ({ date, pointsEarned })),
      taskPerformance,
      levelDistribution: [...levels]
        .sort(([left], [right]) => left - right)
        .map(([level, childCount]) => ({ level, childCount })),
    };
  }

  async findRankingCandidates(input: Parameters<AnalyticsRepository['findRankingCandidates']>[0]) {
    const children = await this.prisma.user.findMany({
      where: { familyId: input.familyId, role: 'CHILD', deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        nickname: true,
        createdAt: true,
        currentLevel: true,
        pointsBalance: true,
        pointsEarnedTotal: true,
      },
    });
    const logs =
      input.startAt && input.endAtExclusive
        ? await this.prisma.pointsLog.findMany({
            where: {
              familyId: input.familyId,
              userId: { in: children.map(({ id }) => id) },
              createdAt: { gte: input.startAt, lt: input.endAtExclusive },
              user: { familyId: input.familyId, role: 'CHILD', deletedAt: null },
            },
            select: { userId: true, type: true, delta: true },
          })
        : [];
    const totals = new Map<string, { balance: number; earned: number }>();
    for (const log of logs) {
      const total = totals.get(log.userId) ?? { balance: 0, earned: 0 };
      total.balance += log.delta;
      if (log.type === 'EARN' || (log.type === 'MANUAL' && log.delta > 0))
        total.earned += log.delta;
      totals.set(log.userId, total);
    }
    return children.map((child) => ({
      childId: child.id,
      nickname: child.nickname,
      createdAt: child.createdAt,
      currentLevel: child.currentLevel,
      pointsBalance: child.pointsBalance,
      pointsEarnedTotal: child.pointsEarnedTotal,
      periodBalance: totals.get(child.id)?.balance ?? 0,
      periodEarned: totals.get(child.id)?.earned ?? 0,
    }));
  }
}
