import { defineConfig, devices } from '@playwright/test';

const port = 4322;
// Point the suite at a running server (the dev server, say) with PLAYWRIGHT_BASE_URL; without it
// the suite builds the site and serves the build, as CI does.
const external = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // In CI the JSON report is handed to the build, which reads its numbers into the Quality page.
  // The GitHub reporter turns each failure into an annotation on the run.
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }], ['json', { outputFile: 'tests/results/run.json' }]] : [['list']],
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: external
    ? undefined
    : {
        command: `npm run build && npm run preview -- --port ${port} --host 127.0.0.1`,
        url: `http://127.0.0.1:${port}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
