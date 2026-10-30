import { test, expect, type Page } from '@playwright/test';

/**
 * Text can be selected with the mouse on every page: nothing sits over it (link overlays, bugs,
 * the HUD, entrance layers), and the highlight is visible on every field.
 */
const PAGES = ['/', '/skills/', '/portfolio/', '/contact/', '/quality/', '/privacy/', '/terms/', '/accessibility/'];

async function settle(page: Page) {
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await page.evaluate(() => {
    document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in'));
    // the Skills deck is scrubbed by the scroll; the plain rows are what a drag can reach
    document.querySelectorAll('[data-deck]').forEach((e) => e.classList.remove('is-deck'));
    return Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    );
  });
}

/**
 * Paragraphs and list items with real text, not ones that are a single link. Up to six, spread
 * over the page, picked once and tagged: a page whose text changes while the test runs (the
 * Quality steps write their results) must not hand back a different list on the next look.
 */
const pick = () => {
  const all = [...document.querySelectorAll<HTMLElement>('main p, main li, main dd')].filter((e) => {
    const text = (e.textContent ?? '').trim();
    if (text.length < 40 || e.querySelector('p, li') || !e.getClientRects().length) return false;
    const link = e.querySelector('a');
    return !(link && (link.textContent ?? '').trim().length >= text.length - 2);
  });
  const step = Math.max(1, Math.floor(all.length / 6));
  const chosen = all.filter((_, i) => i % step === 0).slice(0, 6);
  chosen.forEach((e, i) => e.setAttribute('data-sel-pick', String(i)));
  return chosen.length;
};

/**
 * The Quality page runs each step as it scrolls into view and rewrites that step's result line
 * and the report, the very text a drag might be crossing. Run every step first and wait for the
 * last result, so the page is still before the first drag.
 */
async function quiet(page: Page, path: string) {
  if (path !== '/quality/') return;
  await page.mouse.move(640, 300);
  await page.getByRole('button', { name: 'Run every step' }).click();
  await expect(page.locator('#run-status')).toHaveText('Every step has run. The report is at the end.', { timeout: 20_000 });
  await expect(page.locator('.step.is-running')).toHaveCount(0);
}

for (const path of PAGES) {
  test(`${path}: a drag across a paragraph selects its text, and the highlight shows`, async ({ page }) => {
    await page.goto(path);
    await quiet(page, path);
    await settle(page);
    const count: number = await page.evaluate(`(${pick})()`);
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const line = await page.evaluate(
        (i) => {
          const el = document.querySelector<HTMLElement>(`[data-sel-pick="${i}"]`)!;
          el.scrollIntoView({ block: 'center' });
          // The first line of the element's own text, as the mouse would see it.
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let node: Text | null;
          let rect: DOMRect | undefined;
          while ((node = walker.nextNode() as Text | null)) {
            if ((node.textContent ?? '').trim().length < 10) continue;
            const r = document.createRange();
            r.selectNodeContents(node);
            rect = [...r.getClientRects()].find((x) => x.width > 40);
            if (rect) break;
          }
          const bg = (e: HTMLElement | null) => {
            for (; e; e = e.parentElement) {
              const c = getComputedStyle(e).backgroundColor;
              if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
            }
            return 'none';
          };
          return {
            text: (el.textContent ?? '').trim().slice(0, 50),
            // From the left edge of the first glyph to the right edge of the line, as a reader would.
            // Headless Chromium collapses a drag that starts on the right half of a glyph, so the
            // start sits on the edge; that quirk never shows in a headed browser.
            x1: rect!.left + 1,
            x2: rect!.right - 2,
            y: (rect!.top + rect!.bottom) / 2,
            field: bg(el),
            highlight: getComputedStyle(el, '::selection').backgroundColor,
          };
        },
        i,
      );
      await page.evaluate(() => getSelection()?.removeAllRanges());
      await page.mouse.move(line.x1, line.y);
      await page.mouse.down();
      await page.mouse.move(line.x1 + 15, line.y, { steps: 3 });
      await page.mouse.move(line.x2, line.y, { steps: 6 });
      await page.mouse.up();
      const selected = await page.evaluate(() => getSelection()?.toString() ?? '');
      expect(selected.trim().length, `${path}: "${line.text}" selected nothing`).toBeGreaterThan(3);
      expect(line.highlight, `${path}: "${line.text}" highlight vanishes on its field`).not.toBe(line.field);
    }
    // Every block of text on the page, not only the sampled ones: the highlight never matches the field.
    const vanishing = await page.evaluate(() => {
      const bg = (e: HTMLElement | null) => {
        for (; e; e = e.parentElement) {
          const c = getComputedStyle(e).backgroundColor;
          if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
        }
        return 'none';
      };
      return [...document.querySelectorAll<HTMLElement>('main :is(p, li, dd, dt, h1, h2, h3, h4, a, button, label)')]
        .filter((e) => (e.textContent ?? '').trim().length > 0 && e.getClientRects().length)
        .filter((e) => getComputedStyle(e, '::selection').backgroundColor === bg(e))
        .map((e) => `${e.tagName}.${e.className}: ${(e.textContent ?? '').trim().slice(0, 40)}`);
    });
    expect(vanishing, `${path}: highlight vanishes on`).toEqual([]);
  });
}
