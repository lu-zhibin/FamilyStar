import { describe, expect, it } from 'vitest';

import {
  badgeConditionLabel,
  badgeConditionTypes,
  badgeProgressPercent,
  buildBadgeTemplatePayload,
} from './badges';

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
      '条件目标必须为 1 至 2147483647 的整数',
    );
    expect(() => buildBadgeTemplatePayload(badgeForm('LEVEL_REACHED', '1.5'))).toThrow(
      '条件目标必须为 1 至 2147483647 的整数',
    );
  });

  it('property: every automatic form condition shares the API integer boundary', () => {
    for (const type of badgeConditionTypes.filter((value) => value !== 'MANUAL')) {
      for (const target of [1, 2, 97, 2_147_483_647]) {
        expect(buildBadgeTemplatePayload(badgeForm(type, String(target))).condition).toEqual({
          type,
          target,
        });
      }
      for (const target of ['-1', '0', '1.5', '2147483648', '9007199254740991']) {
        expect(() => buildBadgeTemplatePayload(badgeForm(type, target))).toThrow(
          '条件目标必须为 1 至 2147483647 的整数',
        );
      }
    }
  });

  it('enforces the same boundary for the award level', () => {
    const form = badgeForm('MANUAL');
    form.set('award_level', '2147483648');

    expect(() => buildBadgeTemplatePayload(form)).toThrow('颁发级别必须为 1 至 2147483647 的整数');
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
