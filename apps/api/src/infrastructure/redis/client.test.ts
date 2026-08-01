import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  client: {
    isOpen: false,
    connect: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('redis', () => ({ createClient: redisMocks.createClient }));

import {
  connectRedis,
  createRedisConnection,
  disconnectRedis,
  redisReconnectStrategy,
} from './client.js';

describe('Redis client lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.client.isOpen = false;
    redisMocks.createClient.mockReturnValue(redisMocks.client);
    redisMocks.client.on.mockReturnValue(redisMocks.client);
  });

  it('creates a fail-fast client with bounded reconnect backoff', () => {
    const client = createRedisConnection({ url: 'redis://cache.internal:6379' });

    expect(client).toBe(redisMocks.client);
    expect(redisMocks.createClient).toHaveBeenCalledWith({
      url: 'redis://cache.internal:6379',
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 5_000,
        reconnectStrategy: redisReconnectStrategy,
      },
    });
    expect(redisReconnectStrategy(0)).toBe(100);
    expect(redisReconnectStrategy(4)).toBe(1_600);
    expect(redisReconnectStrategy(10)).toBe(3_000);
  });

  it('passes client errors to an injected safe handler', () => {
    const onError = vi.fn();
    createRedisConnection({ url: 'redis://localhost:6379', onError });
    const errorListener = redisMocks.client.on.mock.calls[0]?.[1] as (error: Error) => void;
    const error = new Error('private connection detail');

    errorListener(error);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it('logs only structured non-sensitive error metadata by default', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createRedisConnection({ url: 'redis://user:secret@localhost:6379' });
    const errorListener = redisMocks.client.on.mock.calls[0]?.[1] as (error: Error) => void;

    errorListener(new TypeError('redis://user:secret@localhost:6379'));

    const log = errorSpy.mock.calls[0]?.[0] as string;
    expect(JSON.parse(log)).toMatchObject({
      level: 'error',
      event: 'redis_client_error',
      error_name: 'TypeError',
    });
    expect(log).not.toContain('secret');
    errorSpy.mockRestore();
  });

  it('connects and disconnects only when the socket state requires it', async () => {
    await connectRedis(redisMocks.client);
    expect(redisMocks.client.connect).toHaveBeenCalledOnce();

    redisMocks.client.isOpen = true;
    await connectRedis(redisMocks.client);
    expect(redisMocks.client.connect).toHaveBeenCalledOnce();

    disconnectRedis(redisMocks.client);
    expect(redisMocks.client.destroy).toHaveBeenCalledOnce();

    redisMocks.client.isOpen = false;
    disconnectRedis(redisMocks.client);
    expect(redisMocks.client.destroy).toHaveBeenCalledOnce();
  });
});
