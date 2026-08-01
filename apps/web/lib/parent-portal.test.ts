import { describe, expect, it } from 'vitest';

import {
  canAccessParentPortal,
  copyTextToClipboard,
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

describe('family-code clipboard', () => {
  it('uses the modern clipboard when available', async () => {
    const writes: string[] = [];

    await copyTextToClipboard('AB12CD34EF', {
      clipboard: { writeText: async (text) => void writes.push(text) },
      legacyCopy: () => false,
    });

    expect(writes).toEqual(['AB12CD34EF']);
  });

  it('falls back to legacy selection copy and reports failure', async () => {
    const copied: string[] = [];

    await copyTextToClipboard('AB12CD34EF', {
      clipboard: null,
      legacyCopy: (text) => copied.push(text) > 0,
    });

    expect(copied).toEqual(['AB12CD34EF']);
    await expect(
      copyTextToClipboard('AB12CD34EF', { clipboard: null, legacyCopy: () => false }),
    ).rejects.toThrow('Clipboard access is unavailable.');
  });
});
