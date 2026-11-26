import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Bug Sweep, the small game on the About page: nothing of it loads until Play; then the site's ship
 * sweeps ten bugs with the keyboard or the touch buttons; it pauses with Esc, when the tab hides and
 * when the field leaves the screen; clearing it unlocks Bug Sweep cleared on the scoreboard; three
 * hits is game over, and Try again starts afresh. The suite's build carries a handle on the game
 * (`sweepTest`, test builds only; the production build leaves it out, checked in CI).
 */
type State = { mode: string; lives: number; shipX: number; shipW: number; bugW: number; stars: { x: number; y: number }[]; left: number; shots: number; touch: boolean; scale: number; bugs: { x: number; y: number; alive: boolean; diving: boolean }[]; glitching: boolean; glitchBug: number; clock: number };
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
  test(`Bug Sweep (${width}x${height}): the section, nothing of the game loaded until Play, then the field crisp at a whole number of pixels, the right controls, on screen above the bottom bar`, { tag: ['@bugsweep'] }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const fetched: string[] = [];
    page.on('request', (r) => fetched.push(r.url()));
    await openAbout(page);
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'I love playing and making games', level: 2 }) });
    await expect(section).toBeVisible();
    await expect(section.locator('.flag')).toHaveText(/Level 5 · Play/);
    await expect(section).toContainText("Here's one I made while building this site.");
    // the text alternative and the names
    await expect(page.locator('[data-sweep-stage]')).toHaveAccessibleDescription(/Bug Sweep is a short arcade game/);
    await expect(page.getByRole('button', { name: 'Play Bug Sweep' })).toBeVisible();
    // nothing of the game before Play
    await page.waitForTimeout(500);
    expect(fetched.filter((u) => /sweep\.[\w-]+\.js/.test(u)), 'no game code before Play').toEqual([]);
    expect(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width), 'an empty canvas, at its own size').toBe(160);
    await play(page);
    expect(fetched.filter((u) => /sweep\.[\w-]+\.js/.test(u)).length, 'the code arrives with Play').toBe(1);
    // the field: a whole number of device pixels per game pixel
    const field = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height, css: c.getBoundingClientRect().width, dpr: devicePixelRatio, rendering: getComputedStyle(c).imageRendering }));
    expect(field.w % 160).toBe(0);
    expect(field.h).toBe((field.w / 160) * 128);
    expect(Math.abs(field.css * field.dpr - field.w)).toBeLessThan(0.5);
    expect(field.rendering).toBe('pixelated');
    // the ship one and a half bugs wide at most; the stars scattered over the whole field
    const st0 = await state(page);
    expect(st0.shipW / st0.bugW).toBeGreaterThanOrEqual(1.3);
    expect(st0.shipW / st0.bugW).toBeLessThanOrEqual(1.5);
    const xs = st0.stars.map((p) => p.x);
    const ys = st0.stars.map((p) => p.y);
    expect(new Set(xs.map((x) => Math.floor(x / 16))).size, 'stars across the width').toBeGreaterThanOrEqual(6);
    expect(Math.max(...ys) - Math.min(...ys), 'and down the height').toBeGreaterThan(80);
    // a keyboard: the keys line (no touch here)
    await expect(page.getByText('Arrow keys or A and D to move, Space to fire, Esc to pause.')).toBeVisible();
    await expect(page.getByText('Hold Left or Right to move, tap Fire to shoot.')).toBeHidden();
    // the heading and the line on the left like every level's; from a tablet up the game centred in the level
    expect(await page.locator('section.play .level__title').evaluate((el) => getComputedStyle(el).textAlign)).not.toBe('center');
    if (width >= 768) {
      const centre = async (sel: string) => {
        const b = (await page.locator(sel).boundingBox())!;
        return b.x + b.width / 2;
      };
      expect(Math.abs((await centre('[data-sweep-stage]')) - (await centre('section.play .level__head'))), 'the game centred in the level').toBeLessThanOrEqual(2);
    }
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
      const p = (await pad.boundingBox())!;
      expect(p.y + p.height, 'the buttons clear of the bottom bar').toBeLessThanOrEqual(bar.y);
      // (no ship rides on the bar below 64rem)
      await expect(page.locator('.hud__runner')).toBeHidden();
    } else {
      await expect(pad).toBeHidden();
    }
    // the whole field on screen
    const st = (await page.locator('[data-sweep-stage]').boundingBox())!;
    expect(st.y).toBeGreaterThanOrEqual(0);
    expect(st.y + st.height).toBeLessThanOrEqual(height);
  });
}

