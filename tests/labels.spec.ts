import { test, expect } from '@playwright/test';

/**
 * Every level's label (the flag: "Level 2 · Games" and the like) starts at the same left edge as
 * every other on the page: the left edge of the content column, whatever the level centres below it.
 */
const PAGES = ['/', '/about/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/'];

for (const [width, height] of [
  [1440, 900],
  [768, 1024],
  [375, 812],
] as const) {
  test(`every level label starts at the same left edge (${width}x${height})`, { tag: ['@viewports'] }, async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const labels = await page.locator('section.level').evaluateAll((levels) =>
        levels
          .map((level) => {
            const flag = level.querySelector('.level__head .flag, .flag');
            if (!flag) return null;
            const r = flag.getBoundingClientRect();
            const pad = parseFloat(getComputedStyle(level).paddingLeft);
            return { text: flag.textContent!.trim(), left: Math.round(r.left), edge: Math.round(level.getBoundingClientRect().left + pad) };
          })
          .filter((x) => x !== null),
      );
      expect(labels.length, `${path} has labels`).toBeGreaterThan(0);
      for (const l of labels) {
        expect(Math.abs(l!.left - labels[0]!.left), `${path}: "${l!.text}" at ${l!.left}, the first at ${labels[0]!.left}`).toBeLessThanOrEqual(1);
        expect(Math.abs(l!.left - l!.edge), `${path}: "${l!.text}" on the content column's left edge`).toBeLessThanOrEqual(1);
      }
    }
    await context.close();
  });
}
