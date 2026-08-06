export type FamilyDashboardResponse = Readonly<{
  date: string;
  time_zone: string;
  children: ReadonlyArray<{
    child_id: string;
    nickname: string;
    task_total: number;
    completed_count: number;
    pending_review_count: number;
    points_earned: number;
  }>;
  todos: {
    pending_reviews: { count: number; target_url: string };
    pending_redemptions: { count: number; target_url: string };
    pending_fulfillments: { count: number; target_url: string };
  };
  recent_activity: ReadonlyArray<{
    id: string;
    type: string;
    occurred_at: string;
    actor: { id: string; nickname: string; role: 'PARENT' | 'CHILD' } | null;
    child: { id: string; nickname: string } | null;
    entity_type: string;
    entity_id: string;
    target_url: string;
    details: Readonly<Record<string, string | number | boolean | null>>;
  }>;
}>;

export type AnalyticsFilters = Readonly<{
  startDate: string;
  endDate: string;
  childId?: string;
  taskId?: string;
}>;

export type FamilyAnalyticsResponse = Readonly<{
  range: { start_date: string; end_date: string; time_zone: string; day_count: number };
  filters: { child_id: string | null; task_id: string | null };
  overview: {
    scheduled_count: number;
    completed_count: number;
    completion_rate: number | null;
    points_earned: number;
  };
  points_trend: ReadonlyArray<{ date: string; points_earned: number }>;
  task_performance: ReadonlyArray<{
    task_id: string;
    task_name: string;
    scheduled_count: number;
    completed_count: number;
    completion_rate: number | null;
  }>;
  level_distribution: ReadonlyArray<{ level: number; child_count: number }>;
}>;

export type ChildPointsResponse = Readonly<{
  child_id: string;
  points_balance: number;
  points_earned_total: number;
}>;

export type PointsLog = Readonly<{
  id: string;
  type: 'EARN' | 'REDEEM' | 'REFUND' | 'MANUAL';
  business_type: string;
  business_id: string;
  delta: number;
  balance_before: number;
  balance_after: number;
  earned_total_after: number;
  remark: string | null;
  created_at: string;
}>;

export type ChildPointsLogsResponse = Readonly<{
  logs: ReadonlyArray<PointsLog>;
  page: { next_cursor: string | null; has_more: boolean };
}>;

export type RankingMetric = 'balance' | 'earned' | 'level';
export type RankingPeriod = 'week' | 'month' | 'all';

export type FamilyRankingsResponse = Readonly<{
  metric: RankingMetric;
  period: RankingPeriod;
  range: { start_date: string; end_date: string; time_zone: string } | null;
  items: ReadonlyArray<{
    rank: number;
    child_id: string;
    nickname: string;
    value: number;
    period_earned?: number;
    is_current_user: boolean;
  }>;
}>;

export function buildFamilyDashboardPath(date: string): string {
  return `/family/dashboard?date=${encodeURIComponent(date)}`;
}

export function buildFamilyAnalyticsPath(filters: AnalyticsFilters): string {
  const search = new URLSearchParams({
    start_date: filters.startDate,
    end_date: filters.endDate,
  });
  if (filters.childId) search.set('child_id', filters.childId);
  if (filters.taskId) search.set('task_id', filters.taskId);
  return `/family/analytics?${search.toString()}`;
}

export function buildPointsLogsPath(cursor?: string | null, limit = 20): string {
  const search = new URLSearchParams({ limit: String(limit) });
  if (cursor) search.set('cursor', cursor);
  return `/points/me/logs?${search.toString()}`;
}

export function buildRankingsPath(metric: RankingMetric, period: RankingPeriod): string {
  const search = new URLSearchParams({ metric, period, family_scope: 'family' });
  return `/rankings?${search.toString()}`;
}
