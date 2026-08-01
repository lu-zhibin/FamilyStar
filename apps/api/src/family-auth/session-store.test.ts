import { describe, expect, it } from 'vitest';

import { createRedisKeyspace } from '../infrastructure/redis/keys.js';
import type { RedisCommandPort } from '../infrastructure/redis/primitives.js';
import { SESSION_TTL_SECONDS } from './constants.js';
import { RedisSessionStore } from './session-store.js';

describe('RedisSessionStore', () => {
  it('stores an opaque session with the rolling session TTL', async () => {
    const commands: string[][] = [];
    const redis: RedisCommandPort = {
      async sendCommand(arguments_) {
        commands.push([...arguments_]);
        return arguments_[0] === 'GET' ? null : 'OK';
      },
    };
    const store = new RedisSessionStore(redis, createRedisKeyspace('test'), () => 'opaque-token');
    const session = {
      subjectId: 'parent-1',
      familyId: 'family-1',
      role: 'parent' as const,
      issuedAt: '2026-07-30T12:00:00.000Z',
    };

    await expect(store.create(session)).resolves.toBe('opaque-token');
    expect(commands).toEqual([
      ['GET', 'test:session-revision:parent-1'],
      [
        'SET',
        'test:session:opaque-token',
        JSON.stringify({ ...session, revision: 0 }),
        'EX',
        String(SESSION_TTL_SECONDS),
      ],
    ]);
  });

  it('reads valid sessions and rejects malformed values', async () => {
    const replies: unknown[] = [
      JSON.stringify({
        subjectId: 'parent-1',
        familyId: 'family-1',
        role: 'parent',
        issuedAt: '2026-07-30T12:00:00.000Z',
        revision: 0,
      }),
      null,
      1,
      '{invalid',
    ];
    const redis: RedisCommandPort = {
      async sendCommand() {
        return replies.shift() ?? null;
      },
    };
    const store = new RedisSessionStore(redis, createRedisKeyspace('test'));

    await expect(store.read('valid')).resolves.toMatchObject({ subjectId: 'parent-1' });
    await expect(store.read('invalid')).resolves.toBeNull();
  });

  it('reads child sessions used for family account switching', async () => {
    const replies: unknown[] = [
      JSON.stringify({
        subjectId: 'child-1',
        familyId: 'family-1',
        role: 'child',
        issuedAt: '2026-07-30T12:00:00.000Z',
        revision: 2,
      }),
      '2',
      1,
    ];
    const redis: RedisCommandPort = {
      async sendCommand() {
        return replies.shift() ?? null;
      },
    };
    const store = new RedisSessionStore(redis, createRedisKeyspace('test'));

    await expect(store.read('child-token')).resolves.toMatchObject({ role: 'child' });
  });

  it('invalidates prior sessions by incrementing the subject revision', async () => {
    const commands: string[][] = [];
    const replies: unknown[] = [
      JSON.stringify({
        subjectId: 'child-1',
        familyId: 'family-1',
        role: 'child',
        issuedAt: '2026-07-30T12:00:00.000Z',
        revision: 1,
      }),
      '2',
      1,
      3,
    ];
    const redis: RedisCommandPort = {
      async sendCommand(arguments_) {
        commands.push([...arguments_]);
        return replies.shift() ?? null;
      },
    };
    const store = new RedisSessionStore(redis, createRedisKeyspace('test'));

    await expect(store.read('old-token')).resolves.toBeNull();
    await expect(store.revokeSubject('child-1')).resolves.toBeUndefined();
    expect(commands).toEqual([
      ['GET', 'test:session:old-token'],
      ['GET', 'test:session-revision:child-1'],
      ['DEL', 'test:session:old-token'],
      ['INCR', 'test:session-revision:child-1'],
    ]);
  });
});
