import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CURSOR_PAGE_LIMIT,
  decodeCursor,
  encodeCursor,
  InvalidPaginationError,
  parseCursorPageQuery,
} from './cursor.js';

describe('cursor pagination', () => {
  it('round trips an opaque stable position', () => {
    const position = {
      sortValue: '2026-08-05T12:34:56.789Z',
      id: '01989a58-c542-7abc-8def-0123456789ab',
    };

    const encoded = encodeCursor(position);

    expect(encoded).not.toContain(position.sortValue);
    expect(decodeCursor(encoded)).toEqual(position);
  });

  it('property: every valid generated position has a canonical deterministic round trip', () => {
    for (let index = 0; index < 128; index += 1) {
      const position = {
        sortValue: new Date(Date.UTC(2026, 0, 1, 0, index, index % 60)).toISOString(),
        id: `record-${String(index).padStart(3, '0')}`,
      };

      const first = encodeCursor(position);
      const second = encodeCursor(position);
      expect(first).toBe(second);
      expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeCursor(first)).toEqual(position);
    }
  });

  it('property: stable cursor paging visits every ordered item exactly once', () => {
    const items = Array.from({ length: 73 }, (_, index) => ({
      sortValue: `2026-08-${String(Math.floor(index / 4) + 1).padStart(2, '0')}`,
      id: `record-${String(index).padStart(3, '0')}`,
    }));
    const visited: typeof items = [];
    let cursor: string | undefined;

    while (visited.length < items.length) {
      const query = parseCursorPageQuery(
        cursor === undefined ? { limit: '9' } : { cursor, limit: '9' },
      );
      const start =
        query.cursor === null
          ? 0
          : items.findIndex(
              (item) => item.sortValue === query.cursor?.sortValue && item.id === query.cursor.id,
            ) + 1;
      const page = items.slice(start, start + query.limit);
      visited.push(...page);
      const last = page.at(-1);
      cursor =
        last === undefined || start + page.length >= items.length ? undefined : encodeCursor(last);
    }

    expect(visited).toEqual(items);
    expect(new Set(visited.map(({ id }) => id)).size).toBe(items.length);
  });

  it('uses the default limit and an empty position', () => {
    expect(parseCursorPageQuery({})).toEqual({
      cursor: null,
      limit: DEFAULT_CURSOR_PAGE_LIMIT,
    });
  });

  it('parses a cursor and a caller supplied page limit', () => {
    const position = { sortValue: '42', id: 'record-42' };

    expect(parseCursorPageQuery({ cursor: encodeCursor(position), limit: '25' })).toEqual({
      cursor: position,
      limit: 25,
    });
  });

  it('supports a smaller domain-specific maximum', () => {
    expect(parseCursorPageQuery({ limit: '10' }, { defaultLimit: 5, maxLimit: 10 })).toEqual({
      cursor: null,
      limit: 10,
    });
  });

  it('property: accepts every positive limit through the configured maximum', () => {
    for (let limit = 1; limit <= 100; limit += 1) {
      expect(parseCursorPageQuery({ limit: String(limit) }).limit).toBe(limit);
    }
  });

  it.each(['', '0', '-1', '1.5', ' 2', '2 ', '101', '9007199254740992'])(
    'rejects invalid page limit %j',
    (limit) => {
      expect(() => parseCursorPageQuery({ limit })).toThrow(InvalidPaginationError);
    },
  );

  it.each([
    '',
    'not+base64url',
    Buffer.from('not-json').toString('base64url'),
    Buffer.from(JSON.stringify([2, 'value', 'id'])).toString('base64url'),
    Buffer.from(JSON.stringify([1, '', 'id'])).toString('base64url'),
    Buffer.from(JSON.stringify([1, 'value', ''])).toString('base64url'),
    Buffer.from(JSON.stringify([1, 'value', 'id', 'extra'])).toString('base64url'),
  ])('rejects malformed cursor %j', (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(InvalidPaginationError);
  });

  it('rejects invalid parser limits', () => {
    expect(() => parseCursorPageQuery({}, { defaultLimit: 11, maxLimit: 10 })).toThrow(
      InvalidPaginationError,
    );
  });
});
