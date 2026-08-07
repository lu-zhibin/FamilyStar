const { expect, request, test } = require('@playwright/test');

test.skip(
  !process.env.REAL_ACCEPTANCE,
  'Runs only against the isolated deployed acceptance environment.',
);

function calendarDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function registerParent(baseURL, suffix, label) {
  const context = await request.newContext({ baseURL });
  const response = await context.post('/api/v1/auth/parent/register', {
    data: {
      family_name: `${label}家庭${suffix}`,
      nickname: `${label}家长`,
      email: `familystar-history-${suffix}-${label === '历史验收' ? 'primary' : 'isolated'}@example.com`,
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

async function waitForCollaborationRound(child, date) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await child.get(`/api/v1/tasks/me?date=${date}`);
    expect(response.status()).toBe(200);
    const tasks = (await response.json()).data.tasks;
    const collaboration = tasks.find((task) => task.collaboration_mode === 'COLLAB');
    if (collaboration?.collaboration_round?.id) return collaboration.collaboration_round.id;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('The collaboration round was not generated in time.');
}

test('reads reviewed solo and collaboration history with scoped media batches', async () => {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const today = calendarDate();
  const yesterday = calendarDate(-1);
  const parent = await registerParent(baseURL, suffix, '历史验收');
  const session = (await (await parent.get('/api/v1/auth/session')).json()).data;
  const firstChild = await createChild(parent, '历史验收孩子一', '2468');
  const secondChild = await createChild(parent, '历史验收孩子二', '1357');
  const childOne = await loginChild(baseURL, session.family_code, firstChild.id, '2468');
  const childTwo = await loginChild(baseURL, session.family_code, secondChild.id, '1357');

  const taskTypesResponse = await parent.get('/api/v1/family/task-types');
  expect(taskTypesResponse.status()).toBe(200);
  const taskTypeId = (await taskTypesResponse.json()).data.task_types[0].id;

  const soloTaskResponse = await parent.post('/api/v1/family/tasks', {
    data: {
      task_type_id: taskTypeId,
      name: `历史补打${suffix}`,
      check_type: 'TICK',
      verify_mode: 'MANUAL',
      collaboration_mode: 'SOLO',
      frequency: { kind: 'daily' },
      base_points: 11,
      assignments: [{ child_id: firstChild.id, start_date: yesterday }],
    },
  });
  expect(soloTaskResponse.status()).toBe(201);
  const soloTask = (await soloTaskResponse.json()).data.task;

  const collaborationTaskResponse = await parent.post('/api/v1/family/tasks', {
    data: {
      task_type_id: taskTypeId,
      name: `历史协作${suffix}`,
      check_type: 'TEXT',
      verify_mode: 'MANUAL',
      collaboration_mode: 'COLLAB',
      frequency: { kind: 'daily' },
      base_points: 13,
      assignments: [
        { child_id: firstChild.id, start_date: today },
        { child_id: secondChild.id, start_date: today },
      ],
    },
  });
  expect(collaborationTaskResponse.status()).toBe(201);

  const soloSubmission = await childOne.post('/api/v1/check-ins', {
    headers: { 'Idempotency-Key': `history-solo-${suffix}` },
    data: {
      task_assignment_id: soloTask.assignments[0].id,
      check_date: yesterday,
      content: { media_ids: [] },
    },
  });
  expect(soloSubmission.status()).toBe(201);
  const checkIn = (await soloSubmission.json()).data.check_in;
  const soloReview = await parent.post(`/api/v1/check-ins/${checkIn.id}/reviews`, {
    headers: { 'Idempotency-Key': `history-solo-review-${suffix}` },
    data: { status: 'APPROVED' },
  });
  expect(soloReview.status()).toBe(200);

  const roundId = await waitForCollaborationRound(childOne, today);
  const firstCollaboration = await childOne.post(
    `/api/v1/collaboration-rounds/${roundId}/submissions`,
    {
      headers: { 'Idempotency-Key': `history-collab-one-${suffix}` },
      data: { content: { text: '一起完成第一份', media_ids: [] } },
    },
  );
  expect(firstCollaboration.status()).toBe(201);
  const firstSubmission = (await firstCollaboration.json()).data.submission;
  const secondCollaboration = await childTwo.post(
    `/api/v1/collaboration-rounds/${roundId}/submissions`,
    {
      headers: { 'Idempotency-Key': `history-collab-two-${suffix}` },
      data: { content: { text: '一起完成第二份', media_ids: [] } },
    },
  );
  expect(secondCollaboration.status()).toBe(201);
  const secondSubmission = (await secondCollaboration.json()).data.submission;

  for (const [submission, key] of [
    [firstSubmission, 'one'],
    [secondSubmission, 'two'],
  ]) {
    const review = await parent.post(`/api/v1/collaboration-submissions/${submission.id}/reviews`, {
      headers: { 'Idempotency-Key': `history-collab-review-${key}-${suffix}` },
      data: { status: 'APPROVED' },
    });
    expect(review.status()).toBe(200);
  }

  const mineResponse = await childOne.get('/api/v1/check-ins/me/history?limit=1');
  expect(mineResponse.status()).toBe(200);
  const mine = (await mineResponse.json()).data;
  expect(mine.items).toHaveLength(1);
  expect(mine.items[0]).toMatchObject({
    submission_type: 'COLLABORATION',
    status: 'APPROVED',
    review: { decision: 'APPROVED' },
    collaboration_round: { id: roundId },
  });
  expect(mine.page).toMatchObject({ has_more: true });
  expect(typeof mine.page.next_cursor).toBe('string');

  const nextResponse = await childOne.get(
    `/api/v1/check-ins/me/history?limit=1&cursor=${encodeURIComponent(mine.page.next_cursor)}`,
  );
  expect(nextResponse.status()).toBe(200);
  expect((await nextResponse.json()).data.items[0]).toMatchObject({
    submission_id: checkIn.id,
    submission_type: 'SOLO',
    status: 'APPROVED',
    check_date: yesterday,
    review: { decision: 'APPROVED' },
    points_earned: 11,
  });

  const filteredResponse = await parent.get(
    `/api/v1/family/check-ins/history?child_id=${firstChild.id}&task_id=${soloTask.id}&submission_type=SOLO&start_date=${yesterday}&end_date=${yesterday}`,
  );
  expect(filteredResponse.status()).toBe(200);
  expect((await filteredResponse.json()).data.items).toMatchObject([
    { submission_id: checkIn.id, check_date: yesterday, status: 'APPROVED' },
  ]);

  const otherParent = await registerParent(baseURL, suffix, '历史隔离');
  const isolatedHistory = await otherParent.get(
    `/api/v1/family/check-ins/history?child_id=${firstChild.id}`,
  );
  expect(isolatedHistory.status()).toBe(200);
  expect((await isolatedHistory.json()).data.items).toEqual([]);

  const inaccessibleMediaIds = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const inaccessibleMedia = await parent.post('/api/v1/media/access-urls', {
    data: { media_ids: inaccessibleMediaIds },
  });
  expect(inaccessibleMedia.status()).toBe(404);
  expect(await inaccessibleMedia.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  const duplicateMedia = await parent.post('/api/v1/media/access-urls', {
    data: { media_ids: [inaccessibleMediaIds[0], inaccessibleMediaIds[0]] },
  });
  expect(duplicateMedia.status()).toBe(400);

  await parent.dispose();
  await childOne.dispose();
  await childTwo.dispose();
  await otherParent.dispose();
});
