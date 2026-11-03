import { test, expect, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';

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
    await expect(pill).toHaveAccessibleName(/level\s*Lv\s*1\s*\/\s*5\s*00 bugs caught\s*0\/6 achievements/);
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
    await expect(page.locator('[data-hud-ach]')).toHaveText('1/6');
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

  test('the track is a rail no wider than the ship on the left, its numbers fully visible; the scoreboard is a compact card bottom right that opens on Enter, a click or a tap and closes on the pill, Escape or a click outside', async ({ page }) => {
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
      // (no plate behind the ship: the rail has a gap where it is)
      await expect(page.locator('.hud__ship')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
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
      // the pointer alone never opens it: it is a disclosure
      await pill.hover();
      await page.waitForTimeout(200);
      await expect(panel).toBeHidden();
      await pill.click();
      await expect(panel).toBeVisible();
      await expect(panel.getByText('Bugs caught')).toBeVisible();
      await expect(panel.locator('.score__ach li')).toHaveCount(6);
      const pb = (await panel.boundingBox())!;
      expect(pb.y + pb.height, `${path}: the card opens above the pill`).toBeLessThanOrEqual(p.y + 1);
      // the pill closes it again, with the pointer still on it
      await pill.click();
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
    // a phone or a tablet: the track is a thin line on the top edge of the bottom bar, the ship
    // riding on it, and the counter at the bar's right end
    for (const [w, h] of [
      [820, 1000],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/skills/');
      const line = (await page.locator('#hud').boundingBox())!;
      const tabbar = (await page.locator('.tabbar').boundingBox())!;
      expect(line.width).toBe(w);
      expect(line.height, 'a thin line').toBeLessThanOrEqual(4);
      expect(Math.abs(line.y + line.height - tabbar.y), "on the bar's top edge").toBeLessThanOrEqual(1);
      const ship = (await page.locator('.hud__runner').boundingBox())!;
      expect(Math.abs(ship.y + ship.height - line.y), 'the ship rides on it').toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
      await expect.poll(async () => (await page.locator('.hud__runner').boundingBox())!.x, 'and runs along it with the scroll').toBeGreaterThan(100);
      const counter = (await page.locator('.score__pill').boundingBox())!;
      expect(counter.x + counter.width).toBe(w);
      expect(counter.y).toBeGreaterThanOrEqual(tabbar.y);
      expect(counter.y + counter.height).toBeLessThanOrEqual(h);
      expect(counter.height, 'a 44px target').toBeGreaterThanOrEqual(44);
    }
  });

  test("under the device's reduced motion the games wait, hidden, and start when the Motion switch is turned on", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('#hud')).toBeHidden();
    await expect(page.locator('#dock')).toBeHidden();
    await expect(page.locator('[data-bug]:visible')).toHaveCount(0);
    await expect(page.locator('h1')).toBeVisible();
    await page.getByRole('button', { name: /^Motion/ }).click();
    await expect(page.getByRole('button', { name: /^Scoreboard/ })).toBeVisible();
    expect(await page.locator('[data-bug]:visible').count()).toBeGreaterThan(0);
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

test.describe('The tap hint', () => {
  const phone = { viewport: { width: 375, height: 780 }, hasTouch: true, isMobile: true };
  test('on a touch screen a pixel TAP sits beside the first bug on screen, once a visit, for a few seconds or until a catch; decorative', async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext(phone);
    const page = await context.newPage();
    await page.goto('/');
    const hint = page.locator('.bug__tap');
    await expect(hint).toHaveCount(1, { timeout: 5000 });
    await expect(hint).toHaveText('TAP');
    await expect(hint).toHaveAttribute('aria-hidden', 'true');
    // beside a bug that is on screen, and inside the screen
    const bug = hint.locator('xpath=../preceding-sibling::button[1]');
    await expect(bug).toHaveAttribute('data-bug', /.+/);
    const h = (await hint.boundingBox())!;
    expect(h.x).toBeGreaterThanOrEqual(0);
    expect(h.x + h.width).toBeLessThanOrEqual(375);
    // the bug's name is still its own
    await expect(bug).toHaveAccessibleName('Catch this bug');
    // gone after a few seconds, and not again this visit
    await expect(hint).toHaveCount(0, { timeout: 7000 });
    await page.reload();
    await page.waitForTimeout(2000);
    await expect(page.locator('.bug__tap')).toHaveCount(0);
    await context.close();
  });

  test('a catch takes the hint away at once', async ({ browser }) => {
    const context = await browser.newContext(phone);
    const page = await context.newPage();
    await page.goto('/');
    const hint = page.locator('.bug__tap');
    await expect(hint).toHaveCount(1, { timeout: 5000 });
    const bug = hint.locator('xpath=../preceding-sibling::button[1]');
    await bug.evaluate((b) => b.getAnimations().forEach((a) => a.pause()));
    await bug.tap();
    await expect(hint).toHaveCount(0);
    await context.close();
  });

  test('no hint with motion off, or with the games off', async ({ browser }) => {
    let page: Page;
    for (const store of [{ 'playrun.motion': 'off' }, { 'playrun.games': JSON.stringify({ on: false, bugs: [], achievements: [] }) }]) {
      const context = await browser.newContext(phone);
      page = await context.newPage();
      await page.addInitScript((s) => Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)), store);
      await page.goto('/');
      await page.waitForTimeout(2500);
      await expect(page.locator('.bug__tap')).toHaveCount(0);
      await context.close();
    }
  });
});

