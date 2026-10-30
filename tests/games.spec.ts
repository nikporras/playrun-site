import { test, expect, type Locator } from '@playwright/test';

// A bug paces while the games are on; a click waits for a still target, so the walk is paused first.
const still = (bug: Locator) => bug.evaluate((el) => el.getAnimations().forEach((a) => a.pause()));

/**
 * The games: the runner on the floor, the bug hunt, the achievements, the HUD toggle and the
 * 404 countdown. Every game is optional, so the checks also cover the ways to not play.
 */
test.describe('Games', () => {
  test('the HUD shows, the games toggle off and the choice is remembered', async ({ page }) => {
    await page.goto('/');
    const hud = page.locator('#hud');
    await expect(hud).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/games/);
    await expect(page.locator('.hud__floor')).toBeVisible();
    await page.getByRole('button', { name: /Games on/ }).click();
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)games(\s|$)/);
    await expect(page.locator('.hud__floor')).toBeHidden();
    await expect(page.locator('[data-bug]:visible')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: /Games off/ })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: /Games off/ }).click();
    await expect(page.locator('html')).toHaveClass(/(^|\s)games(\s|$)/);
  });

  test('a bug is caught with the net, counts, unlocks the first achievement and survives a reload', async ({ page }) => {
    await page.goto('/');
    const bug = page.locator('[data-bug]:visible').first();
    const id = await bug.getAttribute('data-bug');
    await still(bug);
    await bug.scrollIntoViewIfNeeded();
    await expect(bug).toHaveAccessibleName('Catch this bug');
    await bug.click();
    await expect(bug).toHaveClass(/is-caught/);
    await expect(bug.locator('.bug__net')).toBeVisible();
    await expect(page.locator('[data-hud-bugs]')).toHaveText('00');
    await expect(page.locator('[data-hud-bugs]')).toHaveText('01');
    await expect(page.locator('[data-toast]')).toContainText('Caught your first bug');
    await expect(page.locator('[data-toast]')).toHaveClass(/is-in/);
    await expect(page.locator('[data-hud-ach]')).toHaveText('1/4');
    await expect(page.locator(`[data-bug="${id}"]`)).toBeHidden();
    await page.reload();
    await expect(page.locator('[data-hud-bugs]')).toHaveText('01');
    await expect(page.locator(`[data-bug="${id}"]`)).toBeHidden();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('[data-hud-bugs]')).toHaveText('00');
    await expect(page.locator(`[data-bug="${id}"]`)).toBeVisible();
  });

  test('the net cursor shows over a bug and nowhere else, and only with a fine pointer', async ({ page }) => {
    await page.goto('/');
    const bug = page.locator('[data-bug]:visible').first();
    const cursorOf = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).cursor);
    expect(await cursorOf('[data-bug]:visible')).toContain('net-cursor.svg');
    expect(await cursorOf('h1')).not.toContain('net-cursor');
    expect(await cursorOf('a.button')).toBe('pointer');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await bug.focus();
    await page.keyboard.press('Enter');
    await expect(bug).toHaveClass(/is-caught/);
  });

  test('a touch tap catches without a cursor change', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('/');
    const bug = page.locator('[data-bug]:visible').first();
    expect(await bug.evaluate((el) => getComputedStyle(el).cursor)).not.toContain('net-cursor');
    await still(bug);
    await bug.tap();
    await expect(bug).toHaveClass(/is-caught/);
    await expect(page.locator('[data-hud-bugs]')).toHaveText('01');
    await context.close();
  });

  test('the ship moves along the floor with the scroll', async ({ page }) => {
    await page.goto('/');
    const x = () => page.locator('.hud__runner').evaluate((el) => el.getBoundingClientRect().left);
    const start = await x();
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'instant' }));
    await expect.poll(x).toBeGreaterThan(start + 100);
    await expect(page.locator('[data-hud-level]')).not.toHaveText('1');
  });

  test('reduced motion removes the games and the bar', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('#hud')).toHaveCount(0);
    await expect(page.locator('[data-bug]:visible')).toHaveCount(0);
    await expect(page.locator('h1')).toBeVisible();
    await context.close();
  });

  test('the 404 page counts down and Stay here stops it', async ({ page }) => {
    const res = await page.goto('/this-page-is-not-in-the-build');
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Game over');
    const num = page.locator('[data-count]');
    await expect(num).toBeVisible();
    await expect(num).toHaveText(/^[0-9]$/, { timeout: 3000 });
    await page.getByRole('button', { name: 'Stay here' }).click();
    await expect(num).toBeHidden();
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/this-page-is-not-in-the-build');
    await expect(page.getByRole('link', { name: 'Continue to Home' })).toHaveAttribute('href', '/');
  });

  test('the 404 page is a plain link home without script', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/nothing-here');
    await expect(page.locator('h1')).toHaveText('Game over');
    await expect(page.locator('[data-count]')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Continue to Home' })).toBeVisible();
    await context.close();
  });
});
