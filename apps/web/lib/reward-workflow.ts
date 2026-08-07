export type RedemptionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
export type WishStatus = 'ACTIVE' | 'ADOPTED' | 'CANCELLED';
export type WorkflowRewardType = 'PHYSICAL' | 'PRIVILEGE' | 'EXPERIENCE' | 'CUSTOM';
export type WorkflowRewardStatus = 'ACTIVE' | 'INACTIVE';

export type RewardWorkflowRedemption = Readonly<{
  id: string;
  child_id: string;
  reward_id: string;
  points_spent: number;
  status: RedemptionStatus;
  rejection_reason?: string | null;
}>;

export type RewardWorkflowWish = Readonly<{
  id: string;
  child_id: string;
  title: string;
  description?: string | null;
  target_points: number;
  status: WishStatus;
  progress: Readonly<{ points: number; remaining?: number; ratio: number }>;
}>;

export type WishAdoptionPayload = Readonly<{
  type: WorkflowRewardType;
  stock_total: number | null;
  prerequisites: Readonly<{
    min_level?: number;
    redeem_limit?: Readonly<{
      per_day?: number;
      per_week?: number;
      per_month?: number;
    }>;
  }>;
  status: WorkflowRewardStatus;
}>;

type AdoptionFormData = Pick<FormData, 'get'>;

const redemptionLabels: Readonly<Record<RedemptionStatus, string>> = {
  PENDING: '待审批',
  APPROVED: '待兑现',
  REJECTED: '已拒绝，退款完成',
  FULFILLED: '已兑现',
};

export function redemptionStatusLabel(status: RedemptionStatus): string {
  return redemptionLabels[status];
}

export function activeWishes<T extends { status: WishStatus }>(wishes: readonly T[]): T[] {
  return wishes.filter((wish) => wish.status === 'ACTIVE');
}

function optionalPositiveInteger(form: AdoptionFormData, key: string): number | undefined {
  const value = String(form.get(key) ?? '').trim();
  return value ? Number(value) : undefined;
}

export function buildWishAdoptionPayload(form: AdoptionFormData): WishAdoptionPayload {
  const stock = String(form.get('stock_total') ?? '').trim();
  const minLevel = optionalPositiveInteger(form, 'min_level');
  const perDay = optionalPositiveInteger(form, 'per_day');
  const perWeek = optionalPositiveInteger(form, 'per_week');
  const perMonth = optionalPositiveInteger(form, 'per_month');
  const redeemLimit = {
    ...(perDay === undefined ? {} : { per_day: perDay }),
    ...(perWeek === undefined ? {} : { per_week: perWeek }),
    ...(perMonth === undefined ? {} : { per_month: perMonth }),
  };

  return {
    type: String(form.get('type') ?? '') as WorkflowRewardType,
    stock_total: stock ? Number(stock) : null,
    prerequisites: {
      ...(minLevel === undefined ? {} : { min_level: minLevel }),
      ...(Object.keys(redeemLimit).length === 0 ? {} : { redeem_limit: redeemLimit }),
    },
    status: String(form.get('status') ?? '') as WorkflowRewardStatus,
  };
}
