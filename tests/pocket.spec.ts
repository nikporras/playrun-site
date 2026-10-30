import { test, expect, devices } from '@playwright/test';

/**
 * Pocket DevTools: on a phone the Quality page swaps the computer instructions for phone steps and
 * a panel that shows what F12 would: the console errors the page caught, the requests it made
 * and its load timings, from its own records.
 */
test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });

test('the phone steps replace the computer ones, and the panel shows the console, the requests and the timings', async ({ page }) => {
  await page.goto('/quality');
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await expect(page.locator('.step__desktop .step__howtitle').first()).toBeHidden();
  await expect(page.locator('.step__desktop').first()).toBeHidden();
  await expect(page.locator('.step__phone').first()).toBeVisible();
  for (const text of ['Rotate the phone', 'Pinch to zoom', 'VoiceOver', 'TalkBack', 'Reduce motion']) await expect(page.getByText(text).first()).toBeVisible();
  await expect(page.locator('.step__note').first()).toBeVisible();
  await expect(page.locator('.step__note').first()).toContainText('Checking on a computer?');
  await expect(page.locator('.step__note').first()).toContainText('Pocket DevTools');
  // the computer steps are folded under a button, closed by default, and open on a tap
  const fold = page.locator('#step-responsive .step__fold');
  await expect(fold).toBeVisible();
  await expect(fold).toHaveText(/Checking on a computer\?/);
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#how-responsive')).toBeHidden();
  await fold.tap();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#how-responsive')).toBeVisible();
  await expect(page.locator('#how-responsive')).toContainText("The page switches to its phone layout. That's expected, it's what you're testing.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'no sideways scroll with a fold open').toBeLessThanOrEqual(0);
  await fold.tap();
  await expect(page.locator('#how-responsive')).toBeHidden();
  // the keyboard works it too
  await fold.focus();
  await page.keyboard.press('Enter');
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Enter');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  const dev = page.locator('.devtools');
  await dev.scrollIntoViewIfNeeded();
  await expect(dev).toBeVisible();
  await expect(page.locator('[data-dev-console] li').first()).toHaveText('No errors since this page loaded.');
  await expect.poll(() => page.locator('[data-dev-network] tr').count()).toBeGreaterThan(5);
  await expect(page.locator('[data-dev-network] td.is-ok').first()).toBeVisible();
  await expect(page.locator('[data-dev-network] td.is-bad')).toHaveCount(0);
  const perf = page.locator('[data-dev-perf]');
  await expect(perf).toContainText(/First paint\s*\d+ ms/);
  await expect(perf).toContainText(/Loaded\s*\d+ ms/);
  await expect(perf).toContainText(/Requests\s*\d+/);
  await expect(perf).toContainText(/Transferred\s*\d+ KB/);
  // the steps run on the phone too
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(150);
  }
  await expect(page.locator('.step.is-pass')).toHaveCount(5, { timeout: 15_000 });
});
