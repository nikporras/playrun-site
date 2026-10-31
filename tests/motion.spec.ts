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
    // no headline break, no ticket
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const wallTop = await page.locator('.wall').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(wallTop - height + 300));
    await page.waitForTimeout(1500);
    await expect(page.locator('.hero__break')).toBeHidden();
    await expect(page.locator('h1')).toHaveCSS('opacity', '1');
    await expect(page.locator('.hero__ticket')).not.toHaveClass(/is-in/);
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

test('the Motion switch follows the device: under reduced motion it reads off, cannot be turned on, and says why', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  const button = page.getByRole('button', { name: /^Motion/ });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(button).toHaveAccessibleName(/off by your device setting/);
  // (a press does nothing: Playwright needs force to press a button marked disabled)
  await button.click({ force: true });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('html')).toHaveClass(/motion-off/);
  await context.close();
});
