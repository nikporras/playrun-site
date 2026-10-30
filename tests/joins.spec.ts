import { test, expect } from '@playwright/test';
import sharp from 'sharp';

/**
 * The pixel joins between levels: on every page, each boundary that changes colour is crossed by
 * two or three layered silhouettes (cloud banks from the sky, terrain into and out of the bright
 * levels and down to the footer). They are decoration: hidden from assistive tech, no pointer
 * events, full bleed with no sideways scroll, in flow so they cover no text or control. The band is
 * transparent, so the upper level's own field shows above the shapes, and the front layer is the
 * colour of what follows, so there is no seam and no box. On Home the clouds ride on the top of
 * Level 2: the cloud line is the edge that slides over the pinned hero, the photo showing through.
 * The back layers drift with the scroll where scroll-driven animations exist, never under reduced
 * motion. On a phone each join is a mosaic of 16px blocks instead, flipping in once as it comes
 * into view; a still dithered fade under reduced motion.
 */
const PAGES = ['/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/'];
const TEXT = 'main :is(p, li, dt, dd, h1, h2, h3, h4, a, button:not(.bug), img, picture, table, pre, input, textarea, label, .flag)';
const CLEAR = 'rgba(0, 0, 0, 0)';

for (const path of PAGES) {
  for (const width of [1920, 1440, 768, 375]) {
    test(`${path} at ${width}px: every colour change is a pixel join, decorative, seamless, see-through, covering nothing, the front edge bumps all along`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(path);
      await page.waitForTimeout(300);
      const joins = page.locator('.join');
      expect(await joins.count()).toBeGreaterThanOrEqual(1);
      const info = await joins.evaluateAll(
        (els, text) => {
          // a level under the curtain paints its field as a gradient below the band: read that colour
          const fieldOf = (el: Element) => {
            const cs = getComputedStyle(el);
            return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : (cs.backgroundImage.match(/rgba?\([^)]*\)/)?.[0] ?? cs.backgroundColor);
          };
          return els.map((el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const level = el.closest('.level')!;
            const top = el.classList.contains('join--top');
            // a band at the foot of a level goes into what follows it; one at the top (the curtain) into its own level
            const next = top ? level : (level.nextElementSibling ?? document.querySelector('footer'))!;
            const layers = Array.from(el.querySelectorAll('svg.join__layer'));
            const covered = Array.from(document.querySelectorAll(text))
              .filter((t) => {
                const b = t.getBoundingClientRect();
                // (the clipped content of a folded card on a phone is hidden, not covered)
                return b.width > 0 && b.height > 0 && getComputedStyle(t).visibility !== 'hidden' && b.left < r.right && b.right > r.left && b.top < r.bottom - 0.5 && b.bottom > r.top + 0.5;
              })
              .map((t) => `${t.tagName}: ${(t.textContent ?? '').trim().slice(0, 30)}`);
            // the front layer's top edge, column by column, from its own path (M0 144 V.. H.. V.. H.. Z)
            const d = el.querySelector('.join__layer--front .join__fill')!.getAttribute('d') ?? '';
            const cols = Array.from(d.matchAll(/V(\d+)H(\d+)/g), (m) => 144 - Number(m[1]));
            let flat = 0;
            let run = 0;
            for (let c = 0; c < cols.length * 2; c++) {
              run = cols[c % cols.length] === cols[(c - 1 + cols.length) % cols.length] ? run + 1 : 1;
              flat = Math.max(flat, Math.min(run, cols.length));
            }
            const scale = Number(getComputedStyle(el.querySelector('.join__layer--front')!).scale) || 1;
            // the phone's mosaic: which blocks of each row show across the visible width
            const mosaic = el.querySelector('.join__mosaic')!;
            const blocks = Array.from(mosaic.querySelectorAll('rect')).map((b) => ({ x: Number(b.getAttribute('x')), y: Number(b.getAttribute('y')) }));
            const seen = Math.ceil(r.width / 16);
            const rowsShown = [0, 16, 32, 48, 64].map((y) => blocks.filter((b) => b.y === y && b.x / 16 < seen).length);
            return {
              mosaic: getComputedStyle(mosaic).display,
              layersShown: layers.filter((s) => !s.classList.contains('join__mosaic') && s.getClientRects().length > 0).length,
              mosaicFill: mosaic.querySelector('rect') ? getComputedStyle(mosaic.querySelector('rect')!).fill : '',
              mosaicCrisp: mosaic.getAttribute('shape-rendering') === 'crispEdges',
              mosaicHeight: mosaic.getBoundingClientRect().height,
              rowsShown,
              seen,
              signature: blocks.map((b) => `${b.x},${b.y}`).join(' '),
              frontFlatPx: flat * 8 * scale,
              frontRisePx: (Math.max(...cols) - Math.min(...cols)) * scale,
              frontCols: cols.length,
              scale,
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
              bandImage: cs.backgroundImage,
              after: fieldOf(next),
              covered,
              room: parseFloat(getComputedStyle(level)[top ? 'paddingTop' : 'paddingBottom']),
            };
          });
        },
        TEXT,
      );
      for (const j of info) {
        expect(j.hidden, 'decorative').toBe('true');
        expect(j.pointer).toBe('none');
        expect(j.position).toBe('absolute');
        expect(j.left, 'full bleed').toBe(0);
        expect(j.width).toBe(width);
        expect(j.height).toBeGreaterThanOrEqual(width < 768 ? 64 : width < 1024 ? 100 : 128);
        expect(j.band, 'the band is see-through: no box under the shapes').toBe(CLEAR);
        expect(j.bandImage).toBe('none');
        expect(j.room, 'the level made room for the band').toBeGreaterThanOrEqual(j.height);
        expect(j.covered, 'covers no text or control').toEqual([]);
        if (width < 768) {
          // a phone: the mosaic instead of the layers, blocks of the next level's colour filling the
          // band row by row, each row a mix of both colours, so the edge is never a straight line
          expect(j.mosaic, 'the mosaic on a phone').toBe('block');
          expect(j.layersShown, 'no clouds or terrain on a phone').toBe(0);
          expect(j.mosaicCrisp).toBe(true);
          expect(j.mosaicHeight, 'the mosaic fills the band').toBe(j.height);
          expect(j.mosaicFill, 'the blocks are the colour of what follows').toBe(j.after);
          for (const [r, n] of j.rowsShown.entries()) {
            expect(n, `row ${r + 1} has blocks of the next colour`).toBeGreaterThan(0);
            expect(n, `row ${r + 1} keeps gaps of the colour above`).toBeLessThan(j.seen);
          }
          expect(j.rowsShown[4], 'the next colour thickens row by row').toBeGreaterThan(j.rowsShown[0]);
          continue;
        }
        expect(j.mosaic, 'no mosaic above a phone').toBe('none');
        expect(j.layers, 'two or three layers').toBeGreaterThanOrEqual(2);
        expect(j.layers).toBeLessThanOrEqual(3);
        expect(j.crisp, 'crisp pixels, hidden from assistive tech').toBe(true);
        expect(j.fills[j.fills.length - 1], 'the front layer is the colour of what follows').toBe(j.after);
        expect(new Set(j.fills).size, 'each layer its own tone').toBe(j.layers);
        if (j.kind === 'clouds') expect(j.highlights, 'lighter pixels on the cloud tops').toBeGreaterThan(0);
        // the edge between the two colours is the front layer's own silhouette: no flat run longer
        // than 64px on a desktop (scaled down with the art on tablets and phones), and bumps at
        // least a third of the band tall
        expect(j.frontCols, 'a stepped front edge').toBeGreaterThan(60);
        expect(j.frontFlatPx, `no straight run along the front edge (${j.kind})`).toBeLessThanOrEqual(64 * j.scale);
        expect(j.frontRisePx, 'bumps at least a third of the band').toBeGreaterThanOrEqual(48 * j.scale);
      }
      expect(new Set(info.map((j) => j.signature)).size, 'no two mosaics the same').toBe(info.length);
      const kinds = new Set(info.map((j) => j.kind));
      if (path !== '/this-page-is-not-in-the-build/') expect(kinds.has('clouds'), 'clouds out of the sky').toBe(true);
      expect(kinds.has('terrain'), 'terrain into the bright levels or down to the footer').toBe(true);
      // no straight edge between two colours: wherever a level's colour differs from the one
      // before, the one before carries a join at its foot or this one carries it at its top; and
      // clouds come only out of the navy sky
      const seams = await page.locator('main .level').evaluateAll((levels) => {
        const navy = 'rgb(12, 21, 42)';
        const fieldOf = (el: Element) => {
          const cs = getComputedStyle(el);
          return cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : (cs.backgroundImage.match(/rgba?\([^)]*\)/)?.[0] ?? cs.backgroundColor);
        };
        const out: string[] = [];
        levels.slice(1).forEach((l, i) => {
          const prev = levels[i];
          if (fieldOf(l) === fieldOf(prev)) return;
          const join = prev.querySelector(':scope > .join--bottom') ?? l.querySelector(':scope > .join--top');
          if (!join) out.push(`straight edge above ${l.className}`);
          else if (join.classList.contains('join--clouds') !== (fieldOf(prev) === navy)) out.push(`wrong kind above ${l.className}`);
        });
        const last = levels[levels.length - 1];
        const footer = document.querySelector('footer')!;
        if (fieldOf(last) !== fieldOf(footer) && !last.querySelector(':scope > .join--bottom')) out.push('straight edge above the footer');
        return out;
      });
      expect(seams).toEqual([]);
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

test('on a phone each mosaic waits off screen, flips in block by block within about half a second as it arrives, once; still under reduced motion', async ({ page, browser }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/skills/');
  await page.waitForTimeout(300);
  const last = page.locator('.join').last();
  // far below: armed, every block waiting
  expect(await last.evaluate((el) => el.classList.contains('is-armed') && !el.classList.contains('is-flipped'))).toBe(true);
  expect(await last.locator('.join__block').first().evaluate((b) => getComputedStyle(b).opacity)).toBe('0');
  // the moments are spread over half a second, in no simple order
  const delays = await last.locator('.join__block').evaluateAll((bs) => bs.map((b) => parseFloat((b as SVGElement).style.getPropertyValue('--d'))));
  expect(Math.max(...delays)).toBeLessThanOrEqual(520);
  expect(Math.max(...delays) - Math.min(...delays)).toBeGreaterThan(250);
  expect(delays.slice(1).some((d, i) => d < delays[i]), 'a random order').toBe(true);
  await last.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(last).toHaveClass(/is-flipped/);
  await page.waitForTimeout(700);
  expect(await last.locator('.join__block').evaluateAll((bs) => bs.every((b) => getComputedStyle(b).opacity === '1')), 'every block in').toBe(true);
  // once: scrolled away and back it stays in
  await page.evaluate(() => scrollTo(0, 0));
  await last.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  expect(await last.locator('.join__block').evaluateAll((bs) => bs.every((b) => getComputedStyle(b).opacity === '1'))).toBe(true);
  const still = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 375, height: 812 } });
  const p2 = await still.newPage();
  await p2.goto('/skills/');
  expect(await p2.locator('.join.is-armed').count(), 'nothing waits under reduced motion').toBe(0);
  expect(await p2.locator('.join').last().locator('.join__block').evaluateAll((bs) => bs.every((b) => getComputedStyle(b).opacity === '1')), 'the dithered fade simply stands').toBe(true);
  await still.close();
});

