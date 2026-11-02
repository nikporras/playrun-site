import { test, expect, devices } from '@playwright/test';

/**
 * Pocket DevTools: with a phone picked (an Android phone here, picked for itself) the Quality page
 * shows the phone's steps and a panel that shows what F12 would: the console errors the page
 * caught, the requests it made and its load timings, from its own records.
 */
test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });

test('a phone picks itself: its steps show, and the panel shows the console, the requests and the timings', async ({ page }) => {
  await page.goto('/quality/');
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  // (an Android phone: the picker chose it, so its steps show and no computer's)
  await expect(page.locator('[data-picker] [aria-pressed="true"]')).toHaveText('Android');
  for (const text of ['Rotate the phone', 'Pinch to zoom', 'TalkBack', 'Remove animations']) await expect(page.locator('.step__for:not([hidden])').getByText(text).first()).toBeVisible();
  await expect(page.getByText('Press F12').first()).toBeHidden();
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
