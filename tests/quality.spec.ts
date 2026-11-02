import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
    // this browser's instructions show, the phones' and Pocket DevTools do not
    await expect(page.getByText('Press F12').first()).toBeVisible();
    await expect(page.locator('.step__for[data-for="iphone"]').first()).toBeHidden();
    await expect(page.locator('.devtools')).toBeHidden();
    // the suite's own numbers are on the report
    await expect(page.locator('.report__suite')).toContainText(/\d+ checks in \d+ spec files/);
    await expect(page.locator('.report__suite')).toContainText(/Playwright 1\./);
  });

  test("the steps for a computer are one action each with that browser's keys, and say what to expect; Tab really lands on Skip to content", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/quality/');
    await page.mouse.move(640, 300);
    // (this browser is Chrome: its steps show)
    const hows = page.locator('.step__for:not([hidden]) .how');
    expect(await hows.count()).toBeGreaterThanOrEqual(10);
    for (const how of await hows.all()) {
      await expect(how.locator('.how__do')).toHaveText(/\S/);
      await expect(how.locator('.how__see')).toContainText(/You should see\s*\S/);
    }
    const first = hows.first();
    await expect(first).toContainText('Press F12');
    await expect(page.locator('#step-responsive .step__for:not([hidden]) .how__note')).toHaveText("The page switches to its phone layout. That's expected, it's what you're testing.");
    // the keyboard check, as written
    const a11y = page.locator('#step-a11y .step__for:not([hidden]) .how');
    await expect(a11y.nth(0).locator('.how__do')).toHaveText('Reload the page, then press the Tab key once (above Caps Lock).');
    await expect(a11y.nth(0).locator('.how__see')).toContainText('A Skip to content link appears at the top left, with an outline.');
    await expect(a11y.nth(1).locator('.how__do')).toHaveText('Keep pressing Tab.');
    await expect(a11y.nth(1).locator('.how__see')).toContainText('The outline moves through every link and button in reading order.');
    // the keys read at body size in the text face; the short label keeps the pixel face at 16px
    const key = await page.locator('.step__for:not([hidden]) .how__key').first().evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), family: getComputedStyle(el).fontFamily }));
    expect(key.size).toBeGreaterThanOrEqual(16);
    expect(key.family).toMatch(/Montserrat/);
    const label = await page.locator('.step__for:not([hidden]) .how__seekey').first().evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), family: getComputedStyle(el).fontFamily, color: getComputedStyle(el).color }));
    expect(label.size, 'not tiny').toBeGreaterThanOrEqual(16);
    expect(label.family).toMatch(/Pixel Operator/);
    expect(['rgb(86, 189, 218)', 'rgb(103, 193, 140)'], 'reads on navy').toContain(label.color);
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
    // UK spelling in every option's copy, apart from the names of buttons quoted as the phones spell them
    const text = (await page.locator('.step__for').allTextContents()).join(' ');
    expect(text).not.toMatch(/\u2014/);
    expect(text).not.toMatch(/\bcenter\b|\boptimiz/);
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
    await expect(page.locator('.step__for .step__list').first()).toBeVisible();
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

