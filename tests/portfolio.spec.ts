import { test, expect, type Page } from '@playwright/test';

/**
 * The Portfolio journey: newest first, the track shows the year of the post on screen, and the
 * scan: a bonus on a game card that is already on screen. Nothing waits for the laser; every
 * header, block and card shows with the normal entrance as it enters the screen. Once the scroll
 * settles, the card wholly on screen nearest the middle gets one shot (a beam from the ship on a
 * desktop, the sweep alone on a phone), one at a time, each card at most once. With the games
 * off, under reduced motion and without script there is no laser and everything is simply there.
 */
const noSmooth = (page: Page) => page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });

test.describe('The Portfolio journey', () => {
  test('the track shows the year as the page scrolls, 2026 down to 2021, with a marker where each year begins', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portfolio');
    await noSmooth(page);
    const year = page.locator('[data-hud-year]');
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await expect(year).toBeVisible();
    await expect(year).toHaveText('2026');
    await expect(page.getByRole('button', { name: /^Scoreboard/ })).toHaveAccessibleName(/year 2026/);
    await expect(page.locator('.hud__levels li')).toHaveText(['26', '25', '22', '21']);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(year).toHaveText('2021');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(year).toHaveText('2026');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.hud__levels li').first()).toHaveText('2026');
  });

  test('nothing waits for the laser: every header and card shows as it enters the screen, and a fast scroll to the foot shows them all at once', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portfolio');
    await noSmooth(page);
    const entrances = page.locator('.group__head[data-enter], .card[data-enter]');
    expect(await entrances.count()).toBe(27);
    await expect(page.locator('[data-land], [data-landing], .is-landed')).toHaveCount(0);
    // a card entering at the foot of the screen shows straight away, with no shot involved
    const third = page.locator('.card').nth(5);
    const y = await third.evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight * 0.85), y);
    await expect(third).toHaveClass(/is-in/, { timeout: 1500 });
    await expect(third).toHaveCSS('opacity', '1', { timeout: 2000 });
    await expect(third).not.toHaveClass(/is-scanned/);
    // straight to the foot: whatever is on screen is shown within a second, scanned or not, and
    // on the way back up every screen is shown as soon as it is reached
    // (a card still peeking into the bottom strip, below the entrance line, is not counted yet)
    const onScreen = () => page.locator('.card').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().bottom > 0 && el.getBoundingClientRect().top < innerHeight * 0.9).map((el) => el.classList.contains('is-in') && parseFloat(getComputedStyle(el).opacity) > 0.5));
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(1200);
    let seen = await onScreen();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean), 'the last screen is shown at once').toBe(true);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let s = height; s > 0; s -= 800) {
      await page.evaluate((s) => window.scrollTo(0, s), s);
      await page.waitForTimeout(1200);
      seen = await onScreen();
      expect(seen.every(Boolean), `at ${s}: every card on screen is shown`).toBe(true);
    }
    await expect(entrances.locator(':scope.is-in')).toHaveCount(27, { timeout: 1500 });
  });

  test('a settled card near the middle gets one shot: a thick glowing beam from the ship to its logo, a flash at the nose, a sweep and a tick; one shot at a time, only cards, each once', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portfolio');
    await noSmooth(page);
    await page.mouse.move(640, 300);
    await page.evaluate(() => {
      const w = window as unknown as { __shots: number[] };
      w.__shots = [];
      new MutationObserver((muts) => {
        for (const m of muts) {
          const el = m.target as HTMLElement;
          if (el.matches('.laser') && el.classList.contains('is-on')) {
            const t = performance.now();
            if (!w.__shots.length || t - w.__shots[w.__shots.length - 1] > 50) w.__shots.push(t);
          }
        }
      }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
    });
    // bring the first card to the middle and let the scroll settle
    const first = page.locator('.card').first();
    const y = await first.evaluate((el) => el.getBoundingClientRect().top + el.offsetHeight / 2 + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
    await expect(first).toHaveClass(/is-scanned/, { timeout: 2500 });
    await expect(page.locator('.laser')).toHaveClass(/is-on/);
    await expect(page.locator('.flash')).toHaveClass(/is-on/);
    const beam = await page.locator('.laser').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { h: parseFloat(cs.height), x: parseFloat(cs.getPropertyValue('--x')), len: parseFloat(cs.getPropertyValue('--len')), a: parseFloat(cs.getPropertyValue('--a')), glow: cs.boxShadow, duration: el.getAnimations().map((a) => a.effect?.getComputedTiming().duration)[0] };
    });
    expect(beam.h, 'about three times the old 5px').toBeGreaterThanOrEqual(12);
    expect(beam.x, 'from the ship on the left').toBeLessThan(60);
    expect(beam.len).toBeGreaterThan(100);
    expect(beam.glow, 'a glow').toContain('px');
    expect(Number(beam.duration)).toBeLessThanOrEqual(500);
    // the beam ends at the card's logo, not at its edge
    const aim = await page.evaluate(() => {
      const laser = document.querySelector<HTMLElement>('.laser')!;
      const cs = getComputedStyle(laser);
      const x = parseFloat(cs.getPropertyValue('--x'));
      const y = parseFloat(cs.getPropertyValue('--y'));
      const len = parseFloat(cs.getPropertyValue('--len'));
      const a = parseFloat(cs.getPropertyValue('--a'));
      const end = { x: x + Math.cos(a) * len, y: y + Math.sin(a) * len };
      const logo = document.querySelector('.card.is-scanned .card__logo')!.getBoundingClientRect();
      return { end, logo: { l: logo.left, r: logo.right, t: logo.top, b: logo.bottom } };
    });
    expect(aim.end.x).toBeGreaterThan(aim.logo.l - 2);
    expect(aim.end.x).toBeLessThan(aim.logo.r + 2);
    expect(aim.end.y).toBeGreaterThan(aim.logo.t - 2);
    expect(aim.end.y).toBeLessThan(aim.logo.b + 2);
    // the sweep and the tick on the card, no layout shift
    const before = await first.locator('.card__title').evaluate((el) => el.getBoundingClientRect().top);
    expect(await first.evaluate((el) => getComputedStyle(el, '::before').animationName)).toBe('scan-sweep');
    expect(await first.locator('.card__tick').evaluate((el) => getComputedStyle(el).animationName)).toContain('tick-pop');
    await page.waitForTimeout(600);
    expect(Math.abs((await first.locator('.card__title').evaluate((el) => el.getBoundingClientRect().top)) - before), 'no layout shift').toBeLessThan(0.5);
    expect(await first.evaluate((el) => el.scrollHeight === el.clientHeight || getComputedStyle(el).overflow === 'hidden')).toBe(true);
    // only cards are ever scanned; headers and blocks never
    expect(await page.locator('.is-scanned:not(.card)').count()).toBe(0);
    // one at a time: a walk down the page, pausing on each screen, never fires two shots within a shot's length
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let s = 0; s < height; s += 700) {
      await page.evaluate((s) => window.scrollTo(0, s), s);
      await page.waitForTimeout(1200);
    }
    const shots = await page.evaluate(() => (window as unknown as { __shots: number[] }).__shots);
    expect(shots.length).toBeGreaterThan(3);
    for (let i = 1; i < shots.length; i++) expect(shots[i] - shots[i - 1], 'a shot at a time').toBeGreaterThanOrEqual(850);
    // each card at most once: coming back to a screen whose cards are all scanned fires nothing new
    const back = async () => {
      await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
      await page.waitForTimeout(1300);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(1300);
      await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
      await page.waitForTimeout(1300);
    };
    await back();
    const scannedOnce = await page.locator('.card.is-scanned').count();
    const shotsOnce = await page.evaluate(() => (window as unknown as { __shots: number[] }).__shots.length);
    await back();
    expect(await page.locator('.card.is-scanned').count(), 'no card scanned twice').toBe(scannedOnce);
    expect(await page.evaluate(() => (window as unknown as { __shots: number[] }).__shots.length), 'no second shot at a scanned card').toBe(shotsOnce);
    expect(scannedOnce).toBeLessThanOrEqual(await page.locator('.card').count());
  });

  test('with the games off there is no laser and no scan, and everything still shows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portfolio');
    await noSmooth(page);
    await page.mouse.move(640, 300);
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await page.getByRole('button', { name: /Games on/ }).click();
    await page.mouse.click(640, 300);
    const first = page.locator('.card').first();
    const y = await first.evaluate((el) => el.getBoundingClientRect().top + el.offsetHeight / 2 + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
    await page.waitForTimeout(1300);
    await expect(page.locator('.laser.is-on')).toHaveCount(0);
    await expect(page.locator('.is-scanned')).toHaveCount(0);
    await expect(first).toHaveCSS('opacity', '1');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await expect(page.locator('.card').last()).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await page.getByRole('button', { name: /Games off/ }).click();
  });

  test('on a phone the sweep plays without a beam', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto('/portfolio');
    await noSmooth(page);
    const first = page.locator('.card').first();
    const y = await first.evaluate((el) => el.getBoundingClientRect().top + el.offsetHeight / 2 + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
    await expect(first).toHaveClass(/is-scanned/, { timeout: 2500 });
    await expect(page.locator('.laser.is-on')).toHaveCount(0);
    await expect(page.locator('.flash.is-on')).toHaveCount(0);
    await context.close();
  });

  test('under reduced motion there is no laser and no sweep and everything is simply there; without script too', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('/portfolio');
    await expect(page.locator('.card').first()).toHaveCSS('opacity', '1');
    const first = page.locator('.card').first();
    const y = await first.evaluate((el) => el.getBoundingClientRect().top + el.offsetHeight / 2 + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
    await page.waitForTimeout(1300);
    await expect(page.locator('.laser.is-on')).toHaveCount(0);
    await expect(page.locator('.is-scanned')).toHaveCount(0);
    expect(await first.evaluate((el) => getComputedStyle(el, '::before').animationName)).toBe('none');
    await expect(page.locator('.card').last()).toHaveCSS('opacity', '1');
    await context.close();

    const plain = await browser.newContext({ javaScriptEnabled: false });
    const page2 = await plain.newPage();
    await page2.goto('/portfolio');
    await expect(page2.locator('.card').last()).toBeVisible();
    await expect(page2.locator('.card').last()).toHaveCSS('opacity', '1');
    await plain.close();
  });
});
