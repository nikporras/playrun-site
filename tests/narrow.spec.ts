import { test, expect } from '@playwright/test';

/**
 * The narrowest screens: every page, at 300 and 320px wide, scrolled from top to bottom with the
 * motion on and off, never scrolls sideways (once a live check reported an overflow at 317px).
 */
const PAGES = ['/', '/about/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/'];

for (const width of [300, 320]) {
  for (const motion of ['on', 'off'] as const) {
    test(`no sideways scroll at ${width}px on any page, motion ${motion}`, { tag: ['@viewports'] }, async ({ browser }) => {
      test.setTimeout(90_000);
      const context = await browser.newContext({ viewport: { width, height: 640 }, reducedMotion: motion === 'off' ? 'reduce' : 'no-preference' });
      const page = await context.newPage();
      for (const path of PAGES) {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        // (down the whole page, so everything that enters on the way has entered)
        await page.evaluate(async () => {
          for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 25));
          }
        });
        await page.waitForTimeout(200);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${path} at ${width}px`).toBeLessThanOrEqual(0);
        // and the header's switch within the screen
        const b = await page.locator('.motion').boundingBox();
        if (b) expect(b.x + b.width, `${path}: the Motion switch on screen`).toBeLessThanOrEqual(width);
      }
      await context.close();
    });
  }
}
