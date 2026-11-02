import { test, expect } from '@playwright/test';

/**
 * In Firefox: every page loads with no console errors and no failed requests, the Quality picker
 * knows it as Firefox, and the five steps finish, Performance on the paint timing Firefox reports.
 */
// (the local preview is http: the policy's upgrade-insecure-requests is taken out of the page as
// served here, as for WebKit; the live site is https)
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(/upgrade-insecure-requests;?\s*/g, '');
    await route.fulfill({ response, body });
  });
});

const PAGES = ['/', '/about/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/privacy/', '/terms/', '/accessibility/'];

test('in Firefox every page loads clean: no script errors, no console errors, no failed requests', async ({ page }) => {
  test.setTimeout(90_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`script error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  page.on('requestfailed', (r) => problems.push(`failed ${r.url()}`));
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('h1')).toHaveCount(1);
  }
  expect(problems).toEqual([]);
});

test.use({ reducedMotion: 'reduce' });

test('in Firefox the Quality picker is preselected as Firefox and the five steps finish, Performance never failing on a missing figure', async ({ page }) => {
  await page.goto('/quality/');
  await expect(page.locator('[data-picker] [aria-pressed="true"]')).toHaveText('Firefox');
  await expect(page.locator('.step__for:not([hidden])').first()).toHaveAttribute('data-for', 'firefox');
  await expect(page.locator('.step.is-pass, .step.is-fail, .step.is-unmeasured')).toHaveCount(5, { timeout: 20_000 });
  const step = page.locator('#step-performance');
  const detail = (await step.locator('[data-step-result]').textContent()) ?? '';
  test.info().annotations.push({ type: 'firefox-performance', description: detail });
  await expect(step, detail).not.toHaveClass(/is-fail/);
  expect(detail).not.toMatch(/n\/a|\b0ms/);
  await expect(page.locator('.step.is-fail')).toHaveCount(0);
});
