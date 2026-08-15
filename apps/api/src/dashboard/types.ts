import type { SessionStore } from '../family-auth/types.js';
import type { TaskFrequency } from '../tasks/types.js';

export const DASHBOARD_ACTIVITY_LIMIT = 30;

export type DashboardActivityType =
  | 'CHECK_IN_SUBMITTED'
  | 'COLLABORATION_CHECK_IN_SUBMITTED'
  | 'SUBMISSION_REVIEWED'
  | 'POINTS_CHANGED'
  | 'LEVEL_ADVANCED'
  | 'REDEMPTION_REQUESTED'
  | 'REDEMPTION_APPROVED'
  | 'REDEMPTION_REJECTED'
  | 'REDEMPTION_FULFILLED'
  | 'WISH_CREATED'
  | 'WISH_ADOPTED'
  | 'WISH_CANCELLED'
  | 'MEMBER_JOINED'
  | 'MEMBER_DEACTIVATED'
  | 'INVITATION_CREATED'
  | 'INVITATION_ACCEPTED'
  | 'INVITATION_EXPIRED'
  | 'BADGE_AWARDED';

export type DashboardPerson = Readonly<{
  id: string;
  nickname: string;
  role: 'PARENT' | 'CHILD';
}>;

export type DashboardActivity = Readonly<{
  id: string;
  type: DashboardActivityType;
  occurredAt: Date;
  actor: DashboardPerson | null;
  child: Readonly<{ id: string; nickname: string }> | null;
  entityType: string;
  entityId: string;
  targetUrl: string;
  details: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type DashboardBadgeAward = Readonly<{
  id: string;
  child: Readonly<{ id: string; nickname: string }>;
  badgeId: string;
  badgeName: string;
  awardedAt: Date;
  awardedBy: DashboardPerson | null;
}>;

export type DashboardBadgeAwardSource = {
  findRecentAwards(familyId: string, limit: number): Promise<readonly DashboardBadgeAward[]>;
};

export type DashboardFamilyContext = Readonly<{
  timeZone: string;
  children: readonly Readonly<{ id: string; nickname: string }>[];
}>;

export type DashboardAssignmentCandidate = Readonly<{
  id: string;
  childId: string;
  taskId: string;
  collaborationMode: 'SOLO' | 'COLLAB';
  frequency: TaskFrequency;
  customFrequency: TaskFrequency | null;
}>;

export type DashboardProgressEntry = Readonly<{
  childId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}>;

export type DashboardTodoCounts = Readonly<{
  pendingReviews: number;
  pendingRedemptions: number;
  pendingFulfillments: number;
}>;

export type DashboardRepository = {
  findFamilyContext(familyId: string): Promise<DashboardFamilyContext | null>;
  findDailyProgressEntries(input: {
    familyId: string;
    date: string;
  }): Promise<readonly DashboardProgressEntry[]>;
  findDailyEarnedPoints(input: {
    familyId: string;
    startAt: Date;
    endAtExclusive: Date;
  }): Promise<ReadonlyMap<string, number>>;
  findTodoCounts(familyId: string): Promise<DashboardTodoCounts>;
  findRecentActivity(familyId: string, limit: number): Promise<readonly DashboardActivity[]>;
};

export type DashboardChildProgress = Readonly<{
  childId: string;
  nickname: string;
  taskTotal: number;
  completedCount: number;
  pendingReviewCount: number;
  pointsEarned: number;
}>;

export type FamilyDashboard = Readonly<{
  date: string;
  timeZone: string;
  children: readonly DashboardChildProgress[];
  todos: DashboardTodoCounts;
  recentActivity: readonly DashboardActivity[];
}>;

export type DashboardOperations = {
  get(input: { sessionToken?: string; date: string }): Promise<{ dashboard: FamilyDashboard }>;
};

export type DashboardServiceDependencies = Readonly<{
  repository: DashboardRepository;
  sessions: SessionStore;
}>;
