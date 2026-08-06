const { expect, request, test } = require('@playwright/test');

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

async function registerParent(baseURL, suffix, label, emailLabel) {
  const context = await request.newContext({ baseURL });
  const response = await context.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `${label}家庭${suffix}`,
      nickname: `${label}家长`,
      email: `familystar-dashboard-${suffix}-${emailLabel}@example.com`,
      password: 'Acceptance123!',
      time_zone: 'Asia/Shanghai',
    },
  });
  expect(response.status()).toBe(201);
  return context;
}

async function createChild(parent, nickname, pin) {
  const response = await parent.post('/api/v1/family/children', {
    data: { nickname, credential_type: 'pin', credential: pin, gender: 'female' },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).data.child;
}

async function loginChild(baseURL, familyCode, childId, credential) {
  const context = await request.newContext({ baseURL });
  const response = await context.post('/api/v1/auth/child/login', {
    data: { family_code: familyCode, child_id: childId, credential },
  });
  expect(response.status()).toBe(200);
  return context;
}

async function waitForAward(child, presetCode) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const response = await child.get('/api/v1/badges/me');
    expect(response.status()).toBe(200);
    const badges = (await response.json()).data.badges;
    const item = badges.find((badge) => badge.template.preset_code === presetCode);
    if (item?.award) return item.award;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Badge ${presetCode} was not awarded in time.`);
}

test('aggregates the family dashboard and awards isolated badges', async () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const today = calendarDate();
  const parent = await registerParent(baseURL, suffix, '主验收', 'primary');
  const session = (await (await parent.get('/api/v1/auth/session')).json()).data;
  const child = await createChild(parent, '总览验收孩子', '2468');
  const childContext = await loginChild(baseURL, session.family_code, child.id, '2468');

  const templatesResponse = await parent.get('/api/v1/family/badge-templates');
  expect(templatesResponse.status()).toBe(200);
  const templates = (await templatesResponse.json()).data.templates;
  expect(
    templates
      .map(({ preset_code }) => preset_code)
      .filter(Boolean)
      .sort(),
  ).toEqual([
    'first-collaboration',
    'first-task',
    'level-three',
    'one-hundred-points',
    'seven-day-streak',
    'seven-tasks',
  ]);

  const taskTypesResponse = await parent.get('/api/v1/family/task-types');
  expect(taskTypesResponse.status()).toBe(200);
  const taskTypeId = (await taskTypesResponse.json()).data.task_types[0].id;
  const taskResponse = await parent.post('/api/v1/family/tasks', {
    data: {
      task_type_id: taskTypeId,
      name: `总览自动任务${suffix}`,
      check_type: 'TICK',
      verify_mode: 'AUTO',
      collaboration_mode: 'SOLO',
      frequency: { kind: 'daily' },
      base_points: 9,
      assignments: [{ child_id: child.id, start_date: today }],
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).data.task;

  const checkInResponse = await childContext.post('/api/v1/check-ins', {
    headers: { 'Idempotency-Key': `dashboard-badge-${suffix}` },
    data: {
      task_assignment_id: task.assignments[0].id,
      check_date: today,
      content: { media_ids: [] },
    },
  });
  expect(checkInResponse.status()).toBe(201);
  await waitForAward(childContext, 'first-task');

  const manualTemplateResponse = await parent.post('/api/v1/family/badge-templates', {
    data: {
      name: `主动互助${suffix}`,
      description: '由家长认可的主动互助行为',
      icon: 'teamwork',
      category: '互助',
      condition: { type: 'MANUAL' },
    },
  });
  expect(manualTemplateResponse.status()).toBe(201);
  const manualTemplate = (await manualTemplateResponse.json()).data.template;
  const manualAwardResponse = await parent.post('/api/v1/family/badge-awards', {
    data: {
      child_id: child.id,
      template_id: manualTemplate.id,
      reason: '主动帮助家人完成整理',
    },
  });
  expect(manualAwardResponse.status()).toBe(201);

  const protectedUpdate = await parent.patch(
    `/api/v1/family/badge-templates/${manualTemplate.id}`,
    { data: { condition: { type: 'TOTAL_POINTS', target: 10 } } },
  );
  expect(protectedUpdate.status()).toBe(409);

  const dashboardResponse = await parent.get(`/api/v1/family/dashboard?date=${today}`);
  expect(dashboardResponse.status()).toBe(200);
  const dashboard = (await dashboardResponse.json()).data;
  expect(dashboard.children).toContainEqual(
    expect.objectContaining({
      child_id: child.id,
      task_total: 1,
      completed_count: 1,
      pending_review_count: 0,
      points_earned: 9,
    }),
  );
  expect(dashboard.todos).toEqual({
    pending_reviews: { count: 0, target_url: '/reviews' },
    pending_redemptions: { count: 0, target_url: '/rewards' },
    pending_fulfillments: { count: 0, target_url: '/rewards' },
  });
  expect(dashboard.recent_activity).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'CHECK_IN_SUBMITTED',
        child: { id: child.id, nickname: child.nickname },
      }),
      expect.objectContaining({
        type: 'POINTS_CHANGED',
        child: { id: child.id, nickname: child.nickname },
      }),
      expect.objectContaining({
        type: 'BADGE_AWARDED',
        child: { id: child.id, nickname: child.nickname },
      }),
    ]),
  );

  const isolatedParent = await registerParent(baseURL, suffix, '隔离验收', 'isolated');
  const isolatedDashboard = await isolatedParent.get(`/api/v1/family/dashboard?date=${today}`);
  expect(isolatedDashboard.status()).toBe(200);
  const isolated = (await isolatedDashboard.json()).data;
  expect(isolated.children).toEqual([]);
  expect(isolated.recent_activity.some((item) => item.child?.id === child.id)).toBe(false);

  await Promise.all([parent.dispose(), childContext.dispose(), isolatedParent.dispose()]);
});
