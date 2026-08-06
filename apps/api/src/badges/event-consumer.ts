import type { DomainEvent, EventName } from '@familystar/shared';

import type { BadgeRepository } from './types.js';

export const BADGE_EVENT_NAMES = Object.freeze([
  'points.balance.changed.v1',
  'levels.level.advanced.v1',
  'check-in.collaboration.completed.v1',
] as const satisfies readonly EventName[]);

const BADGE_EVENT_NAME_SET = new Set<string>(BADGE_EVENT_NAMES);

export class BadgeEventConsumer {
  constructor(
    private readonly repository: BadgeRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async handle(event: DomainEvent): Promise<{
    children: number;
    evaluated: number;
    awarded: number;
  }> {
    if (!BADGE_EVENT_NAME_SET.has(event.event_name)) {
      return { children: 0, evaluated: 0, awarded: 0 };
    }
    const childIds = await this.repository.findEventChildIds(
      event.family_id,
      event.event_name,
      event.payload,
    );
    let evaluated = 0;
    let awarded = 0;
    for (const childId of new Set(childIds)) {
      const result = await this.repository.evaluateChild({
        familyId: event.family_id,
        childId,
        sourceEventId: event.event_id,
        now: this.now(),
      });
      evaluated += result.evaluated;
      awarded += result.awarded;
    }
    return { children: new Set(childIds).size, evaluated, awarded };
  }
}
