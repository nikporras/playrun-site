import { defineConfig, devices } from '@playwright/test';

const port = 4322;
// Umami's hosts, never reached from a test
const UMAMI = ['cloud.umami.is', 'gateway.umami.is', 'api-gateway.umami.dev'];
// Point the suite at a running server (the dev server, say) with PLAYWRIGHT_BASE_URL; without it
// the suite builds the site and serves the build, as CI does.
const external = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // (GitHub's runner has four cores: two workers leave room for the browsers; locally, half the cores)
  workers: process.env.CI ? 2 : undefined,
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
        // (a test build: the handle Bug Sweep's tests drive it with; the production build leaves it out)
        env: { PUBLIC_TEST_HOOKS: '1' },
        url: `http://127.0.0.1:${port}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [
    // (no browser in the suite can reach Umami: its hosts do not resolve; the tracker also counts
    // only on playrunqa.com, which the suite never is)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: [`--host-resolver-rules=${UMAMI.map((h) => `MAP ${h} ~NOTFOUND`).join(', ')}`] } },
      testIgnore: /(webkit|firefox)\.spec\.ts/,
    },
    // (Safari's engine, for what only it does differently: tests/webkit.spec.ts)
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /webkit\.spec\.ts/ },
    // (and Firefox's: tests/firefox.spec.ts)
    { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: { firefoxUserPrefs: { 'network.dns.localDomains': UMAMI.join(',') } } }, testMatch: /firefox\.spec\.ts/ },
  ],
});
