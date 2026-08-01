import { describe, expect, it } from 'vitest';

import { createRedisKeyspace } from './keys.js';

describe('createRedisKeyspace', () => {
  it('creates purpose-specific keys and escapes tenant-controlled segments', () => {
    const keys = createRedisKeyspace('familystar_test');

    expect(keys.session('session:123')).toBe('familystar_test:session:session%3A123');
    expect(keys.sessionRevision('child:1')).toBe('familystar_test:session-revision:child%3A1');
    expect(keys.rateLimit('child-login', 'family:1', 'child/2', '192.0.2.1')).toBe(
      'familystar_test:rate-limit:child-login:family%3A1:child%2F2:192.0.2.1',
    );
    expect(keys.schedulerLock('daily/check-ins')).toBe(
      'familystar_test:scheduler-lock:daily%2Fcheck-ins',
    );
    expect(keys.reviewLock('check-in', 'check:1')).toBe(
      'familystar_test:review-lock:check-in:check%3A1',
    );
    expect(keys.idempotency('points.consumer', 'event:123')).toBe(
      'familystar_test:idempotency:points.consumer:event%3A123',
    );
    expect(keys.cache('family-summary', 'family:1')).toBe(
      'familystar_test:cache:family-summary:family%3A1',
    );
  });

  it.each(['FamilyStar', 'family star', ':familystar', ''])(
    'rejects the unsafe prefix %j',
    (prefix) => {
      expect(() => createRedisKeyspace(prefix)).toThrow('Redis key prefix');
    },
  );

  it('requires rate-limit identifiers', () => {
    const keys = createRedisKeyspace('familystar');
    expect(() => keys.rateLimit('login')).toThrow('at least one identifier');
  });

  it('rejects empty and oversized key segments', () => {
    const keys = createRedisKeyspace('familystar');

    expect(() => keys.session('')).toThrow('between 1 and 256 characters');
    expect(() => keys.cache('summary', 'x'.repeat(257))).toThrow('between 1 and 256 characters');
  });
});
