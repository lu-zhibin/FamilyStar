import type { RedisKeyspace } from '../infrastructure/redis/keys.js';
import {
  claimIdempotencyReceipt,
  releaseIdempotencyReceipt,
  type RedisCommandPort,
} from '../infrastructure/redis/primitives.js';
import type { EventReceiptStore } from './idempotent-consumer.js';

export class RedisEventReceiptStore implements EventReceiptStore {
  constructor(
    private readonly redis: RedisCommandPort,
    private readonly keys: RedisKeyspace,
  ) {}

  claim(
    consumer: string,
    eventId: string,
    ownerToken: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    return claimIdempotencyReceipt(
      this.redis,
      this.keys.idempotency(consumer, eventId),
      ownerToken,
      ttlSeconds,
    );
  }

  release(consumer: string, eventId: string, ownerToken: string): Promise<boolean> {
    return releaseIdempotencyReceipt(
      this.redis,
      this.keys.idempotency(consumer, eventId),
      ownerToken,
    );
  }
}