// What a hint or a bubble must never cover: text, tiles and controls, the header, the HUD, the
// scoreboard and the bottom bar; and it stays inside the screen and its level (which clips it).
const coversNothing = (label: Locator) =>
  label.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const out: string[] = [];
    if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) out.push('off screen');
    const level = el.closest('.level')!.getBoundingClientRect();
    if (r.left < level.left || r.top < level.top || r.right > level.right || r.bottom > level.bottom) out.push('clipped by its level');
    const sel =
      'header, #hud, #dock, .tabbar, main :is(p, li, dt, dd, h1, h2, h3, h4, label, input, textarea, button:not(.bug), a, img, figure, picture, svg:not([aria-hidden="true"]), .flag, .card, .row, .panel, .stat, .drum, .ticker, .step, .tile, form, .hero__figure)';
    for (const o of document.querySelectorAll<HTMLElement>(sel)) {
      if (o.closest('.bug') || !o.getClientRects().length || getComputedStyle(o).visibility === 'hidden') continue;
      const b = o.getBoundingClientRect();
      if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) out.push(`${o.tagName}.${String(o.className).split(' ')[0]}`);
    }
    return out;
  });

const LINES = ['Not a bug, a feature', 'Works on my machine', "Can't reproduce?", 'Severity: cosmetic', "Won't fix", 'Steps to reproduce: catch me'];

