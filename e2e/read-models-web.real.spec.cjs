const { expect, test } = require('@playwright/test');

test.skip(
  !process.env.REAL_ACCEPTANCE,
  'Runs only against the isolated deployed acceptance environment.',
);

function calendarDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

test('renders deployed parent and child read models', async ({ browser, page }) => {
  if (!process.env.PLAYWRIGHT_BASE_URL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const today = calendarDate();
  const registration = await page.request.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `读模型验收家庭${suffix}`,
      nickname: '读模型验收家长',
      email: `familystar-read-models-${suffix}@example.com`,
      password: 'Acceptance123!',
      time_zone: 'Asia/Shanghai',
    },
  });
  expect(registration.status()).toBe(201);

  const session = (await (await page.request.get('/api/v1/auth/session')).json()).data;
  const childResponse = await page.request.post('/api/v1/family/children', {
    data: {
      nickname: '星河读模型孩子',
      credential_type: 'pin',
      credential: '4682',
      gender: 'female',
    },
  });
  expect(childResponse.status()).toBe(201);
  const child = (await childResponse.json()).data.child;

  const taskTypesResponse = await page.request.get('/api/v1/family/task-types');
  expect(taskTypesResponse.status()).toBe(200);
  const taskTypeId = (await taskTypesResponse.json()).data.task_types[0].id;
  const taskResponse = await page.request.post('/api/v1/family/tasks', {
    data: {
      task_type_id: taskTypeId,
      name: `读模型晨读${suffix}`,
      check_type: 'TICK',
      verify_mode: 'AUTO',
      collaboration_mode: 'SOLO',
      frequency: { kind: 'daily' },
      base_points: 13,
      assignments: [{ child_id: child.id, start_date: today }],
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).data.task;

  const childContext = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL });
  const childLogin = await childContext.request.post('/api/v1/auth/child/login', {
    data: { family_code: session.family_code, child_id: child.id, credential: '4682' },
  });
  expect(childLogin.status()).toBe(200);
  const checkIn = await childContext.request.post('/api/v1/check-ins', {
    headers: { 'Idempotency-Key': `read-models-web-${suffix}` },
    data: {
      task_assignment_id: task.assignments[0].id,
      check_date: today,
      content: { media_ids: [] },
    },
  });
  expect(checkIn.status()).toBe(201);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: '家庭总览' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '星河读模型孩子' })).toBeVisible();
  await expect(page.getByText('1 / 1 项已完成')).toBeVisible();
  await expect(page.getByText('+13 星')).toBeVisible();

  await page.goto('/stats');
  await expect(page.getByRole('heading', { name: '数据面板' })).toBeVisible();
  await page.getByLabel('孩子').selectOption(child.id);
  await page.getByLabel('任务').selectOption(task.id);
  await page.getByRole('button', { name: '应用筛选' }).click();
  await expect(page.getByRole('heading', { name: '积分趋势' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '任务表现' })).toBeVisible();
  const taskPerformance = page.locator('section.panel').filter({ hasText: '任务表现' });
  await expect(taskPerformance.getByText(`读模型晨读${suffix}`, { exact: true })).toBeVisible();
  await expect(taskPerformance.getByText('1 / 1 次完成')).toBeVisible();

  const childPage = await childContext.newPage();
  await childPage.setViewportSize({ width: 390, height: 844 });
  await childPage.goto('/child/achievements');
  await expect(childPage.getByRole('heading', { name: '积分明细' })).toBeVisible();
  await expect(childPage.getByText('+13')).toBeVisible();
  await expect(childPage.getByText('余额 13')).toBeVisible();

  await childPage.goto('/child/rewards');
  await expect(childPage.getByText('13 星', { exact: true })).toBeVisible();
  await expect(childPage.getByText('累计星星 13')).toBeVisible();

  await childPage.goto('/child/profile');
  await expect(childPage.getByRole('heading', { name: '家庭排行' })).toBeVisible();
  await expect(childPage.getByText('星河读模型孩子（我）', { exact: true })).toBeVisible();
  await childPage.getByRole('button', { name: '当前等级' }).click();
  await expect(childPage.getByText('Lv.1', { exact: true })).toBeVisible();
  await expect(childPage.getByText('本周期新增 13 星')).toBeVisible();

  await childContext.close();
});
