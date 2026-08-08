const { expect, test } = require('@playwright/test');

test.skip(
  Boolean(process.env.REAL_ACCEPTANCE),
  'Mock-backed browser contracts run against the local web and auth servers.',
);

const parentPages = [
  ['/dashboard', '家庭总览', '总览'],
  ['/tasks', '任务管理', '任务'],
  ['/reviews', '打卡审核', '审核'],
  ['/rewards', '奖励管理', '奖励'],
  ['/levels', '等级与成就', '等级'],
  ['/badges', '徽章管理', '徽章'],
  ['/stats', '数据面板', '数据'],
  ['/records', '成长记录', '记录'],
  ['/family', '家庭成员', '成员'],
  ['/settings', '设置', '设置'],
];

const childPages = [
  ['/child', '今日任务', '主页'],
  ['/child/check-ins', '今日打卡', '打卡'],
  ['/child/achievements', '20 级成长阶梯', '成就'],
  ['/child/rewards', '奖励商店', '奖励'],
  ['/child/records', '我的记录', '我的'],
  ['/child/profile', '我的空间', '我的'],
];

function envelope(data, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      success: status < 400,
      ...(status < 400
        ? { data }
        : {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Child account is temporarily locked.',
              details: { remaining_seconds: 900 },
            },
          }),
      meta: { request_id: 'playwright-e2e', timestamp: '2026-08-01T00:00:00.000Z' },
    }),
  };
}

const childFixture = {
  id: 'child-e2e',
  nickname: '小宇',
  grade: '三年级',
  gender: 'male',
  credential_type: 'pin',
};

const levelFixture = {
  user_id: childFixture.id,
  points_earned_total: 120,
  current_level: 3,
  current: { level: 3, name: '成长', icon: 'star', points_required: 100 },
  benefits: { discount: 1, effective_auto_approve_quota: 0, wish_slots: 1 },
  next: {
    level: 4,
    name: '进阶',
    icon: 'star',
    points_required: 180,
    points_remaining: 60,
    progress_ratio: 0.25,
  },
};

const starlightThemeFixture = {
  key: 'starlight',
  name: 'Starlight',
  description: 'A bright blue theme for every new explorer.',
  minimum_level: 1,
  tokens: {
    '--color-background': '#f5f7ff',
    '--color-surface': '#ffffff',
    '--color-primary': '#4f46e5',
    '--color-secondary': '#f59e0b',
    '--color-text': '#1e1b4b',
  },
  unlocked: true,
  selected: true,
};

const childTaskFixture = {
  task_id: 'task-child-e2e',
  task_assignment_id: 'assignment-child-e2e',
  name: '整理学习桌',
  description: '把文具和书本归位',
  submission_guide: '完成后勾选',
  collaboration_mode: 'SOLO',
  frequency: { kind: 'daily' },
  points: 15,
  check_type: 'TICK',
  verify_mode: 'AUTO',
  start_date: '2026-08-01',
  end_date: null,
};

