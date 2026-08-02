export type ApiLoadState = 'loading' | 'live' | 'empty' | 'error';

export function readApiField<T>(payload: Record<string, unknown>, key: string): T {
  if (!Object.prototype.hasOwnProperty.call(payload, key) || payload[key] === undefined) {
    throw new Error(`API response is missing required field: ${key}`);
  }

  return payload[key] as T;
}

export function loadedState(value: unknown): ApiLoadState {
  return Array.isArray(value) && value.length === 0 ? 'empty' : 'live';
}
