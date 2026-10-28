import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Routes that are planned but not built yet. Links to them are reported, not failed,
 * so the suite stays green while the site is built page by page. Remove entries as pages land.
 */
const PLANNED_ROUTES: string[] = [];

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

/** Wait for the load sequence and any running CSS animations to finish. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    ),
  );
}

async function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

test.describe('Home', () => {
  test('loads with one h1 and no console errors or failed requests', async ({ page }) => {
    const errors = await collectErrors(page);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/PlayRun/);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(/I break\s*games\./);
    await page.waitForLoadState('networkidle');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('every internal link resolves', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page.locator('a[href]').evaluateAll((as) =>
      (as as HTMLAnchorElement[]).map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/')),
    );
    const unique = [...new Set(hrefs.map((h) => h.split('#')[0]).filter(Boolean))];
    expect(unique.length).toBeGreaterThan(0);
    const planned: string[] = [];
    for (const href of unique) {
      const res = await request.get(href);
      if (res.status() === 404 && PLANNED_ROUTES.includes(href)) {
        planned.push(href);
        continue;
      }
      expect(res.status(), `${href} answered ${res.status()}`).toBe(200);
    }
    if (planned.length) test.info().annotations.push({ type: 'planned routes not built yet', description: planned.join(', ') });
  });

  test('has no accessibility violations (axe)', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('headings are in order and images have alt text', async ({ page }) => {
    await page.goto('/');
    const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1], `heading jump at index ${i}: ${levels.join(',')}`).toBeLessThanOrEqual(1);
    }
    const missingAlt = await page.locator('img:not([alt])').count();
    expect(missingAlt).toBe(0);
  });

  test('keyboard focus is visible on the first interactive element', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip');
    await expect(skip).toBeFocused();
    const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('menu toggle works on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Menu' });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Skills' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('the self test runs, reports and scores the page', async ({ page }) => {
    await page.goto('/');
    // Nothing is ticked before the test runs: idle boxes and blank counts, the last run as text only
    await expect(page.locator('.panel.is-idle')).toHaveCount(6);
    await expect(page.locator('.panel.is-pass, .panel.is-failed')).toHaveCount(0);
    await expect(page.locator('#selftest-status')).toHaveText(/\d+ of \d+ checks passed in the last run/);
    await page.getByRole('button', { name: 'Test this page' }).click();
    await expect(page.locator('#selftest-status')).toContainText(/on your device/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible();
    await expect(page.locator('#selftest-score')).toBeVisible();
    await expect(page.locator('#selftest-score [data-score]')).toHaveText(/^\d\/6$/);
    await expect(page.locator('.panel.is-idle')).toHaveCount(0);
    await expect(page.locator('.panel.is-pass, .panel.is-failed')).toHaveCount(6);
  });

  test('the ticker moves, pauses with its button and stands still under reduced motion', async ({ page, browser }) => {
    await page.goto('/');
    const lane = page.locator('.marquee__lane').first();
    const state = () => lane.evaluate((el) => getComputedStyle(el).animationPlayState);
    await page.locator('.marquee').scrollIntoViewIfNeeded();
    await expect.poll(state).toBe('running');
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(state).toBe('paused');
    await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true');

    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const quiet = await context.newPage();
    await quiet.goto('/');
    const name = await quiet.locator('.marquee__lane').first().evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('none');
    await expect(quiet.getByRole('button', { name: 'Pause' })).toHaveCount(0);
    await context.close();
  });

  test('hero content is in the HTML before any script runs', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.hero__statement')).toBeVisible();
    await expect(page.locator('.marquee__list').first()).toBeVisible();
    await expect(page.locator('.services__row').first()).toBeVisible();
    await expect(page.locator('.stage__via')).toHaveCount(5);
    await expect(page.locator('.hero__badge')).toHaveCount(3);
    await context.close();
  });

  for (const vp of VIEWPORTS) {
    test(`renders without sideways overflow at ${vp.width}px (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.evaluate(() => document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in')));
      await settle(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath(`home-${vp.name}.png`), fullPage: true });
    });
  }
});
