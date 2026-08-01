import type { RedisKeyspace } from '../infrastructure/redis/keys.js';
import type { RedisCommandPort } from '../infrastructure/redis/primitives.js';
import { consumeRateLimit } from '../infrastructure/redis/primitives.js';
import { CHILD_LOGIN_RATE_LIMIT, CHILD_LOGIN_RATE_WINDOW_SECONDS } from './constants.js';
import type { ChildLoginRateLimiter } from './child-types.js';

export class RedisChildLoginRateLimiter implements ChildLoginRateLimiter {
  constructor(
    private readonly redis: RedisCommandPort,
    private readonly keyspace: RedisKeyspace,
  ) {}

  async consume(familyId: string, childId: string) {
    const result = await consumeRateLimit(
      this.redis,
      this.keyspace.rateLimit('child-login', familyId, childId),
      CHILD_LOGIN_RATE_LIMIT,
      CHILD_LOGIN_RATE_WINDOW_SECONDS,
    );
    return { allowed: result.allowed, retryAfterSeconds: result.retryAfterSeconds };
  }
}
