import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility beyond the first paint: axe (WCAG 2.1 A and AA) on every page at a phone's width
 * too, on About and the 404, and on the parts that open on demand: the scoreboard, an achievement
 * toast, the glitch card, Bug Sweep playing, paused and over, and the Testing steps for a phone.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const scan = async (page: Page, what: string) => {
  // (every entrance finished first: axe would read a fading label's colour half way)
  await page.evaluate(async () => {
    document.querySelectorAll('[data-enter]').forEach((el) => el.classList.add('is-in'));
    await Promise.all(document.getAnimations().filter((a) => a.timeline instanceof DocumentTimeline && a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {})));
    await new Promise((r) => setTimeout(r, 700));
  });
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations, `${what}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
};
const PAGES = ['/', '/about/', '/portfolio/', '/testing/', '/contact/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/'];

for (const [width, height] of [
  [1440, 900],
  [375, 812],
] as const) {
  test(`every page passes axe at ${width}px, About and the 404 included`, { tag: ['@a11y'] }, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await scan(page, `${path} at ${width}px`);
    }
    await context.close();
  });

  test(`what opens on demand passes axe at ${width}px: the scoreboard, a toast, the glitch card, Bug Sweep playing, paused and over, the Testing steps for a phone`, { tag: ['@a11y'] }, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    // the scoreboard, open
    await page.goto('/about/');
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await expect(page.locator('.score__panel')).toBeVisible();
    await scan(page, 'the scoreboard open');
    await page.keyboard.press('Escape');
    // an achievement toast
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('playrun:achieve', { detail: 'first-bug' })));
    await expect(page.locator('[data-toast]')).toHaveClass(/is-in/);
    await scan(page, 'a toast');
    // the glitch card
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.locator('.wall__trip[data-trip="glitch"]').count()).toBe(1);
    // (the glitch arms once the page has loaded and settled)
    await page.waitForFunction(() => document.readyState === 'complete');
    await page.waitForTimeout(400);
    const line = await page.locator('.wall__trip[data-trip="glitch"]').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    const foot = await page.locator('.hero').evaluate((el: HTMLElement) => Math.min(innerHeight, (parseFloat(getComputedStyle(el).top) || 0) + el.offsetHeight));
    await page.evaluate((y) => window.scrollTo(0, y), Math.ceil(line - foot + 2));
    await expect(page.locator('[data-glitch-card]')).toHaveClass(/is-in/, { timeout: 3000 });
    await scan(page, 'the glitch card');
    // Bug Sweep playing, paused and over
    await page.goto('/about/');
    await page.getByRole('button', { name: 'Play Bug Sweep' }).click();
    const mode = () => page.locator('[data-sweep]').evaluate((el) => (el as unknown as { sweepTest?: { state: () => { mode: string } } }).sweepTest?.state().mode ?? 'none');
    await expect.poll(mode).toBe('play');
    await scan(page, 'Bug Sweep playing');
    await page.keyboard.press('Escape');
    await expect.poll(mode).toBe('paused');
    await scan(page, 'Bug Sweep paused');
    await page.locator('[data-sweep]').evaluate((el) => {
      const t = (el as unknown as { sweepTest: { hit: () => void } }).sweepTest;
      for (let i = 0; i < 3; i++) t.hit();
    });
    // (hits count only in play: carry on, then three)
    await page.keyboard.press('Escape');
    await expect.poll(mode).toBe('play');
    await page.locator('[data-sweep]').evaluate((el) => {
      const t = (el as unknown as { sweepTest: { hit: () => void } }).sweepTest;
      for (let i = 0; i < 3; i++) t.hit();
    });
    await expect.poll(mode).toBe('over');
    await scan(page, 'Bug Sweep over');
    // the Testing steps for a phone, with Pocket DevTools
    await page.goto('/testing/');
    await page.getByRole('button', { name: 'iPhone' }).click();
    await expect(page.locator('.devtools')).toBeVisible();
    await scan(page, 'the Testing steps for an iPhone');
    await context.close();
  });
}

// About's Quick facts and FAQ: a native dropdown, closed at first, opened and closed from the
// keyboard with a visible focus ring, clean under axe both ways, at a desktop and a phone width.
for (const [width, height] of [[1440, 900], [375, 812]] as const) {
  test(`About's Quick facts and FAQ dropdown (${width}px): keyboard, visible focus, axe clean closed and open`, { tag: ['@a11y'] }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    // (the CLICK ME or TAP hint, decorative and gone after five seconds, would be read by axe half
    // faded beside the level's bug; games.spec covers it)
    await page.addInitScript(() => sessionStorage.setItem('playrun.taphint', 'shown'));
    await page.goto('/about/');
    const faq = page.locator('details.faq');
    const summary = faq.locator('summary');
    await expect(faq).not.toHaveAttribute('open');
    await scan(page, `About ${width}, dropdown closed`);
    await summary.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(summary).toBeFocused();
    expect(await summary.evaluate((el) => getComputedStyle(el).outlineStyle), 'a visible focus ring').not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(faq).toHaveAttribute('open', '');
    await expect(page.getByRole('table', { name: 'Key facts about Nicolás Porras' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: 'What is PlayRun?' })).toBeVisible();
    await scan(page, `About ${width}, dropdown open`);
    await page.keyboard.press('Space');
    await expect(faq).not.toHaveAttribute('open');
    // the page's bug stays catchable with the dropdown closed
    await expect(page.locator('[data-bug="about-1"]')).toBeVisible();
  });
}