function defaultApiResponse(request, role) {
  const url = request.url();
  if (url.endsWith('/auth/session')) {
    return envelope({
      role,
      subject_id: `${role}-e2e`,
      family_id: 'family-e2e',
      family_code: '123456',
    });
  }
  if (url.endsWith('/family/children')) return envelope({ children: [childFixture] });
  if (url.endsWith('/family/task-types')) {
    return envelope({
      task_types: [{ id: 'task-type-e2e', name: '日常习惯', icon: 'star', is_system: true }],
    });
  }
  if (url.endsWith('/family/tasks')) return envelope({ tasks: [] });
  if (new URL(url).pathname.endsWith('/tasks/me')) {
    return envelope({ date: '2026-08-02', tasks: [childTaskFixture] });
  }
  if (url.endsWith('/family/submission-reviews/pending')) return envelope({ reviews: [] });
  if (url.includes('/family/submission-reviews/history')) return envelope({ reviews: [] });
  if (url.includes('/family/dashboard?')) {
    return envelope({
      date: '2026-08-02',
      time_zone: 'Asia/Shanghai',
      children: [],
      todos: {
        pending_reviews: { count: 0, target_url: '/reviews' },
        pending_redemptions: { count: 0, target_url: '/rewards' },
        pending_fulfillments: { count: 0, target_url: '/rewards' },
      },
      recent_activity: [],
    });
  }
  if (url.includes('/family/analytics?')) {
    return envelope({
      range: {
        start_date: '2026-07-04',
        end_date: '2026-08-02',
        time_zone: 'Asia/Shanghai',
        day_count: 30,
      },
      filters: { child_id: null, task_id: null },
      overview: {
        scheduled_count: 0,
        completed_count: 0,
        completion_rate: null,
        points_earned: 0,
      },
      points_trend: [],
      task_performance: [],
      level_distribution: [],
    });
  }
  if (url.endsWith('/family/settings')) {
    return envelope({
      settings: {
        time_zone: 'Asia/Shanghai',
        check_in_deadline: '23:59',
        makeup_days: 3,
        review_timeout_hours: 48,
        auto_approve_quota: 0,
        streak_multipliers: [
          { days: 3, multiplier: 1.5 },
          { days: 7, multiplier: 2 },
          { days: 14, multiplier: 3 },
          { days: 30, multiplier: 5 },
          { days: 60, multiplier: 8 },
          { days: 100, multiplier: 10 },
        ],
      },
    });
  }
  if (url.endsWith('/family/modules')) {
    return envelope({
      modules: {
        version: 0,
        modules: [
          ['authentication', 'core'],
          ['family-settings', 'core'],
          ['tasks', 'core'],
          ['check-in', 'core'],
          ['points', 'core'],
          ['levels', 'optional'],
          ['analytics', 'optional'],
          ['growth-records', 'optional'],
          ['rewards', 'optional'],
          ['badges', 'optional'],
          ['notifications', 'optional'],
        ].map(([id, category]) => ({
          id,
          category,
          dependencies: [],
          enabled: true,
          configurable: category === 'optional',
        })),
      },
    });
  }
  if (url.endsWith('/family/badge-templates')) return envelope({ templates: [] });
  if (/\/family\/integrations\/(email|cos)$/.test(new URL(url).pathname)) {
    return envelope({
      configured: false,
      status: null,
      configuration: null,
      credentials_configured: false,
      last_verified_at: null,
      last_verification_result: null,
      can_manage: true,
    });
  }
  if (url.endsWith('/levels/me') || /\/levels\/[^/]+$/.test(url)) {
    return envelope({ level: levelFixture });
  }
  if (url.endsWith('/rewards')) {
    return envelope({
      rewards: [
        {
          id: 'reward-e2e',
          name: '动画时间 30 分钟',
          description: '完成任务后休息一下',
          points_cost: 30,
          type: 'PRIVILEGE',
          stock_available: null,
          prerequisites: {},
        },
      ],
    });
  }
  if (url.endsWith('/redemptions')) return envelope({ redemptions: [] });
  if (url.endsWith('/wishes')) return envelope({ wishes: [] });
  if (url.endsWith('/auth/switch-targets')) return envelope({ children: [childFixture] });
  if (url.endsWith('/themes')) {
    return envelope({
      current_level: 3,
      selected_theme: 'starlight',
      themes: [starlightThemeFixture],
    });
  }
  return envelope({});
}

