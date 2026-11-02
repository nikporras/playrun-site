import { test, expect } from '@playwright/test';

/**
 * The narrowest screens: every page, at 300 and 320px wide, scrolled from top to bottom with the
 * motion on and off, never scrolls sideways (once a live check reported an overflow at 317px), and
 * nothing is cut off at the side inside a box that clips it (the Bug Sweep canvas once was).
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
        // nothing cut off at the side inside a box that clips it either (the page would not scroll,
        // the content would just be lost): text, images, controls and the game's canvas
        const cut = await page.evaluate(() => {
          // (decorative or clipped by design: the joins, the bugs, the logo row's window, the glitch's
          // slices, the halo, the drum's faded neighbours offset to the right of the active row)
          const SKIP = '[aria-hidden="true"], .visually-hidden, .ticker__view, .join, .bug, .hero__glitch, .halo__clip, [data-shot], .hud, .dock, .tabbar, .drum__row:not([data-d="0"])';
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>('main :is(p, h1, h2, h3, h4, a, button, img, canvas, li, td, th, input, textarea, label, dt, dd, pre, code, span)')) {
            if ((el.tagName !== 'CANVAS' && el.closest(SKIP)) || !el.getClientRects().length) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              const cs = getComputedStyle(a);
              if (cs.overflowX === 'visible') continue;
              const c = a.getBoundingClientRect();
              if (c.height === 0) break;
              if (r.left < c.left - 1 || r.right > c.right + 1) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}" cut by ${a.tagName.toLowerCase()}.${String(a.className).split(' ')[0]}`);
              break;
            }
          }
          return out;
        });
        expect(cut, `${path} at ${width}px: nothing cut off at the side`).toEqual([]);
        // and the header's switch within the screen
        const b = await page.locator('.motion').boundingBox();
        if (b) expect(b.x + b.width, `${path}: the Motion switch on screen`).toBeLessThanOrEqual(width);
      }
      await context.close();
    });
  }
}
