import { test, expect } from '@playwright/test';

/**
 * The Quality page as a guided test run: five steps that run live on the page with the shared
 * check engine, each with the way to see it yourself, a report at the end with a bug template,
 * and on a phone the Pocket DevTools panel in place of the computer instructions.
 */
test.describe('Quality, the guided test run', () => {
  test('five steps run live as they come into view, and the report adds them up', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/quality');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const steps = page.locator('.step');
    await expect(steps).toHaveCount(5);
    await expect(steps.locator('.step__title')).toHaveText(['Smoke test', 'Responsive', 'Accessibility', 'Links', 'Performance']);
    await expect(page.locator('[data-report-score]')).toContainText('Not run yet');
    // a step runs on its own as it comes into view
    await steps.first().scrollIntoViewIfNeeded();
    await expect(steps.first()).toHaveClass(/is-pass/, { timeout: 10_000 });
    await expect(steps.first().locator('[data-step-result]')).toContainText('exactly one h1');
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 400) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(150);
    }
    await expect(page.locator('.step.is-pass')).toHaveCount(5, { timeout: 15_000 });
    await expect(page.locator('#run-status')).toHaveText('Every step has run. The report is at the end.');
    await expect(page.locator('[data-report-score]')).toHaveText('5 of 5 steps passed on your device.');
    await expect(page.locator('[data-report-result]')).toHaveText(['Pass', 'Pass', 'Pass', 'Pass', 'Pass']);
    await expect(page.locator('[data-report-row="performance"] [data-report-detail]')).toContainText(/First paint at|loaded in/);
    await expect(page.locator('[data-report-row="links"] [data-report-detail]')).toContainText(/\d+ of \d+ links/);
    // the computer instructions show, the phone ones and Pocket DevTools do not
    await expect(page.getByText('Press F12').first()).toBeVisible();
    await expect(page.locator('.step__phone').first()).toBeHidden();
    await expect(page.locator('.devtools')).toBeHidden();
    // the suite's own numbers are on the report
    await expect(page.locator('.report__suite')).toContainText(/\d+ checks in \d+ spec files/);
    await expect(page.locator('.report__suite')).toContainText(/Playwright 1\./);
  });

  test('Run every step runs them all again, in order', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/quality');
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: 'Run every step' }).click();
    await expect(page.locator('#run-status'), errors.join(' | ')).toContainText(/steps run|Every step has run/, { timeout: 15_000 });
    await expect(page.locator('.step.is-pass, .step.is-fail')).toHaveCount(5, { timeout: 15_000 });
    const states = await page.locator('.step').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-step')}: ${e.querySelector('[data-step-result]')?.textContent}`));
    expect(errors, errors.join(' | ')).toEqual([]);
    await expect(page.locator('.step.is-pass'), states.join(' | ')).toHaveCount(5);
    await expect(page.getByRole('button', { name: 'Run again' })).toBeEnabled();
    await expect(page.locator('[data-report-score]')).toHaveText('5 of 5 steps passed on your device.');
  });

  test('the bug report template copies, or selects itself where the clipboard is refused', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/quality');
    const pre = page.locator('[data-template]');
    await expect(pre).toContainText('Steps to reproduce');
    await expect(pre).toContainText('Severity: [Blocker / Major / Minor / Cosmetic]');
    await page.getByRole('button', { name: 'Copy the template' }).click();
    await expect(page.locator('[data-copy-status]')).toHaveText(/Copied\.|Selected/);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    if (clip) expect(clip).toContain('Steps to reproduce');
  });

  test('without script the plan still reads, with the steps to take yourself', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/quality');
    await expect(page.locator('.step')).toHaveCount(5);
    await expect(page.locator('.step__list').first()).toBeVisible();
    await expect(page.locator('[data-step-result]').first()).toContainText('script');
    await expect(page.locator('[data-template]')).toBeVisible();
    await context.close();
  });

  test('under reduced motion every step runs at once and nothing animates', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/quality');
    await expect(page.locator('.step.is-pass')).toHaveCount(5, { timeout: 15_000 });
    expect(await page.locator('.step__mark').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await context.close();
  });
});
