import type { DomainEvent, EventName } from '@familystar/shared';
import type { NotificationType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  InvalidNotificationEventError,
  NotificationEventConsumer,
  NOTIFICATION_EVENT_NAMES,
  registerNotificationEventConsumer,
} from './event-consumer.js';
import { EventBus } from '../events/event-bus.js';
import type { NotificationEventRepository } from './types.js';

const familyId = '00000000-0000-4000-8000-000000000001';
const childId = '00000000-0000-4000-8000-000000000002';
const parentId = '00000000-0000-4000-8000-000000000003';
const targetId = '00000000-0000-4000-8000-000000000004';
const eventId = '00000000-0000-4000-8000-000000000005';

function event(eventName: EventName, payload: DomainEvent['payload']): DomainEvent {
  return {
    event_id: eventId,
    event_name: eventName,
    occurred_at: '2026-08-07T12:00:00.000Z',
    family_id: familyId,
    actor_id: parentId,
    correlation_id: targetId,
    payload,
  };
}

function harness() {
  const repository: NotificationEventRepository = {
    listActiveParentIds: vi.fn().mockResolvedValue([parentId]),
    createFromEvent: vi.fn().mockResolvedValue(1),
  };
  return { repository, consumer: new NotificationEventConsumer(repository) };
}

const cases: readonly Readonly<{
  name: (typeof NOTIFICATION_EVENT_NAMES)[number];
  payload: DomainEvent['payload'];
  type: NotificationType;
  recipients: readonly string[];
}>[] = [
  {
    name: 'check-in.entry.approved.v1',
    payload: { child_id: childId, source_id: targetId, task_name: '阅读' },
    type: 'REVIEW',
    recipients: [childId],
  },
  {
    name: 'check-in.entry.rejected.v1',
    payload: { child_id: childId, source_id: targetId, task_name: '阅读' },
    type: 'REVIEW',
    recipients: [childId],
  },
  {
    name: 'points.balance.changed.v1',
    payload: { user_id: childId, delta: 5, balance_after: 20 },
    type: 'POINTS',
    recipients: [childId],
  },
  {
    name: 'levels.level.advanced.v1',
    payload: { user_id: childId, previous_level: 1, current_level: 2 },
    type: 'LEVEL',
    recipients: [childId, parentId],
  },
  {
    name: 'rewards.redemption.requested.v1',
    payload: { redemption_id: targetId, child_id: childId },
    type: 'REDEMPTION',
    recipients: [parentId],
  },
  {
    name: 'rewards.redemption.approved.v1',
    payload: { redemption_id: targetId, child_id: childId },
    type: 'REDEMPTION',
    recipients: [childId],
  },
  {
    name: 'rewards.redemption.rejected.v1',
    payload: { redemption_id: targetId, child_id: childId },
    type: 'REDEMPTION',
    recipients: [childId],
  },
  {
    name: 'rewards.redemption.fulfilled.v1',
    payload: { redemption_id: targetId, child_id: childId },
    type: 'REDEMPTION',
    recipients: [childId],
  },
  {
    name: 'rewards.wish.adopted.v1',
    payload: { wish_id: targetId, child_id: childId, wish_title: '望远镜' },
    type: 'WISH',
    recipients: [childId],
  },
  {
    name: 'rewards.wish.cancelled.v1',
    payload: { wish_id: targetId, child_id: childId, wish_title: '望远镜' },
    type: 'WISH',
    recipients: [parentId],
  },
  {
    name: 'badges.award.created.v1',
    payload: { award_id: targetId, child_id: childId, badge_name: '坚持之星' },
    type: 'BADGE',
    recipients: [childId, parentId],
  },
  {
    name: 'family.invitation.created.v1',
    payload: { invitation_id: targetId, email: 'parent@example.com' },
    type: 'INVITATION',
    recipients: [parentId],
  },
  {
    name: 'family.invitation.resent.v1',
    payload: { invitation_id: targetId, email: 'parent@example.com' },
    type: 'INVITATION',
    recipients: [parentId],
  },
  {
    name: 'family.invitation.revoked.v1',
    payload: { invitation_id: targetId, email: 'parent@example.com' },
    type: 'INVITATION',
    recipients: [parentId],
  },
  {
    name: 'family.invitation.accepted.v1',
    payload: { invitation_id: targetId, email: 'parent@example.com' },
    type: 'INVITATION',
    recipients: [parentId],
  },
];

describe('NotificationEventConsumer', () => {
  it.each(cases)('maps $name to an idempotent $type notification write', async (testCase) => {
    const { consumer, repository } = harness();

    await expect(consumer.handle(event(testCase.name, testCase.payload))).resolves.toEqual({
      created: 1,
    });
    expect(repository.createFromEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId,
        recipientIds: testCase.recipients,
        type: testCase.type,
        sourceEventId: eventId,
        sourceEventName: testCase.name,
        createdAt: new Date('2026-08-07T12:00:00.000Z'),
      }),
    );
  });

  it('ignores events outside the registered notification contract', async () => {
    const { consumer, repository } = harness();

    await expect(consumer.handle(event('tasks.task.created.v1', {}))).resolves.toBe('ignored');
    expect(repository.createFromEvent).not.toHaveBeenCalled();
  });

  it('rejects an invalid registered payload before writing', async () => {
    const { consumer, repository } = harness();

    await expect(
      consumer.handle(event('points.balance.changed.v1', { user_id: 'invalid' })),
    ).rejects.toBeInstanceOf(InvalidNotificationEventError);
    expect(repository.createFromEvent).not.toHaveBeenCalled();
  });

  it('registers every notification event on the Outbox event bus', async () => {
    const eventBus = new EventBus();
    const consume = vi.fn().mockResolvedValue('processed');
    registerNotificationEventConsumer(eventBus, { consume });
    const publisher = eventBus.createOutboxPublisher();

    for (const eventName of NOTIFICATION_EVENT_NAMES) {
      await publisher.publish(event(eventName, {}));
    }

    expect(consume).toHaveBeenCalledTimes(NOTIFICATION_EVENT_NAMES.length);
    expect(consume.mock.calls.map(([value]) => value.event_name)).toEqual(NOTIFICATION_EVENT_NAMES);
  });
});
