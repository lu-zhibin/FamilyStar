import { describe, expect, it, vi } from 'vitest';

import { createRedisKeyspace } from '../infrastructure/redis/keys.js';
import { RedisEventReceiptStore } from './redis-event-receipts.js';

describe('RedisEventReceiptStore', () => {
  it('claims and owner-releases namespaced receipts', async () => {
    const redis = { sendCommand: vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(1) };
    const store = new RedisEventReceiptStore(redis, createRedisKeyspace('familystar_test'));

    await expect(store.claim('points projector', 'event/1', 'owner-1', 60)).resolves.toBe(true);
    await expect(store.release('points projector', 'event/1', 'owner-1')).resolves.toBe(true);
    expect(redis.sendCommand).toHaveBeenNthCalledWith(1, [
      'SET',
      'familystar_test:idempotency:points%20projector:event%2F1',
      'owner-1',
      'EX',
      '60',
      'NX',
    ]);
    expect(redis.sendCommand.mock.calls[1]?.[0]).toEqual([
      'EVAL',
      expect.stringContaining("redis.call('GET', KEYS[1])"),
      '1',
      'familystar_test:idempotency:points%20projector:event%2F1',
      'owner-1',
    ]);
  });
});
