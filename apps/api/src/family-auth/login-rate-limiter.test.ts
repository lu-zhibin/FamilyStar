import { describe, expect, it } from 'vitest';

import { createRedisKeyspace } from '../infrastructure/redis/keys.js';
import type { RedisCommandPort } from '../infrastructure/redis/primitives.js';
import { CHILD_LOGIN_RATE_LIMIT, CHILD_LOGIN_RATE_WINDOW_SECONDS } from './constants.js';
import { RedisChildLoginRateLimiter } from './login-rate-limiter.js';

describe('RedisChildLoginRateLimiter', () => {
  it('uses a family and child scoped ten-attempt fifteen-minute window', async () => {
    const commands: string[][] = [];
    const redis: RedisCommandPort = {
      async sendCommand(arguments_) {
        commands.push([...arguments_]);
        return [11, 321];
      },
    };
    const limiter = new RedisChildLoginRateLimiter(redis, createRedisKeyspace('test'));

    await expect(limiter.consume('family-1', 'child-1')).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 321,
    });
    expect(commands[0]).toEqual([
      'EVAL',
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      '1',
      'test:rate-limit:child-login:family-1:child-1',
      String(CHILD_LOGIN_RATE_WINDOW_SECONDS),
    ]);
    expect(CHILD_LOGIN_RATE_LIMIT).toBe(10);
  });
});
