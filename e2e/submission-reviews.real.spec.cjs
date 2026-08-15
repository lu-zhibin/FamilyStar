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

test('reviews evidence with deadlines, filters, keyboard controls, and conflict refresh', async ({
  browser,
  page,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const today = calendarDate();
  const registration = await page.request.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `审核验收家庭${suffix}`,
      nickname: '审核验收家长',
      email: `familystar-review-${suffix}@example.com`,
      password: 'Acceptance123!',
      time_zone: 'Asia/Shanghai',
    },
  });
  expect(registration.status()).toBe(201);

  const childResponse = await page.request.post('/api/v1/family/children', {
    data: {
      nickname: `审核验收孩子${suffix}`,
      credential_type: 'pin',
      credential: '6842',
      gender: 'female',
    },
  });
  expect(childResponse.status()).toBe(201);
  const child = (await childResponse.json()).data.child;

  const taskTypesResponse = await page.request.get('/api/v1/family/task-types');
  expect(taskTypesResponse.status()).toBe(200);
  const taskType = (await taskTypesResponse.json()).data.task_types[0];
  const taskName = `审核凭证任务${suffix}`;
  const taskResponse = await page.request.post('/api/v1/family/tasks', {
    data: {
      task_type_id: taskType.id,
      name: taskName,
      description: '验证审核截止时间、历史和凭证键盘交互。',
      submission_guide: '提交两份图片凭证。',
      check_type: 'TEXT',
      verify_mode: 'MANUAL',
      collaboration_mode: 'SOLO',
      frequency: { kind: 'daily' },
      base_points: 17,
      assignments: [{ child_id: child.id, start_date: today }],
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
      credential: '6842',
    },
  });
  expect(childLogin.status()).toBe(200);
  const checkInResponse = await childContext.request.post('/api/v1/check-ins', {
    headers: { 'Idempotency-Key': `review-check-in-${suffix}` },
    data: {
      task_assignment_id: task.assignments[0].id,
      check_date: today,
      content: { text: '两份凭证均已提交。', media_ids: [] },
    },
  });
  expect(checkInResponse.status()).toBe(201);
  const checkIn = (await checkInResponse.json()).data.check_in;
  await childContext.close();

  const media = [
    { id: '00000000-0000-4000-8000-000000000101', type: 'IMAGE', mime_type: 'image/png' },
    { id: '00000000-0000-4000-8000-000000000102', type: 'IMAGE', mime_type: 'image/png' },
  ];
  await page.route('**/api/v1/family/submission-reviews/pending*', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.reviews = payload.data.reviews.map((review) =>
      review.target_id === checkIn.id ? { ...review, media } : review,
    );
    await route.fulfill({ response, json: payload });
  });
  await page.route('**/api/v1/media/*/access-url', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        success: true,
        data: {
          url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2DfoAAAAASUVORK5CYII=',
        },
      },
    });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/reviews');
  await expect(page.getByRole('heading', { name: '打卡审核' })).toBeVisible();
  const reviewCard = page.locator('article').filter({
    has: page.getByRole('heading', { name: taskName, exact: true }),
  });
  await expect(reviewCard.getByText('审核截止：', { exact: false })).toBeVisible();
  await expect(reviewCard.getByText('等待审核', { exact: true })).toBeVisible();

  const evidenceButton = reviewCard.getByRole('button', { name: '查看凭证 (2)' });
  await evidenceButton.click();
  const dialog = page.getByRole('dialog', { name: '提交凭证' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '关闭弹窗' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '下一项凭证' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭弹窗' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByText('2 / 2', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByText('1 / 2', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(evidenceButton).toBeFocused();

  await reviewCard.getByLabel('打回原因').fill('冲突后仍需保留的输入');
  const authoritativeReview = await page.request.post(`/api/v1/check-ins/${checkIn.id}/reviews`, {
    headers: { 'Idempotency-Key': `authoritative-review-${suffix}` },
    data: { status: 'APPROVED' },
  });
  expect(authoritativeReview.status()).toBe(200);
  await reviewCard.getByRole('button', { name: '通过并发分' }).click();
  await expect(page.getByText('审核状态已由服务端更新为通过，当前记录已保留。')).toBeVisible();
  await expect(reviewCard.getByText('服务端已通过', { exact: true })).toBeVisible();
  await expect(reviewCard.getByLabel('打回原因')).toHaveValue('冲突后仍需保留的输入');
  await expect(reviewCard.getByRole('button', { name: '通过并发分' })).toHaveCount(0);

  const historyForm = page.getByRole('button', { name: '筛选历史' }).locator('..');
  await historyForm.getByLabel('孩子').selectOption(child.id);
  await historyForm.getByLabel('任务').selectOption(task.id);
  await historyForm.getByLabel('结果').selectOption('APPROVED');
  await historyForm.getByLabel('开始日期').fill(today);
  await historyForm.getByLabel('结束日期').fill(today);
  await historyForm.getByRole('button', { name: '筛选历史' }).click();
  await expect(
    page.locator('article').filter({ hasText: `${taskName} · ${child.nickname}` }),
  ).toContainText('通过');
});
