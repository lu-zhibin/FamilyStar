import { describe, expect, it } from 'vitest';

import {
  canAccessParentPortal,
  formatFrequency,
  isParentSection,
  parentSectionPaths,
  parentSections,
} from './parent-portal';

describe('parent portal routing', () => {
  it('defines nine unique parent routes', () => {
    expect(parentSections).toHaveLength(9);
    expect(new Set(Object.values(parentSectionPaths))).toHaveLength(9);
    expect(parentSections.every((section) => isParentSection(section))).toBe(true);
  });

  it('rejects unknown sections and child roles', () => {
    expect(isParentSection('unknown')).toBe(false);
    expect(canAccessParentPortal('child')).toBe(false);
    expect(canAccessParentPortal('parent')).toBe(true);
    expect(canAccessParentPortal(null)).toBe(true);
  });
});

describe('task frequency labels', () => {
  it('formats supported task frequencies', () => {
    expect(formatFrequency({ kind: 'daily' })).toBe('每天');
    expect(formatFrequency({ kind: 'weekly_count', count: 5 })).toBe('每周 5 次');
    expect(formatFrequency({ kind: 'weekdays' })).toBe('指定星期');
    expect(formatFrequency({ kind: 'date_range' })).toBe('日期范围');
  });
});
