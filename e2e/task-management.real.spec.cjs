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

test('manages task types, assignments, states, and protected history', async ({
  browser,
  page,
}) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const today = calendarDate();
  const registration = await page.request.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `任务管理验收家庭${suffix}`,
      nickname: '任务管理验收家长',
      email: `familystar-task-management-${suffix}@example.com`,
      password: 'Acceptance123!',
      time_zone: 'Asia/Shanghai',
    },
  });
  expect(registration.status()).toBe(201);
  const session = (await (await page.request.get('/api/v1/auth/session')).json()).data;

  const children = [];
  for (const [nickname, credential, gender] of [
    [`任务验收孩子甲${suffix}`, '4682', 'female'],
    [`任务验收孩子乙${suffix}`, '5793', 'male'],
  ]) {
    const response = await page.request.post('/api/v1/family/children', {
      data: {
        nickname,
        credential_type: 'pin',
        credential,
        gender,
      },
    });
    expect(response.status()).toBe(201);
    children.push({ ...(await response.json()).data.child, credential });
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: '任务管理' })).toBeVisible();

  await page.getByRole('button', { name: '新建类型' }).click();
  let typeDialog = page.getByRole('dialog', { name: '新建任务类型' });
  await typeDialog.getByLabel('类型名称').fill(`验收类型甲${suffix}`);
  await typeDialog.getByLabel('图标').fill('book-open');
  await typeDialog.getByLabel('默认验收方式').selectOption('AUTO');
  await typeDialog.getByRole('button', { name: '保存任务类型' }).click();
  await expect(page.getByText(`验收类型甲${suffix}`, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '新建类型' }).click();
  typeDialog = page.getByRole('dialog', { name: '新建任务类型' });
  await typeDialog.getByLabel('类型名称').fill(`验收类型乙${suffix}`);
  await typeDialog.getByLabel('图标').fill('sparkles');
  await typeDialog.getByRole('button', { name: '保存任务类型' }).click();
  await expect(page.getByText(`验收类型乙${suffix}`, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: `编辑类型验收类型甲${suffix}` }).click();
  typeDialog = page.getByRole('dialog', { name: '编辑任务类型' });
  await typeDialog.getByLabel('类型名称').fill(`验收类型甲已编辑${suffix}`);
  await typeDialog.getByRole('button', { name: '保存任务类型' }).click();
  await expect(page.getByText(`验收类型甲已编辑${suffix}`, { exact: true })).toBeVisible();

  const taskTypesBeforeMove = (await (await page.request.get('/api/v1/family/task-types')).json())
    .data.task_types;
  const customType = taskTypesBeforeMove.find((item) => item.name === `验收类型甲已编辑${suffix}`);
  const disposableType = taskTypesBeforeMove.find((item) => item.name === `验收类型乙${suffix}`);
  expect(customType).toBeTruthy();
  expect(disposableType).toBeTruthy();
  await page.getByRole('button', { name: `上移验收类型甲已编辑${suffix}` }).click();
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/v1/family/task-types');
      const taskTypes = (await response.json()).data.task_types;
      return taskTypes.findIndex((item) => item.id === customType.id);
    })
    .toBeLessThan(taskTypesBeforeMove.findIndex((item) => item.id === customType.id));

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `删除类型验收类型乙${suffix}` }).click();
  await expect(page.getByText(`验收类型乙${suffix}`, { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '创建任务' }).click();
  const createDialog = page.getByRole('dialog', { name: '创建家庭任务' });
  const soloName = `多孩独立阅读${suffix}`;
  await createDialog.getByLabel('任务名称').fill(soloName);
  await createDialog.getByLabel('任务说明').fill('两名孩子分别完成阅读。');
  await createDialog.getByLabel('提交指南').fill('提交阅读摘要并核对完成标准。');
  await createDialog.getByLabel('任务类型').selectOption(customType.id);
  await createDialog.getByLabel('任务模式').selectOption('SOLO');
  await createDialog.getByLabel(children[1].nickname).check();
  await createDialog.locator(`[name="custom_points:${children[0].id}"]`).fill('21');
  await createDialog.locator(`[name="custom_points:${children[1].id}"]`).fill('34');
  await createDialog
    .locator(`[name="custom_frequency_kind:${children[1].id}"]`)
    .selectOption('weekly_count');
  await createDialog.locator(`[name="custom_frequency_count:${children[1].id}"]`).fill('3');
  await createDialog.locator(`[name="custom_check_type:${children[1].id}"]`).selectOption('TEXT');
  await createDialog
    .locator(`[name="custom_verify_mode:${children[1].id}"]`)
    .selectOption('MANUAL');
  await createDialog.locator('[name="check_type"]').selectOption('TICK');
  await createDialog.locator('[name="verify_mode"]').selectOption('AUTO');
  await createDialog.getByLabel('基础积分').fill('15');
  await createDialog.getByRole('button', { name: '创建并启用' }).click();
  await expect(page.getByText(soloName, { exact: true })).toBeVisible();

  let taskList = (await (await page.request.get('/api/v1/family/tasks')).json()).data.tasks;
  const soloTask = taskList.find((item) => item.name === soloName);
  expect(soloTask.submission_guide).toBe('提交阅读摘要并核对完成标准。');
  expect(soloTask.collaboration_mode).toBe('SOLO');
  expect(soloTask.assignments).toHaveLength(2);
  expect(soloTask.assignments.find((item) => item.child_id === children[0].id)).toMatchObject({
    custom_points: 21,
  });
  expect(soloTask.assignments.find((item) => item.child_id === children[1].id)).toMatchObject({
    custom_points: 34,
    custom_frequency: { kind: 'weekly_count', count: 3 },
    custom_check_type: 'TEXT',
    custom_verify_mode: 'MANUAL',
  });
  expect(soloTask.assignments.every((item) => item.start_date === today)).toBe(true);

  const collaborationResponse = await page.request.post('/api/v1/family/tasks', {
    data: {
      task_type_id: customType.id,
      name: `协作整理${suffix}`,
      description: '共同整理家庭空间。',
      submission_guide: '两名孩子分别提交整理结果。',
      check_type: 'TICK',
      verify_mode: 'AUTO',
      collaboration_mode: 'COLLAB',
      frequency: { kind: 'daily' },
      base_points: 19,
      assignments: children.map((child) => ({ child_id: child.id, start_date: today })),
    },
  });
  expect(collaborationResponse.status()).toBe(201);
  const collaborationTask = (await collaborationResponse.json()).data.task;
  expect(collaborationTask.assignments).toHaveLength(2);

  await page.reload();
  const collaborationRow = page
    .getByText(collaborationTask.name, { exact: true })
    .locator('..')
    .locator('..');
  await collaborationRow.getByRole('button', { name: '停用' }).click();
  await page.getByRole('button', { name: '已停用' }).click();
  await expect(page.getByText(collaborationTask.name, { exact: true })).toBeVisible();
  await collaborationRow.getByRole('button', { name: '启用' }).click();
  await page.getByRole('button', { name: '进行中' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await collaborationRow.getByRole('button', { name: '归档' }).click();
  await page.getByRole('button', { name: '已归档' }).click();
  await expect(page.getByText(collaborationTask.name, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `编辑${collaborationTask.name}` })).toBeDisabled();

  const protectedPreset = taskTypesBeforeMove.find((item) => item.template_code);
  const presetDelete = await page.request.delete(`/api/v1/family/task-types/${protectedPreset.id}`);
  expect(presetDelete.status()).toBe(409);
  const referencedDelete = await page.request.delete(`/api/v1/family/task-types/${customType.id}`);
  expect(referencedDelete.status()).toBe(409);

  const childContext = await browser.newContext({ baseURL });
  const childLogin = await childContext.request.post('/api/v1/auth/child/login', {
    data: {
      family_code: session.family_code,
      child_id: children[0].id,
      credential: children[0].credential,
    },
  });
  expect(childLogin.status()).toBe(200);
  const firstAssignment = soloTask.assignments.find((item) => item.child_id === children[0].id);
  const checkIn = await childContext.request.post('/api/v1/check-ins', {
    headers: { 'Idempotency-Key': `task-management-${suffix}` },
    data: {
      task_assignment_id: firstAssignment.id,
      check_date: today,
      content: { media_ids: [] },
    },
  });
  expect(checkIn.status()).toBe(201);
  await childContext.close();

  const unsafePatch = await page.request.patch(`/api/v1/family/tasks/${soloTask.id}`, {
    data: { name: `不应写入的名称${suffix}` },
  });
  expect(unsafePatch.status()).toBe(409);
  const safePatch = await page.request.patch(`/api/v1/family/tasks/${soloTask.id}`, {
    data: { description: '历史产生后仍允许维护说明。' },
  });
  expect(safePatch.status()).toBe(200);

  await page.getByRole('button', { name: '全部' }).click();
  await page.getByRole('button', { name: `编辑${soloName}` }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑家庭任务' });
  await editDialog.getByLabel('任务名称').fill(`页面冲突名称${suffix}`);
  await editDialog.getByRole('button', { name: '保存修改' }).click();
  await expect(editDialog.getByRole('alert')).toContainText('操作冲突');
  await expect(editDialog.getByLabel('任务名称')).toHaveValue(soloName);

  taskList = (await (await page.request.get('/api/v1/family/tasks')).json()).data.tasks;
  expect(taskList.find((item) => item.id === soloTask.id)).toMatchObject({
    name: soloName,
    description: '历史产生后仍允许维护说明。',
  });
});
