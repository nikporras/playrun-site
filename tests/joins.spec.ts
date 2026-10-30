import { test, expect } from '@playwright/test';

/**
 * The pixel joins between levels: on every page, each boundary that changes colour is crossed by
 * two or three layered silhouettes (cloud banks from the sky, terrain into the highlights and down
 * to the footer). They are decoration: hidden from assistive tech, no pointer events, full bleed
 * with no sideways scroll, in flow so they cover no text or control, the band the colour of the
 * level before and the front layer the colour of what follows, so there is no seam. The back
 * layers drift with the scroll where scroll-driven animations exist, and never under reduced motion.
 */
const PAGES = ['/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/'];
const TEXT = 'main :is(p, li, dt, dd, h1, h2, h3, h4, a, button:not(.bug), img, picture, table, pre, input, textarea, label, .flag)';

for (const path of PAGES) {
  for (const width of [1440, 375]) {
    test(`${path} at ${width}px: every colour change is a pixel join, decorative, seamless, covering nothing`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(path);
      await page.waitForTimeout(300);
      const joins = page.locator('.join');
      expect(await joins.count()).toBeGreaterThanOrEqual(1);
      const info = await joins.evaluateAll(
        (els, text) =>
          els.map((el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const level = el.closest('.level')!;
            const bottom = el.classList.contains('join--bottom');
            const next = bottom ? (level.nextElementSibling ?? document.querySelector('footer'))! : level;
            const prev = bottom ? level : level.previousElementSibling!;
            const layers = Array.from(el.querySelectorAll('svg'));
            const covered = Array.from(document.querySelectorAll(text))
              .filter((t) => {
                const b = t.getBoundingClientRect();
                return b.width > 0 && b.height > 0 && b.left < r.right && b.right > r.left && b.top < r.bottom - 0.5 && b.bottom > r.top + 0.5;
              })
              .map((t) => `${t.tagName}: ${(t.textContent ?? '').trim().slice(0, 30)}`);
            return {
              kind: el.className.match(/join--(clouds|terrain)/)?.[1],
              hidden: el.getAttribute('aria-hidden'),
              pointer: cs.pointerEvents,
              position: cs.position,
              left: r.left,
              width: r.width,
              height: r.height,
              layers: layers.length,
              crisp: layers.every((s) => s.getAttribute('shape-rendering') === 'crispEdges' && s.getAttribute('aria-hidden') === 'true'),
              fills: layers.map((s) => getComputedStyle(s.querySelector('.join__fill')!).fill),
              highlights: el.querySelectorAll('.join__light').length,
              band: cs.backgroundColor,
              before: getComputedStyle(prev).backgroundColor,
              after: getComputedStyle(next).backgroundColor,
              covered,
              // the level made room: its padding on that side is at least the band
              room: parseFloat(getComputedStyle(level)[bottom ? 'paddingBottom' : 'paddingTop']),
            };
          }),
        TEXT,
      );
      for (const j of info) {
        expect(j.hidden, 'decorative').toBe('true');
        expect(j.pointer).toBe('none');
        expect(j.position).toBe('absolute');
        expect(j.left, 'full bleed').toBe(0);
        expect(j.width).toBe(width);
        expect(j.height).toBeGreaterThanOrEqual(width < 768 ? 64 : 128);
        expect(j.layers, 'two or three layers').toBeGreaterThanOrEqual(2);
        expect(j.layers).toBeLessThanOrEqual(3);
        expect(j.crisp, 'crisp pixels, hidden from assistive tech').toBe(true);
        expect(j.band, 'the band is the colour of the level before').toBe(j.before);
        expect(j.fills[j.fills.length - 1], 'the front layer is the colour of what follows').toBe(j.after);
        expect(new Set(j.fills).size, 'each layer its own tone').toBe(j.layers);
        if (j.kind === 'clouds') expect(j.highlights, 'lighter pixels on the cloud tops').toBeGreaterThan(0);
        expect(j.room, 'the level made room for the band').toBeGreaterThanOrEqual(j.height);
        expect(j.covered, 'covers no text or control').toEqual([]);
      }
      const kinds = new Set(info.map((j) => j.kind));
      if (path !== '/this-page-is-not-in-the-build/') expect(kinds.has('clouds'), 'clouds out of the sky').toBe(true);
      expect(kinds.has('terrain'), 'terrain into the highlight or down to the footer').toBe(true);
      // no straight edge is left between two fields: every level after the first that changes
      // colour from the one before starts with a join
      const seams = await page.locator('main .level').evaluateAll((levels) =>
        levels.slice(1).filter((l, i) => getComputedStyle(l).backgroundColor !== getComputedStyle(levels[i]).backgroundColor && !l.querySelector(':scope > .join--top')).map((l) => l.className),
      );
      expect(seams, 'no straight colour edge between levels').toEqual([]);
      expect(await page.locator('main .level').last().locator(':scope > .join--bottom').count(), 'terrain down to the footer').toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'no sideways scroll').toBeLessThanOrEqual(0);
    });
  }
}

test('the back layers drift with the scroll, the front layer stays, and nothing moves under reduced motion', async ({ page, browser }) => {
  await page.goto('/');
  // (an animation on a view timeline is idle, and left out of getAnimations, until its band is on screen)
  await page.locator('.join').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  const timelines = await page
    .locator('.join')
    .first()
    .evaluate((el) => Array.from(el.querySelectorAll('svg')).map((s) => s.getAnimations().map((a) => (a.timeline ? a.timeline.constructor.name : 'none'))));
  expect(timelines[0], 'the back layer is driven by the scroll').toEqual(['ViewTimeline']);
  expect(timelines[1], 'the middle layer too').toEqual(['ViewTimeline']);
  expect(timelines[2], 'the front layer stands on its level').toEqual([]);
  // a few dozen pixels at most, and only the vertical
  const range = await page
    .locator('.join__layer--back')
    .first()
    .evaluate((el) => {
      const k = (el.getAnimations()[0].effect as KeyframeEffect).getKeyframes() as { translate?: string }[];
      return k.map((f) => f.translate);
    });
  expect(range[0]).toMatch(/^0(px)? 28px$/);
  expect(range[range.length - 1]).toMatch(/^0(px)? -28px$/);
  const still = await browser.newContext({ reducedMotion: 'reduce' });
  const p2 = await still.newPage();
  await p2.goto('/');
  await p2.locator('.join').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await p2.waitForTimeout(300);
  expect(await p2.locator('.join svg').evaluateAll((els) => els.every((s) => s.getAnimations().length === 0)), 'still under reduced motion').toBe(true);
  await still.close();
});
