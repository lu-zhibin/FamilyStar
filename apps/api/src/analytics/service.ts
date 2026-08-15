import { normalizeFamilySettings } from '../family-settings/service.js';
import { familyCalendarDate, parseFamilyDateRange } from '../http/query-validation.js';
import type {
  AnalyticsMetric,
  AnalyticsOperations,
  AnalyticsPeriod,
  AnalyticsServiceDependencies,
  RankingCandidate,
} from './types.js';

export class AnalyticsAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'AnalyticsAccessError';
  }
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function periodDates(today: string, period: Exclude<AnalyticsPeriod, 'all'>) {
  const date = new Date(`${today}T00:00:00.000Z`);
  if (period === 'week') {
    const day = date.getUTCDay() || 7;
    return { startDate: addDays(today, 1 - day), endDate: today };
  }
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
}

function completionRate(completed: number, scheduled: number): number | null {
  return scheduled === 0 ? null : Number((completed / scheduled).toFixed(4));
}

function rankingValue(
  candidate: RankingCandidate,
  metric: AnalyticsMetric,
  period: AnalyticsPeriod,
): number {
  if (metric === 'level') return candidate.currentLevel;
  if (metric === 'balance') {
    return period === 'all' ? candidate.pointsBalance : candidate.periodBalance;
  }
  return period === 'all' ? candidate.pointsEarnedTotal : candidate.periodEarned;
}

export class AnalyticsService implements AnalyticsOperations {
  private readonly now: () => Date;

  constructor(private readonly dependencies: AnalyticsServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  private async session(token: string | undefined) {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) throw new AnalyticsAccessError('UNAUTHORIZED', 'An active session is required.');
    return session;
  }

  async getAnalytics(input: Parameters<AnalyticsOperations['getAnalytics']>[0]) {
    const session = await this.session(input.sessionToken);
    if (session.role !== 'parent') {
      throw new AnalyticsAccessError('FORBIDDEN', 'A parent session is required.');
    }
    const family = await this.dependencies.repository.findFamilyContext(session.familyId);
    if (!family) throw new AnalyticsAccessError('NOT_FOUND', 'The family was not found.');
    if (input.childId && !family.children.some(({ id }) => id === input.childId)) {
      throw new AnalyticsAccessError('NOT_FOUND', 'The child was not found.');
    }
    if (
      input.taskId &&
      !(await this.dependencies.repository.taskExists(session.familyId, input.taskId))
    ) {
      throw new AnalyticsAccessError('NOT_FOUND', 'The task was not found.');
    }
    const timeZone = normalizeFamilySettings({ timeZone: family.timeZone }).timeZone;
    const range = parseFamilyDateRange({
      startDate: input.startDate,
      endDate: input.endDate,
      timeZone,
      maxDays: 366,
    });
    const aggregate = await this.dependencies.repository.aggregateAnalytics({
      familyId: session.familyId,
      ...(input.childId === undefined ? {} : { childId: input.childId }),
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      startDate: range.startDate,
      endDate: range.endDate,
      startAt: range.startAt,
      endAtExclusive: range.endAtExclusive,
      timeZone,
    });
    return {
      range: {
        startDate: range.startDate,
        endDate: range.endDate,
        timeZone,
        dayCount: range.dayCount,
      },
      filters: { childId: input.childId ?? null, taskId: input.taskId ?? null },
      overview: {
        scheduledCount: aggregate.scheduledCount,
        completedCount: aggregate.completedCount,
        completionRate: completionRate(aggregate.completedCount, aggregate.scheduledCount),
        pointsEarned: aggregate.pointsEarned,
      },
      pointsTrend: aggregate.pointsTrend,
      taskPerformance: aggregate.taskPerformance,
      levelDistribution: aggregate.levelDistribution,
    };
  }

  async getRankings(input: Parameters<AnalyticsOperations['getRankings']>[0]) {
    const session = await this.session(input.sessionToken);
    const family = await this.dependencies.repository.findFamilyContext(session.familyId);
    if (!family) throw new AnalyticsAccessError('NOT_FOUND', 'The family was not found.');
    const timeZone = normalizeFamilySettings({ timeZone: family.timeZone }).timeZone;
    const today = familyCalendarDate(this.now(), timeZone);
    const dates = input.period === 'all' ? null : periodDates(today, input.period);
    const parsed = dates ? parseFamilyDateRange({ ...dates, timeZone, maxDays: 31 }) : null;
    const candidates = await this.dependencies.repository.findRankingCandidates({
      familyId: session.familyId,
      ...(parsed ? { startAt: parsed.startAt, endAtExclusive: parsed.endAtExclusive } : {}),
    });
    const sorted = [...candidates].sort((left, right) => {
      const primary =
        rankingValue(right, input.metric, input.period) -
        rankingValue(left, input.metric, input.period);
      if (primary !== 0) return primary;
      if (input.metric === 'level' && input.period !== 'all') {
        const earned = right.periodEarned - left.periodEarned;
        if (earned !== 0) return earned;
      }
      return (
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.childId.localeCompare(right.childId)
      );
    });
    let rank = 0;
    let previousKey = '';
    const items = sorted.map((candidate, index) => {
      const value = rankingValue(candidate, input.metric, input.period);
      const key = `${value}:${input.metric === 'level' && input.period !== 'all' ? candidate.periodEarned : ''}`;
      if (key !== previousKey) rank = index + 1;
      previousKey = key;
      return {
        rank,
        childId: candidate.childId,
        nickname: candidate.nickname,
        value,
        ...(input.metric === 'level' && input.period !== 'all'
          ? { periodEarned: candidate.periodEarned }
          : {}),
        isCurrentUser: session.role === 'child' && session.subjectId === candidate.childId,
      };
    });
    return {
      metric: input.metric,
      period: input.period,
      range: dates ? { ...dates, timeZone } : null,
      items,
    };
  }
}
