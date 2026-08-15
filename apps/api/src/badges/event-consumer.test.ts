import { createDomainEvent } from '@familystar/shared';
import { describe, expect, it, vi } from 'vitest';

import { BadgeEventConsumer } from './event-consumer.js';
import type { BadgeRepository } from './types.js';

describe('BadgeEventConsumer', () => {
  it('deduplicates affected children and evaluates within the event family', async () => {
    const repository = {
      findEventChildIds: vi.fn().mockResolvedValue(['child-a', 'child-a', 'child-b']),
      evaluateChild: vi
        .fn()
        .mockResolvedValueOnce({ evaluated: 6, awarded: 2 })
        .mockResolvedValueOnce({ evaluated: 6, awarded: 0 }),
    } as unknown as BadgeRepository;
    const now = new Date('2026-08-06T08:00:00.000Z');
    const consumer = new BadgeEventConsumer(repository, () => now);
    const event = createDomainEvent({
      event_id: '00000000-0000-4000-8000-000000000001',
      event_name: 'check-in.collaboration.completed.v1',
      occurred_at: '2026-08-06T08:00:00.000Z',
      family_id: '00000000-0000-4000-8000-000000000002',
      actor_id: null,
      correlation_id: 'round-a',
      payload: { round_id: '00000000-0000-4000-8000-000000000003' },
    });

    await expect(consumer.handle(event)).resolves.toEqual({
      children: 2,
      evaluated: 12,
      awarded: 2,
    });
    expect(repository.evaluateChild).toHaveBeenCalledTimes(2);
    expect(repository.evaluateChild).toHaveBeenCalledWith({
      familyId: event.family_id,
      childId: 'child-a',
      sourceEventId: event.event_id,
      now,
    });
  });

  it('ignores unrelated events', async () => {
    const repository = {
      findEventChildIds: vi.fn(),
      evaluateChild: vi.fn(),
    } as unknown as BadgeRepository;
    const consumer = new BadgeEventConsumer(repository);
    const event = createDomainEvent({
      event_id: '00000000-0000-4000-8000-000000000001',
      event_name: 'rewards.redemption.requested.v1',
      occurred_at: '2026-08-06T08:00:00.000Z',
      family_id: '00000000-0000-4000-8000-000000000002',
      actor_id: null,
      correlation_id: 'redemption-a',
      payload: {},
    });

    await expect(consumer.handle(event)).resolves.toEqual({
      children: 0,
      evaluated: 0,
      awarded: 0,
    });
    expect(repository.findEventChildIds).not.toHaveBeenCalled();
  });

  it('property: repeated delivery of one event reports one award for every replay count', async () => {
    for (let replayCount = 2; replayCount <= 20; replayCount += 1) {
      let awarded = false;
      const repository = {
        findEventChildIds: vi.fn().mockResolvedValue(['child-a']),
        evaluateChild: vi.fn().mockImplementation(async () => {
          if (awarded) return { evaluated: 1, awarded: 0 };
          awarded = true;
          return { evaluated: 1, awarded: 1 };
        }),
      } as unknown as BadgeRepository;
      const consumer = new BadgeEventConsumer(repository);
      const event = createDomainEvent({
        event_id: '00000000-0000-4000-8000-000000000001',
        event_name: 'points.balance.changed.v1',
        occurred_at: '2026-08-06T08:00:00.000Z',
        family_id: '00000000-0000-4000-8000-000000000002',
        actor_id: null,
        correlation_id: 'points-a',
        payload: { user_id: 'child-a' },
      });

      const results = await Promise.all(
        Array.from({ length: replayCount }, () => consumer.handle(event)),
      );

      expect(results.reduce((sum, result) => sum + result.awarded, 0)).toBe(1);
      expect(repository.evaluateChild).toHaveBeenCalledTimes(replayCount);
      expect(repository.evaluateChild).toHaveBeenLastCalledWith(
        expect.objectContaining({
          familyId: event.family_id,
          childId: 'child-a',
          sourceEventId: event.event_id,
        }),
      );
    }
  });
});
