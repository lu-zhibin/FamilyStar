const EVENT_NAME_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.v[1-9]\d*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type EventName = `${string}.${string}.${string}.v${number}`;

export type JsonValue =
  boolean | number | string | null | readonly JsonValue[] | Readonly<{ [key: string]: JsonValue }>;

export type EventPayload = Readonly<Record<string, JsonValue>>;

export type DomainEvent<
  TName extends EventName = EventName,
  TPayload extends EventPayload = EventPayload,
> = Readonly<{
  event_id: string;
  event_name: TName;
  occurred_at: string;
  family_id: string;
  actor_id: string | null;
  correlation_id: string;
  payload: TPayload;
}>;

export type DomainEventInput<TName extends EventName, TPayload extends EventPayload> = DomainEvent<
  TName,
  TPayload
>;

export type EventNameParts = Readonly<{
  namespace: string;
  entity: string;
  action: string;
  version: number;
}>;

export function isEventName(value: string): value is EventName {
  return EVENT_NAME_PATTERN.test(value);
}

export function parseEventName(value: string): EventNameParts {
  if (!isEventName(value)) {
    throw new Error('Event name must use <module>.<entity>.<event>.v<version>.');
  }

  const [namespace, entity, action, version] = value.split('.');
  return Object.freeze({
    namespace: namespace as string,
    entity: entity as string,
    action: action as string,
    version: Number((version as string).slice(1)),
  });
}

function cloneJson(value: unknown, ancestors: ReadonlySet<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Event payload numbers must be finite.');
    }
    return value;
  }

  if (typeof value !== 'object') {
    throw new Error('Event payload must contain only JSON values.');
  }

  if (ancestors.has(value)) {
    throw new Error('Event payload must not contain circular references.');
  }

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneJson(item, nextAncestors)));
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Event payload must contain only plain objects.');
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJson(item, nextAncestors)]),
    ),
  );
}

export function createDomainEvent<TName extends EventName, TPayload extends EventPayload>(
  input: DomainEventInput<TName, TPayload>,
): DomainEvent<TName, TPayload> {
  parseEventName(input.event_name);

  if (!UUID_PATTERN.test(input.event_id)) {
    throw new Error('Event ID must be a UUID.');
  }
  if (!UUID_PATTERN.test(input.family_id)) {
    throw new Error('Event family ID must be a UUID.');
  }
  if (input.actor_id !== null && !UUID_PATTERN.test(input.actor_id)) {
    throw new Error('Event actor ID must be a UUID or null.');
  }
  if (!CORRELATION_ID_PATTERN.test(input.correlation_id)) {
    throw new Error('Event correlation ID is invalid.');
  }
  if (Number.isNaN(Date.parse(input.occurred_at)) || !input.occurred_at.endsWith('Z')) {
    throw new Error('Event occurrence time must be an ISO 8601 UTC string.');
  }
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    throw new Error('Event payload must be a JSON object.');
  }

  return Object.freeze({
    event_id: input.event_id,
    event_name: input.event_name,
    occurred_at: input.occurred_at,
    family_id: input.family_id,
    actor_id: input.actor_id,
    correlation_id: input.correlation_id,
    payload: cloneJson(input.payload, new Set()) as TPayload,
  });
}
