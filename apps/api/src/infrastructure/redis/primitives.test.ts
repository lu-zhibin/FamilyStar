import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acquireLock,
  claimIdempotency,
  claimIdempotencyReceipt,
  consumeRateLimit,
  createRedisCommandPort,
  deleteSession,
  getJsonCache,
  incrementCounter,
  readCounter,
  readSession,
  releaseIdempotencyReceipt,
  releaseLock,
  setJsonCache,
  touchSession,
  writeSession,
} from './primitives.js';
import type { RedisCommandPort } from './primitives.js';

describe('Redis primitives', () => {
  const sendCommand = vi.fn<RedisCommandPort['sendCommand']>();
  const redis: RedisCommandPort = { sendCommand };

  beforeEach(() => {
    sendCommand.mockReset();
  });

  it('adapts a node-redis client to the command port', async () => {
    const client = { sendCommand: vi.fn().mockResolvedValue('PONG') };
    const port = createRedisCommandPort(client);

    await expect(port.sendCommand(['PING'])).resolves.toBe('PONG');
    expect(client.sendCommand).toHaveBeenCalledWith(['PING']);
  });

  it('stores, reads and deletes expiring sessions', async () => {
    sendCommand.mockResolvedValueOnce('OK').mockResolvedValueOnce('session-value');
    sendCommand.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await writeSession(redis, 'familystar:session:1', 'session-value', 3_600);
    await expect(readSession(redis, 'familystar:session:1')).resolves.toBe('session-value');
    await expect(deleteSession(redis, 'familystar:session:1')).resolves.toBe(true);
    await expect(deleteSession(redis, 'familystar:session:missing')).resolves.toBe(false);

    expect(sendCommand.mock.calls).toEqual([
      [['SET', 'familystar:session:1', 'session-value', 'EX', '3600']],
      [['GET', 'familystar:session:1']],
      [['DEL', 'familystar:session:1']],
      [['DEL', 'familystar:session:missing']],
    ]);
  });

  it('handles missing sessions and rejects invalid session replies', async () => {
    sendCommand.mockResolvedValueOnce(null).mockResolvedValueOnce({ value: 'unexpected' });

    await expect(readSession(redis, 'session')).resolves.toBeNull();
    await expect(readSession(redis, 'session')).rejects.toThrow('invalid session reply');
  });

  it('touches session TTL and manages non-negative counters', async () => {
    sendCommand.mockResolvedValueOnce(1).mockResolvedValueOnce(null).mockResolvedValueOnce('3');
    sendCommand.mockResolvedValueOnce(4);

    await expect(touchSession(redis, 'session', 60)).resolves.toBe(true);
    await expect(readCounter(redis, 'revision')).resolves.toBe(0);
    await expect(readCounter(redis, 'revision')).resolves.toBe(3);
    await expect(incrementCounter(redis, 'revision')).resolves.toBe(4);
    expect(sendCommand.mock.calls).toEqual([
      [['EXPIRE', 'session', '60']],
      [['GET', 'revision']],
      [['GET', 'revision']],
      [['INCR', 'revision']],
    ]);
  });

  it('claims idempotency markers with atomic expiration', async () => {
    sendCommand.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    await expect(claimIdempotency(redis, 'idempotency', 86_400)).resolves.toBe(true);
    await expect(claimIdempotency(redis, 'idempotency', 86_400)).resolves.toBe(false);
    expect(sendCommand).toHaveBeenCalledWith(['SET', 'idempotency', '1', 'EX', '86400', 'NX']);
  });

  it('claims and owner-releases idempotency receipts', async () => {
    sendCommand.mockResolvedValueOnce('OK').mockResolvedValueOnce(null).mockResolvedValueOnce(1);

    await expect(claimIdempotencyReceipt(redis, 'receipt', 'owner-1', 60)).resolves.toBe(true);
    await expect(claimIdempotencyReceipt(redis, 'receipt', 'owner-2', 60)).resolves.toBe(false);
    await expect(releaseIdempotencyReceipt(redis, 'receipt', 'owner-1')).resolves.toBe(true);
  });

  it('rejects an empty idempotency receipt owner', async () => {
    await expect(claimIdempotencyReceipt(redis, 'receipt', '', 60)).rejects.toThrow(
      'owner token must not be empty',
    );
  });

  it('acquires and owner-releases scheduler locks atomically', async () => {
    sendCommand.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    sendCommand.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(acquireLock(redis, 'lock', 'owner-1', 30_000)).resolves.toBe(true);
    await expect(acquireLock(redis, 'lock', 'owner-2', 30_000)).resolves.toBe(false);
    await expect(releaseLock(redis, 'lock', 'owner-1')).resolves.toBe(true);
    await expect(releaseLock(redis, 'lock', 'owner-2')).resolves.toBe(false);

    expect(sendCommand.mock.calls[0]?.[0]).toEqual(['SET', 'lock', 'owner-1', 'PX', '30000', 'NX']);
    expect(sendCommand.mock.calls[2]?.[0]).toEqual([
      'EVAL',
      expect.stringContaining("redis.call('GET', KEYS[1])"),
      '1',
      'lock',
      'owner-1',
    ]);
  });

  it('consumes a fixed-window rate limit and reports remaining capacity', async () => {
    sendCommand.mockResolvedValueOnce([2, 45]).mockResolvedValueOnce([4, 40]);

    await expect(consumeRateLimit(redis, 'rate-limit', 3, 60)).resolves.toEqual({
      allowed: true,
      consumed: 2,
      remaining: 1,
      retryAfterSeconds: 45,
    });
    await expect(consumeRateLimit(redis, 'rate-limit', 3, 60)).resolves.toEqual({
      allowed: false,
      consumed: 4,
      remaining: 0,
      retryAfterSeconds: 40,
    });
    expect(sendCommand.mock.calls[0]?.[0]).toEqual([
      'EVAL',
      expect.stringContaining("redis.call('INCR', KEYS[1])"),
      '1',
      'rate-limit',
      '60',
    ]);
  });

  it('uses the configured window if Redis reports an expired rate-limit key', async () => {
    sendCommand.mockResolvedValue([-1, 0]);

    await expect(consumeRateLimit(redis, 'rate-limit', 3, 60)).resolves.toMatchObject({
      retryAfterSeconds: 60,
    });
  });

  it('rejects malformed numeric and rate-limit replies', async () => {
    sendCommand.mockResolvedValueOnce('not-an-integer').mockResolvedValueOnce([1]);
    sendCommand.mockResolvedValueOnce(['invalid-count', 60]);

    await expect(deleteSession(redis, 'session')).rejects.toThrow('invalid delete reply');
    await expect(consumeRateLimit(redis, 'rate-limit', 3, 60)).rejects.toThrow(
      'invalid rate-limit reply',
    );
    await expect(consumeRateLimit(redis, 'rate-limit', 3, 60)).rejects.toThrow(
      'invalid rate-limit count reply',
    );
  });

  it.each([
    ['session', () => writeSession(redis, 'session', 'value', 0)],
    ['idempotency', () => claimIdempotency(redis, 'marker', -1)],
    ['lock', () => acquireLock(redis, 'lock', 'owner', 1.5)],
    ['rate limit', () => consumeRateLimit(redis, 'rate', 0, 60)],
    ['rate window', () => consumeRateLimit(redis, 'rate', 3, Number.MAX_SAFE_INTEGER + 1)],
    ['cache', () => setJsonCache(redis, 'cache', {}, 0)],
  ])('rejects an invalid %s TTL or limit', async (_label, operation) => {
    await expect(operation()).rejects.toThrow('positive safe integer');
  });

  it('round-trips JSON cache payloads and handles a cache miss', async () => {
    sendCommand.mockResolvedValueOnce('OK').mockResolvedValueOnce('{"count":2}');
    sendCommand.mockResolvedValueOnce(null);

    await setJsonCache(redis, 'cache', { count: 2 }, 300);
    await expect(getJsonCache<{ count: number }>(redis, 'cache')).resolves.toEqual({ count: 2 });
    await expect(getJsonCache(redis, 'missing')).resolves.toBeNull();
    expect(sendCommand.mock.calls[0]?.[0]).toEqual(['SET', 'cache', '{"count":2}', 'EX', '300']);
  });

  it('rejects unsupported or malformed cache payloads', async () => {
    await expect(setJsonCache(redis, 'cache', undefined, 300)).rejects.toThrow('JSON serializable');

    sendCommand.mockResolvedValueOnce(42).mockResolvedValueOnce('{malformed');
    await expect(getJsonCache(redis, 'cache')).rejects.toThrow('invalid cache reply');
    await expect(getJsonCache(redis, 'cache')).rejects.toThrow('malformed cached JSON');
  });
});
