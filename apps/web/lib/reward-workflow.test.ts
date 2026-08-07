import { describe, expect, it } from 'vitest';

import {
  activeWishes,
  buildWishAdoptionPayload,
  redemptionStatusLabel,
  type RedemptionStatus,
} from './reward-workflow';

describe('reward workflow helpers', () => {
  it.each([
    ['PENDING', '待审批'],
    ['APPROVED', '待兑现'],
    ['REJECTED', '已拒绝，退款完成'],
    ['FULFILLED', '已兑现'],
  ] as const)('localizes %s redemptions', (status, label) => {
    expect(redemptionStatusLabel(status satisfies RedemptionStatus)).toBe(label);
  });

  it('keeps every active wish in source order', () => {
    const wishes = [
      { id: 'one', status: 'ACTIVE' as const },
      { id: 'two', status: 'ADOPTED' as const },
      { id: 'three', status: 'ACTIVE' as const },
      { id: 'four', status: 'CANCELLED' as const },
    ];

    expect(activeWishes(wishes).map(({ id }) => id)).toEqual(['one', 'three']);
  });

  it('builds the strict wish adoption contract with all configured limits', () => {
    const form = new FormData();
    form.set('type', 'EXPERIENCE');
    form.set('stock_total', '8');
    form.set('min_level', '3');
    form.set('per_day', '1');
    form.set('per_week', '2');
    form.set('per_month', '4');
    form.set('status', 'ACTIVE');

    expect(buildWishAdoptionPayload(form)).toEqual({
      type: 'EXPERIENCE',
      stock_total: 8,
      prerequisites: {
        min_level: 3,
        redeem_limit: { per_day: 1, per_week: 2, per_month: 4 },
      },
      status: 'ACTIVE',
    });
  });

  it('uses unlimited stock and omits unconfigured prerequisites', () => {
    const form = new FormData();
    form.set('type', 'CUSTOM');
    form.set('status', 'INACTIVE');

    expect(buildWishAdoptionPayload(form)).toEqual({
      type: 'CUSTOM',
      stock_total: null,
      prerequisites: {},
      status: 'INACTIVE',
    });
  });
});
