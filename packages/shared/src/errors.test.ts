import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from './errors.js';

describe('ERROR_CODES', () => {
  it('exports the stable error code set', () => {
    expect(Object.values(ERROR_CODES).sort()).toEqual([
      'CONFLICT',
      'FORBIDDEN',
      'INTERNAL_ERROR',
      'INVALID_REQUEST',
      'MODULE_DISABLED',
      'NOT_FOUND',
      'RATE_LIMITED',
      'UNAUTHORIZED',
    ]);
  });

  it('keeps every machine error code unique and uppercase', () => {
    const codes = Object.values(ERROR_CODES);

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z]+(?:_[A-Z]+)*$/.test(code))).toBe(true);
  });
});
