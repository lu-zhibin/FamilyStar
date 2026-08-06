const { expect, request, test } = require('@playwright/test');

test.skip(
  !process.env.REAL_ACCEPTANCE,
  'Runs only against the isolated deployed acceptance environment.',
);

test('reads scoped child point summaries and an empty stable ledger page', async () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const pin = '2468';
  const parent = await request.newContext({ baseURL });
  const registration = await parent.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `积分验收家庭${suffix}`,
      nickname: '积分验收家长',
      email: `familystar-points-${suffix}@example.com`,
      password: 'Acceptance123!',
      time_zone: 'Asia/Shanghai',
    },
  });
  expect(registration.status()).toBe(201);

  const sessionResponse = await parent.get('/api/v1/auth/session');
  expect(sessionResponse.status()).toBe(200);
  const session = await sessionResponse.json();

  const childResponse = await parent.post('/api/v1/family/children', {
    data: {
      nickname: '积分验收孩子',
      credential_type: 'pin',
      credential: pin,
      gender: 'female',
    },
  });
  expect(childResponse.status()).toBe(201);
  const child = (await childResponse.json()).data.child;

  const parentSummary = await parent.get(`/api/v1/family/children/${child.id}/points`);
  expect(parentSummary.status()).toBe(200);
  expect(await parentSummary.json()).toMatchObject({
    data: {
      points: {
        child_id: child.id,
        points_balance: 0,
        points_earned_total: 0,
      },
    },
  });

  const childSession = await request.newContext({ baseURL });
  const login = await childSession.post('/api/v1/auth/child/login', {
    data: { family_code: session.data.family_code, child_id: child.id, credential: pin },
  });
  expect(login.status()).toBe(200);

  const ownSummary = await childSession.get('/api/v1/points/me');
  expect(ownSummary.status()).toBe(200);
  expect(await ownSummary.json()).toMatchObject({
    data: {
      points: {
        child_id: child.id,
        points_balance: 0,
        points_earned_total: 0,
      },
    },
  });

  const logs = await childSession.get('/api/v1/points/me/logs?limit=1');
  expect(logs.status()).toBe(200);
  expect(await logs.json()).toMatchObject({
    data: { logs: [], page: { next_cursor: null, has_more: false } },
  });

  const otherParent = await request.newContext({ baseURL });
  const otherRegistration = await otherParent.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `积分隔离家庭${suffix}`,
      nickname: '隔离验收家长',
      email: `familystar-points-isolation-${suffix}@example.com`,
      password: 'Acceptance123!',
      time_zone: 'Asia/Shanghai',
    },
  });
  expect(otherRegistration.status()).toBe(201);
  expect((await otherParent.get(`/api/v1/family/children/${child.id}/points`)).status()).toBe(404);

  await parent.dispose();
  await childSession.dispose();
  await otherParent.dispose();
});
