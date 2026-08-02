import { describe, expect, it } from 'vitest';

import { loadedState, readApiField } from './api-resource';

describe('API resource fields', () => {
  it('preserves an empty array as a valid empty response', () => {
    const children = readApiField<unknown[]>({ children: [] }, 'children');

    expect(children).toEqual([]);
    expect(loadedState(children)).toBe('empty');
  });

  it('marks populated and object responses as live', () => {
    expect(loadedState([{ id: 'child-1' }])).toBe('live');
    expect(loadedState({ id: 'child-1' })).toBe('live');
  });

  it('rejects a response that omits the required field', () => {
    expect(() => readApiField({}, 'children')).toThrow(
      'API response is missing required field: children',
    );
  });
});
