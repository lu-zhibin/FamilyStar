import { describe, expect, it } from 'vitest';

import { parseEnvironment } from './environment.js';

describe('parseEnvironment', () => {
  it('returns stable local development defaults', () => {
    expect(parseEnvironment({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      WORKER_PORT: 3002,
      WORKER_POLL_INTERVAL_MS: 5000,
      WORKER_BATCH_SIZE: 100,
      WORKER_LOCK_TTL_MS: 300000,
      MEDIA_CLEANUP_AGE_HOURS: 24,
      PUBLIC_BASE_URL: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://familystar:familystar@localhost:5432/familystar?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      REDIS_KEY_PREFIX: 'familystar',
    });
  });

  it('coerces a valid custom port and preserves valid configuration', () => {
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        PORT: '4000',
        PUBLIC_BASE_URL: 'https://familystar.example.test',
        DATABASE_URL: 'postgresql://app:secret@database.example.test:5432/familystar',
        REDIS_URL: 'rediss://cache.example.test:6380',
        REDIS_KEY_PREFIX: 'familystar_test',
      }),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 4000,
      WORKER_PORT: 3002,
      WORKER_POLL_INTERVAL_MS: 5000,
      WORKER_BATCH_SIZE: 100,
      WORKER_LOCK_TTL_MS: 300000,
      MEDIA_CLEANUP_AGE_HOURS: 24,
      PUBLIC_BASE_URL: 'https://familystar.example.test',
      DATABASE_URL: 'postgresql://app:secret@database.example.test:5432/familystar',
      REDIS_URL: 'rediss://cache.example.test:6380',
      REDIS_KEY_PREFIX: 'familystar_test',
    });
  });

  it.each(['1', '65535'])('accepts the port boundary %s', (port) => {
    expect(parseEnvironment({ PORT: port }).PORT).toBe(Number(port));
  });

  it('parses bounded Worker configuration', () => {
    expect(
      parseEnvironment({
        WORKER_PORT: '4100',
        WORKER_POLL_INTERVAL_MS: '1000',
        WORKER_BATCH_SIZE: '250',
        WORKER_LOCK_TTL_MS: '10000',
        MEDIA_CLEANUP_AGE_HOURS: '48',
      }),
    ).toMatchObject({
      WORKER_PORT: 4100,
      WORKER_POLL_INTERVAL_MS: 1000,
      WORKER_BATCH_SIZE: 250,
      WORKER_LOCK_TTL_MS: 10000,
      MEDIA_CLEANUP_AGE_HOURS: 48,
    });
  });

  it('rejects Worker configuration outside operational bounds', () => {
    expect(() =>
      parseEnvironment({
        WORKER_PORT: '0',
        WORKER_POLL_INTERVAL_MS: '999',
        WORKER_BATCH_SIZE: '1001',
        WORKER_LOCK_TTL_MS: '9999',
        MEDIA_CLEANUP_AGE_HOURS: '0',
      }),
    ).toThrow(
      'Invalid environment variables: WORKER_PORT, WORKER_POLL_INTERVAL_MS, WORKER_BATCH_SIZE, WORKER_LOCK_TTL_MS, MEDIA_CLEANUP_AGE_HOURS',
    );
  });

  it.each(['0', '65536', '3001.5', 'not-a-port'])('rejects the invalid port %s', (port) => {
    expect(() => parseEnvironment({ PORT: port })).toThrow('Invalid environment variables: PORT');
  });

  it('rejects an unsupported environment and invalid public URL', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'staging', PUBLIC_BASE_URL: 'invalid-url' })).toThrow(
      'Invalid environment variables: NODE_ENV, PUBLIC_BASE_URL',
    );
  });

  it('requires HTTPS for the production public base URL', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        PUBLIC_BASE_URL: 'http://familystar.example.test',
      }),
    ).toThrow('Invalid environment variables: PUBLIC_BASE_URL');
  });

  it('requires a PostgreSQL database URL', () => {
    expect(() => parseEnvironment({ DATABASE_URL: 'mysql://localhost/familystar' })).toThrow(
      'Invalid environment variables: DATABASE_URL',
    );
  });

  it('requires a Redis URL and a safe key prefix', () => {
    expect(() =>
      parseEnvironment({ REDIS_URL: 'https://localhost:6379', REDIS_KEY_PREFIX: 'Family Star' }),
    ).toThrow('Invalid environment variables: REDIS_URL, REDIS_KEY_PREFIX');
  });

  it('preserves optional credential vault configuration for isolated validation', () => {
    const environment = parseEnvironment({
      CREDENTIAL_VAULT_ACTIVE_KEY_VERSION: 'v2',
      CREDENTIAL_VAULT_MASTER_KEYS: '{"v2":"private-key-material"}',
    });

    expect(environment.CREDENTIAL_VAULT_ACTIVE_KEY_VERSION).toBe('v2');
    expect(environment.CREDENTIAL_VAULT_MASTER_KEYS).toBe('{"v2":"private-key-material"}');
  });

  it('reports invalid field names without exposing supplied values', () => {
    let error: unknown;

    try {
      parseEnvironment({
        PORT: 'private-port-value',
        PUBLIC_BASE_URL: 'private-url-value',
        DATABASE_URL: 'private-database-value',
        REDIS_URL: 'private-redis-value',
        REDIS_KEY_PREFIX: 'private prefix value',
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Invalid environment variables: PORT, PUBLIC_BASE_URL, DATABASE_URL, REDIS_URL, REDIS_KEY_PREFIX',
    );
    expect((error as Error).message).not.toContain('private-port-value');
    expect((error as Error).message).not.toContain('private-url-value');
    expect((error as Error).message).not.toContain('private-database-value');
    expect((error as Error).message).not.toContain('private-redis-value');
    expect((error as Error).message).not.toContain('private prefix value');
  });
});
