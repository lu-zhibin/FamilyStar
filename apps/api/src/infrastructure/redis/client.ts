import { createClient } from 'redis';

const CONNECT_TIMEOUT_MS = 5_000;
const INITIAL_RECONNECT_DELAY_MS = 100;
const MAX_RECONNECT_DELAY_MS = 3_000;

export type CreateRedisClientOptions = {
  url: string;
  onError?: (error: Error) => void;
};

function instantiateRedisClient(url: string) {
  return createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: redisReconnectStrategy,
    },
  });
}

export type RedisClient = ReturnType<typeof instantiateRedisClient>;

export type RedisLifecycleClient = Pick<RedisClient, 'connect' | 'destroy' | 'isOpen'>;

export function redisReconnectStrategy(retries: number): number {
  return Math.min(INITIAL_RECONNECT_DELAY_MS * 2 ** retries, MAX_RECONNECT_DELAY_MS);
}

export function createRedisConnection({ url, onError }: CreateRedisClientOptions): RedisClient {
  const client = instantiateRedisClient(url);

  client.on('error', (error) => {
    if (onError) {
      onError(error);
      return;
    }

    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'redis_client_error',
        error_name: error.name,
      }),
    );
  });

  return client;
}

export async function connectRedis(client: RedisLifecycleClient): Promise<void> {
  if (!client.isOpen) {
    await client.connect();
  }
}

export function disconnectRedis(client: RedisLifecycleClient): void {
  if (client.isOpen) {
    client.destroy();
  }
}
