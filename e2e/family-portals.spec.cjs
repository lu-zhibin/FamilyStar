const { expect, test } = require('@playwright/test');

const parentPages = [
  ['/dashboard', '家庭总览', '总览'],
  ['/tasks', '任务管理', '任务'],
  ['/reviews', '打卡审核', '审核'],
  ['/rewards', '奖励管理', '奖励'],
  ['/levels', '等级与成就', '等级'],
  ['/stats', '数据面板', '数据'],
  ['/records', '成长记录', '记录'],
  ['/family', '家庭成员', '成员'],
  ['/settings', '设置', '设置'],
];

const childPages = [
  ['/child', '今日任务', '主页'],
  ['/child/check-ins', '今日打卡', '打卡'],
  ['/child/achievements', '20 级成长阶梯', '成就'],
  ['/child/rewards', '奖励商店', '奖励'],
  ['/child/records', '我的记录', '我的'],
  ['/child/profile', '我的空间', '我的'],
];

function envelope(data, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      success: status < 400,
      ...(status < 400
        ? { data }
        : {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Child account is temporarily locked.',
              details: { remaining_seconds: 900 },
            },
          }),
      meta: { request_id: 'playwright-e2e', timestamp: '2026-08-01T00:00:00.000Z' },
    }),
  };
}

const childFixture = {
  id: 'child-e2e',
  nickname: '小宇',
  grade: '三年级',
  gender: 'male',
  credential_type: 'pin',
};

const levelFixture = {
  user_id: childFixture.id,
  points_earned_total: 120,
  current_level: 3,
  current: { level: 3, name: '成长', icon: 'star', points_required: 100 },
  benefits: { discount: 1, effective_auto_approve_quota: 0, wish_slots: 1 },
  next: {
    level: 4,
    name: '进阶',
    icon: 'star',
    points_required: 180,
    points_remaining: 60,
    progress_ratio: 0.25,
  },
};

function defaultApiResponse(request, role) {
  const url = request.url();
  if (url.endsWith('/auth/session')) {
    return envelope({
      role,
      subject_id: `${role}-e2e`,
      family_id: 'family-e2e',
      family_code: '123456',
    });
  }
  if (url.endsWith('/family/children')) return envelope({ children: [childFixture] });
  if (url.endsWith('/family/task-types')) {
    return envelope({
      task_types: [{ id: 'task-type-e2e', name: '日常习惯', icon: 'star', is_system: true }],
    });
  }
  if (url.endsWith('/family/tasks')) return envelope({ tasks: [] });
  if (url.endsWith('/family/submission-reviews/pending')) return envelope({ reviews: [] });
  if (url.endsWith('/levels/me') || /\/levels\/[^/]+$/.test(url)) {
    return envelope({ level: levelFixture });
  }
  if (url.endsWith('/rewards')) {
    return envelope({
      rewards: [
        {
          id: 'reward-e2e',
          name: '动画时间 30 分钟',
          description: '完成任务后休息一下',
          points_cost: 30,
          type: 'PRIVILEGE',
          stock_available: null,
          prerequisites: {},
        },
      ],
    });
  }
  if (url.endsWith('/redemptions')) return envelope({ redemptions: [] });
  if (url.endsWith('/wishes')) return envelope({ wishes: [] });
  if (url.endsWith('/auth/switch-targets')) return envelope({ children: [childFixture] });
  return envelope({});
}

