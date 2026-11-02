import { defineConfig, devices } from '@playwright/test';

// The weekly check of the live site (.github/workflows/live-check.yml), apart from the suite: its
// tests live in tests-live/ and run against https://playrunqa.com itself. Umami's hosts never
// resolve here, so the check is never counted as a visit.
const UMAMI = ['cloud.umami.is', 'gateway.umami.is', 'api-gateway.umami.dev'];

export default defineConfig({
  testDir: './tests-live',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'live-report' }]] : [['list']],
  use: {
    baseURL: 'https://playrunqa.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'live',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: [`--host-resolver-rules=${UMAMI.map((h) => `MAP ${h} ~NOTFOUND`).join(', ')}`] } },
    },
  ],
});
