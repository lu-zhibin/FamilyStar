import { ERROR_CODES } from '@familystar/shared';
import { describe, expect, it } from 'vitest';

import { createErrorResponse, createSuccessResponse } from './responses.js';

const timestamp = '2026-07-30T00:00:00.000Z';

describe('API response builders', () => {
  it('wraps successful data with deterministic metadata', () => {
    const data = { id: 'family-1' };

    expect(createSuccessResponse(data, 'request-1', timestamp)).toEqual({
      success: true,
      data,
      meta: {
        request_id: 'request-1',
        timestamp,
      },
    });
  });

  it('omits error details when none are provided', () => {
    expect(
      createErrorResponse(ERROR_CODES.NOT_FOUND, 'Missing resource.', 'request-2', timestamp),
    ).toEqual({
      success: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'Missing resource.',
      },
      meta: {
        request_id: 'request-2',
        timestamp,
      },
    });
  });

  it('includes safe structured details when explicitly provided', () => {
    const details = { field: 'name' };
    const response = createErrorResponse(
      ERROR_CODES.INVALID_REQUEST,
      'Invalid request.',
      'request-3',
      timestamp,
      details,
    );

    expect(response.error.details).toEqual(details);
  });
});
