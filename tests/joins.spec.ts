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
 * motion.
 */
const PAGES = ['/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/about/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/'];
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
            const layers = Array.from(el.querySelectorAll('svg'));
            // the art's highest pixel in the band (its top is see-through above it): what could cover
            // text is the clouds or the ground, not the empty top of the box (Home's curtain band
            // reaches over the hero's last line there)
            const artTop = Math.min(...Array.from(el.querySelectorAll('.join__fill'), (f) => Math.min(...Array.from((f.getAttribute('d') ?? '').matchAll(/V(\d+)/g), (m) => Number(m[1])).filter((v) => v < 144))));
            const scaleOf = Number(getComputedStyle(el.querySelector('.join__layer--front')!).scale) || 1;
            const drawnTop = r.top + artTop * scaleOf;
            const covered = Array.from(document.querySelectorAll(text))
              .filter((t) => {
                const b = t.getBoundingClientRect();
                // (the clipped content of a folded card on a phone is hidden, not covered; Home's row of
                // logos and its label are drawn above its clouds)
                if (top && t.closest('.ticker, .wall__head')) return false;
                // (with motion off the row of logos wraps and shows its first line only: the rest is
                // clipped by the row's window, hidden, not covered)
                const view = t.closest('.ticker__view')?.getBoundingClientRect();
                if (view && (b.top >= view.bottom - 0.5 || b.bottom <= view.top + 0.5)) return false;
                return b.width > 0 && b.height > 0 && getComputedStyle(t).visibility !== 'hidden' && b.left < r.right && b.right > r.left && b.top < r.bottom - 0.5 && b.bottom > drawnTop + 0.5;
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
            return {
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
              ticker: top && !!level.querySelector('.ticker') && Number(getComputedStyle(level.querySelector('.ticker')!).zIndex) > Number(cs.zIndex || 0),
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
        expect(j.layers, 'two or three layers').toBeGreaterThanOrEqual(2);
        expect(j.layers).toBeLessThanOrEqual(3);
        expect(j.crisp, 'crisp pixels, hidden from assistive tech').toBe(true);
        expect(j.band, 'the band is see-through: no box under the shapes').toBe(CLEAR);
        expect(j.bandImage).toBe('none');
        expect(j.fills[j.fills.length - 1], 'the front layer is the colour of what follows').toBe(j.after);
        expect(new Set(j.fills).size, 'each layer its own tone').toBe(j.layers);
        if (j.kind === 'clouds') expect(j.highlights, 'lighter pixels on the cloud tops').toBeGreaterThan(0);
        // (Home's curtain carries its label and the row of logos resting in its clouds, drawn above them; every other
        // level makes room for the whole band)
        if (j.ticker) expect(j.room, 'the label and the logos rest in the lower part of the band').toBeGreaterThanOrEqual(j.height * 0.25);
        else expect(j.room, 'the level made room for the band').toBeGreaterThanOrEqual(j.height);
        expect(j.covered, 'covers no text or control').toEqual([]);
        // the edge between the two colours is the front layer's own silhouette: no flat run longer
        // than 64px on a desktop (scaled down with the art on tablets and phones), and bumps at
        // least a third of the band tall
        expect(j.frontCols, 'a stepped front edge').toBeGreaterThan(60);
        expect(j.frontFlatPx, `no straight run along the front edge (${j.kind})`).toBeLessThanOrEqual(64 * j.scale);
        expect(j.frontRisePx, 'bumps at least a third of the band').toBeGreaterThanOrEqual(48 * j.scale);
      }
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

for (const width of [375, 1280, 1440, 1920]) {
  test(`the curtain's edge is the cloud line at ${width}px: mid-slide, the photo shows through above the front clouds`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 780 : 900 });
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
    // scroll until the top of Level 2 crosses the photo (in steps: on a phone the hero scrolls
    // before it pins by its foot, so the photo moves too)
    for (let k = 0; k < 4; k++) {
      const gap = await page.evaluate(() => {
        const i = document.querySelector('.hero__figure img')!.getBoundingClientRect();
        return document.querySelector('.wall')!.getBoundingClientRect().top - (i.top + i.height * 0.45);
      });
      await page.evaluate((d) => scrollBy(0, d), Math.round(gap));
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(300);
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

// On a screen scaled by a fraction (Windows at 125% or 150%, a page zoomed out, an Android phone at
// 2.625) the foot of a join falls inside a device pixel. Nothing may show there but the lower
// colour: not the darker back layers, not the page behind two fields meeting, not a grid line.
// Every join on every page, read from screenshots, row by row across its foot.
const SCALED: [number, number, number][] = [
  [1440, 900, 1.25],
  [1440, 900, 1.5],
  [1440, 900, 0.8],
  [375, 812, 2.625],
];
for (const [width, height, scale] of SCALED) {
  test(`no hairline at the foot of any join on a screen scaled by ${scale} (${width}x${height})`, { tag: ['@brand'] }, async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ deviceScaleFactor: scale, viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const n = await page.locator('.join').count();
      for (let j = 0; j < n; j++) {
        const join = page.locator('.join').nth(j);
        await join.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 300));
        await page.waitForTimeout(100);
        const { bottom, to } = await join.evaluate((el) => ({
          bottom: el.getBoundingClientRect().bottom,
          to: getComputedStyle(el.querySelector('.join__layer--front .join__fill')!).fill,
        }));
        const rgb = (to.match(/[\d.]+/g) ?? []).map(Number);
        // a strip across the middle of the screen, from 8px above the foot to 8px below it
        const png = await page.screenshot({ clip: { x: Math.round(width * 0.2), y: Math.floor(bottom) - 8, width: Math.round(width * 0.6), height: 16 } });
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
        const off: number[] = [];
        for (let row = 0; row < info.height; row++) {
          let n = 0;
          let all = 0;
          for (let x = 0; x < info.width; x += 3, all++) {
            const i = (row * info.width + x) * info.channels;
            if (Math.abs(data[i] - rgb[0]) + Math.abs(data[i + 1] - rgb[1]) + Math.abs(data[i + 2] - rgb[2]) > 12) n++;
          }
          off.push(n / all);
        }
        expect(Math.max(...off), `${path} join ${j}: every row at its foot is the lower colour (${off.map((v) => v.toFixed(2)).join(' ')})`).toBeLessThan(0.2);
      }
    }
    await context.close();
  });
}