test.describe('The click hint and the speech bubble, with a mouse', () => {
  test('at 1440px with a mouse, CLICK ME sits beside the first bug on screen, in the TAP style, covering nothing, once a visit, gone after a catch', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const hint = page.locator('.bug__tap');
    await expect(hint).toHaveCount(1, { timeout: 5000 });
    await expect(hint).toHaveText('CLICK ME');
    await expect(hint).toHaveAttribute('aria-hidden', 'true');
    const bug = hint.locator('xpath=../preceding-sibling::button[1]');
    await expect(bug).toHaveAccessibleName('Catch this bug');
    expect(await coversNothing(hint)).toEqual([]);
    // the same look as TAP: the light pixel label with a navy edge, in the display face, blinking
    const look = await hint.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, font: cs.fontFamily, blink: el.getAnimations().map((a) => (a as CSSAnimation).animationName) };
    });
    expect(look.bg).toBe('rgb(229, 231, 234)');
    expect(look.font).toMatch(/Pixel Operator/);
    expect(look.blink).toEqual(['tap-blink']);
    // it walks with the bug: the same distance from it a second later
    const gap = () =>
      hint.evaluate((el) => {
        const h = el.getBoundingClientRect();
        const b = el.parentElement!.previousElementSibling!.getBoundingClientRect();
        return [Math.round(h.left - b.left), Math.round(h.top - b.top)];
      });
    const before = await gap();
    await page.waitForTimeout(1000);
    const after = await gap();
    expect(Math.abs(after[0] - before[0]) + Math.abs(after[1] - before[1])).toBeLessThanOrEqual(2);
    // a catch takes it away at once, and it does not come back this visit
    await bug.evaluate((b) => b.getAnimations().forEach((a) => a.pause()));
    await bug.click();
    await expect(hint).toHaveCount(0);
    await page.goto('/skills/');
    await page.waitForTimeout(2000);
    await expect(page.locator('.bug__tap')).toHaveCount(0);
  });

  test('at 1440px CLICK ME also goes by itself after five seconds', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('.bug__tap')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('.bug__tap')).toHaveCount(0, { timeout: 7000 });
  });

  test('at 1440px hovering a bug shows a pixel speech bubble: decorative, covering nothing, every line once before any repeats, gone when the pointer leaves or the bug is caught', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => sessionStorage.setItem('playrun.taphint', 'shown'));
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/skills/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const bugs = page.locator('.bug:not([hidden])');
    const n = await bugs.count();
    expect(n).toBeGreaterThan(1);
    const said: string[] = [];
    const say = page.locator('.bug__say');
    // every bug on the page, near an edge or not: the bubble flips to stay on screen and off the text
    for (let round = 0; said.length < LINES.length * 2 && round < 60; round++) {
      const bug = bugs.nth(round % n);
      await bug.evaluate((b) => {
        b.getAnimations().forEach((a) => a.pause());
        b.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(150);
      await page.mouse.move(2, 2);
      await bug.hover();
      // (when no side is clear the bubble does not show at all: then this bug says nothing)
      if ((await say.count()) === 0) continue;
      await expect(say).toHaveCount(1);
      await expect(say).toHaveAttribute('aria-hidden', 'true');
      // outside the button (its name stays its own), in a box beside it, not focusable
      expect(await say.evaluate((el) => !el.closest('button') && el.parentElement!.previousElementSibling === document.querySelector('.bug:hover') && el.tabIndex < 0 && !el.querySelector('*'))).toBe(true);
      await expect(bug).toHaveAccessibleName('Catch this bug');
      expect(await coversNothing(say), await say.innerText()).toEqual([]);
      said.push(await say.innerText());
      // the pointer leaves: gone
      await page.mouse.move(2, 2);
      await expect(say).toHaveCount(0);
    }
    // six lines, none twice until all six had been said; then the next six again
    expect(new Set(said.slice(0, 6))).toEqual(new Set(LINES));
    expect(new Set(said.slice(6, 12))).toEqual(new Set(LINES));
    // a catch takes it away
    const bug = bugs.first();
    await bug.evaluate((b) => b.scrollIntoView({ block: 'center' }));
    await bug.hover();
    await bug.click();
    await expect(say).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('at 1440px with motion off the bubble shows still, and there is no CLICK ME', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
    await page.goto('/skills/');
    await page.waitForTimeout(2500);
    await expect(page.locator('.bug__tap')).toHaveCount(0);
    const bug = page.locator('.bug:not([hidden])').first();
    await bug.evaluate((b) => b.scrollIntoView({ block: 'center' }));
    await bug.hover();
    const say = page.locator('.bug__say');
    await expect(say).toHaveCount(1);
    expect(await say.evaluate((el) => el.getAnimations().length)).toBe(0);
    expect(await say.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  });

  test('at 375px on a touch screen: TAP, never CLICK ME, and no speech bubble on a tap', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 780 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto('/');
    const hint = page.locator('.bug__tap');
    await expect(hint).toHaveCount(1, { timeout: 5000 });
    await expect(hint).toHaveText('TAP');
    expect(await coversNothing(hint)).toEqual([]);
    const bug = hint.locator('xpath=../preceding-sibling::button[1]');
    await bug.evaluate((b) => b.getAnimations().forEach((a) => a.pause()));
    await bug.tap();
    await page.waitForTimeout(300);
    await expect(page.locator('.bug__say')).toHaveCount(0);
    await context.close();
  });
});

test.describe('Jump markers', () => {
  for (const [width, height, hit] of [
    [1440, 900, 44],
    [768, 1000, 24],
    [375, 780, 24],
  ] as const) {
    test(`at ${width}px the level markers on the track are buttons that jump to their level, named for it, at least ${hit}px to hit, with a visible focus`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      const jumps = page.locator('.hud__levels .hud__jump');
      await expect(jumps).toHaveCount(4);
      const names = await jumps.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
      expect(names).toEqual(["Jump to Level 2: Games I've tested", 'Jump to Level 3: My game QA career in numbers', 'Jump to Level 4: This site, tested like my games', 'Jump to Level 5: After hours']);
      const column = await page.locator('.level').first().evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
      for (const b of await jumps.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()))) {
        expect(b.height).toBeGreaterThanOrEqual(hit);
        expect(b.width).toBeGreaterThanOrEqual(24);
        // on the rail: as wide as the gutter allows, never into the column
        if (width >= 1024) expect(b.right).toBeLessThanOrEqual(column);
      }
      // a jump: Level 4's top comes to the top of the screen and its heading takes focus
      await page.getByRole('button', { name: /^Jump to Level 4/ }).click();
      await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('[data-level="4"]')!.getBoundingClientRect().top)), { timeout: 3000 }).toBeLessThanOrEqual(2);
      await expect(page.locator('#proof-title')).toBeFocused();
      // the keyboard reaches them with a ring
      await jumps.first().focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(jumps.first()).toBeFocused();
      expect(await jumps.first().evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    });
  }

  test('with motion off the jump is instant; on the Portfolio the markers are years named for their post', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: /^Jump to Level 5/ }).click();
    const at = await page.evaluate(() => Math.round(document.querySelector('[data-level="5"]')!.getBoundingClientRect().top));
    expect(Math.abs(at), 'there at once').toBeLessThanOrEqual(2);
    await page.goto('/portfolio/');
    const names = await page.locator('.hud__levels .hud__jump').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    // (the rail shows two digits: the name carries them and the year)
    expect(names[0]).toBe('Jump to ’26 (2026): Aonic');
    expect(names[names.length - 1]).toBe('Jump to ’21 (2021): Universally Speaking');
  });
});

