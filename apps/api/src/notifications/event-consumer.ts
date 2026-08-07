import type { DomainEvent, EventName } from '@familystar/shared';
import type { NotificationType } from '@prisma/client';
import { z } from 'zod';

import { CHECK_IN_APPROVED_EVENT, CHECK_IN_REJECTED_EVENT } from '../check-ins/events.js';
import {
  INVITATION_ACCEPTED_EVENT,
  INVITATION_CREATED_EVENT,
  INVITATION_RESENT_EVENT,
  INVITATION_REVOKED_EVENT,
} from '../family-auth/invitation-events.js';
import type { NotificationEventRepository } from './types.js';
import type { EventBus } from '../events/event-bus.js';

export const NOTIFICATION_EVENT_NAMES = Object.freeze([
  CHECK_IN_APPROVED_EVENT,
  CHECK_IN_REJECTED_EVENT,
  'points.balance.changed.v1',
  'levels.level.advanced.v1',
  'rewards.redemption.requested.v1',
  'rewards.redemption.approved.v1',
  'rewards.redemption.rejected.v1',
  'rewards.redemption.fulfilled.v1',
  'rewards.wish.adopted.v1',
  'rewards.wish.cancelled.v1',
  'badges.award.created.v1',
  INVITATION_CREATED_EVENT,
  INVITATION_RESENT_EVENT,
  INVITATION_REVOKED_EVENT,
  INVITATION_ACCEPTED_EVENT,
] as const satisfies readonly EventName[]);

const notificationEventNames = new Set<string>(NOTIFICATION_EVENT_NAMES);
const pointsSchema = z
  .object({ user_id: z.string().uuid(), delta: z.number().int(), balance_after: z.number().int() })
  .passthrough();
const levelSchema = z
  .object({
    user_id: z.string().uuid(),
    previous_level: z.number().int().positive(),
    current_level: z.number().int().positive(),
  })
  .passthrough();
const approvalSchema = z
  .object({
    child_id: z.string().uuid(),
    source_id: z.string().uuid(),
    task_name: z.string().min(1),
  })
  .passthrough();
const rejectionSchema = z
  .object({
    child_id: z.string().uuid(),
    source_id: z.string().uuid(),
    task_name: z.string().min(1),
  })
  .passthrough();
const redemptionSchema = z
  .object({ redemption_id: z.string().uuid(), child_id: z.string().uuid() })
  .passthrough();
const wishSchema = z
  .object({
    wish_id: z.string().uuid(),
    child_id: z.string().uuid(),
    wish_title: z.string().min(1),
  })
  .passthrough();
const badgeSchema = z
  .object({
    award_id: z.string().uuid(),
    child_id: z.string().uuid(),
    badge_name: z.string().min(1),
  })
  .passthrough();
const invitationSchema = z
  .object({ invitation_id: z.string().uuid(), email: z.string().email() })
  .passthrough();

type NotificationDraft = Readonly<{
  recipients: 'child' | 'parents' | 'child-and-parents';
  childId?: string;
  type: NotificationType;
  title: string;
  content: string;
  targetType: string;
  targetId: string | null;
  targetUrl: string;
}>;

export class InvalidNotificationEventError extends Error {
  constructor(eventName: string) {
    super(`Notification event ${eventName} has an invalid payload.`);
    this.name = 'InvalidNotificationEventError';
  }
}

function parse<T>(event: DomainEvent, schema: z.ZodType<T>): T {
  const result = schema.safeParse(event.payload);
  if (!result.success) throw new InvalidNotificationEventError(event.event_name);
  return result.data;
}

