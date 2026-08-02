import { describe, expect, it } from 'vitest';

import {
  buildSoloTaskDraft,
  canAccessParentPortal,
  copyTextToClipboard,
  formatFrequency,
  isParentSection,
  parentSectionPaths,
  parentSections,
} from './parent-portal';

describe('task creation payload', () => {
  function taskForm(description: string): FormData {
    const form = new FormData();
    form.set('task_type_id', 'type-1');
    form.set('name', '每天阅读');
    form.set('description', description);
    form.set('check_type', 'TEXT');
    form.set('verify_mode', 'MANUAL');
    form.set('base_points', '10');
    form.set('child_id', 'child-1');
    return form;
  }

  it('omits an empty optional description from the API request', () => {
    expect(buildSoloTaskDraft(taskForm('  '), '2026-08-01')).toEqual({
      task_type_id: 'type-1',
      name: '每天阅读',
      check_type: 'TEXT',
      verify_mode: 'MANUAL',
      collaboration_mode: 'SOLO',
      frequency: { kind: 'daily' },
      base_points: 10,
      assignments: [{ child_id: 'child-1', start_date: '2026-08-01' }],
    });
  });

  it('trims and preserves a provided description', () => {
    expect(buildSoloTaskDraft(taskForm('  阅读第三章  '), '2026-08-01')).toMatchObject({
      description: '阅读第三章',
    });
  });
});

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

    await copyTextToClipboard('012345', {
      clipboard: { writeText: async (text) => void writes.push(text) },
      legacyCopy: () => false,
    });

    expect(writes).toEqual(['012345']);
  });

  it('falls back to legacy selection copy and reports failure', async () => {
    const copied: string[] = [];

    await copyTextToClipboard('012345', {
      clipboard: null,
      legacyCopy: (text) => copied.push(text) > 0,
    });

    expect(copied).toEqual(['012345']);
    await expect(
      copyTextToClipboard('012345', { clipboard: null, legacyCopy: () => false }),
    ).rejects.toThrow('Clipboard access is unavailable.');
  });
});
