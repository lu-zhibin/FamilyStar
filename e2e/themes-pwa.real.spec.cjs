const { expect, test } = require('@playwright/test');

const {
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
test.setTimeout(150_000);

test('locks unavailable themes and persists a real unlocked selection with controlled CSS tokens', async ({
  browser,
  page,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');
  const run = nonce('themes');
  const session = await registerParent(page.request, run, '主题闭环');
  const child = await createChild(page.request, run);
  const task = await createTask(page.request, child, run, {
    name: `主题升级任务${run}`,
    base_points: 220,
  });
  const childContext = await loginChild(browser, baseURL, session.family_code, child);
  await expectStatus(
    await childContext.request.post('/api/v1/check-ins', {
      headers: { 'Idempotency-Key': `theme-level-${run}` },
      data: {
        task_assignment_id: task.assignments[0].id,
        check_date: calendarDate(),
        content: { media_ids: [] },
      },
    }),
    201,
    'complete theme level task',
  );
  await expect
    .poll(async () => {
      const response = await childContext.request.get('/api/v1/themes');
      if (response.status() !== 200) return 0;
      return (await response.json()).data.current_level;
    })
    .toBeGreaterThanOrEqual(3);

  const childPage = await childContext.newPage();
  await childPage.setViewportSize({ width: 390, height: 844 });
  await childPage.goto('/child/profile');
  const ocean = childPage.getByRole('article', { name: 'Ocean主题，已解锁' });
  await expect(ocean).toBeVisible();
  const forest = childPage.getByRole('article', { name: 'Forest主题，锁定' });
  await expect(forest.getByRole('button', { name: '尚未解锁' })).toBeDisabled();
  await ocean.getByRole('button', { name: '选择主题' }).click();
  await expect(childPage.getByRole('alert').filter({ hasText: 'Ocean 主题已应用' })).toBeVisible();
  await expect(childPage.locator('.child-theme-shell')).toHaveAttribute('data-theme', 'ocean');
  await expect
    .poll(() =>
      childPage
        .locator('.child-theme-shell')
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue('--color-primary').trim(),
        ),
    )
    .toBe('#0891b2');

  const lockedSelection = await childContext.request.patch('/api/v1/themes/selection', {
    data: { theme_key: 'forest' },
  });
  expect(lockedSelection.status()).toBe(409);
  expect(await lockedSelection.json()).toMatchObject({
    error: { code: 'CONFLICT', details: { theme_key: 'forest' } },
  });
  await childPage.reload();
  await expect(childPage.locator('.child-theme-shell')).toHaveAttribute('data-theme', 'ocean');
  await expect(childPage.getByRole('article', { name: 'Ocean主题，当前选择' })).toBeVisible();
  await childContext.close();
});

test('serves an installable manifest, activates caches, and falls back on offline navigation', async ({
  context,
  page,
}) => {
  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json');
  expect(await manifestResponse.json()).toMatchObject({
    name: 'FamilyStar 家庭成长助手',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    icons: [
      { src: '/icons/familystar-192.svg', sizes: '192x192' },
      { src: '/icons/familystar-512.svg', sizes: '512x512' },
    ],
  });

  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) => setTimeout(resolve, 500));
  });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);
  }
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await caches.keys()).some((key) => key.startsWith('familystar-pwa-')),
      ),
    )
    .toBe(true);
  const cachedShell = await page.evaluate(async () => {
    const [root, offline, manifest] = await Promise.all([
      caches.match('/'),
      caches.match('/offline'),
      caches.match('/manifest.webmanifest'),
    ]);
    return [root, offline, manifest].every(Boolean);
  });
  expect(cachedShell).toBe(true);

  await context.setOffline(true);
  try {
    await page.goto('/offline', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '暂时连接不到网络' })).toBeVisible();
    await expect(page.getByRole('button', { name: '重新连接' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
