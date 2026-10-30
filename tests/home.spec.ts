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
    await expect(page.locator('h1')).toHaveText(/Nicolás\s*Porras/);
    await expect(page.locator('.hero__role')).toHaveText('Game QA, platform compliance & release testing');
    await expect(page.locator('.hero__value')).toContainText('testing games since 2021 and leading QA teams since 2022');
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

  test('menu toggle works on a phone, and the nav holds only the three pages and the button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Menu' });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
    const nav = page.getByRole('navigation', { name: 'Site' });
    await expect(nav.getByRole('link')).toHaveText(['Skills', 'Portfolio', 'Quality', 'Get in touch']);
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('the hero is pinned and the next level slides over it; it scrolls away under reduced motion', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const hero = page.locator('.hero');
    expect(await hero.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    const figure = page.locator('.hero__figure img');
    await expect(figure).toBeVisible();
    expect(await page.locator('main img:not([alt=""])').count(), 'the photo appears once on the site').toBe(1);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => {
      const hero = document.querySelector('.hero')!.getBoundingClientRect();
      const next = document.querySelector('.wall')!.getBoundingClientRect();
      return { heroTop: hero.top, heroBottom: hero.bottom, nextTop: next.top };
    });
    expect(after.heroTop, 'the hero stays at the top of the screen').toBeGreaterThanOrEqual(-1);
    expect(after.nextTop, 'the next level has climbed over the hero').toBeLessThan(after.heroBottom);

    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const quiet = await context.newPage();
    await quiet.goto('/');
    expect(await quiet.locator('.hero').evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky');
    await context.close();
  });

  test('the wall shows every title as a logo or its icon, each linking to the portfolio', async ({ page }) => {
    await page.goto('/');
    const links = page.locator('.wall__link');
    expect(await links.count()).toBe(20);
    const names = await links.evaluateAll((as) => as.map((a) => a.getAttribute('aria-label') ?? ''));
    expect(names).toContain("Lou's Lagoon");
    expect(names).toContain('The Climb 2');
    expect(new Set(names).size).toBe(20);
    for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toBe('/portfolio');
    expect(await page.locator('.wall__logo').count(), 'official logos').toBeGreaterThanOrEqual(16);
    await expect(page.locator('.wall__grid')).not.toContainText(/stage|view on/i);
  });

  test('the stats are counted from the data and count up into view', async ({ page }) => {
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const nums = page.locator('.stat__num');
    await expect(nums).toHaveCount(4);
    const labels = await page.locator('.stat__label').allTextContents();
    expect(labels).toEqual(['years in QA', 'companies', 'games', 'platforms']);
    await page.locator('.stats').scrollIntoViewIfNeeded();
    await expect(nums.nth(0)).toHaveText('5+', { timeout: 5000 });
    await expect(nums.nth(1)).toHaveText('6');
    await expect(nums.nth(2)).toHaveText('20');
    await expect(nums.nth(3)).toHaveText('10+');
  });

  test('the self test runs, reports and scores the page, and the Quality link stays visible', async ({ page }) => {
    await page.goto('/');
    // Nothing is ticked before the test runs: idle boxes and blank counts, the last run as text only
    await expect(page.locator('.panel.is-idle')).toHaveCount(6);
    await expect(page.locator('.panel.is-pass, .panel.is-failed')).toHaveCount(0);
    await expect(page.locator('#selftest-status')).toHaveText(/\d+ (of \d+ checks passed in the last run|checks run before every deploy)/);
    const quality = page.locator('.proof').getByRole('link', { name: 'How I test this site' });
    await expect(quality).toHaveAttribute('href', '/quality');
    await page.getByRole('button', { name: 'Test this page' }).click();
    await expect(page.locator('#selftest-status')).toContainText(/on your device/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible();
    await expect(page.locator('#selftest-score')).toBeVisible();
    await expect(page.locator('#selftest-score [data-score]')).toHaveText(/^\d\/6$/);
    await expect(page.locator('.panel.is-idle')).toHaveCount(0);
    await expect(page.locator('.panel.is-pass, .panel.is-failed')).toHaveCount(6);
    await expect(quality).toBeVisible();
  });

  test('Get in touch appears in the nav, the hero and the end of Home only', async ({ page }) => {
    await page.goto('/');
    const buttons = page.getByRole('link', { name: 'Get in touch' });
    await expect(buttons).toHaveCount(3);
    await expect(page.locator('header').getByRole('link', { name: 'Get in touch' })).toHaveCount(1);
    await expect(page.locator('.hero').getByRole('link', { name: 'Get in touch' })).toHaveCount(1);
    await expect(page.locator('.final').getByRole('link', { name: 'Get in touch' })).toHaveCount(1);
    await expect(page.locator('footer').getByRole('link', { name: 'Get in touch' })).toHaveCount(0);
    for (const path of ['/skills', '/portfolio', '/quality', '/contact', '/credits', '/privacy']) {
      await page.goto(path);
      await expect(page.locator('main').getByRole('link', { name: 'Get in touch' }), path).toHaveCount(0);
    }
  });

  test('hero content is in the HTML before any script runs', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.hero__value')).toBeVisible();
    await expect(page.locator('.wall__link')).toHaveCount(20);
    await expect(page.locator('.stat__num').first()).toHaveText('5+');
    await expect(page.locator('.final__text')).toContainText('Helldivers, The Witcher and God of War');
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
