import { test, expect, type Page } from '@playwright/test';

/**
 * The Motion switch in the header: on by default (it follows the device's reduced-motion setting
 * until the visitor chooses), remembered per visitor, and when off the site behaves as under
 * reduced motion: no join drift, no headline break, a still drum, no scan or bolt, no walking bugs.
 */
const noSmooth = (page: Page) => page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
const drift = (page: Page) =>
  page.evaluate(() => document.getAnimations().filter((a) => a.timeline && a.timeline.constructor.name === 'ViewTimeline').length);

for (const [width, height] of [
  [1440, 900],
  [375, 780],
] as const) {
  test(`the Motion switch (${width}px): a real toggle in the header beside the logo, on by default, off makes the site still, and the choice is remembered`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await noSmooth(page);
    const button = page.getByRole('button', { name: 'Motion' });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    const b = (await button.boundingBox())!;
    const logo = (await page.locator('.header__brand').boundingBox())!;
    expect(b.height, 'a 44px target').toBeGreaterThanOrEqual(44);
    expect(b.x, 'beside the logo').toBeGreaterThan(logo.x + logo.width - 1);
    expect(Math.abs(b.y + b.height / 2 - (logo.y + logo.height / 2)), 'on the logo’s line').toBeLessThan(12);
    expect(b.x + b.width).toBeLessThanOrEqual(width);
    // a visible focus
    await page.locator('.header__brand').focus();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    // on: the joins drift and the bugs walk
    await page.locator('.join').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    if (width >= 768) expect(await drift(page), 'the joins drift').toBeGreaterThan(0);
    // off
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('html')).toHaveClass(/motion-off/);
    expect(await page.evaluate(() => localStorage.getItem('playrun.motion'))).toBe('off');
    // still: nothing animates or drifts, the hero is not pinned, the bugs stand still
    await page.locator('.join').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    expect(await drift(page), 'no join drift').toBe(0);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a as CSSAnimation).animationName).length), 'no CSS animation running').toBe(0);
    expect(await page.locator('.hero').evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky');
    // no glitch, no card
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const wallTop = await page.locator('.wall').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(wallTop - height + 300));
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-glitch]')).toBeHidden();
    await expect(page.locator('h1')).toHaveCSS('opacity', '1');
    await expect(page.locator('[data-glitch-card]')).toBeHidden();
    // a still drum
    await page.locator('[data-drum]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const i0 = await page.locator('.drum__list').evaluate((el) => el.style.getPropertyValue('--i'));
    await page.waitForTimeout(4200);
    expect(await page.locator('.drum__list').evaluate((el) => el.style.getPropertyValue('--i')), 'the drum stays still').toBe(i0);
    // remembered: still off after a reload
    await page.reload();
    await expect(page.getByRole('button', { name: 'Motion' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('html')).toHaveClass(/motion-off/);
    // and on again
    await page.getByRole('button', { name: 'Motion' }).click();
    await expect(page.getByRole('button', { name: 'Motion' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).not.toHaveClass(/motion-off/);
    expect(await page.evaluate(() => localStorage.getItem('playrun.motion'))).toBe('on');
  });
}

test('with motion off there is no scan or bolt on the Portfolio', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/portfolio/');
  await noSmooth(page);
  await page.locator('.card').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(2500);
  await expect(page.locator('.card.is-scanned')).toHaveCount(0);
  expect(await page.locator('.bolt__px').evaluateAll((els) => els.filter((el) => el.getAnimations().length).length)).toBe(0);
});

// The device asks for reduced motion: still until the visitor chooses, and their choice wins.
// the state as it shows: On, Off, or Off (device setting)
const label = (page: Page) =>
  page.locator('.motion').evaluate((el) => [el.querySelector('.motion__state'), el.querySelector('.motion__why')].filter((e) => e!.getClientRects().length).map((e) => (e as HTMLElement).innerText).join(' ').replace(/\s+/g, ' ').trim());
const running = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running' && (a as CSSAnimation).animationName)
      .map((a) => (a as CSSAnimation).animationName),
  );