async function setPortalRole(page, role) {
  await page.context().addCookies([
    {
      name: 'familystar_session',
      value: `${role}-e2e-session`,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function mockApi(page, handler, role = 'parent') {
  await setPortalRole(page, role);
  await page.route('**/api/v1/**', async (route) => {
    const override = handler?.(route.request());
    await route.fulfill(override ?? defaultApiResponse(route.request(), role));
  });
}

test.describe('FamilyStar portal routes', () => {
  test('keeps the mobile login accessible and lays out child profiles without overflow', async ({
    page,
  }) => {
    let familyLookupCount = 0;
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request();
      if (request.url().endsWith('/auth/session')) {
        await route.fulfill(envelope({}, 401));
        return;
      }
      if (request.url().endsWith('/auth/child/family')) {
        familyLookupCount += 1;
        await route.fulfill(
          familyLookupCount === 1
            ? envelope({}, 401)
            : envelope({
                family: { name: '星光家庭', family_code: '123456' },
                children: [
                  {
                    id: 'child-login-1',
                    nickname: '小星',
                    grade: '三年级',
                    avatar_media_id: null,
                  },
                  {
                    id: 'child-login-2',
                    nickname: '小月',
                    grade: '二年级',
                    avatar_media_id: null,
                  },
                  {
                    id: 'child-login-3',
                    nickname: '小雨',
                    grade: '一年级',
                    avatar_media_id: null,
                  },
                ],
              }),
        );
        return;
      }
      await route.fulfill(envelope({}));
    });

    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await expect(page.getByText('FamilyStar', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: '今天以谁的身份出发？' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'FamilyStar 登录' })).toBeVisible();
      await expect(page.getByText('孩子完成任务，收获积分与成就')).toBeVisible();
      const pageWidths = await page.evaluate(() => ({
        client: globalThis.document.documentElement.clientWidth,
        scroll: globalThis.document.documentElement.scrollWidth,
      }));
      expect(pageWidths.scroll).toBe(pageWidths.client);
    }

    await page.getByRole('tab', { name: '我是孩子' }).click();
    await expect(page.getByText('找到你的家庭', { exact: true })).toBeVisible();
    await expect(page.getByText('家庭码可以向家长询问')).toBeVisible();
    await page.getByLabel('6 位数字家庭码').fill('123456');
    await page.getByRole('button', { name: '找到我的家庭' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'PIN 尝试次数较多' })).toBeVisible();
    await page.getByRole('button', { name: '找到我的家庭' }).click();
    await expect(page.getByRole('button', { name: '换一个' })).toBeVisible();
    await expect(page.getByRole('group', { name: '选择你的头像' })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });

    const childList = page.getByRole('group', { name: '选择你的头像' });
    const childCards = childList.getByRole('button');
    await expect(childCards).toHaveCount(3);
    await childCards.nth(1).click();
    await expect(childCards.nth(1)).toHaveAttribute('aria-pressed', 'true');
    const childLoginWidths = await page.evaluate(() => ({
      client: globalThis.document.documentElement.clientWidth,
      scroll: globalThis.document.documentElement.scrollWidth,
    }));
    expect(childLoginWidths.scroll).toBe(childLoginWidths.client);
  });

  test('renders the complete login content on tablet and desktop viewports', async ({ page }) => {
    await page.route('**/api/v1/auth/session', (route) => route.fulfill(envelope({}, 401)));

    for (const viewport of [
      { width: 820, height: 900 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      const loginRegion = page.getByRole('region', { name: 'FamilyStar 登录' });
      await expect(loginRegion).toBeVisible();
      await expect(page.getByText('今天以谁的身份出发？')).toBeVisible();
      await expect(page.getByText('欢迎回家', { exact: true })).toBeVisible();
      await expect(page.getByText('一个入口，连接全家的每一次成长。')).toBeVisible();
      await expect(page.getByText('把好习惯，变成全家的闪光时刻')).toBeVisible();
    }
  });

  test('keeps all parent navigation items in a mobile scroll strip without document overflow', async ({
    page,
  }) => {
    await mockApi(page);

    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 720 });
      await page.goto('/dashboard');

      const navigation = page.getByRole('navigation', { name: '家长端模块导航' });
      const links = navigation.getByRole('link');
      await expect(links).toHaveCount(10);
      await expect(links.first()).toBeVisible();

      const dimensions = await page.evaluate(() => {
        const navigationContent = globalThis.document.querySelector('.nav-scroll');
        if (navigationContent) {
          navigationContent.scrollLeft = navigationContent.scrollWidth;
        }
        const lastLink = navigationContent?.querySelector('a:last-of-type');
        const navigationBounds = navigationContent?.getBoundingClientRect();
        const lastLinkBounds = lastLink?.getBoundingClientRect();
        return {
          documentClientWidth: globalThis.document.documentElement.clientWidth,
          documentScrollWidth: globalThis.document.documentElement.scrollWidth,
          navigationClientWidth: navigationContent?.clientWidth,
          navigationScrollWidth: navigationContent?.scrollWidth,
          lastLinkVisible:
            navigationBounds !== undefined &&
            lastLinkBounds !== undefined &&
            lastLinkBounds.left >= navigationBounds.left - 1 &&
            lastLinkBounds.right <= navigationBounds.right + 1,
        };
      });
      expect(dimensions.documentScrollWidth).toBe(dimensions.documentClientWidth);
      expect(dimensions.navigationScrollWidth).toBeGreaterThanOrEqual(
        dimensions.navigationClientWidth,
      );
      expect(dimensions.lastLinkVisible).toBe(true);
    }
  });

  test('renders all current parent pages with current navigation state', async ({ page }) => {
    test.setTimeout(120_000);
    await mockApi(page);
    for (const [path, heading, navigationLabel] of parentPages) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      const navigation = page.getByRole('navigation', { name: '家长端模块导航' });
      await expect(navigation).toBeVisible();
      await expect(
        navigation.getByRole('link', { name: navigationLabel, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });

  test('renders all six child pages on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, undefined, 'child');
    for (const [path, heading, navigationLabel] of childPages) {
      await page.goto(path);
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
      const navigation = page.getByRole('navigation', { name: '孩子端主导航' });
      await expect(navigation).toBeVisible();
      await expect(
        navigation.getByRole('link', { name: navigationLabel, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });

  test('enforces browser role guards for parent and child portals', async ({ page }) => {
    await mockApi(page);
    await page.goto('/child');
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: '家庭总览' })).toBeVisible();

    await setPortalRole(page, 'child');
    await page.goto('/tasks');
    await expect(page).toHaveURL('/child');
    await expect(page.getByText('今日任务', { exact: true }).first()).toBeVisible();
  });
});

test.describe('FamilyStar core browser flows', () => {
  test('manages family profile and co-parent invitations with authoritative refreshes', async ({
    page,
  }) => {
    let profile = {
      id: 'family-e2e',
      name: '星光家庭',
      time_zone: 'Asia/Shanghai',
      parents: [
        {
          id: 'parent-e2e',
          nickname: '星爸',
          email: 'owner@example.com',
          is_creator: true,
          joined_at: '2026-08-01T00:00:00.000Z',
        },
      ],
      invitations: [],
      permissions: { can_update_name: true, can_manage_invitations: true },
    };
    let savedProfilePayload;
    let createdInvitationPayload;
    let resendCount = 0;
    await mockApi(page, (request) => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/family/profile') && request.method() === 'GET') {
        return envelope({ profile });
      }
      if (path.endsWith('/family/profile') && request.method() === 'PATCH') {
        savedProfilePayload = request.postDataJSON();
        profile = {
          ...profile,
          name: savedProfilePayload.name,
          time_zone: savedProfilePayload.time_zone,
        };
        return envelope({ profile });
      }
      if (path.endsWith('/auth/parent/invitations') && request.method() === 'POST') {
        createdInvitationPayload = request.postDataJSON();
        profile = {
          ...profile,
          invitations: [
            {
              id: 'invitation-e2e',
              email: createdInvitationPayload.email,
              status: 'pending',
              expires_at: '2026-08-12T00:00:00.000Z',
              created_at: '2026-08-05T00:00:00.000Z',
            },
          ],
        };
        return envelope({
          invitation: {
            id: 'invitation-e2e',
            email: createdInvitationPayload.email,
            expiresAt: '2026-08-12T00:00:00.000Z',
          },
          delivery: 'copy-link',
          invitationLink: 'https://example.test/invitations/initial',
        });
      }
      if (path.endsWith('/family/invitations/invitation-e2e/resend')) {
        resendCount += 1;
        return envelope({
          invitation: {
            id: 'invitation-e2e',
            email: 'coparent@example.com',
            expiresAt: '2026-08-13T00:00:00.000Z',
          },
          delivery: 'copy-link',
          invitationLink: 'https://example.test/invitations/refreshed',
        });
      }
      if (path.endsWith('/family/invitations/invitation-e2e') && request.method() === 'DELETE') {
        profile = { ...profile, invitations: [] };
        return envelope({ invitation: { id: 'invitation-e2e', status: 'expired' } });
      }
      return undefined;
    });

    await page.goto('/family');
    const profilePanel = page.locator('section.panel').filter({ hasText: '家庭资料' });
    await profilePanel.getByLabel('家庭名称').fill('星河家庭');
    await profilePanel.getByLabel('家庭时区').fill('Europe/Berlin');
    await profilePanel.getByRole('button', { name: '保存家庭资料' }).click();
    await expect(page.getByText('家庭资料已更新。')).toBeVisible();
    expect(savedProfilePayload).toEqual({ name: '星河家庭', time_zone: 'Europe/Berlin' });

    const parentPanel = page.locator('section.panel').filter({ hasText: '家长与共同管理' });
    await expect(parentPanel.getByText('星爸', { exact: true })).toBeVisible();
    await parentPanel.getByLabel('邀请共同家长').fill('coparent@example.com');
    await parentPanel.getByRole('button', { name: '发送邀请' }).click();
    await expect(parentPanel.getByText('coparent@example.com')).toBeVisible();
    await expect(parentPanel.getByLabel('最新邀请链接')).toHaveValue(
      'https://example.test/invitations/initial',
    );
    expect(createdInvitationPayload).toEqual({ email: 'coparent@example.com' });

    await parentPanel.getByLabel('重发coparent@example.com的邀请').click();
    await expect(parentPanel.getByLabel('最新邀请链接')).toHaveValue(
      'https://example.test/invitations/refreshed',
    );
    expect(resendCount).toBe(1);

    await parentPanel.getByLabel('撤销coparent@example.com的邀请').click();
    await page.getByRole('button', { name: '确认撤销' }).click();
    await expect(parentPanel.getByText('coparent@example.com')).toHaveCount(0);
    await expect(page.getByText('coparent@example.com的邀请已撤销。')).toBeVisible();
  });

  test('shows co-parent family management restrictions', async ({ page }) => {
    await mockApi(page, (request) => {
      if (request.url().endsWith('/family/profile')) {
        return envelope({
          profile: {
            id: 'family-e2e',
            name: '星光家庭',
            time_zone: 'Asia/Shanghai',
            parents: [],
            invitations: [],
            permissions: { can_update_name: false, can_manage_invitations: false },
          },
        });
      }
      return undefined;
    });

    await page.goto('/family');
    await expect(page.getByLabel('家庭名称')).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('家庭时区')).toBeEditable();
    await expect(page.getByText('家庭名称由家庭创建者管理')).toBeVisible();
    await expect(page.getByText('邀请管理由家庭创建者处理')).toBeVisible();
    await expect(page.getByLabel('邀请共同家长')).toHaveCount(0);
  });

  test('maintains, tests and deletes the family email integration', async ({ page }) => {
    let emailResource = {
      configured: false,
      status: null,
      configuration: null,
      credentials_configured: false,
      last_verified_at: null,
      last_verification_result: null,
      can_manage: true,
    };
    let savedPayload;
    await mockApi(page, (request) => {
      const path = new URL(request.url()).pathname;
      if (path.endsWith('/family/integrations/email') && request.method() === 'GET') {
        return envelope(emailResource);
      }
      if (path.endsWith('/family/integrations/email') && request.method() === 'PUT') {
        savedPayload = request.postDataJSON();
        emailResource = {
          ...emailResource,
          configured: true,
          status: 'pending',
          configuration: savedPayload.configuration,
          credentials_configured: true,
        };
        return envelope(emailResource);
      }
      if (path.endsWith('/family/integrations/email/test') && request.method() === 'POST') {
        emailResource = {
          ...emailResource,
          status: 'verified',
          last_verified_at: '2026-08-03T00:00:00.000Z',
          last_verification_result: { code: 'email_test_sent' },
        };
        return envelope(emailResource);
      }
      if (path.endsWith('/family/integrations/email') && request.method() === 'DELETE') {
        emailResource = {
          configured: false,
          status: null,
          configuration: null,
          credentials_configured: false,
          last_verified_at: null,
          last_verification_result: null,
          can_manage: true,
        };
        return { status: 204, body: '' };
      }
      return undefined;
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings');
    const card = page.locator('section.panel').filter({ hasText: '家庭邮件' });
    await card.getByLabel('SMTP Host').fill('smtp.example.com');
    await card.getByLabel('发件邮箱').fill('family@example.com');
    await card.getByLabel('SMTP 用户名').fill('family@example.com');
    await card.getByLabel('密码或授权码').fill('authorization-code');
    await card.getByRole('button', { name: '保存配置' }).click();

    await expect(card.getByText('待验证', { exact: true })).toBeVisible();
    expect(savedPayload).toMatchObject({
      configuration: { host: 'smtp.example.com', port: 465, tls_mode: 'tls' },
      credentials: { username: 'family@example.com', password: 'authorization-code' },
    });
    await card.getByRole('button', { name: '测试连接' }).click();
    await expect(card.getByText('验证通过', { exact: true })).toBeVisible();
    await expect(card.getByText('测试邮件已发送')).toBeVisible();

    await card.getByRole('button', { name: '删除' }).click();
    await page.getByRole('button', { name: '确认删除' }).click();
    await expect(card.getByText('未配置', { exact: true })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      client: globalThis.document.documentElement.clientWidth,
      scroll: globalThis.document.documentElement.scrollWidth,
    }));
    expect(dimensions.scroll).toBe(dimensions.client);
  });

  test('reloads the authoritative review queue and preserves failed submissions', async ({
    page,
  }) => {
    let pending = [
      {
        target_type: 'CHECK_IN',
        target_id: 'check-in-review-e2e',
        attempt_id: 'check-attempt-review-e2e',
        task: { id: 'task-review-e2e', name: '晨读' },
        child: { id: 'child-review-e2e', nickname: '小星' },
        content_text: '已经读完两章。',
        media: [],
        submitted_at: '2026-08-02T08:00:00.000Z',
      },
      {
        target_type: 'COLLABORATION_SUBMISSION',
        target_id: 'collaboration-review-e2e',
        attempt_id: 'collaboration-attempt-review-e2e',
        task: { id: 'task-collaboration-e2e', name: '整理房间' },
        child: { id: 'child-collaboration-e2e', nickname: '小月' },
        content_text: '已经整理好书桌。',
        media: [],
        submitted_at: '2026-08-02T08:10:00.000Z',
      },
    ];
    let queueReads = 0;
    let idempotencyKey;
    await mockApi(page, (request) => {
      const url = request.url();
      if (request.method() === 'GET' && url.endsWith('/family/submission-reviews/pending')) {
        queueReads += 1;
        return envelope({ reviews: pending });
      }
      if (request.method() === 'POST' && url.endsWith('/check-ins/check-in-review-e2e/reviews')) {
        idempotencyKey = request.headers()['idempotency-key'];
        pending = pending.filter(({ target_id }) => target_id !== 'check-in-review-e2e');
        return envelope({ review: { id: 'review-e2e', status: 'APPROVED' } });
      }
      if (
        request.method() === 'POST' &&
        url.endsWith('/collaboration-submissions/collaboration-review-e2e/reviews')
      ) {
        return envelope({}, 409);
      }
      if (
        request.method() === 'GET' &&
        url.endsWith('/collaboration-submissions/collaboration-review-e2e/reviews')
      ) {
        return envelope({ reviews: [] });
      }
      return undefined;
    });

    await page.goto('/reviews');
    const approvedCard = page.locator('article').filter({ hasText: '晨读' });
    await approvedCard.getByRole('button', { name: '通过并发分' }).click();
    await expect(page.getByText('审核通过，积分已按规则处理。')).toBeVisible();
    await expect(approvedCard).toHaveCount(0);
    await expect.poll(() => queueReads).toBeGreaterThanOrEqual(2);
    expect(idempotencyKey).toBe('review:check-attempt-review-e2e:APPROVED');

    await page.reload();
    await expect(page.getByText('整理房间', { exact: true })).toBeVisible();
    await expect(page.getByText('晨读', { exact: true })).toHaveCount(0);
    const failedCard = page.locator('article').filter({ hasText: '整理房间' });
    await failedCard.getByRole('button', { name: '通过并发分' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '保留当前记录' })).toBeVisible();
    await expect(failedCard).toBeVisible();
  });

  test('previews review media and keeps decision actions in mobile order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, (request) => {
      const url = request.url();
      if (url.endsWith('/family/submission-reviews/pending')) {
        return envelope({
          reviews: [
            {
              target_type: 'CHECK_IN',
              target_id: 'check-in-media-e2e',
              attempt_id: 'attempt-media-e2e',
              task: { id: 'task-media-e2e', name: '整理房间' },
              child: { id: 'child-media-e2e', nickname: '小月' },
              content_text: '已经整理完成。',
              media: [
                { id: 'image-media-e2e', type: 'IMAGE', mime_type: 'image/png' },
                { id: 'image-media-e2e-2', type: 'IMAGE', mime_type: 'image/jpeg' },
                { id: 'video-media-e2e', type: 'VIDEO', mime_type: 'video/mp4' },
              ],
              submitted_at: '2026-08-03T08:00:00.000Z',
            },
          ],
        });
      }
      if (url.endsWith('/media/image-media-e2e/access-url')) {
        return envelope({
          url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"%3E%3Crect width="20" height="20" fill="orange"/%3E%3C/svg%3E',
        });
      }
      if (url.endsWith('/media/image-media-e2e-2/access-url')) {
        return envelope({
          url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"%3E%3Crect width="20" height="20" fill="blue"/%3E%3C/svg%3E',
        });
      }
      if (url.endsWith('/media/video-media-e2e/access-url')) {
        return envelope({ url: 'data:video/mp4;base64,AAAA' });
      }
      return undefined;
    });

    await page.goto('/reviews');
    const card = page.locator('article').filter({ hasText: '整理房间' });
    const approve = card.getByRole('button', { name: '通过并发分' });
    const reject = card.getByRole('button', { name: '不通过打回' });
    const reason = card.getByLabel('打回原因');
    const [approveBox, rejectBox, reasonBox] = await Promise.all([
      approve.boundingBox(),
      reject.boundingBox(),
      reason.boundingBox(),
    ]);
    expect(approveBox.y).toBeLessThan(rejectBox.y);
    expect(rejectBox.y).toBeLessThan(reasonBox.y);

    await card.getByRole('button', { name: '查看凭证 (3)' }).click();
    const dialog = page.getByRole('dialog', { name: '提交凭证' });
    await expect(dialog.getByAltText('提交凭证 1')).toBeVisible();
    await dialog.getByRole('button', { name: '放大图片' }).click();
    await expect(dialog.getByRole('button', { name: '恢复图片原始缩放' })).toContainText('125%');
    const imageViewport = dialog.getByLabel('图片凭证浏览区域');
    const imageViewportBox = await imageViewport.boundingBox();
    await page.mouse.move(
      imageViewportBox.x + imageViewportBox.width / 2,
      imageViewportBox.y + imageViewportBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      imageViewportBox.x + imageViewportBox.width / 2 + 45,
      imageViewportBox.y + imageViewportBox.height / 2 + 35,
    );
    await page.mouse.up();
    await expect(dialog.getByAltText('提交凭证 1')).toHaveCSS(
      'transform',
      /matrix\(1\.25, 0, 0, 1\.25, (?!0, 0)/,
    );
    await dialog.getByRole('button', { name: '恢复图片原始缩放' }).click();
    const touchClient = await page.context().newCDPSession(page);
    const touchY = imageViewportBox.y + imageViewportBox.height / 2;
    await touchClient.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: imageViewportBox.x + imageViewportBox.width * 0.8, y: touchY }],
    });
    await touchClient.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: imageViewportBox.x + imageViewportBox.width * 0.2, y: touchY }],
    });
    await touchClient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(dialog.getByAltText('提交凭证 2')).toBeVisible();
    await dialog.getByRole('button', { name: '放大图片' }).click();
    await touchClient.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: imageViewportBox.x + imageViewportBox.width / 2, y: touchY }],
    });
    await touchClient.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: imageViewportBox.x + imageViewportBox.width / 2 - 40, y: touchY + 30 }],
    });
    await touchClient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(dialog.getByAltText('提交凭证 2')).toBeVisible();
    await expect(dialog.getByAltText('提交凭证 2')).toHaveCSS(
      'transform',
      /matrix\(1\.25, 0, 0, 1\.25, (?!0, 0)/,
    );
    await dialog.getByRole('button', { name: '下一项凭证' }).click();
    await expect(dialog.getByLabel('视频凭证 3')).toBeVisible();
    await page.locator('.modal-backdrop').click({ position: { x: 2, y: 2 } });
    await expect(dialog).toHaveCount(0);
  });

  test('creates a parent task and preserves the API contract', async ({ page }) => {
    let taskPayload;
    await mockApi(page, (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/family/tasks')) {
        taskPayload = request.postDataJSON();
        return envelope(
          {
            task: {
              id: 'task-e2e',
              ...taskPayload,
              task_type_id: taskPayload.task_type_id,
              status: 'ACTIVE',
            },
          },
          201,
        );
      }
      return undefined;
    });
    await page.goto('/tasks');
    await page.getByRole('button', { name: '创建任务' }).click();
    await page.getByLabel('任务名称').fill('整理学习桌');
    await page.getByRole('button', { name: '创建并启用' }).click();
    await expect.poll(() => taskPayload?.name).toBe('整理学习桌');
    expect(taskPayload.assignments).toHaveLength(1);
  });

  test('edits a parent task and keeps the server response after refresh', async ({ page }) => {
    let task = {
      id: 'task-edit-e2e',
      task_type_id: 'task-type-e2e',
      name: '整理书桌',
      description: '收好课本',
      submission_guide: null,
      check_type: 'TICK',
      verify_mode: 'AUTO',
      collaboration_mode: 'SOLO',
      frequency: { kind: 'daily' },
      base_points: 10,
      status: 'ACTIVE',
      assignments: [{ id: 'assignment-edit-e2e', child_id: childFixture.id }],
    };
    let patch;
    await mockApi(page, (request) => {
      const url = request.url();
      if (request.method() === 'GET' && url.endsWith('/family/tasks')) {
        return envelope({ tasks: [task] });
      }
      if (request.method() === 'PATCH' && url.endsWith('/family/tasks/task-edit-e2e')) {
        patch = request.postDataJSON();
        task = { ...task, ...patch };
        return envelope({ task });
      }
      return undefined;
    });

    await page.goto('/tasks');
    await page.getByRole('button', { name: '编辑整理书桌' }).click();
    await page
      .getByRole('dialog', { name: '编辑家庭任务' })
      .getByLabel('任务名称')
      .fill('整理学习桌');
    await page.getByRole('button', { name: '保存修改' }).click();
    await expect.poll(() => patch?.name).toBe('整理学习桌');
    await expect(page.getByText('整理学习桌', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('整理学习桌', { exact: true })).toBeVisible();
  });

  test('shows the current child assigned tasks on home and check-ins', async ({ page }) => {
    await mockApi(page, undefined, 'child');
    await page.goto('/child');
    await expect(page.getByText('整理学习桌', { exact: true })).toBeVisible();
    await page.goto('/child/check-ins');
    await expect(page.getByText('整理学习桌', { exact: true })).toBeVisible();
    await expect(page.getByText('+15 星', { exact: true })).toBeVisible();
    await expect(page.getByText('提交说明：完成后勾选', { exact: true })).toBeVisible();
  });

  test('submits a real child checkbox check-in request', async ({ page }) => {
    let submittedRequest;
    await mockApi(
      page,
      (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/check-ins')) {
          submittedRequest = {
            body: request.postDataJSON(),
            idempotencyKey: request.headers()['idempotency-key'],
          };
          return envelope(
            {
              check_in: {
                id: 'check-in-child-e2e',
                task_assignment_id: childTaskFixture.task_assignment_id,
                status: 'APPROVED',
              },
            },
            201,
          );
        }
        return undefined;
      },
      'child',
    );

    await page.goto('/child/check-ins');
    const card = page.locator('article.child-card').filter({ hasText: '整理学习桌' });
    await card.getByRole('button', { name: '完成打卡' }).click();

    await expect
      .poll(() => submittedRequest?.body.task_assignment_id)
      .toBe(childTaskFixture.task_assignment_id);
    expect(submittedRequest.idempotencyKey).toMatch(/^check-in-/);
    await expect(card.getByRole('status')).toHaveText('打卡已提交。');
  });

  test('shows mobile videos in the child media picker and preserves selected file names', async ({
    page,
  }) => {
    await mockApi(
      page,
      (request) => {
        if (new URL(request.url()).pathname.endsWith('/tasks/me')) {
          return envelope({
            date: '2026-08-03',
            tasks: [
              {
                ...childTaskFixture,
                name: '录制整理书桌',
                check_type: 'VIDEO',
                verify_mode: 'MANUAL',
              },
            ],
          });
        }
        return undefined;
      },
      'child',
    );

    await page.goto('/child/check-ins');
    const card = page.locator('article.child-card').filter({ hasText: '录制整理书桌' });
    await expect(card.getByText('选择本地文件')).toBeVisible();
    const input = card.locator('input[type="file"]');
    await expect(input).toHaveClass(/sr-only/);
    await expect(input).toHaveAttribute('accept', 'video/mp4,video/quicktime,video/x-m4v');
    await input.setInputFiles({
      name: '整理完成.mov',
      mimeType: 'video/quicktime',
      buffer: Buffer.from('familystar-e2e'),
    });
    await expect(card.getByText('已选择 1 个文件')).toBeVisible();
    expect(await input.evaluate((element) => element.files?.[0]?.name)).toBe('整理完成.mov');
  });

  test('simulates COS multipart calls and displays PIN lock countdown', async ({ page }) => {
    const cosCalls = [];
    await mockApi(
      page,
      (request) => {
        const url = request.url();
        if (url.includes('/media/uploads')) {
          cosCalls.push(url);
          if (url.endsWith('/complete')) {
            return envelope({
              upload: { id: 'upload-e2e', media_id: 'media-e2e', status: 'READY' },
            });
          }
          return envelope(
            { upload: { id: 'upload-e2e', media_id: 'media-e2e', status: 'UPLOADING' } },
            201,
          );
        }
        if (url.endsWith('/auth/switch-targets')) {
          return envelope({
            children: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                nickname: '小宇',
                credential_type: 'pin',
                gender: 'male',
              },
            ],
          });
        }
        if (url.endsWith('/auth/child/switch') && request.method() === 'POST')
          return envelope({}, 401);
        return undefined;
      },
      'child',
    );
    await page.goto('/child');
    await page.evaluate(async () => {
      const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': 'cos-e2e' };
      await fetch('/api/v1/media/uploads', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'IMAGE',
          mime_type: 'image/png',
          checksum: 'a'.repeat(64),
          size_bytes: 8,
        }),
      });
      await fetch('/api/v1/media/uploads/upload-e2e/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    });
    await expect.poll(() => cosCalls.length).toBe(2);

    await page.getByRole('button', { name: '切换家庭账号' }).click();
    await page.getByLabel('PIN 或密码').fill('0000');
    await page.getByRole('button', { name: '进入个人空间' }).click();
    await expect(page.getByRole('timer')).toContainText(/14:5\d|15:00/);
  });

  test('covers review timeout, level progress, inventory redemption and refund states', async ({
    page,
  }) => {
    const writes = [];
    await mockApi(page, (request) => {
      if (request.method() === 'POST') writes.push(request.url());
      if (
        request.method() === 'POST' &&
        request.url().endsWith('/rewards/reward-e2e/redemptions')
      ) {
        return envelope({
          redemption: {
            id: 'redemption-created-e2e',
            child_id: 'child-e2e',
            reward_id: 'reward-e2e',
            points_spent: 30,
            status: 'PENDING',
          },
        });
      }
      if (request.method() === 'GET' && request.url().endsWith('/redemptions')) {
        return envelope({
          redemptions: [
            {
              id: 'redemption-refunded-e2e',
              child_id: 'child-e2e',
              reward_id: 'reward-e2e',
              points_spent: 30,
              status: 'REJECTED',
            },
          ],
        });
      }
      return undefined;
    });
    await page.goto('/reviews');
    await expect(page.getByText(/超时/).first()).toBeVisible();

    await setPortalRole(page, 'child');
    await page.goto('/child/achievements');
    await expect(page.getByText('20 级成长阶梯', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar').first()).toBeVisible();

    await page.goto('/child/rewards');
    const reward = page.locator('article').filter({ hasText: '动画时间 30 分钟' });
    await reward.getByRole('button', { name: '立即兑换' }).click();
    await expect(page.getByRole('dialog', { name: '确认兑换' })).toBeVisible();
    await page.getByRole('button', { name: /确认支付/ }).click();
    await expect.poll(() => writes.some((url) => url.includes('/redemptions'))).toBe(true);

    await setPortalRole(page, 'parent');
    await page.goto('/rewards');
    await expect(page.getByText(/库存/).first()).toBeVisible();
    await expect(page.getByText('已拒绝，退款完成', { exact: true })).toBeVisible();
  });
});
