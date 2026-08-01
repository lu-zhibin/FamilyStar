import { describe, expect, it } from 'vitest';

import { createDomainEvent, isEventName, parseEventName } from './events.js';
import type { DomainEvent, EventName, EventPayload, JsonValue } from './events.js';

const eventInput = {
  event_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f185',
  event_name: 'check-in.entry.completed.v1',
  occurred_at: '2026-07-30T10:00:00.000Z',
  family_id: '018f47a8-7b21-7cc2-9a4d-8f92fa16f186',
  actor_id: null,
  correlation_id: 'request_123',
  payload: { points: 10, tags: ['study'], metadata: { approved: true } },
} as const satisfies DomainEvent<EventName, EventPayload>;

describe('event contracts', () => {
  it('parses versioned names and accepts hyphenated namespaces', () => {
    expect(isEventName(eventInput.event_name)).toBe(true);
    expect(parseEventName(eventInput.event_name)).toEqual({
      namespace: 'check-in',
      entity: 'entry',
      action: 'completed',
      version: 1,
    });
  });

  it.each([
    'checkin.completed',
    'checkin.entry.completed',
    'checkin.entry.completed.v0',
    'Checkin.entry.completed.v1',
    'checkin.entry.completed.v1.extra',
  ])('rejects invalid event name %s', (eventName) => {
    expect(isEventName(eventName)).toBe(false);
    expect(() => parseEventName(eventName)).toThrow('<module>.<entity>.<event>.v<version>');
  });

  it('creates a deeply immutable event snapshot', () => {
    const source = {
      ...eventInput,
      payload: { points: 10, tags: ['study'], metadata: { approved: true } },
    };
    const event = createDomainEvent(source);

    source.payload.points = 20;
    source.payload.tags.push('sport');

    expect(event.payload).toEqual({
      points: 10,
      tags: ['study'],
      metadata: { approved: true },
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(Object.isFrozen(event.payload.tags)).toBe(true);
    expect(Object.isFrozen(event.payload.metadata)).toBe(true);
  });

  it.each([
    ['event ID', { event_id: 'invalid' }],
    ['family ID', { family_id: 'invalid' }],
    ['actor ID', { actor_id: 'invalid' }],
    ['correlation ID', { correlation_id: 'contains spaces' }],
    ['occurrence time', { occurred_at: '2026-07-30T10:00:00+08:00' }],
    ['payload object', { payload: [] }],
  ])('rejects an invalid %s', (_label, override) => {
    expect(() => createDomainEvent({ ...eventInput, ...override } as typeof eventInput)).toThrow();
  });

  it.each([
    ['non-finite number', { value: Number.POSITIVE_INFINITY }],
    ['unsupported value', { value: undefined }],
    ['non-plain object', { value: new Date() }],
  ])('rejects a payload containing a %s', (_label, payload) => {
    expect(() =>
      createDomainEvent({ ...eventInput, payload: payload as unknown as EventPayload }),
    ).toThrow();
  });

  it('rejects circular payloads', () => {
    const payload: Record<string, JsonValue> = {};
    payload.self = payload;

    expect(() => createDomainEvent({ ...eventInput, payload })).toThrow('circular references');
  });
});
