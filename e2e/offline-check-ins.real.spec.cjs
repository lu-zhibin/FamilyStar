const { expect, test } = require('@playwright/test');

const {
  calendarDate,
  createChild,
  createTask,
  loginChild,
  nonce,
  readIndexedDb,
  registerParent,
} = require('./real-fixture.cjs');

test.skip(
  !process.env.REAL_ACCEPTANCE,
  'Runs only against the isolated deployed acceptance environment.',
);
test.setTimeout(180_000);

function taskCard(page, name) {
  return page.locator('article.child-card').filter({
    has: page.getByRole('heading', { name, exact: true }),
  });
}

async function prepareOfflineFamily(browser, parentPage, scope) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');
  const run = nonce(scope);
  const session = await registerParent(parentPage.request, run, '离线闭环');
  const child = await createChild(parentPage.request, run);
  const taskTypeId = (await (await parentPage.request.get('/api/v1/family/task-types')).json()).data
    .task_types[0].id;
  const context = await loginChild(browser, baseURL, session.family_code, child);
  return { run, child, context, taskTypeId };
}

test('replays real TICK and TEXT queues and retains a media draft for explicit confirmation', async ({
  browser,
  page,
}) => {
  const { run, child, context, taskTypeId } = await prepareOfflineFamily(browser, page, 'offline');
  const tickName = `离线勾选${run}`;
  const textName = `离线文字${run}`;
  const photoName = `离线媒体${run}`;
  await createTask(page.request, child, `${run}-tick`, {
    task_type_id: taskTypeId,
    name: tickName,
  });
  await createTask(page.request, child, `${run}-text`, {
    task_type_id: taskTypeId,
    name: textName,
    check_type: 'TEXT',
  });
  await createTask(page.request, child, `${run}-photo`, {
    task_type_id: taskTypeId,
    name: photoName,
    check_type: 'PHOTO',
    verify_mode: 'MANUAL',
  });

  const childPage = await context.newPage();
  await childPage.setViewportSize({ width: 390, height: 844 });
  await childPage.goto('/child/check-ins');
  await expect(taskCard(childPage, tickName)).toBeVisible();
  await context.setOffline(true);
  try {
    await taskCard(childPage, tickName).getByRole('button', { name: '完成打卡' }).click();
    await expect(taskCard(childPage, tickName).getByText('已离线保存')).toBeVisible();
    await taskCard(childPage, textName).getByLabel('打卡文字').fill(`离线文字内容${run}`);
    await taskCard(childPage, textName).getByRole('button', { name: '提交打卡' }).click();
    await expect(taskCard(childPage, textName).getByText('已离线保存')).toBeVisible();
    await taskCard(childPage, photoName)
      .getByLabel('打卡图片或视频')
      .setInputFiles({
        name: `offline-${run}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2DfoAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    await taskCard(childPage, photoName).getByRole('button', { name: '提交打卡' }).click();
    await expect(
      taskCard(childPage, photoName).getByText('媒体已保存为本地待确认草稿'),
    ).toBeVisible();

    const [queued, drafts] = await Promise.all([
      readIndexedDb(childPage, 'check-in-queue'),
      readIndexedDb(childPage, 'media-drafts'),
    ]);
    expect(queued).toHaveLength(2);
    expect(queued.map(({ submissionType }) => submissionType).sort()).toEqual(['TEXT', 'TICK']);
    expect(queued.every(({ owner }) => owner.childId === child.id)).toBe(true);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      status: 'awaiting-confirmation',
      owner: { childId: child.id },
    });
  } finally {
    await context.setOffline(false);
  }

  await expect.poll(async () => (await readIndexedDb(childPage, 'check-in-queue')).length).toBe(0);
  await expect
    .poll(async () => {
      const response = await context.request.get('/api/v1/check-ins/me/history?limit=20');
      if (response.status() !== 200) return [];
      return (await response.json()).data.items.map((item) => item.task.name);
    })
    .toEqual(expect.arrayContaining([tickName, textName]));
  await expect(childPage.getByRole('region', { name: '离线打卡同步状态' })).toContainText(
    '待确认媒体',
  );

  await childPage.route('**/api/v1/media/uploads', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      json: {
        success: false,
        error: { code: 'MEDIA_TEMPORARILY_UNAVAILABLE', message: 'Injected media outage.' },
      },
    });
  });
  await childPage.getByRole('button', { name: '确认上传' }).click();
  await expect(
    childPage.getByRole('alert').filter({ hasText: 'Injected media outage' }),
  ).toBeVisible();
  expect(await readIndexedDb(childPage, 'media-drafts')).toEqual([
    expect.objectContaining({ status: 'awaiting-confirmation' }),
  ]);
  await context.close();
});

test('stores an injected replay conflict with the authoritative state in IndexedDB', async ({
  browser,
  page,
}) => {
  const { run, child, context, taskTypeId } = await prepareOfflineFamily(browser, page, 'conflict');
  const taskName = `离线冲突${run}`;
  await createTask(page.request, child, run, { task_type_id: taskTypeId, name: taskName });
  const childPage = await context.newPage();
  await childPage.goto('/child/check-ins');
  await expect(taskCard(childPage, taskName)).toBeVisible();
  await context.setOffline(true);
  await taskCard(childPage, taskName).getByRole('button', { name: '完成打卡' }).click();
  expect(await readIndexedDb(childPage, 'check-in-queue')).toHaveLength(1);

  await childPage.route('**/api/v1/check-ins', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      json: {
        success: false,
        error: {
          code: 'CONFLICT',
          message: '服务端已有该日期打卡。',
          details: { status: 'APPROVED', source: 'server' },
        },
      },
    });
  });
  await context.setOffline(false);
  await expect(childPage.getByRole('region', { name: '离线打卡同步状态' })).toContainText('冲突');
  await expect(
    childPage.getByRole('alert').filter({ hasText: '服务端已有该日期打卡' }),
  ).toBeVisible();
  const queue = await readIndexedDb(childPage, 'check-in-queue');
  expect(queue).toEqual([
    expect.objectContaining({
      status: 'conflict',
      failure: expect.objectContaining({
        code: 'CONFLICT',
        authoritativeState: { status: 'APPROVED', source: 'server' },
      }),
    }),
  ]);
  await context.close();
});
