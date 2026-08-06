import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCosIntegrationPayload,
  buildChildCredentialPatch,
  buildChildProfilePatch,
  buildEmailIntegrationPayload,
  buildFamilyProfilePatch,
  buildSubmissionReviewRequest,
  buildTaskDraft,
  buildTaskFrequency,
  buildTaskPatch,
  canAccessParentPortal,
  copyTextToClipboard,
  formatFrequency,
  isParentSection,
  parentApi,
  parentSectionPaths,
  parentSections,
} from './parent-portal';

afterEach(() => vi.unstubAllGlobals());

describe('child management payloads', () => {
  it('normalizes editable profile fields and preserves an uploaded avatar', () => {
    const form = new FormData();
    form.set('nickname', '  小星  ');
    form.set('gender', 'female');
    form.set('birthday', '2020-02-29');
    form.set('grade', '  一年级  ');

    expect(buildChildProfilePatch(form, '2fb8569c-4b39-4adc-956e-e5da1edbdf4c')).toEqual({
      nickname: '小星',
      gender: 'female',
      birthday: '2020-02-29',
      grade: '一年级',
      avatar_media_id: '2fb8569c-4b39-4adc-956e-e5da1edbdf4c',
    });
  });

  it('uses null to clear optional profile fields', () => {
    const form = new FormData();
    form.set('nickname', '小树');
    form.set('gender', 'male');
    form.set('birthday', '');
    form.set('grade', '  ');

    expect(buildChildProfilePatch(form, null)).toMatchObject({
      birthday: null,
      grade: null,
      avatar_media_id: null,
    });
  });

  it('builds PIN and password resets and rejects invalid credentials', () => {
    const pin = new FormData();
    pin.set('credential_type', 'pin');
    pin.set('credential', '123456');
    pin.set('credential_confirmation', '123456');
    expect(buildChildCredentialPatch(pin)).toEqual({
      credential_type: 'pin',
      credential: '123456',
    });

    pin.set('credential_confirmation', '654321');
    expect(() => buildChildCredentialPatch(pin)).toThrow('两次输入的凭据不一致');

    const password = new FormData();
    password.set('credential_type', 'password');
    password.set('credential', '123456');
    password.set('credential_confirmation', '123456');
    expect(() => buildChildCredentialPatch(password)).toThrow('需要包含字母');

    password.set('credential_type', 'unknown');
    expect(() => buildChildCredentialPatch(password)).toThrow('请选择有效的登录凭据模式');
  });
});

describe('family profile payloads', () => {
  it('normalizes creator-managed family details', () => {
    const form = new FormData();
    form.set('name', '  星光家庭  ');
    form.set('time_zone', 'Asia/Shanghai');

    expect(buildFamilyProfilePatch(form, true)).toEqual({
      name: '星光家庭',
      time_zone: 'Asia/Shanghai',
    });
  });

  it('omits the restricted family name for a co-parent', () => {
    const form = new FormData();
    form.set('name', '越权名称');
    form.set('time_zone', 'Europe/Berlin');

    expect(buildFamilyProfilePatch(form, false)).toEqual({ time_zone: 'Europe/Berlin' });
  });
});

describe('integration settings payloads', () => {
  it('builds email configuration and numeric SMTP port', () => {
    expect(
      buildEmailIntegrationPayload(
        {
          host: ' smtp.example.com ',
          port: '465',
          tlsMode: 'tls',
          fromName: ' FamilyStar ',
          fromAddress: 'family@example.com',
          username: 'family@example.com',
          password: 'authorization-code',
        },
        false,
      ),
    ).toEqual({
      configuration: {
        host: 'smtp.example.com',
        port: 465,
        tls_mode: 'tls',
        from_name: 'FamilyStar',
        from_address: 'family@example.com',
      },
      credentials: { username: 'family@example.com', password: 'authorization-code' },
    });
  });

  it('preserves stored credentials when credential inputs are empty', () => {
    expect(
      buildCosIntegrationPayload(
        {
          bucket: 'family-123',
          region: 'ap-guangzhou',
          domain: 'https://family.example.com',
          secretId: '',
          secretKey: '',
        },
        true,
      ),
    ).toEqual({
      configuration: {
        bucket: 'family-123',
        region: 'ap-guangzhou',
        domain: 'https://family.example.com',
      },
    });
  });

  it('rejects partial or missing credentials', () => {
    expect(() =>
      buildCosIntegrationPayload(
        {
          bucket: 'family-123',
          region: 'ap-guangzhou',
          domain: 'https://family.example.com',
          secretId: 'secret-id',
          secretKey: '',
        },
        true,
      ),
    ).toThrow('SecretId和SecretKey需要同时填写');
  });

  it('accepts successful 204 responses from delete operations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(
      parentApi<void>('/family/integrations/email', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });
});

