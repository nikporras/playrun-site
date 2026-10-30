import { test, expect } from '@playwright/test';

/**
 * The Quality page as a guided test run: five steps that run live on the page with the shared
 * check engine, each with the way to see it yourself, a report at the end with a bug template,
 * and on a phone the Pocket DevTools panel in place of the computer instructions.
 */
test.describe('Quality, the guided test run', () => {
  test('five steps run live as they come into view, and the report adds them up', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/quality/');
    // the pointer starts at the top left corner, over the track, whose panel unfolds on hover: move it off
    await page.mouse.move(640, 300);
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

  test('the computer steps are one action each, name every browser where they differ, mark the Chrome and Edge only ones, and say what to expect; Tab really lands on Skip to content', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/quality/');
    await page.mouse.move(640, 300);
    const hows = page.locator('.step__desktop .how');
    expect(await hows.count()).toBeGreaterThanOrEqual(10);
    for (const how of await hows.all()) {
      await expect(how.locator('.how__do')).toHaveText(/\S/);
      await expect(how.locator('.how__see')).toContainText(/You should see\s*\S/);
    }
    const first = hows.first();
    await expect(first.locator('.how__browsers dt')).toHaveText(['Chrome and Edge', 'Firefox', 'Safari on a Mac']);
    await expect(first).toContainText('Press F12');
    await expect(first).toContainText('Show features for web developers');
    await expect(first).toContainText('Cmd+Option+I');
    const only = page.locator('.how__only');
    await expect(only).toHaveCount(2);
    for (const o of await only.all()) await expect(o).toContainText('Chrome and Edge only');
    await expect(page.locator('#step-a11y .how__only')).toContainText(/Firefox and Safari/);
    await expect(page.locator('#step-performance .how__only')).toContainText(/Firefox or Safari/);
    await expect(page.locator('#step-responsive')).toContainText('Enter Responsive Design Mode');
    await expect(page.locator('#step-responsive .how__note')).toHaveText("The page switches to its phone layout. That's expected, it's what you're testing.");
    // the keyboard check, as written
    const a11y = page.locator('#step-a11y .how');
    await expect(a11y.nth(0).locator('.how__do')).toHaveText('Reload the page, then press the Tab key once (above Caps Lock).');
    await expect(a11y.nth(0).locator('.how__see')).toContainText('A Skip to content link appears at the top left, with an outline.');
    await expect(a11y.nth(1).locator('.how__do')).toHaveText('Keep pressing Tab.');
    await expect(a11y.nth(1).locator('.how__see')).toContainText('The outline moves through every link and button in reading order.');
    await expect(a11y.nth(1).locator('.how__browsers')).toContainText('Press Tab to highlight each item on a webpage');
    // the notes read at body size in the text face; the short labels keep the pixel face at 16px
    const note = await page.locator('.how__only').first().evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), family: getComputedStyle(el).fontFamily }));
    expect(note.size).toBeGreaterThanOrEqual(16);
    expect(note.family).toMatch(/Montserrat/);
    const dd = await page.locator('.how__browsers dd').first().evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), family: getComputedStyle(el).fontFamily }));
    expect(dd.size).toBeGreaterThanOrEqual(16);
    expect(dd.family).toMatch(/Montserrat/);
    for (const sel of ['.how__browsers dt', '.how__seekey']) {
      const label = await page.locator(sel).first().evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), family: getComputedStyle(el).fontFamily, color: getComputedStyle(el).color }));
      expect(label.size, `${sel} is not tiny`).toBeGreaterThanOrEqual(16);
      expect(label.family).toMatch(/Pixel Operator/);
      expect(['rgb(86, 189, 218)', 'rgb(103, 193, 140)'], `${sel} reads on navy`).toContain(label.color);
    }
    // the fold is a phone thing: not shown on a desktop
    await expect(page.locator('.step__fold').first()).toBeHidden();
    await expect(page.locator('.step__note').first()).toBeHidden();
    // and the claim holds: after a reload, one Tab lands on Skip to content, visible, outlined
    await page.reload();
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip');
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    const sk = (await skip.boundingBox())!;
    expect(sk.x).toBeLessThan(200);
    expect(sk.y).toBeLessThan(120);
    expect(await skip.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toMatch(/A|BUTTON/);
    // UK spelling in the copy, apart from the names of buttons quoted as the browsers spell them
    const text = (await page.locator('.step__desktop').allTextContents()).join(' ');
    expect(text).not.toMatch(/\u2014/);
    expect(text).not.toMatch(/\bcolor\b|\bcenter\b|\boptimiz/);
  });

  test('Run every step runs them all again, in order', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto('/quality/');
    // the pointer starts at the top left corner, over the track, whose panel unfolds on hover: move it off
    await page.mouse.move(640, 300);
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
    await page.goto('/quality/');
    // the pointer starts at the top left corner, over the track, whose panel unfolds on hover: move it off
    await page.mouse.move(640, 300);
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
    await page.goto('/quality/');
    // the pointer starts at the top left corner, over the track, whose panel unfolds on hover: move it off
    await page.mouse.move(640, 300);
    await expect(page.locator('.step')).toHaveCount(5);
    await expect(page.locator('.step__desktop .step__list').first()).toBeVisible();
    await expect(page.locator('.step__fold').first()).toBeHidden();
    await expect(page.locator('[data-step-result]').first()).toContainText('script');
    await expect(page.locator('[data-template]')).toBeVisible();
    await context.close();
  });

  test('under reduced motion every step runs at once and nothing animates', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/quality/');
    // the pointer starts at the top left corner, over the track, whose panel unfolds on hover: move it off
    await page.mouse.move(640, 300);
    await expect(page.locator('.step.is-pass')).toHaveCount(5, { timeout: 15_000 });
    expect(await page.locator('.step__mark').first().evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await context.close();
  });
});