for (const width of [1280, 1440, 1920]) {
  test(`the curtain's edge is the cloud line at ${width}px: mid-slide, the photo shows through above the front clouds`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.waitForTimeout(1500);
    const wall = page.locator('.wall');
    const band = wall.locator(':scope > .join--top');
    await expect(band).toHaveCount(1);
    expect(await band.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(CLEAR);
    // the level paints its field below the band only
    const paint = await wall.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.backgroundColor, image: cs.backgroundImage, size: cs.backgroundSize, position: cs.backgroundPosition, repeat: cs.backgroundRepeat };
    });
    expect(paint.color).toBe(CLEAR);
    expect(paint.image).toContain('linear-gradient');
    expect(paint.repeat).toBe('no-repeat');
    // scroll until the top of Level 2 crosses the photo
    const img = (await page.locator('.hero__figure img').boundingBox())!;
    const wallTop = await wall.evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await page.evaluate((y) => scrollTo(0, y), wallTop - (img.y + img.height * 0.45));
    await page.waitForTimeout(500);
    const now = await page.evaluate(() => {
      const w = document.querySelector('.wall')!.getBoundingClientRect();
      const i = document.querySelector('.hero__figure img')!.getBoundingClientRect();
      const front = document.querySelector('.wall > .join--top .join__layer--front')!.getBoundingClientRect();
      return { wallTop: w.top, imgLeft: i.left, imgRight: i.right, imgTop: i.top, imgBottom: i.bottom, frontTop: front.top };
    });
    expect(now.wallTop, 'Level 2 is across the photo').toBeGreaterThan(now.imgTop + 20);
    expect(now.wallTop).toBeLessThan(now.imgBottom - 60);
    // just above the front cloud layer, over the figure: not the level's blue, not the band of any
    // colour, but whatever is behind (the photo or the hero)
    const x = Math.round((now.imgLeft + now.imgRight) / 2);
    const samples: number[][] = [];
    for (const y of [Math.round(now.wallTop + 4), Math.round(now.wallTop + 10), Math.round(now.frontTop - 6)]) {
      const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
      const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      samples.push([data[0], data[1], data[2]]);
    }
    for (const [r, g, b] of samples) {
      expect(`${r},${g},${b}`, 'not the blue field').not.toBe('81,108,179');
      expect(Math.abs(r - 81) + Math.abs(g - 108) + Math.abs(b - 179), 'nothing like the blue field').toBeGreaterThan(30);
    }
    // and the photo is what shows: at least one sample is a grey of the portrait, not the navy sky
    expect(samples.some(([r, g, b]) => Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 60), 'the portrait shows through').toBe(true);
  });
}
