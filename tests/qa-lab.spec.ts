import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/**
 * The Testing page as a guided test run: five steps that run live on the page with the shared
 * check engine, each with the way to see it yourself, a report card after them (the sixth card),
 * and on a phone the Pocket DevTools panel in place of the computer instructions.
 */
test.describe('QA Lab, the live checks', () => {
  test('five steps run live as they come into view, and the report adds them up', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/qa-lab/');
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
    await expect(page.locator('[data-report-score]')).toHaveText('5 of 5 steps passed on your device.');
    await expect(page.locator('[data-report-result]')).toHaveText(['Pass', 'Pass', 'Pass', 'Pass', 'Pass']);
    await expect(page.locator('[data-report-row].is-pass')).toHaveCount(5);
    await expect(page.locator('[data-report-detail]')).toHaveCount(0);
    // this browser's instructions show, the phones' and Pocket DevTools do not
    await expect(page.getByText('Press F12').first()).toBeVisible();
    await expect(page.locator('.step__for[data-for="iphone"]').first()).toBeHidden();
    await expect(page.locator('.devtools')).toBeHidden();
    // the suite's own number on the report (src/data/suite.ts; a build with no run has only the
    // list; pages.spec checks it against Playwright's), and where it runs, from the Playwright
    // projects and the live check's schedule (.github/workflows/live-check.yml)
    const line = (await page.locator('.report__suite').textContent())!.trim();
    expect(line).toMatch(/^\d+ checks (passed before this page went live|run before this page goes live)\.$/);
    await expect(page.locator('.report__where')).toHaveText('Run in Chromium, Firefox and WebKit on every push, and against the live site every Monday.');
  });

  test("the steps for a computer are one action each with that browser's keys, and say what to expect; Tab really lands on Skip to content", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/qa-lab/');
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

  test('the hero says what the page is, with no Run every step button or status line; with the Motion switch off every step runs after load, in order, with no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
    await page.goto('/qa-lab/');
    // the pointer starts at the top left corner, over the track, whose panel unfolds on hover: move it off
    await page.mouse.move(640, 300);
    await expect(page.locator('.qa .flag')).toHaveText('QA Lab');
    await expect(page.locator('h1')).toHaveText('Inside my QA Lab');
    await expect(page.locator('.qa__lead')).toHaveText('How I test, shown on this site: live checks on your device, a real test plan and real bug reports from building it.');
    await expect(page.getByRole('button', { name: /Run every step|Run again/ })).toHaveCount(0);
    await expect(page.locator('#run-status, #run-all')).toHaveCount(0);
    await expect(page.locator('.step.is-pass, .step.is-fail')).toHaveCount(5, { timeout: 15_000 });
    const states = await page.locator('.step').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-step')}: ${e.querySelector('[data-step-result]')?.textContent}`));
    expect(errors, errors.join(' | ')).toEqual([]);
    await expect(page.locator('.step.is-pass'), states.join(' | ')).toHaveCount(5);
    await expect(page.locator('[data-report-score]')).toHaveText('5 of 5 steps passed on your device.');
  });

  test('a full run earns Tested the page, the achievement Home no longer awards', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
    await page.goto('/qa-lab/');
    await page.mouse.move(640, 300);
    await expect(page.locator('.step.is-pass, .step.is-fail, .step.is-unmeasured')).toHaveCount(5, { timeout: 15_000 });
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('playrun.games') ?? '{}').achievements ?? [])).toContain('selftest');
    // and Home has nothing that awards it
    await page.goto('/');
    await expect(page.locator('#selftest')).toHaveCount(0);
  });

  test('without script the plan still reads, with the steps to take yourself', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/qa-lab/');
    // the pointer starts at the top left corner, over the track, whose panel unfolds on hover: move it off
    await page.mouse.move(640, 300);
    await expect(page.locator('.step')).toHaveCount(5);
    await expect(page.locator('.step__for .step__list').first()).toBeVisible();
    await expect(page.locator('[data-step-result]').first()).toContainText('script');
    await context.close();
  });

  test('under reduced motion every step runs at once and nothing animates', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/qa-lab/');
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
    await page.goto('/qa-lab/');
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
    const accents = ['rgb(158, 210, 226)', 'rgb(86, 189, 218)', 'rgb(159, 178, 228)', 'rgb(84, 148, 198)', 'rgb(127, 143, 224)'];
    expect(looks.map((l) => l.border), 'sky, cyan, periwinkle, steel, indigo').toEqual(accents);
    // one family: every accent's hue sits between cyan and blue, so none reads like an error
    for (const a of accents) {
      const [r, g, b] = a.match(/\d+/g)!.map((n) => Number(n) / 255);
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      const hue = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
      expect(hue < 0 ? hue + 360 : hue, `${a} in the blue family`).toBeGreaterThanOrEqual(185);
      expect(hue < 0 ? hue + 360 : hue, `${a} in the blue family`).toBeLessThanOrEqual(235);
    }
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
    await page.goto('/qa-lab/');
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
    expect(detail).not.toMatch(/n\/a|\b0ms/);
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

test('the title reads as one phrase in balanced lines: at most three at 300px, at most two from 768px', { tag: ['@viewports'] }, async ({ page }) => {
  for (const [width, most] of [[300, 3], [320, 3], [375, 3], [768, 2], [1024, 2], [1440, 2], [1920, 2]] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/qa-lab/');
    await page.evaluate(() => document.fonts.ready);
    const lines = await page.locator('#qa-title').evaluate((h) => {
      // the text's own line boxes (not the mask spans around it)
      const r = document.createRange();
      const text = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
      const tops = new Set<number>();
      for (let n = text.nextNode(); n; n = text.nextNode()) {
        if (!n.textContent!.trim()) continue;
        r.selectNodeContents(n);
        for (const b of r.getClientRects()) if (b.width > 0) tops.add(Math.round(b.top));
      }
      return tops.size;
    });
    expect(lines, `${width}px`).toBeLessThanOrEqual(most);
    expect(lines, `${width}px`).toBeGreaterThan(0);
  }
});

// Phones and tablets: the five steps and the report swipe (Swipe.astro), one on show with the next
// peeking in, "n of 6", Previous and Next. A step runs when its card comes on show; the row is as
// tall as the tallest card, so the buttons and what follows never move as the cards go by.
for (const [width, height] of [[375, 812], [768, 1024]] as const) {
  test(`at ${width}px the steps and the report swipe: one card on show, each labelled Step n of 6 and Report, 6 of 6, run as it comes on show, the buttons never moving`, { tag: ['@viewports', '@a11y'] }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/qa-lab/');
    const region = page.getByRole('region', { name: 'The five steps and the report' });
    await expect(region).toHaveAttribute('aria-roledescription', 'carousel');
    const cards = region.locator('.step');
    await expect(cards).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await expect(cards.nth(i)).toHaveAttribute('role', 'group');
      await expect(cards.nth(i)).toHaveAttribute('aria-label', `Step ${i + 1} of 6`);
      // (the visible label keeps its own number alone)
      await expect(cards.nth(i).locator('.step__num')).toHaveText(`Step ${i + 1}`);
    }
    const report = region.locator('[data-report]');
    await expect(report).toHaveAttribute('role', 'group');
    await expect(report).toHaveAttribute('aria-roledescription', 'slide');
    await expect(report).toHaveAttribute('aria-label', 'Report, 6 of 6');
    const track = region.locator('.swipe__track');
    await track.scrollIntoViewIfNeeded();
    const pos = region.locator('[data-swipe-pos]');
    await expect(pos).toHaveText('1 of 6');
    // one on show, the next peeking in from the edge
    const b = await cards.evaluateAll((els) => els.slice(0, 2).map((e) => e.getBoundingClientRect().toJSON()));
    expect(b[0].left).toBeGreaterThanOrEqual(0);
    expect(b[0].right).toBeLessThan(width);
    expect(width - b[1].left).toBeGreaterThan(0);
    expect(width - b[1].left).toBeLessThan(80);
    // the first runs once the row is on screen; the second waits for its turn
    await expect(cards.nth(0)).toHaveClass(/is-(pass|fail|unmeasured)/, { timeout: 15_000 });
    await page.waitForTimeout(800);
    await expect(cards.nth(1)).toHaveClass(/is-idle/);
    // each card keeps its own height; the row is as tall as the tallest, so swiping moves nothing
    // under it (a result arriving can make a card taller: that is the only change allowed)
    const heights = () => cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    const h0 = await heights();
    expect(new Set(h0).size, 'cards keep their own heights').toBeGreaterThan(1);
    expect(await track.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(Math.max(...h0) - 1);
    const next = region.getByRole('button', { name: 'Next card' });
    // (measured from the row's top: the status line at the top of the page changes with the results)
    const where = () => page.evaluate(() => {
      const row = document.querySelector('.plan .swipe__track')!.getBoundingClientRect().top;
      return [document.querySelector('.plan [data-swipe-next]')!.getBoundingClientRect().top - row, document.querySelector('.plan .swipe__controls')!.getBoundingClientRect().bottom - row];
    });
    for (let k = 2; k <= 5; k++) {
      const tallest = Math.max(...(await heights()));
      const before = await where();
      await next.click();
      await expect(pos).toHaveText(`${k} of 6`);
      await expect(cards.nth(k - 1)).toHaveClass(/is-(pass|fail|unmeasured)/, { timeout: 15_000 });
      if (Math.max(...(await heights())) === tallest) expect(await where(), `card ${k}: nothing under the row moved`).toEqual(before);
    }
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('playrun.games') ?? '{}').achievements ?? [])).toContain('selftest');
    // and the last card is the report, every step in it
    await next.click();
    await expect(pos).toHaveText('6 of 6');
    await expect(report).toHaveClass(/is-current/);
    await expect(report.locator('[data-report-row]:not(.is-idle)')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test('at 375px with the Motion switch off all five run after load, wherever the swipe is', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
  await page.goto('/qa-lab/');
  await expect(page.locator('.step.is-pass, .step.is-fail, .step.is-unmeasured')).toHaveCount(5, { timeout: 20_000 });
  await expect(page.locator('.plan [data-swipe-pos]')).toHaveText('1 of 6');
});

