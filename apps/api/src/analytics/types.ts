import type { SessionStore } from '../family-auth/types.js';

export type AnalyticsMetric = 'balance' | 'earned' | 'level';
export type AnalyticsPeriod = 'week' | 'month' | 'all';

export type AnalyticsFamilyContext = Readonly<{
  timeZone: string;
  children: readonly Readonly<{
    id: string;
    nickname: string;
    currentLevel: number;
    pointsBalance: number;
    pointsEarnedTotal: number;
    createdAt: Date;
  }>[];
}>;

export type AnalyticsPoint = Readonly<{ date: string; pointsEarned: number }>;
export type TaskPerformance = Readonly<{
  taskId: string;
  taskName: string;
  scheduledCount: number;
  completedCount: number;
  completionRate: number | null;
}>;
export type LevelDistribution = Readonly<{
  level: number;
  childCount: number;
}>;

export type AnalyticsAggregate = Readonly<{
  scheduledCount: number;
  completedCount: number;
  pointsEarned: number;
  pointsTrend: readonly AnalyticsPoint[];
  taskPerformance: readonly TaskPerformance[];
  levelDistribution: readonly LevelDistribution[];
}>;

export type RankingCandidate = Readonly<{
  childId: string;
  nickname: string;
  createdAt: Date;
  currentLevel: number;
  pointsBalance: number;
  pointsEarnedTotal: number;
  periodBalance: number;
  periodEarned: number;
}>;

export type AnalyticsRepository = {
  findFamilyContext(familyId: string): Promise<AnalyticsFamilyContext | null>;
  taskExists(familyId: string, taskId: string): Promise<boolean>;
  aggregateAnalytics(input: {
    familyId: string;
    childId?: string;
    taskId?: string;
    startDate: string;
    endDate: string;
    startAt: Date;
    endAtExclusive: Date;
    timeZone: string;
  }): Promise<AnalyticsAggregate>;
  findRankingCandidates(input: {
    familyId: string;
    startAt?: Date;
    endAtExclusive?: Date;
  }): Promise<readonly RankingCandidate[]>;
};

export type AnalyticsOperations = {
  getAnalytics(input: {
    sessionToken?: string;
    childId?: string;
    taskId?: string;
    startDate: string;
    endDate: string;
  }): Promise<{
    range: Readonly<{
      startDate: string;
      endDate: string;
      timeZone: string;
      dayCount: number;
    }>;
    filters: Readonly<{ childId: string | null; taskId: string | null }>;
    overview: Readonly<{
      scheduledCount: number;
      completedCount: number;
      completionRate: number | null;
      pointsEarned: number;
    }>;
    pointsTrend: readonly AnalyticsPoint[];
    taskPerformance: readonly TaskPerformance[];
    levelDistribution: readonly LevelDistribution[];
  }>;
  getRankings(input: {
    sessionToken?: string;
    metric: AnalyticsMetric;
    period: AnalyticsPeriod;
  }): Promise<{
    metric: AnalyticsMetric;
    period: AnalyticsPeriod;
    range: Readonly<{ startDate: string; endDate: string; timeZone: string }> | null;
    items: readonly Readonly<{
      rank: number;
      childId: string;
      nickname: string;
      value: number;
      periodEarned?: number;
      isCurrentUser: boolean;
    }>[];
  }>;
};

export type AnalyticsServiceDependencies = Readonly<{
  repository: AnalyticsRepository;
  sessions: SessionStore;
  now?: () => Date;
}>;
