import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Bug Sweep, the small game on the About page: nothing of it loads until Play; then the site's ship
 * sweeps ten bugs with the keyboard or the touch buttons; it pauses with Esc, when the tab hides and
 * when the field leaves the screen; clearing it unlocks Bug Sweep cleared on the scoreboard; three
 * hits is game over, and Try again starts afresh. The suite's build carries a handle on the game
 * (`sweepTest`, test builds only; the production build leaves it out, checked in CI).
 */
type State = { mode: string; lives: number; shipX: number; left: number; shots: number; touch: boolean; scale: number; bugs: { x: number; y: number; alive: boolean; diving: boolean }[] };
// (before the game's code has arrived there is no handle yet: the mode reads 'none')
const state = (page: Page) => page.locator('[data-sweep]').evaluate((el) => (el as unknown as { sweepTest?: { state: () => unknown } }).sweepTest?.state() ?? { mode: 'none' }) as Promise<State>;
const hook = (page: Page, name: string, arg?: unknown) =>
  page.locator('[data-sweep]').evaluate((el, [n, a]) => (el as unknown as { sweepTest: Record<string, (x?: unknown) => unknown> }).sweepTest[n as string](a), [name, arg] as const);
const SIZES = [
  [1440, 900],
  [768, 1024],
  [375, 812],
] as const;

const openAbout = async (page: Page) => {
  await page.goto('/about/');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-sweep]').scrollIntoViewIfNeeded();
};
const play = async (page: Page) => {
  await page.getByRole('button', { name: 'Play Bug Sweep' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('play');
};

for (const [width, height] of SIZES) {
  test(`Bug Sweep (${width}x${height}): the section, nothing of the game loaded until Play, then the field crisp at a whole number of pixels, the right controls, on screen above the bottom bar`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const fetched: string[] = [];
    page.on('request', (r) => fetched.push(r.url()));
    await openAbout(page);
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'I love playing and making games', level: 2 }) });
    await expect(section).toBeVisible();
    await expect(section.locator('.flag')).toHaveText(/Level 2 · Play/);
    await expect(section).toContainText("Here's one I made while building this site.");
    // the text alternative and the names
    await expect(page.locator('[data-sweep-stage]')).toHaveAccessibleDescription(/Bug Sweep is a short arcade game/);
    await expect(page.getByRole('button', { name: 'Play Bug Sweep' })).toBeVisible();
    // nothing of the game before Play
    await page.waitForTimeout(500);
    expect(fetched.filter((u) => /sweep\.[\w-]+\.js/.test(u)), 'no game code before Play').toEqual([]);
    expect(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width), 'an empty canvas').toBe(300);
    await play(page);
    expect(fetched.filter((u) => /sweep\.[\w-]+\.js/.test(u)).length, 'the code arrives with Play').toBe(1);
    // the field: a whole number of device pixels per game pixel
    const field = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height, css: c.getBoundingClientRect().width, dpr: devicePixelRatio, rendering: getComputedStyle(c).imageRendering }));
    expect(field.w % 160).toBe(0);
    expect(field.h).toBe((field.w / 160) * 128);
    expect(Math.abs(field.css * field.dpr - field.w)).toBeLessThan(0.5);
    expect(field.rendering).toBe('pixelated');
    // the focus on the field, the bar reads three lives and ten bugs
    await expect(page.locator('[data-sweep-stage]')).toBeFocused();
    await expect(page.locator('[data-sweep-lives]')).toHaveText('3');
    await expect(page.locator('[data-sweep-bugs]')).toHaveText('10');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    // touch buttons on tablets and phones, at least 44px, above the bottom bar; none on a desktop
    const pad = page.locator('[data-sweep-pad]');
    if (width < 1024) {
      await expect(pad).toBeVisible();
      for (const name of ['Left', 'Fire', 'Right']) {
        const b = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
        expect(b.height, `${name} at least 44px`).toBeGreaterThanOrEqual(44);
        expect(b.width).toBeGreaterThanOrEqual(44);
      }
      const bar = (await page.locator('.tabbar').boundingBox())!;
      const ship = (await page.locator('.hud__runner').boundingBox())!;
      const p = (await pad.boundingBox())!;
      expect(p.y + p.height, 'the buttons clear of the bottom bar').toBeLessThanOrEqual(bar.y);
      expect(p.y + p.height, 'and of the ship riding on it').toBeLessThanOrEqual(ship.y);
    } else {
      await expect(pad).toBeHidden();
    }
    // the whole field on screen
    const st = (await page.locator('[data-sweep-stage]').boundingBox())!;
    expect(st.y).toBeGreaterThanOrEqual(0);
    expect(st.y + st.height).toBeLessThanOrEqual(height);
  });
}