test.describe('Kept in the browser', () => {
  test('damaged games data starts afresh instead of stopping the games; old Skills ids carry over; keys from removed features are tidied away', async ({ browser }) => {
    for (const bad of ['{"achievements":"x"}', '[1,2]', 'not json', '{"on":"yes"}', '{"bugs":[1]}']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.addInitScript((v) => localStorage.setItem('playrun.games', v), bad);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/');
      await expect(page.locator('[data-hud-ach]'), bad).toHaveText('0/6');
      expect(errors, bad).toEqual([]);
      await context.close();
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('playrun.games', JSON.stringify({ on: true, bugs: ['services-1', 'home-1'], achievements: ['services', 'first-bug'] }));
      sessionStorage.setItem('playrun.ticket', 'kept');
      sessionStorage.setItem('playrun.glitch', 'done');
    });
    await page.goto('/skills/');
    await expect(page.locator('[data-hud-ach]')).toHaveText('2/6');
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await expect(page.locator('.score__ach li.is-done')).toHaveText(['Caught your first bug', 'Read every skill']);
    // the bug caught under its old id stays caught under its new one
    await expect(page.locator('[data-bug="skills-1"]')).toBeHidden();
    expect(await page.evaluate(() => [sessionStorage.getItem('playrun.ticket'), sessionStorage.getItem('playrun.glitch')])).toEqual([null, null]);
    await context.close();
  });

  test('the level track is a navigation landmark and the scoreboard a complementary one, each named', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/skills/');
    await expect(page.getByRole('navigation', { name: 'Level track' })).toBeAttached();
    await expect(page.getByRole('complementary', { name: 'Scoreboard' })).toBeVisible();
  });
});

// The ship has no box behind it, on the bottom bar (phones and tablets) or on the desktop rail: a
// thin navy outline round its own shape instead, at the size it always had. On the rail, the rail
// has a gap where the ship is, so it never shows through the ship's hollow middle.
for (const width of [375, 768, 1280, 1440, 1920]) {
  test(`at ${width}px the ship has no solid background: transparent, outlined by its own shape, the same size${width >= 1024 ? ', the rail hidden behind it' : ''}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/skills/');
    const ship = page.locator('.hud__ship');
    await expect(ship).toBeVisible();
    const look = await ship.evaluate((el) => {
      const solid = (e: Element) => {
        const cs = getComputedStyle(e);
        return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none';
      };
      const runner = el.closest('.hud__runner')!;
      const b = runner.getBoundingClientRect();
      return { solid: solid(el) || solid(runner), filter: getComputedStyle(el.querySelector('.sprite')!).filter, w: b.width, h: b.height };
    });
    expect(look.solid, 'no box behind the ship').toBe(false);
    expect(look.filter.match(/drop-shadow/g)?.length, 'an outline round its shape').toBe(4);
    const size = width >= 1024 ? 28 : 24;
    expect(look.w).toBe(size);
    expect(look.h).toBe(size);
    if (width >= 1024) {
      // down the rail's line through the ship: no pixel of the rail's colour (#838894) shows
      const r = (await page.locator('.hud__runner').boundingBox())!;
      const png = await page.screenshot({ clip: { x: r.x + r.width / 2 - 1, y: r.y + 1, width: 2, height: r.height - 2 } });
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      let rail = 0;
      for (let i = 0; i < data.length; i += info.channels) if (Math.abs(data[i] - 131) + Math.abs(data[i + 1] - 136) + Math.abs(data[i + 2] - 148) < 12) rail++;
      expect(rail, 'the rail does not show through the ship').toBe(0);
      // and it is there above and below the ship
      const above = await page.screenshot({ clip: { x: r.x + r.width / 2 - 1, y: r.y + r.height + 4, width: 2, height: 2 } });
      const px = (await sharp(above).raw().toBuffer())!;
      expect(Math.abs(px[0] - 131) + Math.abs(px[1] - 136) + Math.abs(px[2] - 148), 'the rail runs on past the ship').toBeLessThan(12);
    }
  });
}
