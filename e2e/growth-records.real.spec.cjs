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

test('manages parent growth records and renders child history', async ({ browser, page }) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const today = calendarDate();
  const registration = await page.request.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `成长记录验收家庭${suffix}`,
      nickname: '成长记录验收家长',
      email: `familystar-growth-records-${suffix}@example.com`,
      password: 'Acceptance123!',
      time_zone: 'Asia/Shanghai',
    },
  });
  expect(registration.status()).toBe(201);
  const session = (await (await page.request.get('/api/v1/auth/session')).json()).data;

  const childResponse = await page.request.post('/api/v1/family/children', {
    data: {
      nickname: '成长记录验收孩子',
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
      name: `成长记录阅读${suffix}`,
      check_type: 'TICK',
      verify_mode: 'AUTO',
      collaboration_mode: 'SOLO',
      frequency: { kind: 'daily' },
      base_points: 17,
      assignments: [{ child_id: child.id, start_date: today }],
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).data.task;

  const childContext = await browser.newContext({ baseURL });
  const childLogin = await childContext.request.post('/api/v1/auth/child/login', {
    data: { family_code: session.family_code, child_id: child.id, credential: '4682' },
  });
  expect(childLogin.status()).toBe(200);
  const checkInResponse = await childContext.request.post('/api/v1/check-ins', {
    headers: { 'Idempotency-Key': `growth-record-check-in-${suffix}` },
    data: {
      task_assignment_id: task.assignments[0].id,
      check_date: today,
      content: { media_ids: [] },
    },
  });
  expect(checkInResponse.status()).toBe(201);
  expect((await checkInResponse.json()).data.check_in.status).toBe('APPROVED');

  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/v1/family/growth-records?task_id=${task.id}&type=CHECK_IN`,
        );
        if (response.status() !== 200) return 0;
        return (await response.json()).data.items.length;
      },
      { timeout: 20_000 },
    )
    .toBe(1);

  for (let index = 1; index <= 21; index += 1) {
    const response = await page.request.post('/api/v1/family/growth-records', {
      data: {
        child_id: child.id,
        task_id: task.id,
        type: 'NOTE',
        title: `分页记录 ${String(index).padStart(2, '0')} ${suffix}`,
        content_text: `第 ${index} 条分页验收记录`,
        occurred_on: today,
        media_ids: [],
      },
    });
    expect(response.status()).toBe(201);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/records');
  await expect(page.getByRole('heading', { name: '成长记录', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '加载更多记录' })).toBeVisible();

  await page.getByRole('button', { name: '写记录' }).click();
  const createDialog = page.getByRole('dialog', { name: '写一条成长记录' });
  await createDialog.getByLabel('孩子').selectOption(child.id);
  await createDialog.getByLabel('类型').selectOption('NOTE');
  await createDialog.getByLabel('关联任务').selectOption(task.id);
  await createDialog.getByLabel('标题').fill(`验收学习笔记${suffix}`);
  await createDialog.getByLabel('记录日期').fill(today);
  await createDialog.getByLabel('正文').fill('今天完成了成长记录页面验收。');
  await createDialog.getByRole('button', { name: '保存记录' }).click();
  await expect(page.getByText(`验收学习笔记${suffix}`, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: `编辑验收学习笔记${suffix}` }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑成长记录' });
  await editDialog.getByLabel('类型').selectOption('MILESTONE');
  await editDialog.getByLabel('标题').fill(`验收成长里程碑${suffix}`);
  await editDialog.getByLabel('正文').fill('完成新建、编辑与筛选。');
  await editDialog.getByRole('button', { name: '保存记录' }).click();
  await expect(page.getByText(`验收成长里程碑${suffix}`, { exact: true })).toBeVisible();

  await page.getByLabel('孩子').selectOption(child.id);
  await page.getByLabel('任务').selectOption(task.id);
  await page.getByLabel('类型').selectOption('MILESTONE');
  await page.getByLabel('开始日期').fill(today);
  await page.getByLabel('结束日期').fill(today);
  await page.getByRole('button', { name: '应用筛选' }).click();
  await expect(page.getByText(`验收成长里程碑${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`分页记录 01 ${suffix}`, { exact: true })).toHaveCount(0);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `删除验收成长里程碑${suffix}` }).click();
  await expect(page.getByText('当前筛选下还没有成长记录')).toBeVisible();

  await page.getByLabel('孩子').selectOption('');
  await page.getByLabel('任务').selectOption('');
  await page.getByLabel('类型').selectOption('');
  await page.getByLabel('开始日期').fill('');
  await page.getByLabel('结束日期').fill('');
  await page.getByRole('button', { name: '应用筛选' }).click();

  const firstPageResponse = await page.request.get('/api/v1/family/growth-records?limit=20');
  const firstPage = (await firstPageResponse.json()).data;
  expect(firstPage.page.has_more).toBe(true);
  const secondPageResponse = await page.request.get(
    `/api/v1/family/growth-records?limit=20&cursor=${encodeURIComponent(firstPage.page.next_cursor)}`,
  );
  const secondPage = (await secondPageResponse.json()).data;
  expect(secondPage.items.length).toBeGreaterThan(0);
  const nextPageTitle = secondPage.items[0].title;
  await expect(page.getByText(nextPageTitle, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '加载更多记录' }).click();
  await expect(page.getByText(nextPageTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: task.name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `编辑${task.name}` })).toHaveCount(0);
  await expect(page.getByRole('button', { name: `删除${task.name}` })).toHaveCount(0);

  const childPage = await childContext.newPage();
  await childPage.setViewportSize({ width: 390, height: 844 });
  await childPage.goto('/child/records');
  await expect(childPage.getByRole('heading', { name: '我的记录' })).toBeVisible();
  await expect(childPage.getByText(task.name, { exact: true })).toBeVisible();
  await expect(childPage.getByText(/个人打卡/)).toBeVisible();
  await expect(childPage.getByText('已通过', { exact: true })).toBeVisible();
  await expect(childPage.getByText('+17 星', { exact: true })).toBeVisible();
  await expect(childPage.getByRole('button', { name: /编辑|删除/ })).toHaveCount(0);

  await childContext.close();
});
