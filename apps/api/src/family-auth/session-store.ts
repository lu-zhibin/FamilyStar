import { randomBytes } from 'node:crypto';

import type { RedisKeyspace } from '../infrastructure/redis/keys.js';
import type { RedisCommandPort } from '../infrastructure/redis/primitives.js';
import {
  deleteSession,
  incrementCounter,
  readCounter,
  readSession,
  touchSession,
  writeSession,
} from '../infrastructure/redis/primitives.js';
import { SESSION_TTL_SECONDS } from './constants.js';
import type { AuthSession, SessionStore } from './types.js';

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: RedisCommandPort,
    private readonly keyspace: RedisKeyspace,
    private readonly tokenFactory: () => string = () => randomBytes(32).toString('base64url'),
  ) {}

  async create(session: AuthSession): Promise<string> {
    const token = this.tokenFactory();
    const revision = await readCounter(
      this.redis,
      this.keyspace.sessionRevision(session.subjectId),
    );
    await writeSession(
      this.redis,
      this.keyspace.session(token),
      JSON.stringify({ ...session, revision }),
      SESSION_TTL_SECONDS,
    );
    return token;
  }

  async read(token: string): Promise<AuthSession | null> {
    const value = await readSession(this.redis, this.keyspace.session(token));
    if (value === null) return null;
    try {
      const session = JSON.parse(value) as Partial<AuthSession> & { revision?: unknown };
      if (
        typeof session.subjectId !== 'string' ||
        typeof session.familyId !== 'string' ||
        (session.role !== 'parent' && session.role !== 'child') ||
        typeof session.issuedAt !== 'string' ||
        !Number.isSafeInteger(session.revision) ||
        Number(session.revision) < 0
      ) {
        return null;
      }
      const revision = await readCounter(
        this.redis,
        this.keyspace.sessionRevision(session.subjectId),
      );
      if (revision !== session.revision) {
        await deleteSession(this.redis, this.keyspace.session(token));
        return null;
      }
      if (!(await touchSession(this.redis, this.keyspace.session(token), SESSION_TTL_SECONDS))) {
        return null;
      }
      return {
        subjectId: session.subjectId,
        familyId: session.familyId,
        role: session.role,
        issuedAt: session.issuedAt,
      };
    } catch {
      return null;
    }
  }

  async revoke(token: string): Promise<void> {
    await deleteSession(this.redis, this.keyspace.session(token));
  }

  async revokeSubject(subjectId: string): Promise<void> {
    await incrementCounter(this.redis, this.keyspace.sessionRevision(subjectId));
  }
}