for (const [width, height] of [
  [1440, 900],
  [768, 1024],
  [375, 812],
  [320, 640],
] as const) {
  test(`each step its own accent and pixel icon (${width}x${height}): five accents on the border, the number and the title, none like a pass or a fail, every text AA (axe)`, { tag: ['@a11y'] }, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/quality/');
    const looks = await page.locator('.step').evaluateAll((els) =>
      els.map((el) => {
        const cs = (sel: string) => getComputedStyle(el.querySelector(sel)!);
        const lum = (c: string) => {
          const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
            const k = Number(v) / 255;
            return k <= 0.03928 ? k / 12.92 : ((k + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
        const bg = getComputedStyle(el).backgroundColor;
        const icon = el.querySelector('.step__title svg.step__icon');
        return {
          border: getComputedStyle(el).borderTopColor,
          num: cs('.step__num').color,
          title: cs('.step__title').color,
          icon: icon ? { hidden: icon.getAttribute('aria-hidden'), path: icon.querySelector('path')!.getAttribute('d'), color: getComputedStyle(icon).color, w: icon.getBoundingClientRect().width } : null,
          numRatio: ratio(cs('.step__num').color, bg),
        };
      }),
    );
    const accents = ['rgb(158, 210, 226)', 'rgb(86, 189, 218)', 'rgb(159, 178, 228)', 'rgb(84, 148, 198)', 'rgb(255, 95, 162)'];
    expect(looks.map((l) => l.border), 'sky, cyan, periwinkle, steel, pink').toEqual(accents);
    for (const [i, l] of looks.entries()) {
      expect(l.num).toBe(accents[i]);
      expect(l.title).toBe(accents[i]);
      expect(l.icon, 'a pixel icon').not.toBeNull();
      expect(l.icon!.hidden).toBe('true');
      expect(l.icon!.color).toBe(accents[i]);
      expect(l.icon!.w).toBeGreaterThanOrEqual(16);
      expect(l.numRatio, 'the small number AA on the card').toBeGreaterThanOrEqual(4.5);
      // never the pass green or the fail light
      expect(['rgb(103, 193, 140)', 'rgb(229, 231, 234)']).not.toContain(l.border);
    }
    expect(new Set(looks.map((l) => l.icon!.path)).size, 'five different icons').toBe(5);
    // the marks keep their colours: a pass is green
    await expect(page.locator('.step.is-pass')).toHaveCount(5, { timeout: 15_000 });
    expect(await page.locator('.step__mark').first().evaluate((el) => getComputedStyle(el).color)).toBe('rgb(103, 193, 140)');
    const results = await new AxeBuilder({ page }).include('.plan').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    await context.close();
  });
}

test.describe('Performance under reduced motion', () => {
  const run = async (browser: import('@playwright/test').Browser, setup?: () => void) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    if (setup) await page.addInitScript(setup);
    await page.goto('/quality/');
    await expect(page.locator('.step.is-pass, .step.is-fail, .step.is-unmeasured')).toHaveCount(5, { timeout: 15_000 });
    const step = page.locator('#step-performance');
    return { context, page, step, detail: (await step.locator('[data-step-result]').textContent()) ?? '' };
  };

  test('the steps wait for the page to load, so Performance reports real figures: never n/a, never 0ms', { tag: ['@a11y'] }, async ({ browser }) => {
    const { context, page, step, detail } = await run(browser);
    await expect(step).toHaveClass(/is-pass/);
    expect(detail).toMatch(/First paint at \d+(ms|\.\d+s|s), loaded in \d+(ms|\.\d+s|s)/);
    expect(detail).not.toMatch(/n\/a|\b0ms/);
    // the load really had happened when it ran
    expect(await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).loadEventEnd)).toBeGreaterThan(0);
    await expect(page.locator('[data-report-row="performance"] [data-report-detail]')).not.toContainText('n/a');
    await expect(page.locator('[data-dev-perf]')).not.toContainText('n/a');
    await context.close();
  });

  test('Safari-like (no first-paint, a first-contentful-paint): Performance passes on it, named First contentful paint', async ({ browser }) => {
    const { context, step, detail } = await run(browser, () => {
      const get = performance.getEntriesByType.bind(performance);
      performance.getEntriesByType = ((type: string) => (type === 'paint' ? get(type).filter((p) => p.name !== 'first-paint') : get(type))) as typeof performance.getEntriesByType;
    });
    await expect(step).toHaveClass(/is-pass/);
    expect(detail).toMatch(/^First contentful paint at \d+(ms|\.\d+s|s), loaded in /);
    await context.close();
  });

  test('no paint timings at all: Performance is NOT MEASURED in grey, neither a pass nor a fail, and the report counts the measured steps', async ({ browser }) => {
    const { context, page, step, detail } = await run(browser, () => {
      const get = performance.getEntriesByType.bind(performance);
      performance.getEntriesByType = ((type: string) => (type === 'paint' ? [] : get(type))) as typeof performance.getEntriesByType;
      // (and no observer to hear of one later)
      (window as unknown as { PerformanceObserver: unknown }).PerformanceObserver = class {
        observe() {}
        disconnect() {}
      };
    });
    await expect(step).toHaveClass(/is-unmeasured/);
    await expect(step).not.toHaveClass(/is-pass|is-fail/);
    await expect(step.locator('[data-step-word]')).toHaveText('Not measured');
    await expect(step.locator('.step__state')).toHaveCSS('text-transform', 'uppercase');
    expect(await step.locator('.step__state').evaluate((el) => getComputedStyle(el).color), 'grey').toBe('rgb(170, 179, 197)');
    expect(detail).toContain('paint timing not reported by this browser');
    expect(detail).not.toMatch(/n\/a|0ms/);
    await expect(page.locator('[data-report-row="performance"] [data-report-result]')).toHaveText('Not measured');
    await expect(page.locator('[data-report-score]')).toHaveText('4 of 4 measured steps passed on your device, 1 not measured.');
    await context.close();
  });

  test('a slow real figure fails: a first paint over its budget', async ({ browser }) => {
    const { context, step, detail } = await run(browser, () => {
      const get = performance.getEntriesByType.bind(performance);
      performance.getEntriesByType = ((type: string) => (type === 'paint' ? [{ name: 'first-paint', startTime: 4000, entryType: 'paint', duration: 0 }] : get(type))) as typeof performance.getEntriesByType;
    });
    await expect(step).toHaveClass(/is-fail/);
    expect(detail).toBe('Slow: first paint at 4.0s.');
    await context.close();
  });

  test('a browser that reports no load timing: Performance says so in words, never 0ms', async ({ browser }) => {
    const { context, page, step, detail } = await run(browser, () => {
      const get = performance.getEntriesByType.bind(performance);
      performance.getEntriesByType = ((type: string) => (type === 'navigation' ? [] : get(type))) as typeof performance.getEntriesByType;
    });
    await expect(step).toHaveClass(/is-pass/);
    expect(detail).toContain('load time not reported by this browser');
    expect(detail).not.toMatch(/n\/a|\b0ms/);
    await expect(page.locator('[data-dev-perf]')).toContainText('not reported by this browser');
    await context.close();
  });
});