test('Bug Sweep with the keyboard: arrows and A and D move, Space fires, and the page never scrolls; Esc pauses and resumes', { tag: ['@bugsweep'] }, async ({ page }) => {
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

test('Bug Sweep by touch at 375x812: held Left and Right move the ship, Fire fires, and the dives are slower for thumbs', { tag: ['@bugsweep'] }, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await openAbout(page);
  await page.getByRole('button', { name: 'Play Bug Sweep' }).tap();
  await expect.poll(async () => (await state(page)).mode).toBe('play');
  expect((await state(page)).touch, 'a touch screen').toBe(true);
  // the buttons' line instead of the keys
  await expect(page.getByText('Hold Left or Right to move, tap Fire to shoot.')).toBeVisible();
  await expect(page.getByText('Arrow keys or A and D to move, Space to fire, Esc to pause.')).toBeHidden();
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

// The bot plays on the game's own clock: the clock is stopped and moved on by a quarter of a second
// for each decision, so the game is the same however busy the machine is (no real-time race with
// the rest of the suite), and with the seed fixed it is the same game every time.
test('Bug Sweep is winnable with the touch buttons at 375x812, playing at a thumb’s pace (a decision every quarter second of game time)', { tag: ['@bugsweep'] }, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await openAbout(page);
  await page.getByRole('button', { name: 'Play Bug Sweep' }).tap();
  await expect.poll(async () => (await state(page)).mode).toBe('play');
  // (a fixed seed for the dives, so the suite replays the same game every time; random games won 10 of 10)
  await hook(page, 'seed', 11);
  await hook(page, 'manual', true);
  const left = page.getByRole('button', { name: 'Left', exact: true });
  const right = page.getByRole('button', { name: 'Right', exact: true });
  const fire = page.getByRole('button', { name: 'Fire', exact: true });
  // a press held for a quarter of a second of game time: down, the clock moved on, up
  const hold = async (b: Locator) => {
    await b.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 });
    await hook(page, 'advance', 250);
    await b.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 0 });
  };
  let s = await state(page);
  let turns = 0;
  // A player with thumbs: every 250 ms, look, then press one thing for that long. Get out from
  // under a bug diving close; otherwise line up under the nearest bug in formation and fire.
  // (two minutes of game time at most)
  while (s.mode === 'play' && turns < 480) {
    const ship = s.shipX + s.shipW / 2;
    const danger = s.bugs.filter((b) => b.alive && b.diving && b.y > 40 && b.y < 118 && Math.abs(b.x + 5 - ship) < 30).sort((a, b) => b.y - a.y)[0];
    let move: Locator | null = null;
    if (danger) {
      const away = danger.x + 5 > ship ? left : right;
      // (against a wall, the only way out is past it)
      move = (away === left && s.shipX < 4) || (away === right && s.shipX > 156 - s.shipW) ? (away === left ? right : left) : away;
    } else {
      const target = s.bugs.filter((b) => b.alive && !b.diving).sort((a, b) => Math.abs(a.x + 5 - ship) - Math.abs(b.x + 5 - ship))[0];
      if (target && Math.abs(target.x + 5 - ship) > 4) move = target.x + 5 > ship ? right : left;
    }
    await hold(move ?? fire);
    turns++;
    s = await state(page);
  }
  expect(s.mode, `cleared in ${turns / 4} s of game time with ${s.lives} lives left`).toBe('won');
  await context.close();
});

