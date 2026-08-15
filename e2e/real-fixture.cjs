const { expect } = require('@playwright/test');

const PASSWORD = 'Acceptance123!';

function nonce(scope = 'acceptance') {
  return `${scope}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function calendarDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function expectStatus(response, status, operation) {
  if (response.status() !== status) {
    throw new Error(`${operation} returned ${response.status()}: ${await response.text()}`);
  }
  return response;
}

async function registerParent(api, run, label = '闭环验收') {
  const response = await api.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `${label}家庭${run}`,
      nickname: `${label}家长`,
      email: `familystar-${run}@example.com`,
      password: PASSWORD,
      time_zone: 'Asia/Shanghai',
    },
  });
  await expectStatus(response, 201, 'register parent');
  return (
    await (await expectStatus(await api.get('/api/v1/auth/session'), 200, 'read session')).json()
  ).data;
}

async function createChild(api, run, credential = '4682') {
  const response = await api.post('/api/v1/family/children', {
    data: {
      nickname: `闭环孩子${run}`,
      credential_type: 'pin',
      credential,
      gender: 'female',
      grade: '三年级',
    },
  });
  await expectStatus(response, 201, 'create child');
  return { ...(await response.json()).data.child, credential };
}

async function firstTaskTypeId(api) {
  const response = await expectStatus(
    await api.get('/api/v1/family/task-types'),
    200,
    'read task types',
  );
  return (await response.json()).data.task_types[0].id;
}

async function createTask(api, child, run, overrides = {}) {
  const taskTypeId = overrides.task_type_id ?? (await firstTaskTypeId(api));
  const response = await api.post('/api/v1/family/tasks', {
    data: {
      task_type_id: taskTypeId,
      name: `闭环任务${run}`,
      description: 'Playwright 真实业务闭环隔离任务。',
      submission_guide: '按要求完成后提交。',
      check_type: 'TICK',
      verify_mode: 'AUTO',
      collaboration_mode: 'SOLO',
      frequency: { kind: 'daily' },
      base_points: 12,
      assignments: [{ child_id: child.id, start_date: calendarDate() }],
      ...overrides,
    },
  });
  await expectStatus(response, 201, 'create task');
  return (await response.json()).data.task;
}

async function loginChild(browser, baseURL, familyCode, child) {
  const context = await browser.newContext({ baseURL });
  const response = await context.request.post('/api/v1/auth/child/login', {
    data: {
      family_code: familyCode,
      child_id: child.id,
      credential: child.credential,
    },
  });
  await expectStatus(response, 200, 'login child');
  return context;
}

async function assertNoHorizontalOverflow(page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    )
    .toEqual(expect.objectContaining({ clientWidth: page.viewportSize().width }));
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
}

async function readIndexedDb(page, storeName) {
  return page.evaluate(
    ({ databaseName, store }) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open(databaseName, 2);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(store, 'readonly');
          const request = transaction.objectStore(store).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
          transaction.oncomplete = () => database.close();
        };
      }),
    { databaseName: 'familystar-offline', store: storeName },
  );
}

module.exports = {
  PASSWORD,
  assertNoHorizontalOverflow,
  calendarDate,
  createChild,
  createTask,
  expectStatus,
  firstTaskTypeId,
  loginChild,
  nonce,
  readIndexedDb,
  registerParent,
};