describe('submission review requests', () => {
  const target = {
    target_type: 'CHECK_IN' as const,
    target_id: 'check-in-1',
    attempt_id: 'attempt-2',
  };

  it('uses a stable attempt-scoped idempotency key and target route', () => {
    expect(buildSubmissionReviewRequest(target, 'APPROVED')).toEqual({
      path: '/check-ins/check-in-1/reviews',
      idempotencyKey: 'review:attempt-2:APPROVED',
      body: { status: 'APPROVED' },
    });
    expect(buildSubmissionReviewRequest(target, 'APPROVED').idempotencyKey).toBe(
      buildSubmissionReviewRequest(target, 'APPROVED').idempotencyKey,
    );
  });

  it('routes collaboration reviews and trims rejection reasons', () => {
    expect(
      buildSubmissionReviewRequest(
        { ...target, target_type: 'COLLABORATION_SUBMISSION', target_id: 'submission-1' },
        'REJECTED',
        '  请补充照片  ',
      ),
    ).toEqual({
      path: '/collaboration-submissions/submission-1/reviews',
      idempotencyKey: 'review:attempt-2:REJECTED',
      body: { status: 'REJECTED', reason: '请补充照片' },
    });
  });
});

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
    form.set('collaboration_mode', 'SOLO');
    form.set('frequency_kind', 'daily');
    return form;
  }

  it('omits an empty optional description from the API request', () => {
    expect(buildTaskDraft(taskForm('  '), '2026-08-01')).toEqual({
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
    expect(buildTaskDraft(taskForm('  阅读第三章  '), '2026-08-01')).toMatchObject({
      description: '阅读第三章',
    });
  });

  it('builds a collaboration task with unique child assignments', () => {
    const form = taskForm('一起完成');
    form.set('collaboration_mode', 'COLLAB');
    form.append('child_id', 'child-2');
    form.append('child_id', 'child-1');

    expect(buildTaskDraft(form, '2026-08-01')).toMatchObject({
      collaboration_mode: 'COLLAB',
      assignments: [
        { child_id: 'child-1', start_date: '2026-08-01' },
        { child_id: 'child-2', start_date: '2026-08-01' },
      ],
    });
  });

  it('requires one child for solo tasks and at least two for collaboration tasks', () => {
    const solo = taskForm('');
    solo.delete('child_id');
    expect(() => buildTaskDraft(solo, '2026-08-01')).toThrow('单人任务需要选择一名孩子。');

    const collaboration = taskForm('');
    collaboration.set('collaboration_mode', 'COLLAB');
    expect(() => buildTaskDraft(collaboration, '2026-08-01')).toThrow(
      '协作任务至少需要选择两名孩子。',
    );
  });
});

describe('task update payload', () => {
  function taskForm(description: string): FormData {
    const form = new FormData();
    form.set('task_type_id', 'type-2');
    form.set('name', '  每天整理书桌  ');
    form.set('description', description);
    form.set('check_type', 'TICK');
    form.set('verify_mode', 'AUTO');
    form.set('base_points', '20');
    form.set('frequency_kind', 'weekly_count');
    form.set('frequency_count', '3');
    return form;
  }

  it('builds the editable task fields without replacing assignments', () => {
    expect(buildTaskPatch(taskForm('  完成后勾选  '))).toEqual({
      task_type_id: 'type-2',
      name: '每天整理书桌',
      description: '完成后勾选',
      check_type: 'TICK',
      verify_mode: 'AUTO',
      frequency: { kind: 'weekly_count', count: 3 },
      base_points: 20,
    });
  });

  it('uses null to clear an optional description', () => {
    expect(buildTaskPatch(taskForm('  '))).toMatchObject({ description: null });
  });
});

describe('task frequency payload', () => {
  it('builds selected weekdays', () => {
    const form = new FormData();
    form.set('frequency_kind', 'weekdays');
    form.append('frequency_weekdays', '1');
    form.append('frequency_weekdays', '5');
    expect(buildTaskFrequency(form)).toEqual({ kind: 'weekdays', weekdays: [1, 5] });
  });

  it('builds an API date range', () => {
    const form = new FormData();
    form.set('frequency_kind', 'date_range');
    form.set('frequency_start_date', '2026-08-05');
    form.set('frequency_end_date', '2026-08-12');
    expect(buildTaskFrequency(form)).toEqual({
      kind: 'date_range',
      start_date: '2026-08-05',
      end_date: '2026-08-12',
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
