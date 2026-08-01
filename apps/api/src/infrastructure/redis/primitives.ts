import type { RedisClient } from './client.js';

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`.trim();

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`.trim();

export type RedisCommandPort = {
  sendCommand(arguments_: readonly string[]): Promise<unknown>;
};

export type RedisCommandClient = Pick<RedisClient, 'sendCommand'>;

export type RateLimitResult = {
  allowed: boolean;
  consumed: number;
  remaining: number;
  retryAfterSeconds: number;
};

export function createRedisCommandPort(client: RedisCommandClient): RedisCommandPort {
  return {
    sendCommand: (arguments_) => client.sendCommand(arguments_),
  };
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function parseIntegerReply(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Redis returned an invalid ${label} reply.`);
  }

  return parsed;
}

export async function writeSession(
  redis: RedisCommandPort,
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  requirePositiveInteger(ttlSeconds, 'Session TTL');
  await redis.sendCommand(['SET', key, value, 'EX', String(ttlSeconds)]);
}

export async function readSession(redis: RedisCommandPort, key: string): Promise<string | null> {
  const reply = await redis.sendCommand(['GET', key]);

  if (reply === null || typeof reply === 'string') {
    return reply;
  }

  throw new Error('Redis returned an invalid session reply.');
}

export async function deleteSession(redis: RedisCommandPort, key: string): Promise<boolean> {
  return parseIntegerReply(await redis.sendCommand(['DEL', key]), 'delete') > 0;
}

export async function touchSession(
  redis: RedisCommandPort,
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  requirePositiveInteger(ttlSeconds, 'Session TTL');
  return (
    parseIntegerReply(await redis.sendCommand(['EXPIRE', key, String(ttlSeconds)]), 'expire') === 1
  );
}

export async function readCounter(redis: RedisCommandPort, key: string): Promise<number> {
  const reply = await redis.sendCommand(['GET', key]);
  if (reply === null) return 0;
  const value = parseIntegerReply(reply, 'counter');
  if (value < 0) throw new Error('Redis returned a negative counter reply.');
  return value;
}

export async function incrementCounter(redis: RedisCommandPort, key: string): Promise<number> {
  const value = parseIntegerReply(await redis.sendCommand(['INCR', key]), 'counter increment');
  if (value <= 0) throw new Error('Redis returned an invalid counter increment reply.');
  return value;
}

export async function claimIdempotency(
  redis: RedisCommandPort,
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  requirePositiveInteger(ttlSeconds, 'Idempotency TTL');
  return (await redis.sendCommand(['SET', key, '1', 'EX', String(ttlSeconds), 'NX'])) === 'OK';
}

export async function claimIdempotencyReceipt(
  redis: RedisCommandPort,
  key: string,
  ownerToken: string,
  ttlSeconds: number,
): Promise<boolean> {
  requirePositiveInteger(ttlSeconds, 'Idempotency TTL');
  if (ownerToken.length === 0) {
    throw new Error('Idempotency owner token must not be empty.');
  }
  return (
    (await redis.sendCommand(['SET', key, ownerToken, 'EX', String(ttlSeconds), 'NX'])) === 'OK'
  );
}

export async function releaseIdempotencyReceipt(
  redis: RedisCommandPort,
  key: string,
  ownerToken: string,
): Promise<boolean> {
  return releaseLock(redis, key, ownerToken);
}

export async function acquireLock(
  redis: RedisCommandPort,
  key: string,
  ownerToken: string,
  ttlMilliseconds: number,
): Promise<boolean> {
  requirePositiveInteger(ttlMilliseconds, 'Lock TTL');
  return (
    (await redis.sendCommand(['SET', key, ownerToken, 'PX', String(ttlMilliseconds), 'NX'])) ===
    'OK'
  );
}

export async function releaseLock(
  redis: RedisCommandPort,
  key: string,
  ownerToken: string,
): Promise<boolean> {
  const reply = await redis.sendCommand(['EVAL', RELEASE_LOCK_SCRIPT, '1', key, ownerToken]);
  return parseIntegerReply(reply, 'lock release') === 1;
}

export async function consumeRateLimit(
  redis: RedisCommandPort,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  requirePositiveInteger(limit, 'Rate limit');
  requirePositiveInteger(windowSeconds, 'Rate-limit window');

  const reply = await redis.sendCommand([
    'EVAL',
    RATE_LIMIT_SCRIPT,
    '1',
    key,
    String(windowSeconds),
  ]);

  if (!Array.isArray(reply) || reply.length !== 2) {
    throw new Error('Redis returned an invalid rate-limit reply.');
  }

  const consumed = parseIntegerReply(reply[0], 'rate-limit count');
  const ttl = parseIntegerReply(reply[1], 'rate-limit TTL');

  return {
    allowed: consumed <= limit,
    consumed,
    remaining: Math.max(0, limit - consumed),
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}

export async function setJsonCache(
  redis: RedisCommandPort,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  requirePositiveInteger(ttlSeconds, 'Cache TTL');
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new Error('Cache value must be JSON serializable.');
  }

  await redis.sendCommand(['SET', key, serialized, 'EX', String(ttlSeconds)]);
}

export async function getJsonCache<T>(redis: RedisCommandPort, key: string): Promise<T | null> {
  const reply = await redis.sendCommand(['GET', key]);

  if (reply === null) {
    return null;
  }

  if (typeof reply !== 'string') {
    throw new Error('Redis returned an invalid cache reply.');
  }

  try {
    return JSON.parse(reply) as T;
  } catch {
    throw new Error('Redis returned malformed cached JSON.');
  }
}
