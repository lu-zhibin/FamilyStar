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