test('Bug Sweep with the keyboard: arrows and A and D move, Space fires, and the page never scrolls; Esc pauses and resumes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAbout(page);
  await play(page);
  await hook(page, 'calm', true);
  const y0 = await page.evaluate(() => scrollY);
  const x0 = (await state(page)).shipX;
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  const x1 = (await state(page)).shipX;
  expect(x1, 'right').toBeGreaterThan(x0 + 10);
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyA');
  expect((await state(page)).shipX, 'A, left').toBeLessThan(x1 - 10);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(200);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(200);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Space');
  expect((await state(page)).shots, 'Space fires').toBeGreaterThan(0);
  for (const key of ['ArrowDown', 'ArrowUp', 'Space', 'ArrowDown']) await page.keyboard.press(key);
  expect(await page.evaluate(() => scrollY), 'the page stays put').toBe(y0);
  // Esc pauses, Esc again carries on
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  await expect(page.locator('[data-sweep-title]')).toHaveText('Paused');
  await expect(page.getByRole('button', { name: 'Resume' }).first()).toBeVisible();
  await page.waitForTimeout(300);
  const frozen = await state(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  expect((await state(page)).shipX, 'nothing moves while paused').toBe(frozen.shipX);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).mode).toBe('play');
  await expect(page.locator('[data-sweep-overlay]')).toBeHidden();
  // the Pause button too
  await page.locator('[data-sweep-pause]').click();
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  await page.locator('[data-sweep-action]').click();
  await expect.poll(async () => (await state(page)).mode).toBe('play');
});

const press = async (b: Locator, ms: number) => {
  await b.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 });
  await b.page().waitForTimeout(ms);
  await b.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 0 });
};

test('Bug Sweep by touch at 375x812: held Left and Right move the ship, Fire fires, and the dives are slower for thumbs', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await openAbout(page);
  await page.getByRole('button', { name: 'Play Bug Sweep' }).tap();
  await expect.poll(async () => (await state(page)).mode).toBe('play');
  expect((await state(page)).touch, 'a touch screen').toBe(true);
  await hook(page, 'calm', true);
  const x0 = (await state(page)).shipX;
  await press(page.getByRole('button', { name: 'Right', exact: true }), 400);
  const x1 = (await state(page)).shipX;
  expect(x1).toBeGreaterThan(x0 + 10);
  await press(page.getByRole('button', { name: 'Left', exact: true }), 400);
  expect((await state(page)).shipX).toBeLessThan(x1 - 10);
  await page.getByRole('button', { name: 'Fire', exact: true }).dispatchEvent('pointerdown', { pointerId: 8, pointerType: 'touch', isPrimary: true, buttons: 1 });
  expect((await state(page)).shots).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Fire', exact: true }).dispatchEvent('pointerup', { pointerId: 8, pointerType: 'touch', isPrimary: true });
  // crisp at a scale of three: each game pixel a whole number of device pixels
  expect((await state(page)).scale).toBeGreaterThanOrEqual(3);
  await context.close();
});