test('clearing all ten bugs: Level cleared, the achievement Bug Sweep cleared with the toast, the counter at 1/7; Play again starts afresh; Reset clears the achievement', { tag: ['@bugsweep'] }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openAbout(page);
  await expect(page.locator('[data-hud-ach]')).toHaveText('0/7');
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
  await expect(page.locator('[data-hud-ach]')).toHaveText('1/7');
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
  await expect(page.locator('[data-hud-ach]')).toHaveText('0/7');
  await expect(page.locator('.score__ach li.is-done')).toHaveCount(0);
});

test('three hits is game over, with Try again; the field pauses when the tab is hidden and when it leaves the screen', { tag: ['@bugsweep'] }, async ({ page }) => {
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
  // partly scrolled away (a phone held sideways): it carries on
  await page.locator('[data-sweep-stage]').evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY + el.getBoundingClientRect().height * 0.8));
  await page.waitForTimeout(300);
  expect((await state(page)).mode, 'a fifth still on screen: still playing').toBe('play');
  // wholly scrolled away (back up the page: below it there is too little left to scroll it off)
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => (await state(page)).mode).toBe('paused');
  await expect(page.locator('[data-sweep-text]')).toHaveText('Paused while you were away.');
});

test('Bug Sweep plays whatever the motion setting: under the device’s reduced motion it runs, and a clear is still kept', { tag: ['@bugsweep'] }, async ({ browser }) => {
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

// A vertical swipe that starts on the field (or on the poster before Play) scrolls the page, before
// and during a game: only the Left, Fire and Right buttons keep the touch, held to move or fire,
// and the page never scrolls under a held button. Real touches (Chromium's own input), so the
// browser's touch-action decides, not a script.
test('at 375x812 a swipe on the field scrolls the page before Play and during a game, and a held button moves the ship without scrolling', { tag: ['@bugsweep', '@viewports'] }, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await openAbout(page);
  const cdp = await context.newCDPSession(page);
  const swipe = async (x: number, y: number, dy: number, holdMs = 0) => {
    const steps = 8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] });
      await page.waitForTimeout(16);
    }
    if (holdMs) await page.waitForTimeout(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // (a swipe flings on: wait for the page to come to rest)
    let rest = -1;
    for (let k = 0; k < 40; k++) {
      await page.waitForTimeout(100);
      const now = await page.evaluate(() => window.scrollY);
      if (now === rest) break;
      rest = now;
    }
  };
  const pageY = () => page.evaluate(() => window.scrollY);
  const centre = async (sel: string) => {
    const b = (await page.locator(sel).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  // before Play: a swipe up on the poster scrolls the page down
  await page.locator('.sweep__stage').scrollIntoViewIfNeeded();
  let at = await centre('.sweep__stage');
  let before = await pageY();
  await swipe(at.x, at.y, -160);
  expect(await pageY(), 'the page scrolls from the poster').toBeGreaterThan(before + 40);
  // during a game: the same on the field
  const playButton = page.getByRole('button', { name: 'Play Bug Sweep' });
  await playButton.scrollIntoViewIfNeeded();
  // (starting the game is not what this test is about: a plain press, the swipes stay real touches)
  await playButton.dispatchEvent('click');
  await expect.poll(async () => (await state(page)).mode).toBe('play');
  await hook(page, 'calm', true);
  at = await centre('.sweep__stage canvas');
  before = await pageY();
  await swipe(at.x, at.y, -120);
  expect(await pageY(), 'the page scrolls from the field during a game').toBeGreaterThan(before + 30);
  // (the field back on screen, the game playing again)
  await page.locator('.sweep__stage').scrollIntoViewIfNeeded();
  if ((await state(page)).mode === 'paused') await page.getByRole('button', { name: /Resume/ }).first().tap();
  await expect.poll(async () => (await state(page)).mode).toBe('play');
  // a held Right: the ship moves and the page stays put, even with the finger dragging upwards
  const right = await centre('[data-sweep-right]');
  const x0 = (await state(page)).shipX;
  before = await pageY();
  await swipe(right.x, right.y, -60, 400);
  expect((await state(page)).shipX, 'the ship moved right').toBeGreaterThan(x0 + 10);
  expect(Math.abs((await pageY()) - before), 'no scroll under a held button').toBeLessThanOrEqual(1);
  await context.close();
});