async function setPortalRole(page, role) {
  await page.context().addCookies([
    {
      name: 'familystar_session',
      value: `${role}-e2e-session`,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function mockApi(page, handler, role = 'parent') {
  await setPortalRole(page, role);
  await page.route('**/api/v1/**', async (route) => {
    const override = handler?.(route.request());
    await route.fulfill(override ?? defaultApiResponse(route.request(), role));
  });
}

test.describe('FamilyStar portal routes', () => {
  test('renders all nine parent pages with current navigation state', async ({ page }) => {
    test.setTimeout(120_000);
    await mockApi(page);
    for (const [path, heading, navigationLabel] of parentPages) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      const navigation = page.getByRole('navigation', { name: '家长端模块导航' });
      await expect(navigation).toBeVisible();
      await expect(
        navigation.getByRole('link', { name: navigationLabel, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });

  test('renders all six child pages on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, undefined, 'child');
    for (const [path, heading, navigationLabel] of childPages) {
      await page.goto(path);
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
      const navigation = page.getByRole('navigation', { name: '孩子端主导航' });
      await expect(navigation).toBeVisible();
      await expect(
        navigation.getByRole('link', { name: navigationLabel, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });

  test('enforces browser role guards for parent and child portals', async ({ page }) => {
    await mockApi(page);
    await page.goto('/child');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: '家庭总览' })).toBeVisible();

    await setPortalRole(page, 'child');
    await page.goto('/tasks');
    await expect(page).toHaveURL('/child');
    await expect(page.getByText('今日任务', { exact: true }).first()).toBeVisible();
  });
});

test.describe('FamilyStar core browser flows', () => {
  test('reloads the authoritative review queue and preserves failed submissions', async ({
    page,
  }) => {
    let pending = [
      {
        target_type: 'CHECK_IN',
        target_id: 'check-in-review-e2e',
        attempt_id: 'check-attempt-review-e2e',
        task: { id: 'task-review-e2e', name: '晨读' },
        child: { id: 'child-review-e2e', nickname: '小星' },
        content_text: '已经读完两章。',
        media: [],
        submitted_at: '2026-08-02T08:00:00.000Z',
      },
      {
        target_type: 'COLLABORATION_SUBMISSION',
        target_id: 'collaboration-review-e2e',
        attempt_id: 'collaboration-attempt-review-e2e',
        task: { id: 'task-collaboration-e2e', name: '整理房间' },
        child: { id: 'child-collaboration-e2e', nickname: '小月' },
        content_text: '已经整理好书桌。',
        media: [],
        submitted_at: '2026-08-02T08:10:00.000Z',
      },
    ];
    let queueReads = 0;
    let idempotencyKey;
    await mockApi(page, (request) => {
      const url = request.url();
      if (request.method() === 'GET' && url.endsWith('/family/submission-reviews/pending')) {
        queueReads += 1;
        return envelope({ reviews: pending });
      }
      if (request.method() === 'POST' && url.endsWith('/check-ins/check-in-review-e2e/reviews')) {
        idempotencyKey = request.headers()['idempotency-key'];
        pending = pending.filter(({ target_id }) => target_id !== 'check-in-review-e2e');
        return envelope({ review: { id: 'review-e2e', status: 'APPROVED' } });
      }
      if (
        request.method() === 'POST' &&
        url.endsWith('/collaboration-submissions/collaboration-review-e2e/reviews')
      ) {
        return envelope({}, 409);
      }
      return undefined;
    });

    await page.goto('/reviews');
    const approvedCard = page.locator('article').filter({ hasText: '晨读' });
    await approvedCard.getByRole('button', { name: '通过并发分' }).click();
    await expect(page.getByText('审核通过，积分已按规则处理。')).toBeVisible();
    await expect(approvedCard).toHaveCount(0);
    await expect.poll(() => queueReads).toBeGreaterThanOrEqual(2);
    expect(idempotencyKey).toBe('review:check-attempt-review-e2e:APPROVED');

    await page.reload();
    await expect(page.getByText('整理房间', { exact: true })).toBeVisible();
    await expect(page.getByText('晨读', { exact: true })).toHaveCount(0);
    const failedCard = page.locator('article').filter({ hasText: '整理房间' });
    await failedCard.getByRole('button', { name: '通过并发分' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '当前记录已保留' })).toBeVisible();
    await expect(failedCard).toBeVisible();
  });

  test('creates a parent task and preserves the API contract', async ({ page }) => {
    let taskPayload;
    await mockApi(page, (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/family/tasks')) {
        taskPayload = request.postDataJSON();
        return envelope(
          {
            task: {
              id: 'task-e2e',
              ...taskPayload,
              task_type_id: taskPayload.task_type_id,
              status: 'ACTIVE',
            },
          },
          201,
        );
      }
      return undefined;
    });
    await page.goto('/tasks');
    await page.getByRole('button', { name: '创建任务' }).click();
    await page.getByLabel('任务名称').fill('整理学习桌');
    await page.getByRole('button', { name: '创建并启用' }).click();
    await expect.poll(() => taskPayload?.name).toBe('整理学习桌');
    expect(taskPayload.assignments).toHaveLength(1);
  });

  test('keeps child check-ins in the explicit limited state', async ({ page }) => {
    await mockApi(page, undefined, 'child');
    await page.goto('/child/check-ins');
    await expect(page.getByText('今日任务接口待接入', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '去打卡' })).toHaveCount(0);
  });

  test('simulates COS multipart calls and displays PIN lock countdown', async ({ page }) => {
    const cosCalls = [];
    await mockApi(
      page,
      (request) => {
        const url = request.url();
        if (url.includes('/media/uploads')) {
          cosCalls.push(url);
          if (url.endsWith('/complete')) {
            return envelope({
              upload: { id: 'upload-e2e', media_id: 'media-e2e', status: 'READY' },
            });
          }
          return envelope(
            { upload: { id: 'upload-e2e', media_id: 'media-e2e', status: 'UPLOADING' } },
            201,
          );
        }
        if (url.endsWith('/auth/switch-targets')) {
          return envelope({
            children: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                nickname: '小宇',
                credential_type: 'pin',
                gender: 'male',
              },
            ],
          });
        }
        if (url.endsWith('/auth/child/switch') && request.method() === 'POST')
          return envelope({}, 401);
        return undefined;
      },
      'child',
    );
    await page.goto('/child');
    await page.evaluate(async () => {
      const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'cos-e2e' };
      await fetch('/api/v1/media/uploads', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'IMAGE',
          mime_type: 'image/png',
          checksum: 'a'.repeat(64),
          size_bytes: 8,
        }),
      });
      await fetch('/api/v1/media/uploads/upload-e2e/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    });
    await expect.poll(() => cosCalls.length).toBe(2);

    await page.getByRole('button', { name: '切换家庭账号' }).click();
    await page.getByLabel('PIN 或密码').fill('0000');
    await page.getByRole('button', { name: '进入个人空间' }).click();
    await expect(page.getByRole('timer')).toContainText(/14:5\d|15:00/);
  });

  test('covers review timeout, level progress, inventory redemption and refund states', async ({
    page,
  }) => {
    const writes = [];
    await mockApi(page, (request) => {
      if (request.method() === 'POST') writes.push(request.url());
      if (request.method() === 'GET' && request.url().endsWith('/redemptions')) {
        return envelope({
          redemptions: [
            {
              id: 'redemption-refunded-e2e',
              child_id: 'child-e2e',
              reward_id: 'reward-e2e',
              points_spent: 30,
              status: 'REFUNDED',
            },
          ],
        });
      }
      return undefined;
    });
    await page.goto('/reviews');
    await expect(page.getByText(/超时/).first()).toBeVisible();

    await setPortalRole(page, 'child');
    await page.goto('/child/achievements');
    await expect(page.getByText('20 级成长阶梯', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar').first()).toBeVisible();

    await page.goto('/child/rewards');
    const reward = page.locator('article').filter({ hasText: '动画时间 30 分钟' });
    await reward.getByRole('button', { name: '立即兑换' }).click();
    await expect(page.getByRole('dialog', { name: '确认兑换' })).toBeVisible();
    await page.getByRole('button', { name: /确认支付/ }).click();
    await expect.poll(() => writes.some((url) => url.includes('/redemptions'))).toBe(true);

    await setPortalRole(page, 'parent');
    await page.goto('/rewards');
    await expect(page.getByText(/库存/).first()).toBeVisible();
    await expect(page.getByText('REFUNDED', { exact: true })).toBeVisible();
  });
});
