const { expect, request, test } = require('@playwright/test');

test.skip(
  !process.env.REAL_ACCEPTANCE,
  'Runs only against the isolated deployed acceptance environment.',
);

test('manages a child profile and revokes sessions after credential changes', async ({ page }) => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const parentPassword = 'Acceptance123!';
  const initialPin = '2468';
  const updatedPassword = 'ChildPass123';

  const registration = await page.request.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `验收家庭${suffix}`,
      nickname: '验收家长',
      email: `familystar-acceptance-${suffix}@example.com`,
      password: parentPassword,
      time_zone: 'Asia/Shanghai',
    },
  });
  expect(registration.status()).toBe(201);

  const sessionResponse = await page.request.get('/api/v1/auth/session');
  expect(sessionResponse.status()).toBe(200);
  const sessionBody = await sessionResponse.json();
  const familyCode = sessionBody.data.family_code;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/family');
  await expect(page.getByRole('heading', { name: '家庭成员' })).toBeVisible();

  await page.getByRole('button', { name: '添加孩子' }).click();
  const createDialog = page.getByRole('dialog', { name: '添加孩子' });
  await createDialog.getByLabel('昵称').fill('验收小星');
  await createDialog.getByLabel('性别').selectOption('female');
  await createDialog.getByLabel('年级').fill('一年级');
  await createDialog.getByLabel('生日（可选）').fill('2020-02-29');
  await createDialog.getByLabel('初始登录凭据').fill(initialPin);
  await createDialog.getByLabel('再次输入').fill(initialPin);
  await createDialog.getByRole('button', { name: '创建孩子档案' }).click();
  await expect(page.getByText('孩子档案已创建。')).toBeVisible();

  const childrenResponse = await page.request.get('/api/v1/family/children');
  expect(childrenResponse.status()).toBe(200);
  const childrenBody = await childrenResponse.json();
  const child = childrenBody.data.children.find((item) => item.nickname === '验收小星');
  expect(child).toBeTruthy();

  const oldChildSession = await request.newContext({ baseURL });
  const oldLogin = await oldChildSession.post('/api/v1/auth/child/login', {
    data: { family_code: familyCode, child_id: child.id, credential: initialPin },
  });
  expect(oldLogin.status()).toBe(200);

  await page.getByRole('button', { name: '编辑档案' }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑验收小星的档案' });
  await editDialog.getByLabel('昵称').fill('验收小树');
  await editDialog.getByLabel('年级').fill('二年级');
  await editDialog.getByRole('button', { name: '保存档案' }).click();
  await expect(page.getByText('孩子档案已更新。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '验收小树' })).toBeVisible();

  await page.getByRole('button', { name: '重置验收小树的登录凭据' }).click();
  const credentialDialog = page.getByRole('dialog', { name: '重置验收小树的登录凭据' });
  await credentialDialog.getByLabel('凭据模式').selectOption('password');
  await credentialDialog.getByLabel('新登录凭据').fill(updatedPassword);
  await credentialDialog.getByLabel('再次输入').fill(updatedPassword);
  await credentialDialog.getByRole('button', { name: '确认重置' }).click();
  await expect(page.getByText('登录凭据已重置，孩子的旧会话已撤销。')).toBeVisible();
  expect((await oldChildSession.get('/api/v1/auth/session')).status()).toBe(401);
  await oldChildSession.dispose();

  const updatedChildSession = await request.newContext({ baseURL });
  const updatedLogin = await updatedChildSession.post('/api/v1/auth/child/login', {
    data: { family_code: familyCode, child_id: child.id, credential: updatedPassword },
  });
  expect(updatedLogin.status()).toBe(200);

  await page.getByRole('button', { name: '停用验收小树的档案' }).click();
  const deactivateDialog = page.getByRole('dialog', { name: '确认停用孩子档案' });
  await expect(deactivateDialog).toContainText('任务、打卡、积分和成长记录会继续保留');
  await deactivateDialog.getByRole('button', { name: '确认停用' }).click();
  await expect(page.getByText('验收小树的档案已停用，历史记录继续保留。')).toBeVisible();
  await expect(page.getByText('还没有孩子档案')).toBeVisible();
  expect((await updatedChildSession.get('/api/v1/auth/session')).status()).toBe(401);
  await updatedChildSession.dispose();
});
