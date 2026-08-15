const { expect, test } = require('@playwright/test');

const {
  assertNoHorizontalOverflow,
  calendarDate,
  createChild,
  createTask,
  expectStatus,
  loginChild,
  nonce,
  registerParent,
} = require('./real-fixture.cjs');

test.skip(
  !process.env.REAL_ACCEPTANCE,
  'Runs only against the isolated deployed acceptance environment.',
);
test.setTimeout(180_000);

async function waitForNotification(api, title) {
  let found;
  await expect
    .poll(
      async () => {
        const response = await api.get('/api/v1/notifications?limit=50');
        if (response.status() !== 200) return false;
        found = (await response.json()).data.notifications.find((item) => item.title === title);
        return Boolean(found);
      },
      { timeout: 30_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true);
  return found;
}

test('closes parent and child notification read flows and persists parent preferences', async ({
  browser,
  page,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');
  const run = nonce('notifications');
  const session = await registerParent(page.request, run, '通知闭环');
  const child = await createChild(page.request, run);
  const task = await createTask(page.request, child, run, {
    name: `通知审核任务${run}`,
    verify_mode: 'MANUAL',
    base_points: 19,
  });
  const childContext = await loginChild(browser, baseURL, session.family_code, child);
  const checkInResponse = await childContext.request.post('/api/v1/check-ins', {
    headers: { 'Idempotency-Key': `notification-check-in-${run}` },
    data: {
      task_assignment_id: task.assignments[0].id,
      check_date: calendarDate(),
      content: { media_ids: [] },
    },
  });
  await expectStatus(checkInResponse, 201, 'create notification check-in');
  const checkIn = (await checkInResponse.json()).data.check_in;
  await expectStatus(
    await page.request.post(`/api/v1/check-ins/${checkIn.id}/reviews`, {
      headers: { 'Idempotency-Key': `notification-review-${run}` },
      data: { status: 'APPROVED' },
    }),
    200,
    'approve notification check-in',
  );
  await expectStatus(
    await page.request.post('/api/v1/auth/parent/invitations', {
      data: { email: `notification-invite-${run}@example.com` },
    }),
    201,
    'create parent notification source',
  );

  await waitForNotification(page.request, '家庭邀请已创建');
  await waitForNotification(childContext.request, '审核已通过');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  const parentBell = page.getByRole('link', { name: /^通知，\d+ 条未读$/ });
  await expect(parentBell).toBeVisible();
  await parentBell.click();
  await expect(page.getByRole('heading', { name: '通知', exact: true })).toBeVisible();
  await expect(page.getByText('家庭邀请已创建', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '标为已读' }).first().click();
  await expect(page.getByRole('button', { name: '标为已读' }).first()).toHaveCount(0);

  const quietHours = page.getByLabel('启用免打扰时段');
  await quietHours.check();
  await page.getByLabel('开始时间').fill('21:30');
  await page.getByLabel('结束时间').fill('06:45');
  await page.getByLabel('浏览器通知总开关').check();
  await page.getByRole('button', { name: '保存通知偏好' }).click();
  await expect(page.getByRole('status').filter({ hasText: '通知偏好已保存并刷新' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('启用免打扰时段')).toBeChecked();
  await expect(page.getByLabel('开始时间')).toHaveValue('21:30');
  await expect(page.getByLabel('结束时间')).toHaveValue('06:45');
  await assertNoHorizontalOverflow(page);

  const childPage = await childContext.newPage();
  await childPage.setViewportSize({ width: 390, height: 844 });
  await childPage.goto('/child');
  const childBell = childPage.getByRole('link', { name: /^通知，\d+ 条未读$/ });
  await expect(childBell).toBeVisible();
  await childBell.click();
  await expect(childPage.getByText('审核已通过', { exact: true })).toBeVisible();
  await childPage.getByRole('button', { name: '全部已读' }).click();
  await expect(childPage.getByRole('button', { name: '全部已读' })).toBeDisabled();
  await assertNoHorizontalOverflow(childPage);
  await childContext.close();
});

test.describe.serial('family module persistence', () => {
  test('hides rewards in both portals, rejects direct access, and restores retained data', async ({
    browser,
    page,
  }) => {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL;
    if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');
    const run = nonce('modules');
    const session = await registerParent(page.request, run, '模块闭环');
    const child = await createChild(page.request, run);
    const rewardName = `保留奖励${run}`;
    await expectStatus(
      await page.request.post('/api/v1/rewards', {
        data: {
          name: rewardName,
          description: '模块重开后仍应存在。',
          points_cost: 25,
          image_media_id: null,
          type: 'CUSTOM',
          stock_total: null,
          prerequisites: {},
          status: 'ACTIVE',
        },
      }),
      201,
      'create retained reward',
    );
    const childContext = await loginChild(browser, baseURL, session.family_code, child);
    const childPage = await childContext.newPage();

    await page.goto('/settings');
    const modulesPanel = page.locator('section.panel').filter({ hasText: '家庭模块' });
    const rewardToggle = modulesPanel.locator('label').filter({ hasText: '奖励' }).locator('input');
    await expect(rewardToggle).toBeChecked();
    await rewardToggle.click();
    await expect(modulesPanel.getByRole('status')).toContainText('奖励已关闭');
    await expect(rewardToggle).not.toBeChecked();

    await page.goto('/dashboard');
    await expect(
      page.getByRole('navigation', { name: '家长端模块导航' }).getByRole('link', { name: '奖励' }),
    ).toHaveCount(0);
    await page.goto('/rewards');
    await expect(page.getByRole('heading', { name: '奖励已受限' })).toBeVisible();

    await childPage.goto('/child');
    await expect(
      childPage
        .getByRole('navigation', { name: '孩子端主导航' })
        .getByRole('link', { name: '奖励' }),
    ).toHaveCount(0);
    await childPage.goto('/child/rewards');
    await expect(childPage.getByRole('heading', { name: '奖励已受限' })).toBeVisible();
    const disabledApi = await childContext.request.get('/api/v1/rewards');
    expect(disabledApi.status()).toBe(403);
    expect(await disabledApi.json()).toMatchObject({ error: { code: 'MODULE_DISABLED' } });

    await page.goto('/settings');
    const refreshedPanel = page.locator('section.panel').filter({ hasText: '家庭模块' });
    const refreshedToggle = refreshedPanel
      .locator('label')
      .filter({ hasText: '奖励' })
      .locator('input');
    await refreshedToggle.click();
    await expect(refreshedPanel.getByRole('status')).toContainText('奖励已启用');
    await expect(refreshedToggle).toBeChecked();

    await page.goto('/rewards');
    await expect(page.getByRole('heading', { name: rewardName, exact: true })).toBeVisible();
    await childPage.goto('/child/rewards');
    await expect(childPage.getByText(rewardName, { exact: true })).toBeVisible();
    await childContext.close();
  });
});
