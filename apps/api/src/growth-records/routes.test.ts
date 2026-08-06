import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { GrowthRecordAccessError } from './service.js';
import type { GrowthRecordItem, GrowthRecordOperations } from './types.js';

const recordId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const childId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function item(): GrowthRecordItem {
  const timestamp = new Date('2026-08-06T08:00:00.000Z');
  return {
    id: recordId,
    familyId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    child: { id: childId, nickname: '星星' },
    task: null,
    type: 'NOTE',
    title: '阅读笔记',
    contentText: null,
    occurredOn: new Date('2026-08-06T00:00:00.000Z'),
    sourceType: null,
    sourceId: null,
    pointsEarned: null,
    createdById: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    createdAt: timestamp,
    updatedAt: timestamp,
    media: [],
  };
}

function operations(): GrowthRecordOperations {
  return {
    list: vi.fn().mockResolvedValue({ items: [], page: { has_more: false, next_cursor: null } }),
    create: vi.fn().mockResolvedValue({ record: item() }),
    update: vi.fn().mockResolvedValue({ record: item() }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

describe('growth record HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('parses timeline filters and renews the parent cookie', async () => {
    const growthRecordOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', growthRecordOperations });
    const response = await app.request(
      `/api/v1/family/growth-records?child_id=${childId}&type=NOTE&start_date=2026-08-01&end_date=2026-08-06&limit=5`,
      { headers: { cookie: 'familystar_session=parent-session' } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=parent-session');
    expect(growthRecordOperations.list).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      childId,
      type: 'NOTE',
      startDate: '2026-08-01',
      endDate: '2026-08-06',
      cursor: null,
      limit: 5,
    });
  });

  it('creates a manual note and returns snake-case output', async () => {
    const growthRecordOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', growthRecordOperations });
    const response = await app.request('/api/v1/family/growth-records', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'familystar_session=parent-session' },
      body: JSON.stringify({
        child_id: childId,
        type: 'NOTE',
        title: '阅读笔记',
        occurred_on: '2026-08-06',
        media_ids: [],
      }),
    });

    expect(response.status).toBe(201);
    expect(growthRecordOperations.create).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      record: {
        childId,
        type: 'NOTE',
        title: '阅读笔记',
        occurredOn: '2026-08-06',
        mediaIds: [],
      },
    });
    expect(await response.json()).toMatchObject({
      data: { record: { id: recordId, occurred_on: '2026-08-06', content_text: null } },
    });
  });

  it.each([
    ['/api/v1/family/growth-records?child_id=bad', 'GET'],
    ['/api/v1/family/growth-records?type=UNKNOWN', 'GET'],
    [`/api/v1/family/growth-records/${recordId}`, 'PATCH'],
  ])('maps invalid input on %s to 400', async (path, method) => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      growthRecordOperations: operations(),
    });
    const response = await app.request(path, {
      method,
      ...(method === 'PATCH'
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }
        : {}),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('maps family-scoped missing records to 404', async () => {
    const growthRecordOperations = operations();
    vi.mocked(growthRecordOperations.update).mockRejectedValue(
      new GrowthRecordAccessError('NOT_FOUND', 'The growth record was not found.'),
    );
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', growthRecordOperations });
    const response = await app.request(`/api/v1/family/growth-records/${recordId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '更新' }),
    });
    expect(response.status).toBe(404);
  });
});