for (const [width, height] of [
  [1440, 900],
  [375, 780],
] as const) {
  test(`under the device's reduced motion (${width}px): still by default and the switch says why; turned on, everything moves (the curtain, the logos, the drum, the bugs, the joins, the glitch); the choice survives a reload, and off again is still`, async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width, height } });
    const page = await context.newPage();
    await page.goto('/');
    await noSmooth(page);
    const button = page.getByRole('button', { name: /^Motion/ });
    // no choice yet: off, by the device
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(button).not.toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleName(/off by your device setting/);
    expect(await label(page)).toBe('OFF (DEVICE SETTING)');
    await expect(page.locator('html')).toHaveClass(/motion-off/);
    expect(await page.locator('.hero').evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky');
    await expect(page.locator('#hud')).toBeHidden();
    await expect(page.locator('.ticker__pause')).toBeHidden();
    await page.locator('[data-drum]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    await expect(page.locator('[data-drum]')).not.toHaveClass(/is-live/);
    expect(await running(page), 'nothing animates').toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('playrun.motion'))).toBeNull();

    // turned on: it moves, and the choice is kept
    await page.evaluate(() => window.scrollTo(0, 0));
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(await label(page)).toBe('ON');
    await expect(button).toHaveAccessibleName(/^Motion\s*$/);
    await expect(page.locator('html')).not.toHaveClass(/motion-off/);
    expect(await page.evaluate(() => localStorage.getItem('playrun.motion'))).toBe('on');
    const moving = async () => {
      // the curtain pins the hero, the logos roll with their Pause button, the games are back
      expect(await page.locator('.hero').evaluate((el) => getComputedStyle(el).position), 'the curtain').toBe('sticky');
      await expect(page.locator('.ticker__pause'), 'the logos’ Pause').toBeVisible();
      expect(await page.locator('.ticker__track').evaluate((el) => el.getAnimations().some((a) => a.playState === 'running')), 'the logos roll').toBe(true);
      await expect(page.locator('.score__pill')).toBeVisible();
      // the bugs walk
      const bug = page.locator('[data-bug]:visible').first();
      await bug.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(300);
      expect(await bug.evaluate((el) => el.getAnimations().some((a) => a.playState === 'running')), 'the bugs walk').toBe(true);
      // the joins drift (measured on the wider screen, as in the switch test above)
      await page.locator('.join').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(300);
      if (width >= 768) expect(await drift(page), 'the joins drift').toBeGreaterThan(0);
      // the drum turns
      await page.locator('[data-drum]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await expect(page.locator('[data-drum]')).toHaveClass(/is-live/);
      const i0 = await page.locator('.drum__list').evaluate((el) => el.style.getPropertyValue('--i'));
      await expect.poll(() => page.locator('.drum__list').evaluate((el) => el.style.getPropertyValue('--i')), { timeout: 6000, message: 'the drum turns' }).not.toBe(i0);
    };
    await moving();
    // the glitch plays as the hero scrolls away
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const trip = await page.locator('.wall__trip[data-trip="glitch"]').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y + 2), trip);
    await expect(page.locator('[data-glitch-card]')).toHaveClass(/is-in/, { timeout: 3000 });

    // a reload keeps it on
    await page.reload();
    await noSmooth(page);
    await expect(page.getByRole('button', { name: /^Motion/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).not.toHaveClass(/motion-off/);
    await moving();

    // off again: still, and it says Off (the visitor's choice now, not the device's)
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: /^Motion/ }).click();
    await expect(page.getByRole('button', { name: /^Motion/ })).toHaveAttribute('aria-pressed', 'false');
    expect(await label(page)).toBe('OFF');
    expect(await page.evaluate(() => localStorage.getItem('playrun.motion'))).toBe('off');
    await expect(page.locator('html')).toHaveClass(/motion-off/);
    expect(await running(page), 'nothing animates').toEqual([]);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/motion-off/);
    expect(await label(page)).toBe('OFF');
    await context.close();
  });
}

test('without a choice the site follows the device as it changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const button = page.getByRole('button', { name: /^Motion/ });
  expect(await label(page)).toBe('ON');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveClass(/motion-off/);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await label(page)).toBe('OFF (DEVICE SETTING)');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).not.toHaveClass(/motion-off/);
  expect(await label(page)).toBe('ON');
});
