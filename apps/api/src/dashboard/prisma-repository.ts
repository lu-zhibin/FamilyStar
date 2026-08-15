import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import { normalizeFamilySettings } from '../family-settings/service.js';
import { isScheduledOnDate } from '../tasks/frequency.js';
import type { TaskFrequency } from '../tasks/types.js';
import type {
  DashboardActivity,
  DashboardBadgeAwardSource,
  DashboardPerson,
  DashboardRepository,
} from './types.js';

const personSelect = {
  id: true,
  nickname: true,
  role: true,
} satisfies Prisma.UserSelect;

function person(value: DashboardPerson | null | undefined): DashboardPerson | null {
  return value ? { id: value.id, nickname: value.nickname, role: value.role } : null;
}

function child(value: DashboardPerson | null | undefined) {
  return value?.role === 'CHILD' ? { id: value.id, nickname: value.nickname } : null;
}

function activity(
  value: Omit<DashboardActivity, 'actor' | 'child'> & {
    actor?: DashboardPerson | null;
    child?: DashboardPerson | null;
  },
): DashboardActivity {
  return {
    ...value,
    actor: person(value.actor),
    child: child(value.child),
  };
}

function levelAt(
  configurations: readonly Readonly<{ level: number; pointsRequired: number }>[],
  earnedTotal: number,
): number {
  return configurations.reduce(
    (level, configuration) =>
      configuration.pointsRequired <= earnedTotal ? Math.max(level, configuration.level) : level,
    1,
  );
}

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly badgeAwards?: DashboardBadgeAwardSource,
  ) {}

  async findFamilyContext(familyId: string) {
    const family = await this.prisma.family.findFirst({
      where: { id: familyId, deletedAt: null },
      select: {
        settings: true,
        users: {
          where: { role: 'CHILD', deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, nickname: true },
        },
      },
    });
    if (!family) return null;
    const raw =
      typeof family.settings === 'object' &&
      family.settings !== null &&
      !Array.isArray(family.settings)
        ? (family.settings as Record<string, unknown>)
        : {};
    return {
      timeZone: normalizeFamilySettings(raw).timeZone,
      children: family.users,
    };
  }

  async findDailyProgressEntries(input: { familyId: string; date: string }) {
    const businessDate = new Date(`${input.date}T00:00:00.000Z`);
    const assignments = await this.prisma.taskAssignment.findMany({
      where: {
        familyId: input.familyId,
        deletedAt: null,
        startDate: { lte: businessDate },
        OR: [{ endDate: null }, { endDate: { gte: businessDate } }],
        child: { familyId: input.familyId, role: 'CHILD', deletedAt: null },
        task: { familyId: input.familyId, status: 'ACTIVE', deletedAt: null },
      },
      select: {
        id: true,
        childId: true,
        customFrequency: true,
        task: { select: { id: true, collaborationMode: true, frequency: true } },
      },
      orderBy: [{ childId: 'asc' }, { id: 'asc' }],
    });
    const due = assignments.filter((assignment) =>
      isScheduledOnDate(
        (assignment.customFrequency ?? assignment.task.frequency) as unknown as TaskFrequency,
        input.date,
      ),
    );
    const solo = due.filter(({ task }) => task.collaborationMode === 'SOLO');
    const collaboration = due.filter(({ task }) => task.collaborationMode === 'COLLAB');
    const [checkIns, rounds] = await Promise.all([
      solo.length === 0
        ? Promise.resolve([])
        : this.prisma.checkIn.findMany({
            where: {
              familyId: input.familyId,
              taskAssignmentId: { in: solo.map(({ id }) => id) },
              checkDate: businessDate,
              deletedAt: null,
            },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            select: { taskAssignmentId: true, status: true },
          }),
      collaboration.length === 0
        ? Promise.resolve([])
        : this.prisma.collaborationRound.findMany({
            where: {
              familyId: input.familyId,
              taskId: { in: [...new Set(collaboration.map(({ task }) => task.id))] },
              startDate: { lte: businessDate },
              endDate: { gte: businessDate },
            },
            orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
            select: {
              taskId: true,
              submissions: {
                where: { familyId: input.familyId },
                select: { childId: true, status: true },
              },
            },
          }),
    ]);
    const soloStatus = new Map<string, (typeof checkIns)[number]['status']>();
    for (const checkIn of checkIns) {
      if (!soloStatus.has(checkIn.taskAssignmentId)) {
        soloStatus.set(checkIn.taskAssignmentId, checkIn.status);
      }
    }
    const collaborationStatus = new Map<string, (typeof checkIns)[number]['status']>();
    for (const round of rounds) {
      for (const submission of round.submissions) {
        const key = `${round.taskId}:${submission.childId}`;
        if (!collaborationStatus.has(key)) collaborationStatus.set(key, submission.status);
      }
    }
    return due.map((assignment) => ({
      childId: assignment.childId,
      status:
        assignment.task.collaborationMode === 'SOLO'
          ? (soloStatus.get(assignment.id) ?? null)
          : (collaborationStatus.get(`${assignment.task.id}:${assignment.childId}`) ?? null),
    }));
  }

  async findDailyEarnedPoints(input: { familyId: string; startAt: Date; endAtExclusive: Date }) {
    const totals = await this.prisma.pointsLog.groupBy({
      by: ['userId'],
      where: {
        familyId: input.familyId,
        type: 'EARN',
        createdAt: { gte: input.startAt, lt: input.endAtExclusive },
        user: { familyId: input.familyId, role: 'CHILD', deletedAt: null },
      },
      _sum: { delta: true },
    });
    return new Map(totals.map((total) => [total.userId, total._sum.delta ?? 0]));
  }

  async findTodoCounts(familyId: string) {
    const [solo, collaboration, pendingRedemptions, pendingFulfillments] = await Promise.all([
      this.prisma.checkIn.count({
        where: { familyId, status: 'PENDING', deletedAt: null },
      }),
      this.prisma.collaborationSubmission.count({ where: { familyId, status: 'PENDING' } }),
      this.prisma.redemption.count({ where: { familyId, status: 'PENDING' } }),
      this.prisma.redemption.count({ where: { familyId, status: 'APPROVED' } }),
    ]);
    return {
      pendingReviews: solo + collaboration,
      pendingRedemptions,
      pendingFulfillments,
    };
  }

  async findRecentActivity(familyId: string, limit: number) {
    const [
      checkIns,
      collaboration,
      reviews,
      points,
      configurations,
      redemptionRequests,
      redemptionApprovals,
      redemptionRejections,
      redemptionFulfillments,
      wishCreates,
      wishAdoptions,
      wishCancellations,
      memberJoins,
      memberDeactivations,
      invitationCreates,
      invitationAcceptances,
      invitationExpirations,
      badgeAwards,
    ] = await Promise.all([
      this.prisma.checkIn.findMany({
        where: { familyId, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: {
          id: true,
          createdAt: true,
          status: true,
          child: { select: personSelect },
          task: { select: { id: true, name: true } },
        },
      }),
      this.prisma.collaborationSubmission.findMany({
        where: { familyId },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: {
          id: true,
          submittedAt: true,
          status: true,
          child: { select: personSelect },
          round: { select: { task: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.submissionReview.findMany({
        where: { familyId },
        orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: {
          id: true,
          targetType: true,
          decision: true,
          source: true,
          reviewedAt: true,
          reviewer: { select: personSelect },
          checkInAttempt: {
            select: {
              checkIn: {
                select: {
                  id: true,
                  child: { select: personSelect },
                  task: { select: { id: true, name: true } },
                },
              },
            },
          },
          collaborationAttempt: {
            select: {
              submission: {
                select: {
                  id: true,
                  child: { select: personSelect },
                  round: { select: { task: { select: { id: true, name: true } } } },
                },
              },
            },
          },
        },
      }),
      this.prisma.pointsLog.findMany({
        where: { familyId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: {
          id: true,
          type: true,
          businessType: true,
          businessId: true,
          delta: true,
          earnedTotalAfter: true,
          createdAt: true,
          user: { select: personSelect },
        },
      }),
      this.prisma.levelConfig.findMany({
        where: { familyId },
        orderBy: { level: 'asc' },
        select: { level: true, pointsRequired: true },
      }),
      this.redemptionsAt(familyId, 'createdAt', limit),
      this.redemptionsAt(familyId, 'approvedAt', limit),
      this.redemptionsAt(familyId, 'rejectedAt', limit),
      this.redemptionsAt(familyId, 'fulfilledAt', limit),
      this.wishesAt(familyId, 'createdAt', limit),
      this.wishesAt(familyId, 'adoptedAt', limit),
      this.wishesAt(familyId, 'cancelledAt', limit),
      this.membersAt(familyId, 'createdAt', limit),
      this.membersAt(familyId, 'deletedAt', limit),
      this.invitationsAt(familyId, 'createdAt', limit),
      this.invitationsAt(familyId, 'acceptedAt', limit),
      this.invitationsAt(familyId, 'updatedAt', limit, 'EXPIRED'),
      this.badgeAwards?.findRecentAwards(familyId, limit) ?? Promise.resolve([]),
    ]);

    const activities: DashboardActivity[] = [];
    for (const value of checkIns) {
      activities.push(
        activity({
          id: `check-in:${value.id}`,
          type: 'CHECK_IN_SUBMITTED',
          occurredAt: value.createdAt,
          actor: value.child,
          child: value.child,
          entityType: 'check_in',
          entityId: value.id,
          targetUrl: '/reviews',
          details: { task_id: value.task.id, task_name: value.task.name, status: value.status },
        }),
      );
    }
    for (const value of collaboration) {
      activities.push(
        activity({
          id: `collaboration-check-in:${value.id}`,
          type: 'COLLABORATION_CHECK_IN_SUBMITTED',
          occurredAt: value.submittedAt,
          actor: value.child,
          child: value.child,
          entityType: 'collaboration_submission',
          entityId: value.id,
          targetUrl: '/reviews',
          details: {
            task_id: value.round.task.id,
            task_name: value.round.task.name,
            status: value.status,
          },
        }),
      );
    }
    for (const value of reviews) {
      const target =
        value.targetType === 'CHECK_IN'
          ? value.checkInAttempt?.checkIn
          : value.collaborationAttempt?.submission;
      const task =
        value.targetType === 'CHECK_IN'
          ? value.checkInAttempt?.checkIn.task
          : value.collaborationAttempt?.submission.round.task;
      if (!target || !task) continue;
      activities.push(
        activity({
          id: `review:${value.id}`,
          type: 'SUBMISSION_REVIEWED',
          occurredAt: value.reviewedAt,
          actor: value.reviewer,
          child: target.child,
          entityType: 'submission_review',
          entityId: value.id,
          targetUrl: '/reviews',
          details: {
            target_type: value.targetType,
            target_id: target.id,
            task_id: task.id,
            task_name: task.name,
            decision: value.decision,
            source: value.source,
          },
        }),
      );
    }
    for (const value of points) {
      activities.push(
        activity({
          id: `points:${value.id}`,
          type: 'POINTS_CHANGED',
          occurredAt: value.createdAt,
          child: value.user,
          entityType: 'points_log',
          entityId: value.id,
          targetUrl: '/levels',
          details: {
            points_type: value.type,
            delta: value.delta,
            business_type: value.businessType,
            business_id: value.businessId,
          },
        }),
      );
      if (value.type !== 'EARN') continue;
      const previousLevel = levelAt(configurations, value.earnedTotalAfter - value.delta);
      const currentLevel = levelAt(configurations, value.earnedTotalAfter);
      if (currentLevel <= previousLevel) continue;
      activities.push(
        activity({
          id: `level:${value.id}`,
          type: 'LEVEL_ADVANCED',
          occurredAt: value.createdAt,
          child: value.user,
          entityType: 'user_level',
          entityId: value.user.id,
          targetUrl: '/levels',
          details: { previous_level: previousLevel, current_level: currentLevel },
        }),
      );
    }
    this.pushRedemptions(activities, redemptionRequests, 'REDEMPTION_REQUESTED', 'createdAt');
    this.pushRedemptions(activities, redemptionApprovals, 'REDEMPTION_APPROVED', 'approvedAt');
    this.pushRedemptions(activities, redemptionRejections, 'REDEMPTION_REJECTED', 'rejectedAt');
    this.pushRedemptions(activities, redemptionFulfillments, 'REDEMPTION_FULFILLED', 'fulfilledAt');
    this.pushWishes(activities, wishCreates, 'WISH_CREATED', 'createdAt');
    this.pushWishes(activities, wishAdoptions, 'WISH_ADOPTED', 'adoptedAt');
    this.pushWishes(activities, wishCancellations, 'WISH_CANCELLED', 'cancelledAt');
    this.pushMembers(activities, memberJoins, 'MEMBER_JOINED', 'createdAt');
    this.pushMembers(activities, memberDeactivations, 'MEMBER_DEACTIVATED', 'deletedAt');
    this.pushInvitations(activities, invitationCreates, 'INVITATION_CREATED', 'createdAt');
    this.pushInvitations(activities, invitationAcceptances, 'INVITATION_ACCEPTED', 'acceptedAt');
    this.pushInvitations(activities, invitationExpirations, 'INVITATION_EXPIRED', 'updatedAt');
    for (const award of badgeAwards) {
      activities.push(
        activity({
          id: `badge:${award.id}`,
          type: 'BADGE_AWARDED',
          occurredAt: award.awardedAt,
          actor: award.awardedBy,
          child: { ...award.child, role: 'CHILD' },
          entityType: 'badge_award',
          entityId: award.id,
          targetUrl: '/levels',
          details: { badge_id: award.badgeId, badge_name: award.badgeName },
        }),
      );
    }
    return activities
      .sort(
        (left, right) =>
          right.occurredAt.getTime() - left.occurredAt.getTime() ||
          (left.id === right.id ? 0 : left.id > right.id ? -1 : 1),
      )
      .slice(0, limit);
  }

  private redemptionsAt(
    familyId: string,
    field: 'createdAt' | 'approvedAt' | 'rejectedAt' | 'fulfilledAt',
    limit: number,
  ) {
    return this.prisma.redemption.findMany({
      where: { familyId, ...(field === 'createdAt' ? {} : { [field]: { not: null } }) },
      orderBy: [{ [field]: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        status: true,
        pointsSpent: true,
        createdAt: true,
        approvedAt: true,
        rejectedAt: true,
        fulfilledAt: true,
        child: { select: personSelect },
        approvedBy: { select: personSelect },
        rejectedBy: { select: personSelect },
        fulfilledBy: { select: personSelect },
        reward: { select: { id: true, name: true } },
      },
    });
  }

  private wishesAt(
    familyId: string,
    field: 'createdAt' | 'adoptedAt' | 'cancelledAt',
    limit: number,
  ) {
    return this.prisma.wish.findMany({
      where: {
        familyId,
        deletedAt: null,
        ...(field === 'createdAt' ? {} : { [field]: { not: null } }),
      },
      orderBy: [{ [field]: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        targetPoints: true,
        createdAt: true,
        adoptedAt: true,
        cancelledAt: true,
        child: { select: personSelect },
        adoptedRewardId: true,
      },
    });
  }

  private membersAt(familyId: string, field: 'createdAt' | 'deletedAt', limit: number) {
    return this.prisma.user.findMany({
      where: { familyId, ...(field === 'deletedAt' ? { deletedAt: { not: null } } : {}) },
      orderBy: [{ [field]: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { ...personSelect, createdAt: true, deletedAt: true },
    });
  }

  private invitationsAt(
    familyId: string,
    field: 'createdAt' | 'acceptedAt' | 'updatedAt',
    limit: number,
    status?: 'EXPIRED',
  ) {
    return this.prisma.invitation.findMany({
      where: {
        familyId,
        ...(status === undefined ? {} : { status }),
        ...(field === 'acceptedAt' ? { acceptedAt: { not: null } } : {}),
      },
      orderBy: [{ [field]: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        acceptedAt: true,
        invitedBy: { select: personSelect },
        invitedUser: { select: personSelect },
      },
    });
  }

  private pushRedemptions(
    target: DashboardActivity[],
    values: Awaited<ReturnType<PrismaDashboardRepository['redemptionsAt']>>,
    type:
      | 'REDEMPTION_REQUESTED'
      | 'REDEMPTION_APPROVED'
      | 'REDEMPTION_REJECTED'
      | 'REDEMPTION_FULFILLED',
    field: 'createdAt' | 'approvedAt' | 'rejectedAt' | 'fulfilledAt',
  ) {
    for (const value of values) {
      const occurredAt = value[field];
      if (!occurredAt) continue;
      const actor =
        field === 'createdAt'
          ? value.child
          : field === 'approvedAt'
            ? value.approvedBy
            : field === 'rejectedAt'
              ? value.rejectedBy
              : value.fulfilledBy;
      target.push(
        activity({
          id: `redemption:${field}:${value.id}`,
          type,
          occurredAt,
          actor,
          child: value.child,
          entityType: 'redemption',
          entityId: value.id,
          targetUrl: '/rewards',
          details: {
            reward_id: value.reward.id,
            reward_name: value.reward.name,
            points_spent: value.pointsSpent,
            status: value.status,
          },
        }),
      );
    }
  }

  private pushWishes(
    target: DashboardActivity[],
    values: Awaited<ReturnType<PrismaDashboardRepository['wishesAt']>>,
    type: 'WISH_CREATED' | 'WISH_ADOPTED' | 'WISH_CANCELLED',
    field: 'createdAt' | 'adoptedAt' | 'cancelledAt',
  ) {
    for (const value of values) {
      const occurredAt = value[field];
      if (!occurredAt) continue;
      target.push(
        activity({
          id: `wish:${field}:${value.id}`,
          type,
          occurredAt,
          actor: value.child,
          child: value.child,
          entityType: 'wish',
          entityId: value.id,
          targetUrl: '/rewards',
          details: {
            title: value.title,
            target_points: value.targetPoints,
            adopted_reward_id: value.adoptedRewardId,
          },
        }),
      );
    }
  }

  private pushMembers(
    target: DashboardActivity[],
    values: Awaited<ReturnType<PrismaDashboardRepository['membersAt']>>,
    type: 'MEMBER_JOINED' | 'MEMBER_DEACTIVATED',
    field: 'createdAt' | 'deletedAt',
  ) {
    for (const value of values) {
      const occurredAt = value[field];
      if (!occurredAt) continue;
      target.push(
        activity({
          id: `member:${field}:${value.id}`,
          type,
          occurredAt,
          child: value,
          entityType: 'user',
          entityId: value.id,
          targetUrl: '/family',
          details: { nickname: value.nickname, role: value.role },
        }),
      );
    }
  }

  private pushInvitations(
    target: DashboardActivity[],
    values: Awaited<ReturnType<PrismaDashboardRepository['invitationsAt']>>,
    type: 'INVITATION_CREATED' | 'INVITATION_ACCEPTED' | 'INVITATION_EXPIRED',
    field: 'createdAt' | 'acceptedAt' | 'updatedAt',
  ) {
    for (const value of values) {
      const occurredAt = value[field];
      if (!occurredAt) continue;
      target.push(
        activity({
          id: `invitation:${field}:${value.id}`,
          type,
          occurredAt,
          actor: type === 'INVITATION_ACCEPTED' ? value.invitedUser : value.invitedBy,
          entityType: 'invitation',
          entityId: value.id,
          targetUrl: '/family',
          details: { email: value.email },
        }),
      );
    }
  }
}
