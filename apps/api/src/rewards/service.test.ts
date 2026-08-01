import { describe, expect, it, vi } from 'vitest';

import type { SessionStore } from '../family-auth/types.js';
import { RewardAccessError, RewardConflictError, RewardService } from './service.js';
import type { RewardRepository } from './types.js';

function sessions(role: 'parent' | 'child', familyId = 'family-1'): SessionStore {
  return {
    create: vi.fn(),
    read: vi.fn().mockResolvedValue({
      subjectId: `${role}-1`,
      familyId,
      role,
      issuedAt: '2026-07-31T00:00:00.000Z',
    }),
    revokeSubject: vi.fn(),
  };
}

function repository(): RewardRepository {
  return {
    listRewards: vi.fn().mockResolvedValue([]),
    findReward: vi.fn().mockResolvedValue(null),
    createReward: vi.fn(),
    updateReward: vi.fn(),
    softDeleteReward: vi.fn(),
    requestRedemption: vi.fn(),
    listRedemptions: vi.fn().mockResolvedValue([]),
    approveRedemption: vi.fn(),
    fulfillRedemption: vi.fn(),
    rejectRedemption: vi.fn(),
    listWishes: vi.fn().mockResolvedValue([]),
    createWish: vi.fn(),
    cancelWish: vi.fn(),
    adoptWish: vi.fn(),
  };
}

describe('RewardService', () => {
  it('uses the authenticated family and hides inactive rewards from children', async () => {
    const repo = repository();
    const service = new RewardService({
      repository: repo,
      sessions: sessions('child', 'family-a'),
    });

    await service.listRewards({ sessionToken: 'child-session' });

    expect(repo.listRewards).toHaveBeenCalledWith('family-a', true);
  });

  it('requires a parent to mutate a reward', async () => {
    const service = new RewardService({ repository: repository(), sessions: sessions('child') });

    await expect(
      service.createReward({
        sessionToken: 'child-session',
        reward: { name: 'Book', pointsCost: 20, type: 'PHYSICAL' },
      }),
    ).rejects.toEqual(expect.objectContaining<Partial<RewardAccessError>>({ code: 'FORBIDDEN' }));
  });

  it('binds redemption requests to the child and a stable fingerprint', async () => {
    const repo = repository();
    vi.mocked(repo.requestRedemption).mockResolvedValue({} as never);
    const service = new RewardService({
      repository: repo,
      sessions: sessions('child', 'family-a'),
      now: () => new Date('2026-07-31T12:00:00.000Z'),
    });

    await service.requestRedemption({
      sessionToken: 'child-session',
      rewardId: 'reward-1',
      idempotencyKey: 'request-1',
    });

    expect(repo.requestRedemption).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: 'family-a',
        childId: 'child-1',
        rewardId: 'reward-1',
        idempotencyKey: 'request-1',
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('requires a family-level idempotency key', async () => {
    const service = new RewardService({ repository: repository(), sessions: sessions('child') });
    await expect(
      service.requestRedemption({
        sessionToken: 'child-session',
        rewardId: 'reward-1',
        idempotencyKey: '',
      }),
    ).rejects.toBeInstanceOf(RewardConflictError);
  });

  it('scopes wish listing to the child while parents see the family wall', async () => {
    const childRepo = repository();
    await new RewardService({ repository: childRepo, sessions: sessions('child') }).listWishes({
      sessionToken: 'child-session',
    });
    expect(childRepo.listWishes).toHaveBeenCalledWith('family-1', 'child-1');

    const parentRepo = repository();
    await new RewardService({ repository: parentRepo, sessions: sessions('parent') }).listWishes({
      sessionToken: 'parent-session',
    });
    expect(parentRepo.listWishes).toHaveBeenCalledWith('family-1', undefined);
  });
});
