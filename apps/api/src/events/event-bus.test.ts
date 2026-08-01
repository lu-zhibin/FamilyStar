import { describe, expect, it, vi } from 'vitest';

import { createDomainEvent } from '@familystar/shared';
import type { PluginManifest } from '@familystar/shared';

import { EVENT_BUS_ERROR_CODES, EventBus } from './event-bus.js';

const event = createDomainEvent({
  event_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f185',
  event_name: 'tasks.task.completed.v1',
  occurred_at: '2026-07-30T10:00:00.000Z',
  family_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f186',
  actor_id: null,
  correlation_id: 'request_123',
  payload: { points: 10 },
});

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: 'tasks',
    version: '1.0.0',
    capabilities: [],
    dependencies: [],
    permissions: [],
    subscribes: ['tasks.task.completed.v1'],
    publishes: ['tasks.task.completed.v1'],
    ...overrides,
  };
}

describe('EventBus', () => {
  it('publishes to async handlers in stable subscription order', async () => {
    const calls: string[] = [];
    const bus = new EventBus();
    const scope = bus.createScope(manifest());
    scope.subscribe(event.event_name, async () => {
      await Promise.resolve();
      calls.push('first');
    });
    scope.subscribe(event.event_name, () => {
      calls.push('second');
    });

    await scope.publish(event);

    expect(calls).toEqual(['first', 'second']);
  });

  it('uses a handler snapshot and supports idempotent unsubscribe', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const bus = new EventBus();
    const scope = bus.createScope(manifest());
    let unsubscribeSecond: () => void = () => undefined;
    scope.subscribe(event.event_name, () => {
      first();
      unsubscribeSecond();
    });
    unsubscribeSecond = scope.subscribe(event.event_name, second);

    await scope.publish(event);
    await scope.publish(event);
    unsubscribeSecond();

    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledOnce();
  });

  it('allows publishing events with no subscribers', async () => {
    const bus = new EventBus();
    await expect(bus.createScope(manifest()).publish(event)).resolves.toBeUndefined();
  });

  it('propagates handler failures and stops the current ordered dispatch', async () => {
    const failure = new Error('handler failed');
    const second = vi.fn();
    const scope = new EventBus().createScope(manifest());
    scope.subscribe(event.event_name, () => {
      throw failure;
    });
    scope.subscribe(event.event_name, second);

    await expect(scope.publish(event)).rejects.toBe(failure);
    expect(second).not.toHaveBeenCalled();
  });

  it('enforces manifest publish and subscribe declarations', async () => {
    const scope = new EventBus().createScope(manifest({ subscribes: [], publishes: [] }));

    expect(() => scope.subscribe(event.event_name, vi.fn())).toThrowError(
      expect.objectContaining({ code: EVENT_BUS_ERROR_CODES.SUBSCRIBE_DENIED }),
    );
    await expect(scope.publish(event)).rejects.toMatchObject({
      code: EVENT_BUS_ERROR_CODES.PUBLISH_DENIED,
      pluginName: 'tasks',
      eventName: event.event_name,
    });
  });

  it('allows the trusted Outbox publisher to replay domain events', async () => {
    const received = vi.fn();
    const bus = new EventBus();
    bus.createScope(manifest()).subscribe(event.event_name, received);

    await bus.createOutboxPublisher().publish(event);

    expect(received).toHaveBeenCalledWith(event);
  });

  it('removes an event bucket after its final subscription ends', async () => {
    const received = vi.fn();
    const bus = new EventBus();
    const unsubscribe = bus.createScope(manifest()).subscribe(event.event_name, received);

    unsubscribe();
    await bus.createOutboxPublisher().publish(event);

    expect(received).not.toHaveBeenCalled();
  });
});
