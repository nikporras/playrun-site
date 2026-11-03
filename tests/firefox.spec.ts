import { test, expect } from '@playwright/test';
import { cloudsUnderText } from './clouds-under-text';

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
  // (a request Firefox cancels, NS_BINDING_ABORTED, is not a failure: the page served through the
  // route above, or the next navigation, takes its place)
  page.on('requestfailed', (r) => r.failure()?.errorText !== 'NS_BINDING_ABORTED' && problems.push(`failed ${r.url()} (${r.failure()?.errorText})`));
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

// Home's first screen in Firefox: Level 2's clouds begin about 16px under "More about me", never
// over the hero's text, and the row of logos is on the screen
for (const [width, height] of [
  [1915, 910],
  [1920, 940],
  [1536, 730],
  [1366, 657],
] as const) {
  test(`in Firefox at ${width}x${height} the clouds begin just under the hero's text, the logos on the first screen`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.timeline instanceof DocumentTimeline && a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
    const clouds = await cloudsUnderText(page);
    expect(clouds.covered).toEqual([]);
    expect(clouds.first).toBeGreaterThanOrEqual(8);
    expect(clouds.first).toBeLessThanOrEqual(28);
    // (the logos in the row as it shows: those the row's own box clips away do not count)
    const logos = await page.evaluate(() => {
      const view = document.querySelector('.ticker__view')!.getBoundingClientRect();
      return Math.max(...[...document.querySelectorAll('.ticker__view .wall__mark > *')].map((e) => e.getBoundingClientRect()).filter((b) => b.right > 0 && b.left < innerWidth && b.top < view.bottom).map((b) => b.bottom));
    });
    expect(logos).toBeLessThanOrEqual(height);
  });
}
