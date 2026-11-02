import { test, expect, type Page } from '@playwright/test';

/**
 * The device picker on the Quality page: "Testing on:" Chrome or Edge, Firefox, Safari, iPhone,
 * Android; preselected from the browser and device, the choice remembered; each step then shows
 * only that option's instructions (iPhone VoiceOver only, Android TalkBack only), a phone brings
 * Pocket DevTools; without script every option shows.
 */
const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
};
const SIZES = [
  [1440, 900],
  [768, 1024],
  [375, 812],
  [320, 640],
] as const;
const pressed = (page: Page) => page.locator('[data-picker] [aria-pressed="true"]');
// the options shown in the steps, each step's in turn
const shown = (page: Page) => page.locator('.step__for:not([hidden])').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.for));

for (const [width, height] of SIZES) {
  test(`the picker (${width}x${height}): a labelled group of real buttons, preselected from the browser; each step shows only that option, and the choice is remembered`, async ({ browser }) => {
    const touch = width < 1024;
    for (const [ua, expected, label] of [
      [UA.chrome, 'chrome', 'Chrome or Edge'],
      [UA.edge, 'chrome', 'Chrome or Edge'],
      [UA.firefox, 'firefox', 'Firefox'],
      [UA.safari, 'safari', 'Safari'],
      [UA.iphone, 'iphone', 'iPhone'],
      [UA.android, 'android', 'Android'],
    ] as const) {
      const context = await browser.newContext({ viewport: { width, height }, userAgent: ua, hasTouch: touch });
      const page = await context.newPage();
      await page.goto('/quality/');
      await expect(page.getByRole('group', { name: 'Testing on:' })).toBeVisible();
      await expect(pressed(page), ua).toHaveText(label);
      await expect.poll(() => shown(page)).toEqual(Array(5).fill(expected));
      await expect(page.locator('.devtools'), 'Pocket DevTools with a phone').toBeVisible({ visible: expected === 'iphone' || expected === 'android' });
      await context.close();
    }
    // the buttons: named, toggled, reachable by keyboard, at least 44px tall
    const context = await browser.newContext({ viewport: { width, height }, userAgent: UA.chrome, hasTouch: touch });
    const page = await context.newPage();
    await page.goto('/quality/');
    const group = page.getByRole('group', { name: 'Testing on:' });
    await expect(group.getByRole('button')).toHaveText(['Chrome or Edge', 'Firefox', 'Safari', 'iPhone', 'Android']);
    for (const b of await group.getByRole('button').all()) {
      const box = (await b.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    // switching: Firefox, then by keyboard Android
    await group.getByRole('button', { name: 'Firefox' }).click();
    await expect(group.getByRole('button', { name: 'Firefox' })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: 'Chrome or Edge' })).toHaveAttribute('aria-pressed', 'false');
    expect(await shown(page)).toEqual(Array(5).fill('firefox'));
    await group.getByRole('button', { name: 'Android' }).focus();
    await page.keyboard.press('Enter');
    expect(await shown(page)).toEqual(Array(5).fill('android'));
    await expect(page.locator('.devtools')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'no sideways scroll').toBeLessThanOrEqual(0);
    // remembered
    await page.reload();
    await expect(pressed(page)).toHaveText('Android');
    expect(await shown(page)).toEqual(Array(5).fill('android'));
    await context.close();
  });
}

test('each option says only what applies: Chrome or Edge has Lighthouse, Firefox and Safari their own keys and no Lighthouse, iPhone VoiceOver only, Android TalkBack only', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/quality/');
  const group = page.getByRole('group', { name: 'Testing on:' });
  const visible = async () => (await page.locator('.step__for:not([hidden])').allInnerTexts()).join('\n');
  await group.getByRole('button', { name: 'Chrome or Edge' }).click();
  let text = await visible();
  expect(text).toContain('Press F12');
  expect(text).toContain('Lighthouse');
  expect(text).toContain('Press Ctrl+Shift+M (Cmd+Shift+M on a Mac).');
  expect(text).not.toMatch(/Firefox|Safari|VoiceOver|TalkBack|Show features for web developers/);
  await group.getByRole('button', { name: 'Firefox' }).click();
  text = await visible();
  expect(text).toContain('Press Ctrl+Shift+M (Cmd+Option+M on a Mac).');
  expect(text).toContain('under two seconds is the target here');
  expect(text).not.toMatch(/Lighthouse|Safari|Chrome|VoiceOver|TalkBack/);
  await group.getByRole('button', { name: 'Safari' }).click();
  text = await visible();
  expect(text).toContain('Show features for web developers');
  expect(text).toContain('Enter Responsive Design Mode');
  expect(text).toContain('Press Tab to highlight each item on a webpage');
  expect(text).toContain('reload the page with Cmd+R.');
  expect(text).not.toMatch(/Lighthouse|Firefox|Chrome|F12|VoiceOver|TalkBack/);
  await group.getByRole('button', { name: 'iPhone' }).click();
  text = await visible();
  expect(text).toContain('Turn on VoiceOver (Settings, Accessibility, VoiceOver) and swipe right through the page: every image and control is named.');
  expect(text).toContain("Turn on Reduce Motion (Settings, Accessibility, Motion) and come back: the games, the curtain and every animation stop, unless you've turned Motion on in the header.");
  expect(text).not.toMatch(/TalkBack|F12|Lighthouse|Android/);
  await group.getByRole('button', { name: 'Android' }).click();
  text = await visible();
  expect(text).toContain('Turn on TalkBack (Settings, Accessibility; the exact menu name varies by phone) and swipe right through the page: every image and control is named.');
  expect(text).toContain("Turn on Remove animations (Settings, Accessibility; the exact menu name varies by phone) and come back: the games, the curtain and every animation stop, unless you've turned Motion on in the header.");
  expect(text).not.toMatch(/VoiceOver|F12|Lighthouse|iPhone/);
  // no fold and no line about one
  await expect(page.locator('.step__fold, [data-fold]')).toHaveCount(0);
  await expect(page.getByText(/Checking on a computer|folded under/)).toHaveCount(0);
  // the responsive step names the bottom bar, not a Menu button
  await group.getByRole('button', { name: 'Chrome or Edge' }).click();
  await expect(page.locator('#step-responsive')).toContainText('No sideways scrollbar, nothing cut off, and the bar of pages along the bottom.');
  await expect(page.locator('#step-responsive')).not.toContainText('Menu button');
});

test('the picker works with storage blocked, and without script every option shows under its name', async ({ browser }) => {
  const blocked = await browser.newContext({ viewport: { width: 375, height: 812 }, userAgent: UA.iphone });
  const p1 = await blocked.newPage();
  await p1.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('storage off');
      },
    });
  });
  await p1.goto('/quality/');
  await expect(pressed(p1)).toHaveText('iPhone');
  await p1.getByRole('button', { name: 'Safari' }).click();
  expect(await shown(p1)).toEqual(Array(5).fill('safari'));
  await blocked.close();

  const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const p2 = await plain.newPage();
  await p2.goto('/quality/');
  await expect(p2.getByRole('group', { name: 'Testing on:' })).toBeHidden();
  for (const step of await p2.locator('.step').all()) {
    await expect(step.locator('.step__howtitle')).toHaveText([
      'Check it yourself in Chrome or Edge',
      'Check it yourself in Firefox',
      'Check it yourself in Safari on a Mac',
      'Check it yourself on an iPhone',
      'Check it yourself on an Android phone',
    ]);
    for (const block of await step.locator('.step__for').all()) await expect(block).toBeVisible();
  }
  await plain.close();
});