// KNOWN ISSUE QA-002, on purpose: the third bug in the top row glitches for 0.3 s each time it lands
// back in formation after a dive. It is a live example for the QA Lab's bug reports, not a failure:
// these checks make sure it stays purely visual (its place, its hitbox and the score unchanged).
test.describe('Bug Sweep, known issue QA-002 (intentional)', () => {
  test('the glitch is drawing only: the bug keeps its place, is still hit where it is, and the score counts as usual', { tag: ['@bugsweep'] }, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAbout(page);
    await play(page);
    await hook(page, 'seed', 7);
    await hook(page, 'calm', true);
    await hook(page, 'manual', true);
    await hook(page, 'advance', 100);
    const s0 = await state(page);
    expect(s0.glitchBug, 'the third bug in the top row').toBe(2);
    expect(s0.glitching).toBe(false);
    const frame = () => hook(page, 'frame') as Promise<string>;
    const plain = await frame();
    // on demand: the same clock, only the picture differs
    await hook(page, 'glitch');
    const s1 = await state(page);
    expect(s1.glitching).toBe(true);
    expect(s1.clock).toBe(s0.clock);
    expect(s1.bugs).toEqual(s0.bugs);
    expect(s1.left).toBe(s0.left);
    expect(s1.lives).toBe(s0.lives);
    expect(await frame(), 'the sprite is drawn in slices').not.toBe(plain);
    // a shot at it, kept glitching all the way: the bug below it goes first, then it is hit where
    // it stands, and each counts as one
    await hook(page, 'aimAt', 2);
    const shootUntil = async (i: number) => {
      for (let k = 0; k < 60 && (await state(page)).bugs[i].alive; k++) {
        await hook(page, 'glitch');
        await hook(page, 'shoot');
        await hook(page, 'advance', 50);
      }
    };
    await shootUntil(7);
    expect((await state(page)).left).toBe(s0.left - 1);
    await shootUntil(2);
    const s2 = await state(page);
    expect(s2.bugs[2].alive, 'hit mid-glitch, where it stands').toBe(false);
    expect(s2.left).toBe(s0.left - 2);
    // the others untouched
    for (const i of [0, 1, 3, 4, 5, 6, 8, 9]) expect(s2.bugs[i].alive).toBe(true);
  });

  test('it happens to the same bug every time it lands back in formation after a dive, and to no other', { tag: ['@bugsweep'] }, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAbout(page);
    await play(page);
    await hook(page, 'seed', 3);
    await hook(page, 'calm', true);
    await hook(page, 'manual', true);
    const landed = async (i: number) => {
      await hook(page, 'dive', i);
      expect((await state(page)).bugs[i].diving).toBe(true);
      // (the ship moved away from where the dive is aimed, so it misses and comes back round)
      await hook(page, 'aimAt', i < 3 ? 4 : 0);
      for (let k = 0; k < 400 && (await state(page)).bugs[i].diving; k++) await hook(page, 'advance', 50);
      return state(page);
    };
    for (let round = 0; round < 2; round++) {
      const s = await landed(2);
      expect(s.bugs[2].diving, 'back in formation').toBe(false);
      expect(s.glitching, `round ${round + 1}: it glitches as it lands`).toBe(true);
      await hook(page, 'advance', 400);
      expect((await state(page)).glitching, 'over after 0.3 s').toBe(false);
    }
    const other = await landed(0);
    expect(other.bugs[0].diving).toBe(false);
    expect(other.glitching, 'no other bug glitches').toBe(false);
  });
});

