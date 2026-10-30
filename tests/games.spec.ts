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
    // the controls live on the scoreboard card, which the pill opens
    const pill = page.getByRole('button', { name: /^Scoreboard/ });
    await expect(pill).toHaveAccessibleName(/level\s*Lv\s*1\s*\/\s*5\s*00 bugs caught\s*0\/4 achievements/);
    await pill.click();
    await page.getByRole('button', { name: /Games on/ }).click();
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)games(\s|$)/);
    await expect(page.locator('.hud__floor')).toBeHidden();
    await expect(page.locator('[data-bug]:visible')).toHaveCount(0);
    await expect(pill, 'the pill stays, to turn the games back on').toBeVisible();
    await expect(pill).toHaveAccessibleName(/games off/);
    await page.reload();
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
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
    // the toast sits above the scoreboard, bottom right
    const toast = (await page.locator('[data-toast]').boundingBox())!;
    const pillBox = (await page.locator('.score__pill').boundingBox())!;
    expect(toast.y + toast.height).toBeLessThanOrEqual(pillBox.y + 1);
    expect(toast.x + toast.width).toBeGreaterThan(pillBox.x);
    await page.reload();
    await expect(page.locator('[data-hud-bugs]')).toHaveText('01');
    await expect(page.locator(`[data-bug="${id}"]`)).toBeHidden();
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await expect(page.locator('.score__ach li.is-done')).toHaveText(['Caught your first bug']);
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

  test('the ship moves down the track with the scroll', async ({ page }) => {
    await page.goto('/');
    const y = () => page.locator('.hud__runner').evaluate((el) => el.getBoundingClientRect().top);
    const start = await y();
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'instant' }));
    await expect.poll(y).toBeGreaterThan(start + 100);
    await expect(page.locator('[data-hud-level]')).not.toHaveText('1');
  });

  test('the track is a rail no wider than the ship on the left, its numbers fully visible; the scoreboard is a compact card bottom right that opens on hover, Enter or a click', async ({ page }) => {
    for (const path of ['/', '/skills/', '/portfolio/', '/quality/']) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await page.mouse.move(700, 450);
      const hud = page.locator('#hud');
      await expect(hud).toBeVisible();
      const box = (await hud.boundingBox())!;
      const ship = (await page.locator('.hud__runner').boundingBox())!;
      expect(box.x, `${path}: on the left edge`).toBe(0);
      expect(box.width, `${path}: no wider than the ship`).toBeLessThanOrEqual(ship.width + 1);
      expect(box.width, `${path}: slim`).toBeLessThanOrEqual(32);
      expect(box.height, `${path}: full height`).toBeGreaterThanOrEqual(880);
      await expect(page.locator('.hud__floor'), `${path}: a rail, not a strip of squares`).toHaveCSS('background-image', 'none');
      // the ship paints over the rail, and the rail is light with a navy edge so it reads on every field
      const z = await page.evaluate(() => [parseInt(getComputedStyle(document.querySelector('.hud__runner')!).zIndex) || 0, parseInt(getComputedStyle(document.querySelector('.hud__floor')!).zIndex) || 0]);
      expect(z[0], `${path}: the ship on top of the line`).toBeGreaterThan(z[1]);
      const rail = await page.locator('.hud__floor').evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow }));
      expect(rail.bg).not.toBe('rgb(28, 42, 72)');
      expect(rail.shadow).toContain('rgb(12, 21, 42)');
      expect(await page.locator('.hud__levels li span').first().evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
      // the ship hides the rail entirely: at its centre and across its width the top element is the ship
      for (const at of [0, 0.5, 1]) {
        await page.evaluate((at) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * at), at);
        await page.waitForTimeout(250);
        const hits = await page.evaluate(() => {
          const ship = document.querySelector('.hud__runner')!.getBoundingClientRect();
          const cx = ship.left + ship.width / 2;
          const cy = ship.top + ship.height / 2;
          return [-11, -6, -2, 0, 2, 6, 11].map((dx) => {
            const el = document.elementFromPoint(cx + dx, cy);
            return { dx, onShip: !!el?.closest('.hud__runner'), rail: !!el?.closest('.hud__floor'), what: `${el?.tagName}.${el?.getAttribute('class') ?? ''}` };
          });
        });
        for (const h of hits) {
          expect(h.rail, `${path} at ${at}: the rail shows at ${h.dx}px from the ship's centre (${h.what})`).toBe(false);
          expect(h.onShip, `${path} at ${at}: the ship at ${h.dx}px from its centre (${h.what})`).toBe(true);
        }
      }
      await expect(page.locator('.hud__ship')).toHaveCSS('background-color', 'rgb(12, 21, 42)');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      // one marker per level after the first, or one per year where the page carries years,
      // each beside the rail and wholly on screen
      const levels = await page.locator('[data-level]').count();
      const years = await page.locator('[data-year]').evaluateAll((els) => els.map((e) => e.getAttribute('data-year')).filter((y, i, a) => i === 0 || y !== a[i - 1]).length);
      const marks = page.locator('.hud__levels li');
      await expect(marks).toHaveCount(years || levels - 1);
      for (const m of await marks.locator('span').all()) {
        const r = (await m.boundingBox())!;
        expect(r.x, `${path}: the number clears the rail`).toBeGreaterThanOrEqual(box.width);
        expect(r.width, `${path}: the number has a box`).toBeGreaterThan(6);
        expect(r.x + r.width, `${path}: the number stays in the gutter`).toBeLessThanOrEqual(92);
      }
      // the scoreboard: a pill in the bottom right corner, the card hidden until asked for
      const pill = page.getByRole('button', { name: /^Scoreboard/ });
      const p = (await pill.boundingBox())!;
      expect(p.x + p.width, `${path}: at the right edge`).toBeGreaterThanOrEqual(1440 - 40);
      expect(p.y + p.height, `${path}: at the bottom edge`).toBeGreaterThanOrEqual(900 - 40);
      expect(p.height, `${path}: compact`).toBeLessThanOrEqual(40);
      expect(p.width, `${path}: compact`).toBeLessThanOrEqual(200);
      await expect(page.locator('[data-hud-bugs]')).toBeVisible();
      const panel = page.locator('.score__panel');
      await expect(panel).toBeHidden();
      await pill.hover();
      await expect(panel).toBeVisible();
      await expect(panel.getByText('Bugs caught')).toBeVisible();
      await expect(panel.locator('.score__ach li')).toHaveCount(4);
      const pb = (await panel.boundingBox())!;
      expect(pb.y + pb.height, `${path}: the card opens above the pill`).toBeLessThanOrEqual(p.y + 1);
      await page.mouse.move(700, 450);
      await expect(panel).toBeHidden();
      // a disclosure for the keyboard: Enter opens it, Escape closes it, Tab reaches its buttons
      await pill.focus();
      await expect(panel).toBeHidden();
      await page.keyboard.press('Enter');
      await expect(panel).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: /Games on/ })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(pill).toBeFocused();
      await page.mouse.click(700, 450);
      await pill.click();
      await page.mouse.move(700, 450);
      await expect(panel, 'a click pins it open').toBeVisible();
      await expect(pill).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(pill).toHaveAttribute('aria-expanded', 'false');
    }
    // the end of the page: the scoreboard never sits on the footer's last line
    await page.goto('/skills/');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    const legal = (await page.locator('.footer__legal').boundingBox())!;
    const pillEnd = (await page.locator('.score__pill').boundingBox())!;
    expect(legal.y + legal.height).toBeLessThanOrEqual(pillEnd.y);
    // a phone: the bar lies along the bottom, the pill at its right end
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/skills/');
    const bar = (await page.locator('#hud').boundingBox())!;
    expect(bar.width).toBe(390);
    expect(bar.height).toBeLessThanOrEqual(48);
    expect(bar.y + bar.height).toBe(844);
    const pp = (await page.locator('.score__pill').boundingBox())!;
    expect(pp.x + pp.width).toBe(390);
    expect(pp.y).toBeGreaterThanOrEqual(bar.y);
    expect(pp.y + pp.height).toBeLessThanOrEqual(844);
    expect(pp.width, 'compact on a phone, saying the same as on a desktop').toBeLessThanOrEqual(140);
  });

  test('reduced motion removes the games and the bar', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('#hud')).toHaveCount(0);
    await expect(page.locator('#dock')).toHaveCount(0);
    await expect(page.locator('[data-bug]:visible')).toHaveCount(0);
    await expect(page.locator('h1')).toBeVisible();
    await context.close();
  });

  test('the 404 page counts down and Stay here stops it', async ({ page }) => {
    const res = await page.goto('/this-page-is-not-in-the-build/');
    expect(res?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Game over');
    const num = page.locator('[data-count]');
    await expect(num).toBeVisible();
    await expect(num).toHaveText(/^[0-9]$/, { timeout: 3000 });
    await page.getByRole('button', { name: 'Stay here' }).click();
    await expect(num).toBeHidden();
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/this-page-is-not-in-the-build/');
    await expect(page.getByRole('link', { name: 'Continue to Home' })).toHaveAttribute('href', '/');
  });

  test('the 404 page is a plain link home without script', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/nothing-here/');
    await expect(page.locator('h1')).toHaveText('Game over');
    await expect(page.locator('[data-count]')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Continue to Home' })).toBeVisible();
    await context.close();
  });
});
