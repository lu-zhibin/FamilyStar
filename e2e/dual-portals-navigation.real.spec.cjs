const { expect, test } = require('@playwright/test');

const {
  assertNoHorizontalOverflow,
  createChild,
  createTask,
  loginChild,
  nonce,
  registerParent,
} = require('./real-fixture.cjs');

test.skip(
  !process.env.REAL_ACCEPTANCE,
  'Runs only against the isolated deployed acceptance environment.',
);
test.setTimeout(180_000);

const parentPages = [
  ['/dashboard', '家庭总览', '总览'],
  ['/tasks', '任务管理', '任务'],
  ['/reviews', '打卡审核', '审核'],
  ['/rewards', '奖励管理', '奖励'],
  ['/levels', '等级与成就', '等级'],
  ['/badges', '徽章管理', '徽章'],
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

async function visitPages(page, pages, navigationName, viewport) {
  await page.setViewportSize(viewport);
  for (const [path, heading, navigationLabel] of pages) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
    const navigation = page.getByRole('navigation', { name: navigationName });
    await expect(navigation).toBeVisible();
    await expect(
      navigation.getByRole('link', { name: navigationLabel, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await assertNoHorizontalOverflow(page);
  }
}

test('navigates every current parent and child page on desktop and 390px mobile', async ({
  browser,
  page,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');
  const run = nonce('navigation');
  const session = await registerParent(page.request, run, '双端导航');
  const child = await createChild(page.request, run);
  await createTask(page.request, child, run);
  const childContext = await loginChild(browser, baseURL, session.family_code, child);
  const childPage = await childContext.newPage();

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await visitPages(page, parentPages, '家长端模块导航', viewport);
    await visitPages(childPage, childPages, '孩子端主导航', viewport);
  }

  await childContext.close();
});

test('recovers the family dashboard after an injected 503 response', async ({ page }) => {
  const run = nonce('recovery');
  await registerParent(page.request, run, '错误恢复');
  await createChild(page.request, run);
  let failed = false;
  await page.route('**/api/v1/family/dashboard*', async (route) => {
    if (failed) return route.continue();
    failed = true;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      json: {
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Injected dashboard failure.' },
      },
    });
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('alert').filter({ hasText: '家庭总览暂时无法读取' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '家长端模块导航' })).toBeVisible();
  await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.getByRole('heading', { name: '孩子今日进度' })).toBeVisible();
});
