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

async function registerParent(baseURL, suffix, label) {
  const context = await request.newContext({ baseURL });
  const response = await context.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `${label}家庭${suffix}`,
      nickname: `${label}家长`,
      email: `familystar-analytics-${suffix}-${label}@example.com`,
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

test('returns isolated analytics and stable single-member rankings', async () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const today = calendarDate();
  const parent = await registerParent(baseURL, suffix, 'primary');
  const session = (await (await parent.get('/api/v1/auth/session')).json()).data;
  const child = await createChild(parent, '统计验收孩子', '3579');
  const taskTypes = await parent.get('/api/v1/family/task-types');
  expect(taskTypes.status()).toBe(200);
  const taskTypeId = (await taskTypes.json()).data.task_types[0].id;
  const taskResponse = await parent.post('/api/v1/family/tasks', {
    data: {
      task_type_id: taskTypeId,
      name: `统计任务${suffix}`,
      check_type: 'TICK',
      verify_mode: 'AUTO',
      collaboration_mode: 'SOLO',
      frequency: { kind: 'daily' },
      base_points: 11,
      assignments: [{ child_id: child.id, start_date: today }],
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = (await taskResponse.json()).data.task;

  const childContext = await request.newContext({ baseURL });
  const login = await childContext.post('/api/v1/auth/child/login', {
    data: { family_code: session.family_code, child_id: child.id, credential: '3579' },
  });
  expect(login.status()).toBe(200);
  const checkIn = await childContext.post('/api/v1/check-ins', {
    headers: { 'Idempotency-Key': `analytics-${suffix}` },
    data: {
      task_assignment_id: task.assignments[0].id,
      check_date: today,
      content: { media_ids: [] },
    },
  });
  expect(checkIn.status()).toBe(201);

  const analyticsResponse = await parent.get(
    `/api/v1/family/analytics?start_date=${today}&end_date=${today}&child_id=${child.id}&task_id=${task.id}`,
  );
  expect(analyticsResponse.status()).toBe(200);
  const analytics = (await analyticsResponse.json()).data;
  expect(analytics).toMatchObject({
    range: { start_date: today, end_date: today, day_count: 1, time_zone: 'Asia/Shanghai' },
    filters: { child_id: child.id, task_id: task.id },
    overview: {
      scheduled_count: 1,
      completed_count: 1,
      completion_rate: 1,
      points_earned: 11,
    },
    points_trend: [{ date: today, points_earned: 11 }],
    level_distribution: [{ level: 1, child_count: 1 }],
  });
  expect(analytics.task_performance).toContainEqual(
    expect.objectContaining({
      task_id: task.id,
      scheduled_count: 1,
      completed_count: 1,
      completion_rate: 1,
    }),
  );

  const rankingResponse = await childContext.get(
    '/api/v1/rankings?metric=level&period=week&family_scope=family',
  );
  expect(rankingResponse.status()).toBe(200);
  const ranking = (await rankingResponse.json()).data;
  expect(ranking.items).toEqual([
    expect.objectContaining({
      rank: 1,
      child_id: child.id,
      value: 1,
      period_earned: 11,
      is_current_user: true,
    }),
  ]);

  const invalid = await parent.get('/api/v1/rankings?metric=score&period=week');
  expect(invalid.status()).toBe(400);

  const isolatedParent = await registerParent(baseURL, suffix, 'isolated');
  const crossFamily = await isolatedParent.get(
    `/api/v1/family/analytics?start_date=${today}&end_date=${today}&task_id=${task.id}`,
  );
  expect(crossFamily.status()).toBe(404);

  await Promise.all([parent.dispose(), childContext.dispose(), isolatedParent.dispose()]);
});