// Wherever a join shows a gridded navy level, it shows that level's grid, in line with it: the sky
// between the bumps of a cloud join (on Home the band belongs to Level 2 and the sky behind it is
// the hero's own field, reaching under the band), and the navy front layer of a join into a gridded
// navy level (Home's numbers, Skills' closing level), up to the outline of its hills. Joins into
// the plain navy footer stay plain. Read from a screenshot of each band at rest: in its navy
// pixels, the column on a grid line (every 32px from the left edge, as the levels draw it) is a
// shade lighter than the column halfway between two lines, and on a front layer the rows where the
// level below draws its lines (half a cell down from its top, 2px into the band) are lighter too.
for (const [width, height] of [
  [1915, 910],
  [375, 812],
] as const) {
  test(`at ${width}px every join shows the grid of a gridded navy level beside it, on its sky and on its navy front layer, in line with the level`, { tag: ['@brand'] }, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const plain: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.addStyleTag({ content: '.bug, .bug__anchor, #hud, #dock, .tabbar { visibility: hidden !important; } html { scroll-behavior: auto !important; }' });
      const n = await page.locator('.join').count();
      for (let j = 0; j < n; j++) {
        const join = page.locator('.join').nth(j);
        // which side is a gridded navy level: the sky above, or the level below (its front layer)
        const sides = await join.evaluate((el) => {
          const gridded = (e: Element | null) => !!e && /linear-gradient/.test(getComputedStyle(e).backgroundImage + getComputedStyle(e, '::before').backgroundImage) && !e.matches('.footer');
          const level = el.closest('.level')!;
          const top = el.classList.contains('join--top');
          const above = top ? level.previousElementSibling : level;
          const below = top ? level : level.nextElementSibling;
          return { above: el.classList.contains('join--clouds') && gridded(above), below: !top && gridded(below) && !!below?.matches('.level--navy, .level--field') };
        });
        if (!sides.above && !sides.below) continue;
        await join.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight / 2));
        await page.waitForTimeout(150);
        const b = (await join.boundingBox())!;
        const png = await page.screenshot({ clip: { x: 0, y: Math.round(b.y), width, height: Math.round(b.height) } });
        const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
        const px = (x: number, y: number) => {
          const i = (y * info.width + x) * info.channels;
          return [data[i], data[i + 1], data[i + 2]];
        };
        // (navy, plain or under a grid line; never the cloud or ground tones)
        const navy = (c: number[]) => c[0] < 40 && c[1] < 50 && c[2] < 70;
        const sum = (c: number[]) => c[0] + c[1] + c[2];
        let pairs = 0;
        let lighter = 0;
        for (let y = 2; y < info.height - 2; y += 2) {
          for (let x = 32; x + 16 < info.width; x += 32) {
            const on = px(x, y);
            const off = px(x + 16, y);
            if (!navy(on) || !navy(off)) continue;
            pairs++;
            if (sum(on) - sum(off) >= 6) lighter++;
          }
        }
        const which = sides.below ? 'front layer' : 'sky';
        if (pairs < 20 || lighter / pairs < 0.8) plain.push(`${path} join ${j} (${which}): the grid's columns show in ${lighter} of ${pairs} navy points`);
        if (sides.below) {
          // the rows: the level below draws a line every 32px from 14px under the band's foot
          let rows = 0;
          let rowsLit = 0;
          for (let y = info.height - 18; y > 1; y -= 32) {
            for (let x = 8; x < info.width; x += 32) {
              const on = px(x, y);
              const off = px(x, y - 16 > 0 ? y - 16 : y + 16);
              if (!navy(on) || !navy(off)) continue;
              rows++;
              if (sum(on) - sum(off) >= 6) rowsLit++;
            }
          }
          if (rows < 3 || rowsLit / rows < 0.8) plain.push(`${path} join ${j} (front layer): the grid's rows line up in ${rowsLit} of ${rows} navy points`);
        }
      }
    }
    expect(plain).toEqual([]);
    await context.close();
  });
}
