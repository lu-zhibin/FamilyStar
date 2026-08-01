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

async function mockApi(page, handler) {
  await page.route('**/api/v1/**', async (route) => {
    const override = handler?.(route.request());
    await route.fulfill(override ?? envelope({}));
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
    await mockApi(page);
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
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('familystar_role', 'child'));
    await page.goto('/tasks');
    await expect(page.getByRole('alert').filter({ hasText: '需要家长身份' })).toBeVisible();

    await page.evaluate(() => localStorage.setItem('familystar_role', 'parent'));
    await page.goto('/child');
    await expect(page.getByRole('alert').filter({ hasText: '需要孩子身份' })).toBeVisible();
  });
});

test.describe('FamilyStar core browser flows', () => {
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

  test('submits solo and collaboration check-ins with idempotency keys', async ({ page }) => {
    const submissions = [];
    await mockApi(page, (request) => {
      if (request.method() === 'POST' && /check-ins|collaboration-rounds/.test(request.url())) {
        submissions.push({
          url: request.url(),
          key: request.headers()['idempotency-key'],
          body: request.postDataJSON(),
        });
        return envelope(
          {
            check_in: { id: 'check-in-e2e', status: 'PENDING' },
            submission: { id: 'collaboration-e2e', status: 'PENDING' },
          },
          201,
        );
      }
      return undefined;
    });
    await page.goto('/child/check-ins');
    const solo = page.locator('article').filter({ hasText: '数学口算练习' });
    await solo.getByRole('button', { name: '去打卡' }).click();
    await page.getByLabel('说说完成情况').fill('今天完成了全部口算题。');
    await page.getByRole('button', { name: '完成打卡' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '打卡成功' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: '关闭弹窗' }).click();

    const collaboration = page.locator('article').filter({ hasText: '周末大扫除' });
    await collaboration.getByRole('button', { name: '去打卡' }).click();
    await page.getByLabel('说说完成情况').fill('已经整理好自己的房间。');
    await page.getByRole('button', { name: '完成打卡' }).click();

    await expect.poll(() => submissions.length).toBe(2);
    expect(submissions.every(({ key }) => /^check-in-/.test(key))).toBe(true);
    expect(submissions.some(({ url }) => url.includes('collaboration-rounds'))).toBe(true);
  });

  test('simulates COS multipart calls and displays PIN lock countdown', async ({ page }) => {
    const cosCalls = [];
    await mockApi(page, (request) => {
      const url = request.url();
      if (url.includes('/media/uploads')) {
        cosCalls.push(url);
        if (url.endsWith('/complete')) {
          return envelope({ upload: { id: 'upload-e2e', media_id: 'media-e2e', status: 'READY' } });
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
    });
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
    await page.getByRole('button', { name: '通过并发分' }).first().click();

    await page.goto('/child/achievements');
    await expect(page.getByText('20 级成长阶梯', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar').first()).toBeVisible();

    await page.goto('/child/rewards');
    const reward = page.locator('article').filter({ hasText: '动画时间 30 分钟' });
    await reward.getByRole('button', { name: '立即兑换' }).click();
    await expect(page.getByRole('dialog', { name: '确认兑换' })).toBeVisible();
    await page.getByRole('button', { name: /确认支付/ }).click();
    await expect.poll(() => writes.some((url) => url.includes('/redemptions'))).toBe(true);

    await page.goto('/rewards');
    await expect(page.getByText(/库存/).first()).toBeVisible();
    await expect(page.getByText('REFUNDED', { exact: true })).toBeVisible();
  });
});
