import { test, expect, type Page } from '@playwright/test';

/**
 * The Portfolio journey: newest first, the track shows the year of the post on screen, and each
 * company header and card lands once, hit by a short laser from the ship. Under reduced motion
 * there is no laser and everything is simply there.
 */
const noSmooth = (page: Page) => page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });

/** Scroll down the page in steps, giving each landing time to happen. */
async function walk(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(260);
  }
  await page.waitForTimeout(400);
}

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

  test('every header and card lands once, from a laser fired by the ship, one shot every third of a second', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portfolio');
    await noSmooth(page);
    const total = await page.locator('[data-land]').count();
    expect(total).toBe(27);
    // nothing below the first screen has landed yet
    expect(await page.locator('[data-land].is-landed').count()).toBeLessThan(total);
    // count the shots and the landings as they happen
    await page.evaluate(() => {
      const w = window as unknown as { __shots: number; __landings: number; __times: number[] };
      w.__shots = 0;
      w.__landings = 0;
      w.__times = [];
      new MutationObserver((muts) => {
        for (const m of muts) {
          const el = m.target as HTMLElement;
          if (el.matches('.laser') && el.classList.contains('is-on')) {
            const t = performance.now();
            if (!w.__times.length || t - w.__times[w.__times.length - 1] > 50) {
              w.__times.push(t);
              w.__shots++;
            }
          }
          if (el.hasAttribute('data-land') && el.classList.contains('is-landed') && !(el as HTMLElement).dataset.counted) {
            el.dataset.counted = '1';
            w.__landings++;
          }
        }
      }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
    });
    await walk(page);
    await expect(page.locator('[data-land].is-landed')).toHaveCount(total);
    const counts = await page.evaluate(() => {
      const w = window as unknown as { __shots: number; __landings: number; __times: number[] };
      const gaps = w.__times.slice(1).map((t, i) => t - w.__times[i]);
      return { shots: w.__shots, landings: w.__landings, gap: Math.min(...gaps) };
    });
    expect(counts.shots, 'the laser fired').toBeGreaterThan(5);
    expect(counts.gap, 'one target at a time, a readable beat apart').toBeGreaterThanOrEqual(300);
    expect(await page.locator('.laser').evaluate((el) => el.getAnimations().map((a) => a.effect?.getComputedTiming().duration)[0]), 'the beam holds for half a second').toBeGreaterThanOrEqual(500);
    const first = page.locator('[data-land]').first();
    const beam = await page.locator('.laser').evaluate((el) => ({ len: parseFloat(getComputedStyle(el).getPropertyValue('--len')), x: parseFloat(getComputedStyle(el).getPropertyValue('--x')) }));
    expect(beam.x, 'the beam starts at the bar').toBeLessThan(60);
    expect(beam.len).toBeGreaterThan(20);
    // once each: scrolling back up changes nothing
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await expect(first).toHaveClass(/is-landed/);
    await expect(page.locator('[data-land].is-landed')).toHaveCount(total);
    await expect(first).toHaveCSS('opacity', '1');
  });

  test('on a phone the laser fires up from the bottom bar', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto('/portfolio');
    await noSmooth(page);
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(900);
    const beam = await page.locator('.laser').evaluate((el) => ({ y: parseFloat(getComputedStyle(el).getPropertyValue('--y')), a: parseFloat(getComputedStyle(el).getPropertyValue('--a')) }));
    expect(beam.y, 'from the bar at the foot of the screen').toBeGreaterThan(780);
    expect(beam.a, 'pointing up').toBeLessThan(0);
    await context.close();
  });

  test('under reduced motion there is no laser and everything is simply there; without script too', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('/portfolio');
    const total = await page.locator('[data-land]').count();
    await expect(page.locator('[data-land].is-landed')).toHaveCount(total);
    await expect(page.locator('.card').first()).toHaveCSS('opacity', '1');
    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForTimeout(300);
    await expect(page.locator('.laser.is-on')).toHaveCount(0);
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
