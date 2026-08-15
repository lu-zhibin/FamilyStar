const { expect, test } = require('@playwright/test');

test.skip(
  !process.env.REAL_ACCEPTANCE,
  'Runs only against the isolated deployed acceptance environment.',
);
test.setTimeout(120_000);

function calendarDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function registerParent(page, suffix) {
  const response = await page.request.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `奖励管理验收家庭${suffix}`,
      nickname: '奖励管理验收家长',
      email: `familystar-reward-management-${suffix}@example.com`,
      password: 'Acceptance123!',
      time_zone: 'Asia/Shanghai',
    },
  });
  expect(response.status()).toBe(201);
}

test('manages reward details, status, protected inventory, and soft deletion', async ({
  browser,
  page,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await registerParent(page, suffix);
  const childResponse = await page.request.post('/api/v1/family/children', {
    data: {
      nickname: `奖励验收孩子${suffix}`,
      credential_type: 'pin',
      credential: '7316',
      gender: 'female',
    },
  });
  expect(childResponse.status()).toBe(201);
  const child = (await childResponse.json()).data.child;

  const taskTypesResponse = await page.request.get('/api/v1/family/task-types');
  expect(taskTypesResponse.status()).toBe(200);
  const taskType = (await taskTypesResponse.json()).data.task_types[0];
  const taskResponse = await page.request.post('/api/v1/family/tasks', {
    data: {
      task_type_id: taskType.id,
      name: `奖励积分准备${suffix}`,
      description: '为奖励库存冲突验收准备积分。',
      check_type: 'TICK',
      verify_mode: 'AUTO',
      collaboration_mode: 'SOLO',
      frequency: { kind: 'daily' },
      base_points: 100,
      assignments: [{ child_id: child.id, start_date: calendarDate() }],
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).data.task;
  const session = (await (await page.request.get('/api/v1/auth/session')).json()).data;
  const childContext = await browser.newContext({ baseURL });
  const childLogin = await childContext.request.post('/api/v1/auth/child/login', {
    data: {
      family_code: session.family_code,
      child_id: child.id,
      credential: '7316',
    },
  });
  expect(childLogin.status()).toBe(200);
  const checkIn = await childContext.request.post('/api/v1/check-ins', {
    headers: { 'Idempotency-Key': `reward-points-${suffix}` },
    data: {
      task_assignment_id: task.assignments[0].id,
      check_date: calendarDate(),
      content: { media_ids: [] },
    },
  });
  expect(checkIn.status()).toBe(201);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/rewards');
  await expect(page.getByRole('heading', { name: '奖励管理' })).toBeVisible();
  await page.getByRole('button', { name: '新增奖励' }).click();
  let dialog = page.getByRole('dialog', { name: '新增奖励' });
  const rewardName = `周末科学馆${suffix}`;
  await dialog.getByLabel('奖励名称').fill(rewardName);
  await dialog.getByLabel('奖励说明').fill('完成兑换后安排一次家庭科学馆体验。');
  await dialog.getByLabel('所需积分').fill('40');
  await dialog.getByLabel('奖励类型').selectOption('EXPERIENCE');
  await dialog.getByLabel('总库存（留空不限量）').fill('4');
  await dialog.getByLabel('最低等级（留空无限制）').fill('1');
  await dialog.getByLabel('每日兑换上限').fill('1');
  await dialog.getByLabel('每周兑换上限').fill('2');
  await dialog.getByLabel('每月兑换上限').fill('3');
  await dialog.getByRole('button', { name: '保存并上架' }).click();

  let rewardCard = page.locator('article').filter({
    has: page.getByRole('heading', { name: rewardName, exact: true }),
  });
  await expect(rewardCard).toContainText('体验 · Lv.1 解锁');
  await expect(rewardCard).toContainText('每日 1 次 · 每周 2 次 · 每月 3 次');
  await expect(rewardCard).toContainText('总量 4 · 预占 0 · 已兑 0 · 可用 4');
  await expect(rewardCard.getByText('已上架', { exact: true })).toBeVisible();

  await rewardCard.getByRole('button', { name: '下架' }).click();
  await expect(rewardCard.getByText('已下架', { exact: true })).toBeVisible();
  await rewardCard.getByRole('button', { name: '上架' }).click();
  await expect(rewardCard.getByText('已上架', { exact: true })).toBeVisible();

  await rewardCard.getByRole('button', { name: `编辑奖励 ${rewardName}` }).click();
  dialog = page.getByRole('dialog', { name: '编辑奖励' });
  await expect(dialog.getByLabel('奖励说明')).toHaveValue('完成兑换后安排一次家庭科学馆体验。');
  await dialog.getByLabel('奖励说明').fill('已更新：兑换后由家长确认预约日期。');
  await dialog.getByLabel('总库存（留空不限量）').fill('5');
  await dialog.getByRole('button', { name: '保存奖励' }).click();
  await expect(rewardCard).toContainText('已更新：兑换后由家长确认预约日期。');
  await expect(rewardCard).toContainText('总量 5 · 预占 0 · 已兑 0 · 可用 5');

  const rewardsResponse = await page.request.get('/api/v1/rewards');
  const reward = (await rewardsResponse.json()).data.rewards.find(
    (item) => item.name === rewardName,
  );
  expect(reward).toBeTruthy();
  const redemption = await childContext.request.post(`/api/v1/rewards/${reward.id}/redemptions`, {
    headers: { 'Idempotency-Key': `reward-redemption-${suffix}` },
  });
  expect(redemption.status()).toBe(201);
  expect((await redemption.json()).data.redemption.status).toBe('PENDING');
  await childContext.close();

  await page.reload();
  rewardCard = page.locator('article').filter({
    has: page.getByRole('heading', { name: rewardName, exact: true }),
  });
  await expect(rewardCard).toContainText('总量 5 · 预占 1 · 已兑 0 · 可用 4');
  await rewardCard.getByRole('button', { name: `编辑奖励 ${rewardName}` }).click();
  dialog = page.getByRole('dialog', { name: '编辑奖励' });
  await dialog.getByLabel('总库存（留空不限量）').fill('');
  await dialog.getByRole('button', { name: '保存奖励' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('奖励状态已变化');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('总库存（留空不限量）')).toHaveValue('5');
  await dialog.getByRole('button', { name: '关闭弹窗' }).click();

  const disposableName = `临时奖励${suffix}`;
  const disposable = await page.request.post('/api/v1/rewards', {
    data: {
      name: disposableName,
      description: null,
      points_cost: 1,
      image_media_id: null,
      type: 'CUSTOM',
      stock_total: null,
      prerequisites: {},
      status: 'ACTIVE',
    },
  });
  expect(disposable.status()).toBe(201);
  await page.reload();
  const disposableCard = page.locator('article').filter({
    has: page.getByRole('heading', { name: disposableName, exact: true }),
  });
  page.once('dialog', (confirmation) => confirmation.accept());
  await disposableCard.getByRole('button', { name: `删除奖励 ${disposableName}` }).click();
  await expect(disposableCard).toHaveCount(0);
  const authoritativeRewards = (await (await page.request.get('/api/v1/rewards')).json()).data
    .rewards;
  expect(authoritativeRewards.some((item) => item.name === disposableName)).toBe(false);
});

test('uploads a reward image while locking every modal close path', async ({ page }) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await registerParent(page, `image-${suffix}`);
  const uploadId = '00000000-0000-4000-8000-000000000201';
  const mediaId = '00000000-0000-4000-8000-000000000202';
  const upload = {
    id: uploadId,
    media_id: mediaId,
    status: 'UPLOADING',
    failure_code: null,
    mime_type: 'image/png',
    media_type: 'IMAGE',
    size_bytes: 68,
    duration: null,
    parts: [],
  };
  let rewardPayload;

  await page.route('**/api/v1/media/uploads', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      json: { success: true, data: { upload } },
    });
  });
  await page.route(`**/api/v1/media/uploads/${uploadId}/parts/1/authorize`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        success: true,
        data: { url: 'https://reward-upload.example/file', expires_at: new Date().toISOString() },
      },
    });
  });
  await page.route('https://reward-upload.example/file', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-expose-headers': 'ETag',
        etag: '"reward-image-etag"',
      },
    });
  });
  await page.route(`**/api/v1/media/uploads/${uploadId}/parts/1`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        success: true,
        data: {
          upload: {
            ...upload,
            parts: [
              { part_number: 1, etag: 'reward-image-etag', checksum: 'checksum', size_bytes: 68 },
            ],
          },
        },
      },
    });
  });
  await page.route(`**/api/v1/media/uploads/${uploadId}/complete`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { success: true, data: { upload: { ...upload, status: 'READY' } } },
    });
  });
  await page.route(/\/api\/v1\/rewards$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    rewardPayload = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      json: {
        success: true,
        data: {
          reward: {
            id: '00000000-0000-4000-8000-000000000203',
            ...rewardPayload,
            stock_reserved: 0,
            stock_consumed: 0,
            stock_available: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
      },
    });
  });

  await page.goto('/rewards');
  await page.getByRole('button', { name: '新增奖励' }).click();
  const dialog = page.getByRole('dialog', { name: '新增奖励' });
  await dialog.getByLabel('奖励名称').fill(`图片奖励${suffix}`);
  await dialog.getByLabel('奖励图片（可选）').setInputFiles({
    name: 'reward.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2DfoAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await dialog.getByRole('button', { name: '保存并上架' }).click();
  await expect(dialog.getByRole('button', { name: '正在保存...' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '关闭弹窗' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(rewardPayload.image_media_id).toBe(mediaId);
  expect(rewardPayload.status).toBe('ACTIVE');
});
