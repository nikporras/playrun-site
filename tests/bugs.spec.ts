import { test, expect, type Page } from '@playwright/test';

/**
 * The bugs to catch sit in empty field: never over text, never over a tile, on any page at any
 * width. Every visible bug's box is checked against every text block and tile on the page.
 */
const PAGES = ['/', '/skills', '/portfolio', '/about', '/contact', '/quality'];
const WIDTHS = [390, 768, 1024, 1440];

const TEXT = 'main :is(p, li, dt, dd, h1, h2, h3, h4, label, input, textarea, button:not(.bug), a, img, figure, .flag)';
const TILES = 'main :is(.stage, .row, .how__panel, .run__state, .plat__panel, .panel, .services__row, .group__head, .loop__step, .next__step, .pixtile, .tile, .hero__badge, .marquee, form, .who__figure, .hero__figure)';

async function settle(page: Page) {
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await page.evaluate(() => {
    document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in'));
    return Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    );
  });
}

for (const path of PAGES) {
  for (const width of WIDTHS) {
    test(`${path} at ${width}px: no bug sits over text or a tile`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await settle(page);
      await page.waitForTimeout(300);
      const overlaps = await page.evaluate(
        ([TEXT, TILES]) => {
          const box = (e: Element) => {
            const r = e.getBoundingClientRect();
            return { l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY, w: r.width, h: r.height };
          };
          const hits = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
          const bugs = [...document.querySelectorAll<HTMLElement>('.bug')].filter((b) => !b.hidden && b.offsetParent);
          const others = [...document.querySelectorAll<HTMLElement>(`${TEXT}, ${TILES}`)].filter((e) => !e.closest('.bug') && e.getClientRects().length);
          const out: string[] = [];
          for (const bug of bugs) {
            const bb = box(bug);
            for (const el of others) {
              const eb = box(el);
              if (eb.w === 0 || eb.h === 0) continue;
              if (hits(bb, eb)) out.push(`${bug.dataset.bug} over ${el.tagName}.${el.className.toString().split(' ')[0]} "${(el.textContent ?? '').trim().slice(0, 30)}"`);
            }
          }
          return { bugs: bugs.length, out: [...new Set(out)] };
        },
        [TEXT, TILES] as const,
      );
      expect(overlaps.bugs, 'the page has bugs to catch').toBeGreaterThan(0);
      expect(overlaps.out, `${path} at ${width}px`).toEqual([]);
    });
  }
}
