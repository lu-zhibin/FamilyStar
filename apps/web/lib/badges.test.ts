import { describe, expect, it } from 'vitest';

import { badgeConditionLabel, badgeProgressPercent, buildBadgeTemplatePayload } from './badges';

function badgeForm(conditionType: string, target = ''): FormData {
  const form = new FormData();
  form.set('name', '  阅读之星  ');
  form.set('description', '  坚持阅读  ');
  form.set('icon', '  star  ');
  form.set('category', '  学习  ');
  form.set('condition_type', conditionType);
  form.set('condition_target', target);
  form.set('award_level', '2');
  form.set('is_visible', 'on');
  return form;
}

describe('badge helpers', () => {
  it('trims template input and omits a target for manual badges', () => {
    expect(buildBadgeTemplatePayload(badgeForm('MANUAL'))).toEqual({
      name: '阅读之星',
      description: '坚持阅读',
      icon: 'star',
      category: '学习',
      condition: { type: 'MANUAL' },
      award_level: 2,
      is_visible: true,
      is_enabled: false,
    });
  });

  it('requires a positive integer target for automatic badges', () => {
    expect(buildBadgeTemplatePayload(badgeForm('STREAK_DAYS', '7')).condition).toEqual({
      type: 'STREAK_DAYS',
      target: 7,
    });
    expect(() => buildBadgeTemplatePayload(badgeForm('TOTAL_POINTS', '0'))).toThrow(
      '条件目标必须为正整数',
    );
    expect(() => buildBadgeTemplatePayload(badgeForm('LEVEL_REACHED', '1.5'))).toThrow(
      '条件目标必须为正整数',
    );
  });

  it('formats Chinese condition labels and clamps progress percentages', () => {
    expect(badgeConditionLabel({ type: 'COLLABORATION_COUNT', target: 3 })).toBe('累计完成协作 3');
    expect(badgeConditionLabel({ type: 'MANUAL' })).toBe('手动颁发');
    expect(badgeProgressPercent(3, 4)).toBe(75);
    expect(badgeProgressPercent(8, 4)).toBe(100);
    expect(badgeProgressPercent(-1, 4)).toBe(0);
    expect(badgeProgressPercent(1, 0)).toBe(0);
  });
});
