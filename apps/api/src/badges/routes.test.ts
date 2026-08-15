import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { AppEnvironment } from '../http/types.js';
import { registerBadgeRoutes } from './routes.js';
import type { BadgeOperations } from './types.js';

function app(operations: BadgeOperations) {
  const api = new Hono<AppEnvironment>();
  api.use('*', async (context, next) => {
    context.set('requestId', 'request-1');
    await next();
  });
  registerBadgeRoutes(api, operations, false);
  return api;
}

function operations(): BadgeOperations {
  return {
    listTemplates: vi.fn().mockResolvedValue({ templates: [] }),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    removeTemplate: vi.fn(),
    awardManually: vi.fn().mockResolvedValue({
      award: {
        id: 'award-1',
        familyId: 'family-1',
        templateId: '01989a58-c542-7abc-8def-0123456789ab',
        childId: '01989a58-c542-7abc-8def-0123456789ac',
        level: 1,
        templateNameSnapshot: '合作之星',
        templateDescriptionSnapshot: null,
        templateIconSnapshot: 'teamwork',
        templateCategorySnapshot: '协作',
        templateConditionSnapshot: { type: 'MANUAL' },
        templateVersion: 1,
        reason: '主动帮助家人',
        sourceEventId: null,
        awardedById: 'parent-1',
        awardedAt: new Date('2026-08-06T10:00:00.000Z'),
      },
    }),
    getMyWall: vi.fn().mockResolvedValue({ badges: [] }),
  };
}

const automaticConditionTypes = [
  'TASK_COMPLETION_COUNT',
  'STREAK_DAYS',
  'TOTAL_POINTS',
  'LEVEL_REACHED',
  'COLLABORATION_COUNT',
] as const;

describe('badge HTTP routes', () => {
  it('creates a manual award with session-scoped operations', async () => {
    const badgeOperations = operations();
    const response = await app(badgeOperations).request('/family/badge-awards', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'familystar_session=parent-session',
      },
      body: JSON.stringify({
        child_id: '01989a58-c542-7abc-8def-0123456789ac',
        template_id: '01989a58-c542-7abc-8def-0123456789ab',
        reason: '主动帮助家人',
      }),
    });

    expect(response.status).toBe(201);
    expect(badgeOperations.awardManually).toHaveBeenCalledWith({
      sessionToken: 'parent-session',
      childId: '01989a58-c542-7abc-8def-0123456789ac',
      templateId: '01989a58-c542-7abc-8def-0123456789ab',
      reason: '主动帮助家人',
    });
    expect(await response.json()).toMatchObject({
      success: true,
      data: { award: { id: 'award-1', name: '合作之星' } },
    });
  });

  it('rejects malformed template input', async () => {
    const badgeOperations = operations();
    const response = await app(badgeOperations).request('/family/badge-templates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    expect(response.status).toBe(400);
    expect(badgeOperations.createTemplate).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('property: rejects every automatic condition immediately outside the database boundary', async () => {
    for (const type of automaticConditionTypes) {
      for (const target of [0, -1, 1.5, 2_147_483_648]) {
        const badgeOperations = operations();
        const response = await app(badgeOperations).request('/family/badge-templates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Boundary badge',
            icon: 'star',
            category: 'growth',
            condition: { type, target },
          }),
        });

        expect(response.status).toBe(400);
        expect(badgeOperations.createTemplate).not.toHaveBeenCalled();
      }
    }
  });
});