function draft(event: DomainEvent): NotificationDraft {
  if (event.event_name === CHECK_IN_APPROVED_EVENT) {
    const payload = parse(event, approvalSchema);
    return {
      recipients: 'child',
      childId: payload.child_id,
      type: 'REVIEW',
      title: '审核已通过',
      content: `${payload.task_name}已通过审核`,
      targetType: 'CHECK_IN',
      targetId: payload.source_id,
      targetUrl: '/tasks',
    };
  }
  if (event.event_name === CHECK_IN_REJECTED_EVENT) {
    const payload = parse(event, rejectionSchema);
    return {
      recipients: 'child',
      childId: payload.child_id,
      type: 'REVIEW',
      title: '审核未通过',
      content: `${payload.task_name}需要重新提交`,
      targetType: 'CHECK_IN',
      targetId: payload.source_id,
      targetUrl: '/tasks',
    };
  }
  if (event.event_name === 'points.balance.changed.v1') {
    const payload = parse(event, pointsSchema);
    const action = payload.delta >= 0 ? `增加 ${payload.delta}` : `减少 ${Math.abs(payload.delta)}`;
    return {
      recipients: 'child',
      childId: payload.user_id,
      type: 'POINTS',
      title: '积分变动',
      content: `积分${action}，当前余额 ${payload.balance_after}`,
      targetType: 'POINTS',
      targetId: null,
      targetUrl: '/points',
    };
  }
  if (event.event_name === 'levels.level.advanced.v1') {
    const payload = parse(event, levelSchema);
    return {
      recipients: 'child-and-parents',
      childId: payload.user_id,
      type: 'LEVEL',
      title: '等级提升',
      content: `等级已提升至 ${payload.current_level} 级`,
      targetType: 'LEVEL',
      targetId: null,
      targetUrl: '/levels',
    };
  }
  if (event.event_name.startsWith('rewards.redemption.')) {
    const payload = parse(event, redemptionSchema);
    const status = event.event_name.split('.')[2];
    const copy =
      status === 'requested'
        ? ['兑换申请', '孩子提交了新的兑换申请']
        : status === 'approved'
          ? ['兑换已批准', '兑换申请已通过']
          : status === 'rejected'
            ? ['兑换未批准', '兑换申请未通过']
            : ['兑换已完成', '奖励已经兑现'];
    return {
      recipients: status === 'requested' ? 'parents' : 'child',
      childId: payload.child_id,
      type: 'REDEMPTION',
      title: copy[0] as string,
      content: copy[1] as string,
      targetType: 'REDEMPTION',
      targetId: payload.redemption_id,
      targetUrl: '/rewards',
    };
  }
  if (event.event_name.startsWith('rewards.wish.')) {
    const payload = parse(event, wishSchema);
    const adopted = event.event_name === 'rewards.wish.adopted.v1';
    return {
      recipients: adopted ? 'child' : 'parents',
      childId: payload.child_id,
      type: 'WISH',
      title: adopted ? '愿望已采纳' : '愿望已取消',
      content: `${payload.wish_title}${adopted ? '已加入奖励库' : '已取消'}`,
      targetType: 'WISH',
      targetId: payload.wish_id,
      targetUrl: '/rewards',
    };
  }
  if (event.event_name === 'badges.award.created.v1') {
    const payload = parse(event, badgeSchema);
    return {
      recipients: 'child-and-parents',
      childId: payload.child_id,
      type: 'BADGE',
      title: '获得新徽章',
      content: `获得徽章：${payload.badge_name}`,
      targetType: 'BADGE_AWARD',
      targetId: payload.award_id,
      targetUrl: '/badges',
    };
  }
  const payload = parse(event, invitationSchema);
  const action =
    event.event_name === INVITATION_CREATED_EVENT
      ? '已创建'
      : event.event_name === INVITATION_RESENT_EVENT
        ? '已重新发送'
        : event.event_name === INVITATION_REVOKED_EVENT
          ? '已撤销'
          : '已接受';
  return {
    recipients: 'parents',
    type: 'INVITATION',
    title: `家庭邀请${action}`,
    content: `${payload.email} 的邀请${action}`,
    targetType: 'INVITATION',
    targetId: payload.invitation_id,
    targetUrl: '/family',
  };
}

export class NotificationEventConsumer {
  constructor(private readonly repository: NotificationEventRepository) {}

  async handle(event: DomainEvent): Promise<{ created: number } | 'ignored'> {
    if (!notificationEventNames.has(event.event_name)) return 'ignored';
    const value = draft(event);
    const parentIds =
      value.recipients === 'child'
        ? []
        : await this.repository.listActiveParentIds(event.family_id);
    const recipientIds =
      value.recipients === 'parents'
        ? parentIds
        : value.recipients === 'child'
          ? [value.childId as string]
          : [value.childId as string, ...parentIds];
    const created = await this.repository.createFromEvent({
      familyId: event.family_id,
      recipientIds,
      type: value.type,
      title: value.title,
      content: value.content,
      targetType: value.targetType,
      targetId: value.targetId,
      targetUrl: value.targetUrl,
      sourceEventId: event.event_id,
      sourceEventName: event.event_name,
      createdAt: new Date(event.occurred_at),
    });
    return { created };
  }
}

export function registerNotificationEventConsumer(
  eventBus: EventBus,
  consumer: Readonly<{ consume(event: DomainEvent): Promise<unknown> }>,
): void {
  const scope = eventBus.createScope({
    name: 'notification-projector',
    version: '1.0.0',
    capabilities: ['notification-projection'],
    dependencies: [],
    permissions: [],
    publishes: [],
    subscribes: NOTIFICATION_EVENT_NAMES,
  });
  for (const eventName of NOTIFICATION_EVENT_NAMES) {
    scope.subscribe(eventName, async (event) => {
      await consumer.consume(event);
    });
  }
}
