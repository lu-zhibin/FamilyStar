import { ERROR_CODES } from '@familystar/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';

describe('FamilyStar API application', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns service information in the success envelope', async () => {
    const app = createApp({ publicBaseUrl: 'http://localhost:3000' });
    const response = await app.request('/api/v1', {
      headers: { 'X-Request-Id': 'service-test_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-Id')).toBe('service-test_1');
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        name: 'FamilyStar API',
        version: '0.1.0',
      },
      meta: {
        request_id: 'service-test_1',
      },
    });
  });

  it('returns a deterministic healthy process snapshot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T01:02:03.000Z'));
    const app = createApp({ publicBaseUrl: 'http://localhost:3000' });
    const response = await app.request('/api/v1/health', {
      headers: { 'X-Request-Id': 'health-test_1' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        name: 'FamilyStar API',
        version: '0.1.0',
        status: 'ok',
        checked_at: '2026-07-30T01:02:03.000Z',
      },
      meta: {
        request_id: 'health-test_1',
        timestamp: '2026-07-30T01:02:03.000Z',
      },
    });
    expect(Number.isInteger(body.data.uptime_seconds)).toBe(true);
    expect(body.data.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it('maps missing routes to a stable not found response', async () => {
    const app = createApp({ publicBaseUrl: 'http://localhost:3000' });
    const response = await app.request('/api/v1/missing', {
      headers: { 'X-Request-Id': 'missing-test_1' },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'The requested resource was not found.',
      },
      meta: {
        request_id: 'missing-test_1',
      },
    });
  });

  it('maps unhandled errors without exposing internal messages', async () => {
    const app = createApp({ publicBaseUrl: 'http://localhost:3000' });
    app.get('/api/v1/failure', () => {
      throw new Error('sensitive internal failure');
    });

    const response = await app.request('/api/v1/failure', {
      headers: { 'X-Request-Id': 'failure-test_1' },
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'An unexpected error occurred.',
      },
      meta: {
        request_id: 'failure-test_1',
      },
    });
    expect(JSON.stringify(body)).not.toContain('sensitive internal failure');

    const errorLog = vi.mocked(console.error).mock.calls[0]?.[0];
    expect(String(errorLog)).not.toContain('sensitive internal failure');
  });
});
