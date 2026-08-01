import { createHash } from 'node:crypto';

import type { AuthSession } from '../family-auth/types.js';
import { normalizeReward, normalizeRewardPatch } from './logic.js';
import type { RewardDependencies, RewardInput, RewardOperations } from './types.js';

export class RewardAccessError extends Error {
  constructor(
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'RewardAccessError';
  }
}

export class RewardConflictError extends Error {
  readonly code = 'CONFLICT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'RewardConflictError';
  }
}

export class RewardEligibilityError extends Error {
  readonly code = 'CONFLICT' as const;

  constructor(message: string) {
    super(message);
    this.name = 'RewardEligibilityError';
  }
}

function validIdempotencyKey(value: string): boolean {
  return value.length >= 1 && value.length <= 128;
}

export class RewardService implements RewardOperations {
  private readonly now: () => Date;

  constructor(private readonly dependencies: RewardDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async listRewards(input: { sessionToken?: string }) {
    const session = await this.session(input.sessionToken);
    return {
      rewards: await this.dependencies.repository.listRewards(
        session.familyId,
        session.role === 'child',
      ),
    };
  }

  async getReward(input: { sessionToken?: string; rewardId: string }) {
    const session = await this.session(input.sessionToken);
    const reward = await this.dependencies.repository.findReward(
      session.familyId,
      input.rewardId,
      session.role === 'child',
    );
    if (!reward) throw new RewardAccessError('NOT_FOUND', 'The reward was not found.');
    return { reward };
  }

  async createReward(input: { sessionToken?: string; reward: RewardInput }) {
    const session = await this.parent(input.sessionToken);
    return {
      reward: await this.dependencies.repository.createReward(
        session.familyId,
        normalizeReward(input.reward),
      ),
    };
  }

  async updateReward(input: Parameters<RewardOperations['updateReward']>[0]) {
    const session = await this.parent(input.sessionToken);
    const reward = await this.dependencies.repository.updateReward(
      session.familyId,
      input.rewardId,
      normalizeRewardPatch(input.reward),
    );
    if (!reward) throw new RewardAccessError('NOT_FOUND', 'The reward was not found.');
    return { reward };
  }

  async removeReward(input: { sessionToken?: string; rewardId: string }) {
    const session = await this.parent(input.sessionToken);
    if (!(await this.dependencies.repository.softDeleteReward(session.familyId, input.rewardId))) {
      throw new RewardAccessError('NOT_FOUND', 'The reward was not found.');
    }
  }

  async requestRedemption(input: Parameters<RewardOperations['requestRedemption']>[0]) {
    const session = await this.child(input.sessionToken);
    if (!validIdempotencyKey(input.idempotencyKey)) {
      throw new RewardConflictError('A valid Idempotency-Key is required.');
    }
    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify({ childId: session.subjectId, rewardId: input.rewardId }))
      .digest('hex');
    return {
      redemption: await this.dependencies.repository.requestRedemption({
        familyId: session.familyId,
        childId: session.subjectId,
        rewardId: input.rewardId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        now: this.now(),
      }),
    };
  }

  async listRedemptions(input: { sessionToken?: string }) {
    const session = await this.session(input.sessionToken);
    return {
      redemptions: await this.dependencies.repository.listRedemptions(
        session.familyId,
        session.role === 'child' ? session.subjectId : undefined,
      ),
    };
  }

  async approveRedemption(input: Parameters<RewardOperations['approveRedemption']>[0]) {
    const session = await this.parent(input.sessionToken);
    return {
      redemption: await this.dependencies.repository.approveRedemption({
        familyId: session.familyId,
        redemptionId: input.redemptionId,
        parentId: session.subjectId,
        now: this.now(),
      }),
    };
  }

  async fulfillRedemption(input: Parameters<RewardOperations['fulfillRedemption']>[0]) {
    const session = await this.parent(input.sessionToken);
    return {
      redemption: await this.dependencies.repository.fulfillRedemption({
        familyId: session.familyId,
        redemptionId: input.redemptionId,
        parentId: session.subjectId,
        now: this.now(),
      }),
    };
  }

  async rejectRedemption(input: Parameters<RewardOperations['rejectRedemption']>[0]) {
    const session = await this.parent(input.sessionToken);
    const reason = input.reason.trim();
    if (reason.length === 0 || reason.length > 2_000) {
      throw new RewardConflictError('A rejection reason is required.');
    }
    return {
      redemption: await this.dependencies.repository.rejectRedemption({
        familyId: session.familyId,
        redemptionId: input.redemptionId,
        parentId: session.subjectId,
        reason,
        now: this.now(),
      }),
    };
  }

  async listWishes(input: { sessionToken?: string }) {
    const session = await this.session(input.sessionToken);
    return {
      wishes: await this.dependencies.repository.listWishes(
        session.familyId,
        session.role === 'child' ? session.subjectId : undefined,
      ),
    };
  }

  async createWish(input: Parameters<RewardOperations['createWish']>[0]) {
    const session = await this.child(input.sessionToken);
    const title = input.title.trim();
    const description = input.description?.trim() || null;
    if (
      title.length === 0 ||
      title.length > 120 ||
      (description?.length ?? 0) > 10_000 ||
      !Number.isSafeInteger(input.targetPoints) ||
      input.targetPoints <= 0 ||
      input.targetPoints > 2_147_483_647
    ) {
      throw new RewardConflictError('Invalid wish input.');
    }
    return {
      wish: await this.dependencies.repository.createWish({
        familyId: session.familyId,
        childId: session.subjectId,
        title,
        description,
        targetPoints: input.targetPoints,
        now: this.now(),
      }),
    };
  }

  async cancelWish(input: Parameters<RewardOperations['cancelWish']>[0]) {
    const session = await this.child(input.sessionToken);
    return {
      wish: await this.dependencies.repository.cancelWish({
        familyId: session.familyId,
        childId: session.subjectId,
        wishId: input.wishId,
        now: this.now(),
      }),
    };
  }

  async adoptWish(input: Parameters<RewardOperations['adoptWish']>[0]) {
    const session = await this.parent(input.sessionToken);
    const normalized = normalizeReward({
      name: 'adopted wish',
      pointsCost: 1,
      ...input.reward,
    });
    return this.dependencies.repository.adoptWish({
      familyId: session.familyId,
      parentId: session.subjectId,
      wishId: input.wishId,
      reward: {
        imageMediaId: normalized.imageMediaId ?? null,
        type: normalized.type,
        stockTotal: normalized.stockTotal ?? null,
        prerequisites: normalized.prerequisites ?? {},
        status: normalized.status ?? 'ACTIVE',
      },
      now: this.now(),
    });
  }

  private async session(token?: string): Promise<AuthSession> {
    const session = token ? await this.dependencies.sessions.read(token) : null;
    if (!session) throw new RewardAccessError('UNAUTHORIZED', 'An active session is required.');
    return session;
  }

  private async parent(token?: string): Promise<AuthSession> {
    const session = await this.session(token);
    if (session.role !== 'parent')
      throw new RewardAccessError('FORBIDDEN', 'A parent session is required.');
    return session;
  }

  private async child(token?: string): Promise<AuthSession> {
    const session = await this.session(token);
    if (session.role !== 'child')
      throw new RewardAccessError('FORBIDDEN', 'A child session is required.');
    return session;
  }
}
