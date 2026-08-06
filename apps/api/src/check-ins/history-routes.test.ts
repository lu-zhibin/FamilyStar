import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { HistoryAccessError } from './history-service.js';
import type { HistoryOperations } from './history-types.js';

function operations(): HistoryOperations {
  return {
    getMine: vi.fn().mockResolvedValue({ items: [], page: { has_more: false, next_cursor: null } }),
    getFamily: vi
      .fn()
      .mockResolvedValue({ items: [], page: { has_more: false, next_cursor: null } }),
  };
}

describe('history HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('parses parent filters, returns an empty page, and renews the cookie', async () => {
    const historyOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', historyOperations });
    const childId = '22222222-2222-4222-8222-222222222222';
    const response = await app.request(
      `/api/v1/family/check-ins/history?child_id=${childId}&submission_type=SOLO&start_date=2026-08-01&end_date=2026-08-05&limit=5`,
      { headers: { cookie: 'familystar_session=parent-session' } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=parent-session');
    expect(historyOperations.getFamily).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      childId,
      submissionType: 'SOLO',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
      cursor: null,
      limit: 5,
    });
    expect(await response.json()).toMatchObject({
      data: { items: [], page: { has_more: false, next_cursor: null } },
    });
  });

  it.each([
    ['/api/v1/check-ins/me/history?task_id=bad'],
    ['/api/v1/check-ins/me/history?submission_type=TEAM'],
    ['/api/v1/check-ins/me/history?limit=0'],
    ['/api/v1/check-ins/me/history?cursor=not-an-opaque-cursor'],
  ])('maps invalid filters on %s to 400', async (path) => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      historyOperations: operations(),
    });
    const response = await app.request(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it.each([
    ['UNAUTHORIZED', 401],
    ['FORBIDDEN', 403],
  ] as const)('maps %s access failures', async (code, status) => {
    const historyOperations = operations();
    vi.mocked(historyOperations.getMine).mockRejectedValue(new HistoryAccessError(code, 'Denied.'));
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', historyOperations });
    const response = await app.request('/api/v1/check-ins/me/history');
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });
});
