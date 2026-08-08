const { defineConfig, devices } = require('@playwright/test');

const remoteBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const localBaseURL = 'http://127.0.0.1:3000';
const acceptanceSecureOrigin =
  process.env.REAL_ACCEPTANCE && remoteBaseURL && new URL(remoteBaseURL).protocol === 'http:'
    ? new URL(remoteBaseURL).origin
    : null;
const localWebServer = [
  {
    command: 'node e2e/auth-server.cjs',
    url: 'http://127.0.0.1:3001/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  {
    command: 'pnpm --filter @familystar/web exec next dev --hostname 127.0.0.1 --port 3000',
    url: localBaseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
];

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results/playwright',
  use: {
    baseURL: remoteBaseURL ?? localBaseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: acceptanceSecureOrigin
          ? { args: [`--unsafely-treat-insecure-origin-as-secure=${acceptanceSecureOrigin}`] }
          : undefined,
      },
    },
  ],
  webServer: remoteBaseURL ? undefined : localWebServer,
});