test('Bug Sweep is winnable with the touch buttons at 375x812, playing at a thumb’s pace (a decision every quarter second)', async ({ browser }) => {
  test.setTimeout(150_000);
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await openAbout(page);
  await page.getByRole('button', { name: 'Play Bug Sweep' }).tap();
  await expect.poll(async () => (await state(page)).mode).toBe('play');
  // (a fixed seed for the dives, so the suite replays the same game every time; random games won 10 of 10)
  await hook(page, 'seed', 11);
  const left = page.getByRole('button', { name: 'Left', exact: true });
  const right = page.getByRole('button', { name: 'Right', exact: true });
  const fire = page.getByRole('button', { name: 'Fire', exact: true });
  const t0 = Date.now();
  let s = await state(page);
  // A player with thumbs: every 250 ms, look, then press one thing for that long. Get out from
  // under a bug diving close; otherwise line up under the nearest bug in formation and fire.
  while (s.mode === 'play' && Date.now() - t0 < 120_000) {
    const ship = s.shipX + 12;
    const danger = s.bugs.filter((b) => b.alive && b.diving && b.y > 40 && b.y < 118 && Math.abs(b.x + 5 - ship) < 30).sort((a, b) => b.y - a.y)[0];
    let move: Locator | null = null;
    if (danger) {
      const away = danger.x + 5 > ship ? left : right;
      // (against a wall, the only way out is past it)
      move = (away === left && s.shipX < 4) || (away === right && s.shipX > 132) ? (away === left ? right : left) : away;
    } else {
      const target = s.bugs.filter((b) => b.alive && !b.diving).sort((a, b) => Math.abs(a.x + 5 - ship) - Math.abs(b.x + 5 - ship))[0];
      if (target && Math.abs(target.x + 5 - ship) > 4) move = target.x + 5 > ship ? right : left;
    }
    await press(move ?? fire, 250);
    s = await state(page);
  }
  expect(s.mode, `cleared in ${Math.round((Date.now() - t0) / 1000)} s with ${s.lives} lives left`).toBe('won');
  await context.close();
});

test('clearing all ten bugs: Level cleared, the achievement Bug Sweep cleared with the toast, the counter at 1/6; Play again starts afresh; Reset clears the achievement', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAbout(page);
  await expect(page.locator('[data-hud-ach]')).toHaveText('0/6');
  await play(page);
  await hook(page, 'calm', true);
  // (the handle sweeps nine; the last falls to a real shot)
  await hook(page, 'clear');
  await expect(page.locator('[data-sweep-bugs]')).toHaveText('10');
  await hook(page, 'aim');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).mode, { timeout: 3000 }).toBe('won');
  await expect(page.locator('[data-sweep-title]')).toHaveText('Level cleared');
  await expect(page.locator('[data-sweep-bugs]')).toHaveText('0');
  const toast = page.locator('[data-toast]');
  await expect(toast).toHaveClass(/is-in/, { timeout: 3000 });
  await expect(toast).toContainText('Bug Sweep cleared');
  await expect(page.locator('[data-hud-ach]')).toHaveText('1/6');
  await expect(page.locator('[data-sweep-live]')).toHaveText(/Level cleared/);
  await expect(page.getByRole('button', { name: 'Play again' })).toBeFocused();
  // Play again
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('play');
  await expect(page.locator('[data-sweep-bugs]')).toHaveText('10');
  // Reset on the scoreboard clears it
  await page.getByRole('button', { name: /^Scoreboard/ }).click();
  await expect(page.locator('.score__ach li.is-done')).toHaveText(['Bug Sweep cleared']);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('[data-hud-ach]')).toHaveText('0/6');
  await expect(page.locator('.score__ach li.is-done')).toHaveCount(0);
});

test('three hits is game over, with Try again; the field pauses when the tab is hidden and when it leaves the screen', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openAbout(page);
  await play(page);
  await hook(page, 'calm', true);
  await hook(page, 'hit');
  await expect(page.locator('[data-sweep-lives]')).toHaveText('2');
  await expect(page.locator('[data-sweep-live]')).toHaveText('Hit. 2 lives left.');
  await hook(page, 'hit');
  await hook(page, 'hit');
  await expect.poll(async () => (await state(page)).mode).toBe('over');
  await expect(page.locator('[data-sweep-title]')).toHaveText('Game over');
  await expect(page.locator('[data-sweep-lives]')).toHaveText('0');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(async () => (await state(page)).mode).toBe('play');
  await expect(page.locator('[data-sweep-lives]')).toHaveText('3');
  await expect(page.locator('[data-sweep-bugs]')).toHaveText('10');
  // the tab hidden
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { value: false, configurable: true }));
  await page.locator('[data-sweep-action]').click();
  await expect.poll(async () => (await state(page)).mode).toBe('play');
  // scrolled away
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  await expect(page.locator('[data-sweep-text]')).toHaveText('Paused while you were away.');
});

test('Bug Sweep plays whatever the motion setting: under the device’s reduced motion it runs, and a clear is still kept', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await openAbout(page);
  await play(page);
  await hook(page, 'calm', true);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  expect((await state(page)).shipX).toBeGreaterThan(70);
  await hook(page, 'clear');
  await hook(page, 'aim');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).mode, { timeout: 3000 }).toBe('won');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('playrun.games') ?? '{}').achievements)).toContain('bugsweep');
  await context.close();
});
