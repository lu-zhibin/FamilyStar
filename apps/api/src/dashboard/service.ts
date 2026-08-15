import { normalizeFamilySettings } from '../family-settings/service.js';
import { familyDayBounds, parseFamilyDateRange } from '../http/query-validation.js';
import type {
  DashboardActivity,
  DashboardChildProgress,
  DashboardOperations,
  DashboardProgressEntry,
  DashboardServiceDependencies,
} from './types.js';
import { DASHBOARD_ACTIVITY_LIMIT } from './types.js';

export class DashboardAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'DashboardAccessError';
  }
}

function compareActivity(left: DashboardActivity, right: DashboardActivity): number {
  return (
    right.occurredAt.getTime() - left.occurredAt.getTime() ||
    (left.id === right.id ? 0 : left.id > right.id ? -1 : 1)
  );
}

export function buildChildProgress(
  children: readonly Readonly<{ id: string; nickname: string }>[],
  entries: readonly DashboardProgressEntry[],
  points: ReadonlyMap<string, number>,
): readonly DashboardChildProgress[] {
  const progress = new Map(
    children.map((child) => [
      child.id,
      {
        childId: child.id,
        nickname: child.nickname,
        taskTotal: 0,
        completedCount: 0,
        pendingReviewCount: 0,
        pointsEarned: points.get(child.id) ?? 0,
      },
    ]),
  );
  for (const entry of entries) {
    const child = progress.get(entry.childId);
    if (!child) continue;
    child.taskTotal += 1;
    if (entry.status === 'APPROVED') child.completedCount += 1;
    if (entry.status === 'PENDING') child.pendingReviewCount += 1;
  }
  return [...progress.values()];
}

export class DashboardService implements DashboardOperations {
  constructor(private readonly dependencies: DashboardServiceDependencies) {}

  async get(input: { sessionToken?: string; date: string }) {
    const session = input.sessionToken
      ? await this.dependencies.sessions.read(input.sessionToken)
      : null;
    if (!session) throw new DashboardAccessError('UNAUTHORIZED', 'An active session is required.');
    if (session.role !== 'parent') {
      throw new DashboardAccessError('FORBIDDEN', 'A parent session is required.');
    }

    const family = await this.dependencies.repository.findFamilyContext(session.familyId);
    if (!family) throw new DashboardAccessError('NOT_FOUND', 'The family was not found.');
    const timeZone = normalizeFamilySettings({ timeZone: family.timeZone }).timeZone;
    parseFamilyDateRange({
      startDate: input.date,
      endDate: input.date,
      timeZone,
      maxDays: 1,
    });
    const bounds = familyDayBounds(input.date, timeZone);
    const [entries, points, todos, activity] = await Promise.all([
      this.dependencies.repository.findDailyProgressEntries({
        familyId: session.familyId,
        date: input.date,
      }),
      this.dependencies.repository.findDailyEarnedPoints({
        familyId: session.familyId,
        ...bounds,
      }),
      this.dependencies.repository.findTodoCounts(session.familyId),
      this.dependencies.repository.findRecentActivity(session.familyId, DASHBOARD_ACTIVITY_LIMIT),
    ]);

    return {
      dashboard: {
        date: input.date,
        timeZone,
        children: buildChildProgress(family.children, entries, points),
        todos,
        recentActivity: [...activity].sort(compareActivity).slice(0, DASHBOARD_ACTIVITY_LIMIT),
      },
    };
  }
}
