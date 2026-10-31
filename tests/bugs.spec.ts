import { test, expect, type Page } from '@playwright/test';

/**
 * The bugs to catch sit in empty field: never over text, a tile, a button, a logo or the photo,
 * on any page at any width, anywhere along their walk. Every visible bug's box is sampled along
 * its walk and checked, with a small margin, against every text block and tile on the page.
 */
const PAGES = ['/', '/skills/', '/portfolio/', '/contact/', '/quality/'];
const WIDTHS = [390, 768, 1024, 1440];
const MARGIN = 6;

const TEXT = 'main :is(p, li, dt, dd, h1, h2, h3, h4, label, input, textarea, button:not(.bug), a, img, figure, picture, svg:not([aria-hidden="true"]), .flag)';
const TILES = 'main :is(.card, .row, .bring__panel, .run__state, .plat__panel, .panel, .stat, .drum, .stats__head, .ticker, .group__head, .step, .devtools, .report__body, .next__step, .pixtile, .tile, form, .hero__figure, .hero__ticket.is-in)';

async function settle(page: Page) {
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await page.evaluate(() => {
    document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in'));
    return Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.timeline instanceof DocumentTimeline) // (a scroll-driven join drift never finishes)
        .map((a) => a.finished.catch(() => null)),
    );
  });
}

for (const path of PAGES) {
  for (const width of WIDTHS) {
    test(`${path} at ${width}px: no bug walks over text or a tile`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await settle(page);
      await page.waitForTimeout(300);
      const result = await page.evaluate(
        ([TEXT, TILES, MARGIN]) => {
          type Box = { l: number; t: number; r: number; b: number; w: number; h: number };
          const box = (e: Element): Box => {
            const r = e.getBoundingClientRect();
            return { l: r.left + scrollX, t: r.top + scrollY, r: r.right + scrollX, b: r.bottom + scrollY, w: r.width, h: r.height };
          };
          const hits = (a: Box, b: Box) => a.l - MARGIN < b.r && a.r + MARGIN > b.l && a.t - MARGIN < b.b && a.b + MARGIN > b.t;
          const bugs = [...document.querySelectorAll<HTMLElement>('.bug')].filter((b) => !b.hidden && b.offsetParent);
          // (a row of the stats drum beyond the five on show is hidden, and does not count)
          const others = [...document.querySelectorAll<HTMLElement>(`${TEXT}, ${TILES}`)].filter((e) => !e.closest('.bug') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
          const boxes = others.map((e) => ({ e, b: box(e) })).filter(({ b }) => b.w > 0 && b.h > 0);
          const out: string[] = [];
          let walked = 0;
          for (const bug of bugs) {
            const level = bug.closest('.level');
            // Freeze the walk and look at nine points along it; a bug without a walk is one point.
            const walk = bug.getAnimations().find((a) => (a as CSSAnimation).animationName === 'bug-walk');
            const steps = walk ? 9 : 1;
            const duration = walk ? Number(walk.effect?.getComputedTiming().duration ?? 0) : 0;
            if (walk) {
              walk.pause();
              walked++;
            }
            for (let i = 0; i < steps; i++) {
              if (walk) walk.currentTime = (duration * i) / (steps - 1);
              const bb = box(bug);
              if (level) {
                const lb = box(level);
                if (bb.l < lb.l || bb.r > lb.r || bb.t < lb.t || bb.b > lb.b) out.push(`${bug.dataset.bug} leaves its level`);
              }
              for (const { e, b } of boxes) {
                if (hits(bb, b)) out.push(`${bug.dataset.bug} over ${e.tagName}.${e.className.toString().split(' ')[0]} "${(e.textContent ?? '').trim().slice(0, 30)}"`);
              }
            }
            if (walk) {
              walk.currentTime = 0;
              walk.play();
            }
          }
          return { bugs: bugs.length, walked, out: [...new Set(out)] };
        },
        [TEXT, TILES, MARGIN] as const,
      );
      expect(result.bugs, 'the page has bugs to catch').toBeGreaterThan(0);
      expect(result.walked, 'every bug walks').toBe(result.bugs);
      expect(result.out, `${path} at ${width}px`).toEqual([]);
    });
  }
}

test('every bug stands out on its level: its body and legs at least 3:1 against the field (WCAG non-text contrast), with a navy outline round its shape', async ({ page }) => {
  for (const path of [...PAGES, '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    const bugs = await page.locator('[data-bug]').evaluateAll((els) => {
      const lum = (c: string) => {
        const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
          const s = Number(v) / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a: string, b: string) => {
        const [x, y] = [lum(a), lum(b)];
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      // a level under the curtain paints its field as a gradient below its band: read that colour
      const fieldOf = (el: Element) => {
        const cs = getComputedStyle(el);
        return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : (cs.backgroundImage.match(/rgba?\([^)]*\)/)?.[0] ?? cs.backgroundColor);
      };
      return els.map((b) => {
        const level = b.closest('.level')!;
        const field = fieldOf(level);
        const body = getComputedStyle(b.querySelector('.bug__body .px-body')!).fill;
        const leg = getComputedStyle(b.querySelector('.bug__body .px-leg')!).fill;
        const ring = b.querySelectorAll('.bug__body .px-ring');
        return { id: (b as HTMLElement).dataset.bug, level: level.className.match(/level--(navy|blue|cyan|green|light|field)/)?.[1], body: ratio(body, field), leg: ratio(leg, field), ring: ring.length, ringFill: ring[0] ? getComputedStyle(ring[0]).fill : '' };
      });
    });
    // (the legal pages carry none)
    for (const b of bugs) {
      expect(b.body, `${path} ${b.id} body on ${b.level}`).toBeGreaterThanOrEqual(3);
      expect(b.leg, `${path} ${b.id} legs on ${b.level}`).toBeGreaterThanOrEqual(3);
      expect(b.ring, `${path} ${b.id} outlined`).toBeGreaterThan(0);
      expect(b.ringFill).toBe('rgb(12, 21, 42)');
    }
  }
});