test('on a desktop the deck is as it was: no swipe buttons, no carousel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/qa-lab/');
  await expect(page.locator('.plan [data-deck]')).toHaveClass(/is-deck/);
  await expect(page.locator('.plan .swipe__controls')).toBeHidden();
  await expect(page.locator('.plan [data-swipe]')).not.toHaveAttribute('aria-roledescription');
});

// Testing (once Quality) is the QA Lab now. Both old addresses are small pages that send visitors
// on, like /skills/.
for (const old of ['/testing/', '/quality/']) {
  test(`${old} is a silent redirect page to the QA Lab: script and meta refresh, a canonical to /qa-lab/, never indexed, out of the sitemap`, { tag: ['@pages', '@links'] }, async ({ request, page }) => {
    const res = await request.get(old);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<meta http-equiv="refresh" content="0;url=\/qa-lab\/">/);
    expect(html).toContain('<link rel="canonical" href="https://playrunqa.com/qa-lab/">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<meta name="referrer" content="strict-origin-when-cross-origin">');
    expect(html).toMatch(/<script[^>]*>location\.replace\(['`"]\/qa-lab\/['`"]\);?<\/script>/);
    expect(html).toMatch(/<a href="\/qa-lab\/"[^>]*>Go to the QA Lab<\/a>/);
    const sitemap = await (await request.get('/sitemap-0.xml')).text();
    expect(sitemap).not.toContain(old);
    expect(sitemap).toContain('https://playrunqa.com/qa-lab/');
    await page.goto(old);
    await expect(page).toHaveURL(/\/qa-lab\/$/);
    await expect(page.locator('h1')).toHaveText('Inside my QA Lab');
  });
}

test('every link, the nav and the visible wording say QA Lab: no page links to /testing/ or /quality/, and none calls the page Testing or Quality', { tag: ['@pages', '@links'] }, async ({ request, page }) => {
  const llms = await (await request.get('/llms.txt')).text();
  expect(llms).toContain('[QA Lab](https://playrunqa.com/qa-lab/)');
  expect(llms).not.toMatch(/\/(quality|testing)\//i);
  for (const path of ['/', '/about/', '/portfolio/', '/qa-lab/', '/contact/', '/privacy/', '/terms/', '/accessibility/']) {
    await page.goto(path);
    expect(await page.locator('a[href^="/quality"], a[href^="/testing"]').count(), path).toBe(0);
    const text = (await page.locator('body').innerText()).replace(/Quality Assurance/g, '');
    expect(text, `${path}: no "Quality" for the page`).not.toMatch(/\bQuality\b/);
    expect(text, `${path}: no "Testing" for the page`).not.toMatch(/\bTesting( page|:|\b(?= ·))/);
    expect(await page.locator('nav').getByRole('link', { name: 'Testing', exact: true }).count(), path).toBe(0);
  }
  await page.goto('/qa-lab/');
  await expect(page.locator('header nav').getByRole('link', { name: 'QA Lab', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('footer').getByRole('link', { name: 'QA Lab', exact: true })).toHaveAttribute('href', '/qa-lab/');
  await expect(page).toHaveTitle('Inside my QA Lab: how Nicolás Porras tests, live on this site');
});

// The report is the sixth card. It shows each step's result in words with its mark beside it (never
// colour alone), the score, and the suite's lines. When it comes on show it runs any step not yet
// run, so it is always complete, and a full run earns Tested the page.
test('at 375px swiping straight to the report runs the steps not yet run, so the report is complete, and earns Tested the page', { tag: ['@a11y'] }, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/qa-lab/');
  const track = page.locator('.plan .swipe__track');
  await track.scrollIntoViewIfNeeded();
  // the first card runs once the row is on screen; the next four wait
  await expect(page.locator('#step-smoke')).toHaveClass(/is-(pass|fail|unmeasured)/, { timeout: 15_000 });
  await page.waitForTimeout(600);
  await expect(page.locator('.step.is-idle')).toHaveCount(4);
  const report = page.locator('[data-report]');
  await expect(report.locator('[data-report-result]')).toHaveText(['Pass', 'Not run yet', 'Not run yet', 'Not run yet', 'Not run yet']);
  // straight to the end, past the four
  await track.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: 'instant' }));
  await expect(page.locator('.plan [data-swipe-pos]')).toHaveText('6 of 6');
  await expect(page.locator('.step.is-pass, .step.is-fail, .step.is-unmeasured')).toHaveCount(5, { timeout: 20_000 });
  await expect(report.locator('[data-report-result]')).toHaveText(['Pass', 'Pass', 'Pass', 'Pass', 'Pass']);
  await expect(report.locator('[data-report-score]')).toHaveText('5 of 5 steps passed on your device.');
  await expect(report.locator('.report__row .step__mark')).toHaveCount(5);
  for (const m of await report.locator('.report__row .step__mark').all()) await expect(m).toHaveAttribute('aria-hidden', 'true');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('playrun.games') ?? '{}').achievements ?? [])).toContain('selftest');
  const axe = await new AxeBuilder({ page }).include('[data-report]').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

test('on a desktop the report is dealt as the sixth card and runs any step not yet run when it comes into view; the report level is gone, and so are its next links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/qa-lab/');
  await page.mouse.move(640, 300);
  await expect(page.locator('section.level')).toHaveCount(4);
  await expect(page.locator('#report-title')).toHaveText('Test report');
  await expect(page.getByRole('link', { name: /See the games|See the skills/ })).toHaveCount(0);
  // a jump to the report lands where it is dealt; every step has run by then
  await page.evaluate(() => (location.hash = '#report'));
  await expect(page.locator('.step.is-pass, .step.is-fail, .step.is-unmeasured')).toHaveCount(5, { timeout: 20_000 });
  await expect(page.locator('[data-report-row].is-idle')).toHaveCount(0);
  await expect(page.locator('[data-report-score]')).toHaveText(/steps passed on your device/);
});

// Round 9: the QA Lab in four levels: the hero, the live checks, the test plan for Bug Sweep and
// two bug reports with my template.
const tagged = () => {
  const cli = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
  const list = JSON.parse(execFileSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: '', PLAYWRIGHT_JSON_OUTPUT_FILE: '' } }));
  const out: { file: string; title: string; n: number; projects: string[]; tags: string[] }[] = [];
  type S = { specs?: { title: string; file: string; tags?: string[]; tests: { projectName: string }[] }[]; suites?: S[] };
  const walk = (s: S) => {
    for (const sp of s.specs ?? []) if ((sp.tags ?? []).includes('bugsweep')) out.push({ file: path.basename(sp.file), title: sp.title, n: sp.tests.length, projects: sp.tests.map((t) => t.projectName), tags: sp.tags ?? [] });
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of list.suites) walk(s);
  return out;
};

test('the QA Lab has four levels in order: the hero, Live checks, Test plan and Bug reports', { tag: ['@pages'] }, async ({ page }) => {
  await page.goto('/qa-lab/');
  await expect(page.locator('main > section.level')).toHaveCount(4);
  await expect(page.locator('[data-level] > .level__head .flag')).toHaveText(['QA Lab', 'Level 2 · Live checks', 'Level 3 · Test plan', 'Level 4 · Bug reports']);
  await expect(page.locator('main h2.level__title')).toHaveText(['Live checks', 'Test plan: Bug Sweep', 'Bug reports']);
  await expect(page.locator('h1')).toHaveText('Inside my QA Lab');
  // the live checks as they were: the picker, the five steps and the report, Pocket DevTools
  const live = page.locator('[data-level="2"]');
  await expect(live.locator('[data-picker]')).toHaveCount(1);
  await expect(live.locator('.step')).toHaveCount(5);
  await expect(live.locator('[data-report]')).toHaveCount(1);
  await expect(live.locator('.devtools')).toHaveCount(1);
  // the three bugs stay on the page
  await expect(page.locator('main [data-bug]')).toHaveCount(3);
});

test('the test plan for Bug Sweep: every block, the coverage and the results from the suite, the known issue linked', { tag: ['@pages'] }, async ({ page }) => {
  await page.goto('/qa-lab/');
  const plan = page.locator('.testplan');
  await expect(plan.locator('h3')).toHaveText(['Scope', 'Platforms and devices', 'Risks', 'Test types', 'What the automated tests cover', 'Checked by hand', 'Entry and exit criteria', 'How a test run goes', 'Results', 'Known issues']);
  await expect(plan.locator('h4:not(.tp__filename)')).toHaveText(['In scope', 'Out of scope']);
  // the checks tagged for Bug Sweep, from Playwright's own list: files, titles, counts, browsers
  const checks = tagged();
  expect(checks.length).toBeGreaterThan(5);
  const total = checks.reduce((n, c) => n + c.n, 0);
  const files = [...new Set(checks.map((c) => c.file))];
  // the plain summary: the total, then the groups in plain words, each count from the tags
  await expect(plan.locator('[data-tp-total]')).toHaveText(`${total} checks, run on every change`);
  const groups: [string, string][] = [['gameplay', 'Gameplay'], ['controls', 'Controls'], ['a11y', 'Accessibility'], ['events', 'Analytics events'], ['known', 'Known issue QA-002']];
  for (const c of checks) expect(groups.filter(([t]) => c.tags.includes(t)), `one group for "${c.title}"`).toHaveLength(1);
  const shown = groups.map(([t, name]) => [name, checks.filter((c) => c.tags.includes(t)).reduce((n, c) => n + c.n, 0)] as const).filter(([, n]) => n > 0);
  const items = plan.locator('[data-tp-groups] li');
  await expect(items.locator('.tp__name')).toHaveText(shown.map(([name]) => name));
  await expect(items.locator('.tp__count')).toHaveText(shown.map(([, n]) => String(n)));
  expect(shown.reduce((n, [, k]) => n + k, 0)).toBe(total);
  // every test in a closed dropdown, per file, sizes merged into one line
  const more = plan.locator('details[data-tp-coverage]');
  await expect(more).not.toHaveAttribute('open', '');
  await expect(more.locator('summary')).toHaveText('See every test');
  await expect(more.locator('li').first()).toBeHidden();
  await more.locator('summary').click();
  await expect(more.locator('h4')).toHaveText(files);
  const SIZE = /\s*\((\d{3,4})x\d{3,4}\)|\s+at (\d{3,4})(?:x\d{3,4}|px)\b/;
  for (const [i, f] of files.entries()) {
    const keys = [...new Set(checks.filter((c) => c.file === f).map((c) => c.title.replace(SIZE, '')))];
    const lines = more.locator('.tp__file').nth(i).locator('li');
    await expect(lines).toHaveCount(keys.length);
  }
  await expect(more).toContainText('passes axe: the scoreboard');
  await expect(more).toContainText('(at 1440 and 375px)');
  await expect(more).toContainText('(at 1440, 768 and 375px)');
  await expect(more).not.toContainText('1440x900');
  const names: Record<string, string> = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' };
  for (const e of new Set(checks.flatMap((c) => c.projects))) await expect(plan.locator('[data-tp-automated]')).toContainText(names[e]);
  // the results: the total from the list; passed and failed from a run (a local build has none)
  await expect(plan.locator('[data-tp-results] tbody td').first()).toHaveText(String(total));
  await expect(plan.locator('[data-tp-results] tbody td').nth(1)).toHaveText(/^(\d+|Not run yet)$/);
  // the devices checked by hand, as given, and the criteria
  await expect(plan).toContainText('Samsung Galaxy S25 Ultra, Firefox for Android (touch).');
  await expect(plan).toContainText('Windows PC, Firefox (keyboard).');
  await expect(plan).toContainText('The change is pushed to main and CI starts.');
  await expect(plan).toContainText('No open issue above Low.');
  await expect(plan.locator('dt')).toContainText(['Automated', 'By hand', 'Entry', 'Exit', 'After release']);
  // every table has its header cells
  for (const t of await plan.locator('table').all()) expect(await t.locator('thead th[scope="col"]').count()).toBeGreaterThan(0);
  // the known issue goes to its ticket
  await plan.getByRole('link', { name: 'QA-002' }).click();
  await expect(page).toHaveURL(/#qa-002$/);
  await expect(page.locator('#qa-002')).toBeInViewport();
});

test('two bug reports written like real tickets, each with every field, steps, evidence with alt text, the cause and the resolution; then my template', { tag: ['@pages', '@a11y'] }, async ({ page }) => {
  await page.goto('/qa-lab/');
  const reports = page.locator('.reports');
  const tickets = reports.locator('article.ticket');
  await expect(tickets).toHaveCount(2);
  await expect(tickets.locator('.ticket__id')).toHaveText(['QA-001', 'QA-002']);
  await expect(tickets.locator('h3')).toHaveText(["Pocket DevTools: the Network table's columns overlap on Android phones", 'Bug Sweep: one enemy bug glitches when it returns to formation']);
  await expect(tickets.locator('.ticket__status')).toHaveText(['Status: Fixed, verified', "Status: Won't fix (known issue)"]);
  for (const t of await tickets.all()) {
    await expect(t.locator(':scope > .ticket__fields > dt')).toHaveText(['Environment', 'Severity', 'Priority', 'Frequency', 'Preconditions', 'Expected', 'Actual']);
    await expect(t.locator('h4')).toHaveText(['Steps to reproduce', 'Evidence', 'Notes on the cause', 'Resolution']);
    expect(await t.locator('.ticket__steps li').count()).toBeGreaterThanOrEqual(3);
    await expect(t.locator('.ticket__env dt')).toContainText(['Found on', 'Build']);
    const img = t.locator('figure img');
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveAttribute('alt', /.{30,}/);
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(t.locator('figcaption')).not.toBeEmpty();
  }
  const one = tickets.nth(0);
  await expect(one).toContainText('Samsung Galaxy S25 Ultra, Firefox for Android.');
  await expect(one).toContainText('Playwright Pixel 7 profile (Chromium, Android)');
  await expect(one).toContainText('Not browser-specific');
  await expect(one).toContainText('e5ad238');
  await expect(one).toContainText('tests/pocket.spec.ts');
  await expect(one.locator('figcaption')).toHaveText('Reproduced from build 299e74b at 390 pixels wide.');
  const two = tickets.nth(1);
  await expect(two).toContainText('Low. Cosmetic');
  await expect(two.locator('figcaption')).toHaveText('Captured in a test build with the glitch triggered on demand.');
  await expect(two.getByRole('link', { name: 'Play Bug Sweep and try to reproduce it' })).toHaveAttribute('href', '/about/#bug-sweep');
  await expect(two).toContainText('Watch the third bug in the top row: it dives first, about 2 to 3 seconds in.');
  await expect(two).toContainText('For about 0.8 seconds');
  await expect(two).toContainText("Won't fix: kept on purpose as a live example.");
  // the template, on the same scale as the tickets
  await expect(reports.locator('#template-title')).toHaveText('My bug report template');
  await expect(reports.locator('.template__body')).toContainText('Severity: [Low / Medium / High / Critical]');
  await expect(reports.locator('.template__body')).toContainText(/Build: playrunqa\.com, (deployed|built) \d+ \w+ 20\d\d/);
});

for (const width of [1440, 375]) {
  test(`at ${width}px the test plan and the bug reports pass axe, and nothing in them scrolls sideways`, { tag: ['@a11y', '@viewports'] }, async ({ page }) => {
    // (motion off: every entrance shows at once, so axe never reads a line mid fade)
    await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/qa-lab/');
    await page.evaluate(() => document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in')));
    const axe = await new AxeBuilder({ page }).include('.testplan').include('.reports').analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

// QA-002's button goes to the game on About and lands with its heading in view, above the bottom
// bar on a phone.
for (const [width, height] of [[1440, 900], [375, 812]] as const) {
  test(`at ${width}x${height} QA-002's button lands on Bug Sweep with the game's heading in view`, { tag: ['@links'] }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/qa-lab/');
    const button = page.locator('#qa-002').getByRole('link', { name: 'Play Bug Sweep and try to reproduce it' });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(page).toHaveURL(/\/about\/#bug-sweep$/);
    const heading = page.locator('#sweep-title');
    // (the page scrolls smoothly to the game: wait for it to come to rest)
    const where = () =>
      heading.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const bar = document.querySelector('.tabbar');
        const floor = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : innerHeight;
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), floor: Math.round(floor), y: Math.round(scrollY) };
      });
    await expect
      .poll(async () => {
        const b = await where();
        return b.top >= 0 && b.bottom <= b.floor;
      }, { timeout: 8000 })
      .toBe(true);
    const box = await where();
    expect(box.top, 'the heading below the top of the screen').toBeGreaterThanOrEqual(0);
    expect(box.bottom, 'the heading clear of the bottom bar').toBeLessThanOrEqual(box.floor);
    await expect(page.getByRole('button', { name: 'Play Bug Sweep' })).toBeVisible();
  });
}

