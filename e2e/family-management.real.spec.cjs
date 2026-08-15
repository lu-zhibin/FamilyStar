const { expect, test } = require('@playwright/test');

test.skip(
  !process.env.REAL_ACCEPTANCE,
  'Runs only against the isolated deployed acceptance environment.',
);

test('manages family details and a pending co-parent invitation', async ({ page }) => {
  if (!process.env.PLAYWRIGHT_BASE_URL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const registration = await page.request.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `家庭管理验收${suffix}`,
      nickname: '验收创建者',
      email: `familystar-family-${suffix}@example.com`,
      password: 'Acceptance123!',
      time_zone: 'Asia/Shanghai',
    },
  });
  expect(registration.status()).toBe(201);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/family');
  await expect(page.getByRole('heading', { name: '家庭成员' })).toBeVisible();

  const profilePanel = page.locator('section.panel').filter({ hasText: '家庭资料' });
  await expect(profilePanel.getByLabel('家庭名称')).toHaveValue(`家庭管理验收${suffix}`);
  await profilePanel.getByLabel('家庭名称').fill(`星河验收家庭${suffix}`);
  await profilePanel.getByLabel('家庭时区').fill('Europe/Berlin');
  await profilePanel.getByRole('button', { name: '保存家庭资料' }).click();
  await expect(page.getByText('家庭资料已更新。')).toBeVisible();

  const profileResponse = await page.request.get('/api/v1/family/profile');
  expect(profileResponse.status()).toBe(200);
  const profileBody = await profileResponse.json();
  expect(profileBody.data.profile).toMatchObject({
    name: `星河验收家庭${suffix}`,
    time_zone: 'Europe/Berlin',
    permissions: { can_update_name: true, can_manage_invitations: true },
  });

  const invitationEmail = `familystar-coparent-${suffix}@example.com`;
  const parentPanel = page.locator('section.panel').filter({ hasText: '家长与共同管理' });
  await expect(parentPanel.getByText('验收创建者', { exact: true })).toBeVisible();
  await parentPanel.getByLabel('邀请共同家长').fill(invitationEmail);
  await parentPanel.getByRole('button', { name: '发送邀请' }).click();
  await expect(parentPanel.getByText(invitationEmail)).toBeVisible();
  const initialLink = await parentPanel.getByLabel('最新邀请链接').inputValue();
  expect(initialLink).toContain('/invite?token=');

  await parentPanel.getByLabel(`重发${invitationEmail}的邀请`).click();
  await expect
    .poll(() => parentPanel.getByLabel('最新邀请链接').inputValue())
    .not.toBe(initialLink);

  await parentPanel.getByLabel(`撤销${invitationEmail}的邀请`).click();
  const revokeDialog = page.getByRole('dialog', { name: '确认撤销共同家长邀请' });
  await expect(revokeDialog).toContainText('现有邀请链接将立即失效');
  await revokeDialog.getByRole('button', { name: '确认撤销' }).click();
  await expect(parentPanel.getByText(invitationEmail)).toHaveCount(0);
  await expect(page.getByText(`${invitationEmail}的邀请已撤销。`)).toBeVisible();
});
