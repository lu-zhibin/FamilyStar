const KEY_PREFIX_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const MAX_SEGMENT_LENGTH = 256;

export type RedisKeyspace = {
  session(sessionId: string): string;
  sessionRevision(subjectId: string): string;
  rateLimit(scope: string, ...identifiers: string[]): string;
  schedulerLock(jobName: string): string;
  reviewLock(targetType: string, targetId: string): string;
  idempotency(consumer: string, eventId: string): string;
  cache(namespace: string, identifier: string): string;
};

function encodeSegment(value: string, label: string): string {
  if (value.length === 0 || value.length > MAX_SEGMENT_LENGTH) {
    throw new Error(`${label} must contain between 1 and ${MAX_SEGMENT_LENGTH} characters.`);
  }

  return encodeURIComponent(value);
}

export function createRedisKeyspace(prefix: string): RedisKeyspace {
  if (!KEY_PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      'Redis key prefix must contain lowercase letters, numbers, underscores or hyphens.',
    );
  }

  const key = (purpose: string, segments: Array<[value: string, label: string]>) =>
    [prefix, purpose, ...segments.map(([value, label]) => encodeSegment(value, label))].join(':');

  return {
    session: (sessionId) => key('session', [[sessionId, 'Session ID']]),
    sessionRevision: (subjectId) => key('session-revision', [[subjectId, 'Session subject ID']]),
    rateLimit: (scope, ...identifiers) => {
      if (identifiers.length === 0) {
        throw new Error('Rate-limit keys require at least one identifier.');
      }

      return key('rate-limit', [
        [scope, 'Rate-limit scope'],
        ...identifiers.map((identifier): [string, string] => [identifier, 'Rate-limit identifier']),
      ]);
    },
    schedulerLock: (jobName) => key('scheduler-lock', [[jobName, 'Job name']]),
    reviewLock: (targetType, targetId) =>
      key('review-lock', [
        [targetType, 'Review target type'],
        [targetId, 'Review target ID'],
      ]),
    idempotency: (consumer, eventId) =>
      key('idempotency', [
        [consumer, 'Consumer'],
        [eventId, 'Event ID'],
      ]),
    cache: (namespace, identifier) =>
      key('cache', [
        [namespace, 'Cache namespace'],
        [identifier, 'Cache identifier'],
      ]),
  };
}
