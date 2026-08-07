import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app.js';
import { RewardAccessError, RewardConflictError } from './service.js';
import type { RedemptionRecord, RewardOperations, RewardRecord, WishRecord } from './types.js';

const now = new Date('2026-07-31T12:00:00.000Z');
const reward: RewardRecord = {
  id: 'reward-1',
  familyId: 'family-1',
  name: 'Book',
  description: null,
  imageMediaId: 'image-1',
  pointsCost: 50,
  type: 'PHYSICAL',
  stockTotal: 3,
  stockReserved: 1,
  stockConsumed: 1,
  prerequisites: { minLevel: 2, redeemLimit: { perWeek: 1 } },
  status: 'ACTIVE',
  createdAt: now,
  updatedAt: now,
};
const redemption: RedemptionRecord = {
  id: 'redemption-1',
  familyId: 'family-1',
  rewardId: 'reward-1',
  childId: 'child-1',
  listedPointsCost: 50,
  discount: 0.8,
  pointsSpent: 40,
  status: 'PENDING',
  isAutoApproved: false,
  approvedById: null,
  approvedAt: null,
  rejectedById: null,
  rejectedAt: null,
  rejectionReason: null,
  fulfilledById: null,
  fulfilledAt: null,
  createdAt: now,
  updatedAt: now,
};
const wish: WishRecord = {
  id: 'wish-1',
  familyId: 'family-1',
  childId: 'child-1',
  title: 'Telescope',
  description: null,
  targetPoints: 100,
  pointsBalance: 25,
  status: 'ACTIVE',
  adoptedRewardId: null,
  cancelledAt: null,
  adoptedAt: null,
  createdAt: now,
  updatedAt: now,
};

function operations(): RewardOperations {
  return {
    listRewards: vi.fn().mockResolvedValue({ rewards: [reward] }),
    getReward: vi.fn().mockResolvedValue({ reward }),
    createReward: vi.fn().mockResolvedValue({ reward }),
    updateReward: vi.fn().mockResolvedValue({ reward }),
    removeReward: vi.fn().mockResolvedValue(undefined),
    requestRedemption: vi.fn().mockResolvedValue({ redemption }),
    listRedemptions: vi.fn().mockResolvedValue({ redemptions: [redemption] }),
    approveRedemption: vi.fn().mockResolvedValue({ redemption }),
    fulfillRedemption: vi.fn().mockResolvedValue({ redemption }),
    rejectRedemption: vi.fn().mockResolvedValue({ redemption }),
    listWishes: vi.fn().mockResolvedValue({ wishes: [wish] }),
    createWish: vi.fn().mockResolvedValue({ wish }),
    cancelWish: vi.fn().mockResolvedValue({ wish }),
    adoptWish: vi.fn().mockResolvedValue({ wish, reward }),
  };
}

describe('reward HTTP routes', () => {
  beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('maps reward input/output to snake_case and renews the cookie', async () => {
    const rewardOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', rewardOperations });
    const response = await app.request('/api/v1/rewards', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'familystar_session=parent' },
      body: JSON.stringify({
        name: 'Book',
        image_media_id: 'image-1',
        points_cost: 50,
        type: 'PHYSICAL',
        stock_total: 3,
        prerequisites: { min_level: 2, redeem_limit: { per_week: 1 } },
      }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('familystar_session=parent');
    expect(rewardOperations.createReward).toHaveBeenCalledWith({
      sessionToken: 'parent',
      reward: expect.objectContaining({
        imageMediaId: 'image-1',
        pointsCost: 50,
        stockTotal: 3,
        prerequisites: { minLevel: 2, redeemLimit: { perWeek: 1 } },
      }),
    });
    expect(await response.json()).toMatchObject({
      data: {
        reward: {
          family_id: 'family-1',
          points_cost: 50,
          stock_available: 1,
          image_media_id: 'image-1',
        },
      },
    });
  });

  it('passes child redemption idempotency and maps approval fields', async () => {
    const rewardOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', rewardOperations });
    const response = await app.request('/api/v1/rewards/reward-1/redemptions', {
      method: 'POST',
      headers: { cookie: 'familystar_session=child', 'Idempotency-Key': 'request-1' },
    });

    expect(response.status).toBe(201);
    expect(rewardOperations.requestRedemption).toHaveBeenCalledWith({
      sessionToken: 'child',
      rewardId: 'reward-1',
      idempotencyKey: 'request-1',
    });
    expect(await response.json()).toMatchObject({
      data: { redemption: { points_spent: 40, is_auto_approved: false } },
    });
  });

  it.each(['approve', 'fulfill'] as const)(
    'preserves the operation receiver for %s',
    async (action) => {
      const rewardOperations = operations();
      const operation = vi.fn(function (this: RewardOperations) {
        expect(this).toBe(rewardOperations);
        return Promise.resolve({ redemption });
      });
      rewardOperations[action === 'approve' ? 'approveRedemption' : 'fulfillRedemption'] =
        operation;
      const app = createApp({ publicBaseUrl: 'http://localhost:3000', rewardOperations });

      const response = await app.request(`/api/v1/redemptions/redemption-1/${action}`, {
        method: 'POST',
        headers: { cookie: 'familystar_session=parent' },
      });

      expect(response.status).toBe(200);
      expect(operation).toHaveBeenCalledWith({
        sessionToken: 'parent',
        redemptionId: 'redemption-1',
      });
    },
  );

  it('returns live wish progress and maps adoption input', async () => {
    const rewardOperations = operations();
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', rewardOperations });
    const list = await app.request('/api/v1/wishes', {
      headers: { cookie: 'familystar_session=child' },
    });
    expect(await list.json()).toMatchObject({
      data: {
        wishes: [{ points_balance: 25, progress: { points: 25, remaining: 75, ratio: 0.25 } }],
      },
    });

    const adopt = await app.request('/api/v1/wishes/wish-1/adopt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'familystar_session=parent' },
      body: JSON.stringify({ type: 'EXPERIENCE', stock_total: null }),
    });
    expect(adopt.status).toBe(201);
    expect(rewardOperations.adoptWish).toHaveBeenCalledWith({
      sessionToken: 'parent',
      wishId: 'wish-1',
      reward: { type: 'EXPERIENCE', stockTotal: null },
    });
  });

  it.each([
    [new RewardAccessError('UNAUTHORIZED', 'Denied.'), 401, 'UNAUTHORIZED'],
    [new RewardAccessError('FORBIDDEN', 'Denied.'), 403, 'FORBIDDEN'],
    [new RewardAccessError('NOT_FOUND', 'Missing.'), 404, 'NOT_FOUND'],
    [new RewardConflictError('Conflict.'), 409, 'CONFLICT'],
  ] as const)('maps domain errors to HTTP contracts', async (error, status, code) => {
    const rewardOperations = operations();
    vi.mocked(rewardOperations.listRewards).mockRejectedValue(error);
    const app = createApp({ publicBaseUrl: 'http://localhost:3000', rewardOperations });
    const response = await app.request('/api/v1/rewards');

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
  });

  it('rejects malformed reward and rejection bodies', async () => {
    const app = createApp({
      publicBaseUrl: 'http://localhost:3000',
      rewardOperations: operations(),
    });
    const rewardResponse = await app.request('/api/v1/rewards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Book', points_cost: 0, type: 'PHYSICAL' }),
    });
    const rejectResponse = await app.request('/api/v1/redemptions/one/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: ' ' }),
    });
    expect(rewardResponse.status).toBe(400);
    expect(rejectResponse.status).toBe(400);
  });
});
