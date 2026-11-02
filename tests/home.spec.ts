import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path, { join } from 'node:path';

const require = createRequire(import.meta.url);

// The hero's foot as the hero's exit measures it (the hero pins at its top, or by its bottom edge
// when it is taller than the screen), and a scroll just past the line where the name glitches.
const footOf = (page: Page) =>
  page.locator('.hero').evaluate((el: HTMLElement) => Math.min(innerHeight, (parseFloat(getComputedStyle(el).top) || 0) + el.offsetHeight));
const pastBreak = async (page: Page) => {
  const foot = await footOf(page);
  const mark = await page.locator('.wall__trip[data-trip="glitch"]').evaluate((el) => el.getBoundingClientRect().top + scrollY);
  return Math.round(mark - foot + 60);
};

/**
 * Routes that are planned but not built yet. Links to them are reported, not failed,
 * so the suite stays green while the site is built page by page. Remove entries as pages land.
 */
const PLANNED_ROUTES: string[] = [];

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

/** Wait for the load sequence and any running CSS animations to finish. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.timeline instanceof DocumentTimeline) // (a scroll-driven join drift never finishes)
        .map((a) => a.finished.catch(() => null)),
    ),
  );
}

async function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}

test.describe('Home', () => {
  test('loads with one h1 and no console errors or failed requests', { tag: ['@pages', '@console'] }, async ({ page }) => {
    const errors = await collectErrors(page);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/PlayRun/);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(/Nicolás\s*Porras/);
    await expect(page.locator('.hero__post')).toHaveText('Founder & Lead QA, PlayRun');
    await expect(page.locator('.hero__role'), 'the role line is gone').toHaveCount(0);
    // the post sits between the name and the paragraph
    const tops = await page.locator('h1, .hero__post, .hero__value').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    await expect(page.locator('.hero__value')).toHaveText(
      "I'm a game QA tester in London. I've tested console, PC and VR games since 2021, and led QA teams at nDreams and Historic VR. More about me",
    );
    await page.waitForLoadState('networkidle');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('every internal link resolves', { tag: ['@links'] }, async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page.locator('a[href]').evaluateAll((as) =>
      (as as HTMLAnchorElement[]).map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/')),
    );
    const unique = [...new Set(hrefs.map((h) => h.split('#')[0]).filter(Boolean))];
    expect(unique.length).toBeGreaterThan(0);
    const planned: string[] = [];
    for (const href of unique) {
      const res = await request.get(href);
      if (res.status() === 404 && PLANNED_ROUTES.includes(href)) {
        planned.push(href);
        continue;
      }
      expect(res.status(), `${href} answered ${res.status()}`).toBe(200);
    }
    if (planned.length) test.info().annotations.push({ type: 'planned routes not built yet', description: planned.join(', ') });
  });

  test('has no accessibility violations (axe)', { tag: ['@a11y'] }, async ({ page }) => {
    await page.goto('/');
    await settle(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('headings are in order and images have alt text', { tag: ['@a11y'] }, async ({ page }) => {
    await page.goto('/');
    const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1], `heading jump at index ${i}: ${levels.join(',')}`).toBeLessThanOrEqual(1);
    }
    const missingAlt = await page.locator('img:not([alt])').count();
    expect(missingAlt).toBe(0);
  });

  test('keyboard focus is visible on the first interactive element', { tag: ['@a11y'] }, async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip');
    await expect(skip).toBeFocused();
    const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  for (const [width, height] of [
    [375, 780],
    [360, 780],
    [768, 1024],
  ] as const) {
    test(`on a phone or a tablet (${width}px) the pages are in a bottom bar: About, Skills, Games, Quality, Contact as real links with pixel icons and labels of 16px, the current page in green, at least 44px tall with a visible focus; the header keeps the logo, the way home, and has no Menu`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      // Home is the logo: on Home no item in the bar is current
      await expect(page.locator('.tabbar [aria-current]')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'PlayRun, home' })).toHaveAttribute('href', '/');
      await page.goto('/portfolio/');
      await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
      await expect(page.locator('.header__nav')).toBeHidden();
      await expect(page.locator('.header__brand')).toBeVisible();
      const bar = page.getByRole('navigation', { name: 'Site' });
      await expect(bar).toHaveCount(1);
      const links = bar.getByRole('link');
      await expect(links).toHaveText(['About', 'Skills', 'Games', 'Quality', 'Contact']);
      expect(await links.evaluateAll((els) => els.map((a) => a.getAttribute('href')))).toEqual(['/about/', '/skills/', '/portfolio/', '/quality/', '/contact/']);
      await expect(bar.getByRole('link', { name: 'Games' })).toHaveAttribute('aria-current', 'page');
      await expect(bar.locator('[aria-current]')).toHaveCount(1);
      const box = (await bar.boundingBox())!;
      expect(box.x).toBe(0);
      expect(box.width).toBe(width);
      expect(box.y + box.height, 'on the foot of the screen').toBe(height);
      const cells = await links.evaluateAll((els) =>
        els.map((a) => {
          const r = a.getBoundingClientRect();
          const label = a.querySelector('.tabbar__label') as HTMLElement;
          return { h: r.height, w: r.width, labelW: label.getBoundingClientRect().width, size: parseFloat(getComputedStyle(label).fontSize), color: getComputedStyle(a).color, icon: a.querySelectorAll('svg path').length, current: a.hasAttribute('aria-current') };
        }),
      );
      for (const c of cells) {
        expect(c.h, 'a 44px target').toBeGreaterThanOrEqual(44);
        expect(c.size, 'a label of 16px').toBe(16);
        expect(c.labelW, 'the whole label fits its cell').toBeLessThanOrEqual(c.w);
        expect(c.icon, 'a pixel icon').toBe(1);
        expect(c.color).toBe(c.current ? 'rgb(103, 193, 140)' : 'rgb(170, 179, 197)');
      }
      // the counter takes the right end, after the five
      const pill = (await page.locator('.score__pill').boundingBox())!;
      expect(pill.x + pill.width).toBe(width);
      expect(pill.y).toBeGreaterThanOrEqual(box.y);
      for (const c of await links.evaluateAll((els) => els.map((a) => a.getBoundingClientRect().right))) expect(c).toBeLessThanOrEqual(pill.x + 1);
      // focus: a ring on the link
      await page.keyboard.press('Tab');
      await links.first().focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(links.first()).toBeFocused();
      expect(await links.first().evaluate((a) => getComputedStyle(a).outlineStyle)).not.toBe('none');
      // a real link: Quality loads with Quality marked
      await bar.getByRole('link', { name: 'Quality' }).click();
      await expect(page).toHaveURL(/\/quality\/$/);
      await expect(page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Quality' })).toHaveAttribute('aria-current', 'page');
    });
  }

  test('on a phone the bottom bar covers nothing: the last button and the footer end above it and the ship, the achievement toast rises above it, and it is there without script and under reduced motion', async ({ page, browser }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(300);
    const top = (await page.locator('.tabbar').boundingBox())!.y;
    const ship = (await page.locator('.hud__runner').boundingBox())!;
    expect(ship.y + ship.height, 'the ship rides on the bar').toBeLessThanOrEqual(top + 1);
    const last = (await page.locator('.footer__legal').boundingBox())!;
    expect(last.y + last.height, 'the footer ends above the ship').toBeLessThanOrEqual(ship.y);
    const button = (await page.getByRole('link', { name: 'Get in touch' }).last().boundingBox())!;
    expect(button.y + button.height).toBeLessThanOrEqual(ship.y);
    // a toast: above the bar and the ship, never over them
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('playrun:achieve', { detail: 'selftest' })));
    const toast = page.locator('[data-toast]');
    await expect(toast).toHaveClass(/is-in/);
    await page.waitForTimeout(400);
    const t = (await toast.boundingBox())!;
    expect(t.y + t.height).toBeLessThanOrEqual(ship.y);
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.x + t.width).toBeLessThanOrEqual(375);
    // without script and under reduced motion the pages are still in the bar (no counter, no line)
    for (const options of [{ javaScriptEnabled: false }, { reducedMotion: 'reduce' as const }]) {
      const context = await browser.newContext({ ...options, viewport: { width: 375, height: 780 } });
      const p = await context.newPage();
      await p.goto('/skills/');
      await expect(p.getByRole('navigation', { name: 'Site' }).getByRole('link')).toHaveText(['About', 'Skills', 'Games', 'Quality', 'Contact']);
      // (under the device's reduced motion the games wait, hidden, until the Motion switch is on)
      if (options.reducedMotion) await expect(p.locator('.hud__runner')).toBeHidden();
      else await expect(p.locator('.hud__runner')).toHaveCount(1);
      const links = await p.locator('.tabbar__link').evaluateAll((els) => els.map((a) => a.getBoundingClientRect().right));
      expect(links[4], 'the five take the whole bar').toBeGreaterThan(370);
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const legal = (await p.locator('.footer__legal').boundingBox())!;
      expect(legal.y + legal.height).toBeLessThanOrEqual((await p.locator('.tabbar').boundingBox())!.y);
      await context.close();
    }
  });

  test('the hero is pinned and the next level slides over it; it scrolls away under reduced motion', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const hero = page.locator('.hero');
    expect(await hero.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    const figure = page.locator('.hero__figure img');
    await expect(figure).toBeVisible();
    expect(await page.locator('main img:not([alt=""]):not(.wall__logo)').count(), 'the photo appears once on the site').toBe(1);
    // the cutout fades at the bottom; the halo behind it is pixel bands on an 8px grid that fade
    // with it, so neither has a straight edge
    const mask = await page.locator('.hero__figure').evaluate((el) => {
      const pic = el.querySelector('picture')!;
      const cs = getComputedStyle(pic) as CSSStyleDeclaration & { webkitMaskImage?: string };
      return { mask: cs.maskImage || cs.webkitMaskImage || '', composite: (cs as CSSStyleDeclaration & { maskComposite?: string }).maskComposite || '', figMask: getComputedStyle(el).maskImage, glow: getComputedStyle(el, '::before').backgroundImage };
    });
    // the vertical fade (short at the top, eased over the last third) meets an ellipse, so the
    // lower sides and the bottom corners fade too and no straight edge is left
    expect(mask.mask).toMatch(/linear-gradient\((to bottom, )?rgb\(0, 0, 0\) 0%, rgb\(0, 0, 0\) 68%, rgba\(0, 0, 0, 0\.9\) 75%/);
    expect(mask.mask, 'no fade at the top: the headset is whole in the picture').not.toMatch(/rgba\(0, 0, 0, 0\) 0%/);
    expect(mask.mask).toContain('radial-gradient(');
    expect(mask.mask.match(/gradient\(/g)?.length).toBe(2);
    expect(mask.composite, 'the two masks intersect').toMatch(/^intersect/);
    expect(mask.figMask, 'the figure itself is not masked, so the halo is not cut at its edges').toBe('none');
    expect(mask.glow, 'no soft gradient glow any more').toBe('none');
    // the halo: one shown a screen, behind the photo, wider than it, hard 8px steps in the brand
    // cyan and blue at falling opacity, fading row by row and ending at the photo's foot; centred on
    // the photo, and what shows of it centred too (never cut by the screen on one side only)
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [1280, 720],
      [768, 1024],
      [375, 812],
      [360, 740],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      const halo = await page.locator('.hero__figure').evaluate((el) => {
        const shown = [...el.querySelectorAll<SVGSVGElement>('svg.halo')].filter((s) => s.getClientRects().length);
        const svg = shown[0];
        const vb = svg.viewBox.baseVal;
        const paths = [...svg.querySelectorAll('path')];
        const img = el.querySelector('img')!.getBoundingClientRect();
        const r = svg.getBoundingClientRect();
        const lastRow = Math.max(...paths.flatMap((p) => [...p.getAttribute('d')!.matchAll(/M-?\d+ (\d+)h/g)].map((m) => Number(m[1]))));
        const k = r.width / vb.width;
        let minX = Infinity;
        let maxX = -Infinity;
        for (const p of paths) for (const m of p.getAttribute('d')!.matchAll(/M(-?\d+) \d+h(\d+)/g)) {
          minX = Math.min(minX, Number(m[1]));
          maxX = Math.max(maxX, Number(m[1]) + Number(m[2]));
        }
        const clipBox = svg.parentElement!.getBoundingClientRect();
        return {
          contained: r.left + minX * k >= clipBox.left - 0.5 && r.left + maxX * k <= clipBox.right + 0.5,
          count: shown.length,
          crisp: svg.getAttribute('shape-rendering'),
          hidden: svg.getAttribute('aria-hidden'),
          cell: r.width / vb.width,
          integers: paths.every((p) => /^(M-?\d+ \d+h\d+v1h-\d+z)+$/.test(p.getAttribute('d')!)),
          fills: [...new Set(paths.map((p) => p.getAttribute('fill')))],
          opacities: paths.map((p) => Number(p.getAttribute('fill-opacity'))),
          wider: r.width / img.width,
          behind: svg.compareDocumentPosition(el.querySelector('picture')!) & Node.DOCUMENT_POSITION_FOLLOWING,
          endsAt: r.top + ((lastRow + 1) * r.height) / vb.height - img.bottom,
          centre: (r.left + r.right) / 2 - (img.left + img.right) / 2,
          clip: (() => {
            const c = svg.parentElement!.getBoundingClientRect();
            return { centre: (c.left + c.right) / 2 - (img.left + img.right) / 2, overflow: getComputedStyle(svg.parentElement!).overflow, right: c.right };
          })(),
        };
      });
      expect(halo.count, `one halo at ${width}`).toBe(1);
      expect(halo.crisp).toBe('crispEdges');
      expect(halo.hidden).toBe('true');
      expect(halo.cell, '8px steps').toBe(8);
      expect(halo.integers, 'whole cells only').toBe(true);
      expect(halo.fills).toEqual(['#516CB3', '#5495C6', '#56BDDA']);
      expect(Math.max(...halo.opacities)).toBeLessThanOrEqual(0.25);
      expect(new Set(halo.opacities).size, 'falling opacity, faded in steps').toBeGreaterThan(6);
      expect(halo.wider).toBeGreaterThan(1.5);
      expect(halo.behind, 'drawn before the photo, so behind it').toBeTruthy();
      expect(halo.endsAt, "it ends with the photo's fade").toBeLessThanOrEqual(1);
      expect(Math.abs(halo.centre), `centred on the photo at ${width}`).toBeLessThanOrEqual(1);
      expect(halo.clip.overflow).toBe('hidden');
      expect(halo.contained, `every band inside the clip at ${width}: no straight edge`).toBe(true);
      expect(Math.abs(halo.clip.centre), `what shows is centred on the photo at ${width}`).toBeLessThanOrEqual(1);
      expect(halo.clip.right, 'and never cut by the edge of the screen').toBeLessThanOrEqual(width + 1);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    // the photo keeps its full height on screen at every desktop width (nothing is cut off above the hero's foot)
    for (const width of [768, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      const fit = await page.evaluate(() => {
        const hero = document.querySelector('.hero')!.getBoundingClientRect();
        const fig = document.querySelector('.hero__figure')!.getBoundingClientRect();
        return { heroBottom: hero.bottom, figBottom: fig.bottom, figTop: fig.top, heroTop: hero.top };
      });
      expect(fit.figBottom, `${width}: the figure ends inside the hero`).toBeLessThanOrEqual(fit.heroBottom + 1);
      expect(fit.figTop, `${width}: the figure starts inside the hero`).toBeGreaterThanOrEqual(fit.heroTop - 1);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    // the photo is centred on the text block, at 1280, 1440 and 1920
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => {
        const head = document.querySelector('.hero__head')!.getBoundingClientRect();
        const fig = document.querySelector('.hero__figure')!.getBoundingClientRect();
        // the text's own right edge, not the block's: the lines are shorter than the column
        const textRight = Math.max(
          ...[...document.querySelectorAll('.hero__head h1, .hero__head p, .hero__head a')].map((el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            return r.getBoundingClientRect().right;
          }),
        );
        return { head: (head.top + head.bottom) / 2, fig: (fig.top + fig.bottom) / 2, figRight: fig.right, headRight: textRight, figLeft: fig.left };
      });
      expect(Math.abs(m.head - m.fig), `${width}: the photo's middle sits on the text block's middle`).toBeLessThanOrEqual(24);
      expect(m.figLeft, `${width}: the photo stays clear of the text`).toBeGreaterThanOrEqual(m.headRight - 8);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => {
      const hero = document.querySelector('.hero')!.getBoundingClientRect();
      const next = document.querySelector('.wall')!.getBoundingClientRect();
      return { heroTop: hero.top, heroBottom: hero.bottom, nextTop: next.top };
    });
    expect(after.heroTop, 'the hero stays at the top of the screen').toBeGreaterThanOrEqual(-1);
    expect(after.nextTop, 'the next level has climbed over the hero').toBeLessThan(after.heroBottom);

    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const quiet = await context.newPage();
    await quiet.goto('/');
    expect(await quiet.locator('.hero').evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky');
    await context.close();
  });

  // The glitch: the name glitches each time the hero scrolls away and back, until it is tracked;
  // a card asks to track it and stays until it is answered.
  const SIZES = [
    [1440, 900],
    [768, 1024],
    [375, 812],
  ] as const;
  // (scrolled just past the line where it plays: the clouds a little way over the hero's foot)
  const toGlitch = async (page: Page) => {
    await page.evaluate(async (y) => window.scrollTo(0, y), await pastBreak(page));
  };
  // (and back above it, to the name)
  const backUp = async (page: Page) => {
    await page.evaluate(async (y) => window.scrollTo(0, y - 120), await pastBreak(page));
  };
  // (the glitch never starts within 1.2 s of the last one)
  const rest = (page: Page) => page.waitForTimeout(1300);
  const openHome = async (page: Page, width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
  };
  const box = async (page: Page, sel: string) => (await page.locator(sel).boundingBox())!;
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  // Records the glitch frame by frame: when the copy shows, and how far each slice jumps.
  const record = (page: Page) =>
    page.evaluate(() => {
      const copy = document.querySelector<HTMLElement>('[data-glitch]')!;
      const slices = [...copy.querySelectorAll<HTMLElement>('.hero__slice')];
      const frames: { t: number; on: boolean; dx: number }[] = [];
      (window as unknown as { __glitch: typeof frames }).__glitch = frames;
      const t0 = performance.now();
      const tick = () => {
        const shown = getComputedStyle(copy).display !== 'none' && Number(getComputedStyle(slices[0]).opacity) > 0.5;
        const dx = Math.max(...slices.map((s) => Math.abs(new DOMMatrix(getComputedStyle(s).transform).m41)));
        frames.push({ t: performance.now() - t0, on: shown, dx: shown ? dx : 0 });
        if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  const frames = (page: Page) => page.evaluate(() => (window as unknown as { __glitch: { t: number; on: boolean; dx: number }[] }).__glitch);

  for (const [width, height] of SIZES) {
    test(`the glitch (${width}x${height}): as the hero scrolls away the name glitches in two quick bursts over about 0.7 s, slices of a hidden copy jumping well sideways with a strong cyan and pink split, never more than three flashes a second, while the heading never moves; the card asks to track it, clear of the pill, the bar and the HUD, without taking the focus, and stays`, async ({ page }) => {
      test.setTimeout(45_000);
      await openHome(page, width, height);
      const h1 = page.locator('h1');
      const before = await h1.boundingBox();
      const copy = page.locator('[data-glitch]');
      await expect(copy).toHaveAttribute('aria-hidden', 'true');
      await expect(copy).toBeHidden();
      const card = page.locator('[data-glitch-card]');
      await expect(card).toBeHidden();
      // above the line nothing happens
      await backUp(page);
      await page.waitForTimeout(400);
      await expect(copy).toBeHidden();
      // past it: the slices, four of them, each its own band of the name, jumping sideways
      await record(page);
      await toGlitch(page);
      await expect(copy).toBeVisible();
      const slices = await copy.locator('.hero__slice').evaluateAll((els) =>
        els.map((e) => {
          const cs = getComputedStyle(e);
          return { clip: cs.clipPath, shadow: cs.textShadow, dx: (() => {
            // (the jump, resolved: a probe's margin set from it)
            const probe = document.createElement('i');
            probe.style.marginLeft = 'var(--dx)';
            e.append(probe);
            const v = Math.abs(parseFloat(getComputedStyle(probe).marginLeft));
            probe.remove();
            return v;
          })(), text: e.textContent!.replace(/\s+/g, ' ').trim(), running: e.getAnimations().length };
        }),
      );
      expect(slices).toHaveLength(4);
      const [lo, hi] = width < 768 ? [7, 12] : [12, 20];
      for (const s of slices) {
        expect(s.clip).toMatch(/^inset\(/);
        // a strong split: the cyan and the pink edges at least 3px out
        expect(s.shadow, 'a cyan and a pink edge').toMatch(/rgb\(86, 189, 218\) -[3-9]px 0px 0px.*rgb\(255, 95, 162\) [3-9]px 0px 0px/);
        expect(s.dx, `a jump of ${lo} to ${hi}px`).toBeGreaterThanOrEqual(lo);
        expect(s.dx).toBeLessThanOrEqual(hi);
        expect(s.text).toBe('Nicolás Porras');
        expect(s.running).toBeGreaterThan(0);
      }
      expect(new Set(slices.map((s) => s.clip)).size, 'each slice its own band').toBe(4);
      // the real heading never moves or changes
      await expect(h1).toHaveText(/Nicolás\s*Porras/);
      await expect(h1).toHaveCSS('opacity', '1');
      const during = await h1.boundingBox();
      expect(during!.x).toBe(before!.x);
      // over in about 0.7 s, then the card, the focus left where it was
      await expect(copy).toBeHidden({ timeout: 1200 });
      await expect(card).toBeVisible();
      await expect(card).toHaveClass(/is-in/);
      await expect(card.locator('[data-glitch-text]')).toHaveText('Glitch on the name. Track it?');
      await expect(page.getByRole('button', { name: 'Track the bug' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ignore' })).toBeVisible();
      expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
      // two bursts, about 0.7 s from the first frame to the last, never more than three flashes in a second
      await page.waitForTimeout(1500);
      const f = await frames(page);
      const starts = f.filter((x, k) => x.on && (k === 0 || !f[k - 1].on)).map((x) => x.t);
      const shown = f.filter((x) => x.on);
      expect(starts.length, 'two bursts').toBe(2);
      const span = shown[shown.length - 1].t - shown[0].t;
      expect(span, 'about 0.7 s').toBeGreaterThan(500);
      expect(span).toBeLessThan(900);
      for (const t of starts) expect(starts.filter((u) => u >= t && u < t + 1000).length, 'at most three flashes a second').toBeLessThanOrEqual(3);
      expect(Math.max(...shown.map((x) => x.dx)), 'the slices really jump').toBeGreaterThanOrEqual(lo * 0.7);
      // in the scoreboard's corner, clear of the pill, the bar, the track and the ship, and on screen
      const c = await box(page, '[data-glitch-card]');
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(width);
      for (const sel of ['.score__pill', '.hud__runner', '#hud', ...(width < 1024 ? ['.tabbar'] : [])]) expect(overlap(c, await box(page, sel)), `clear of ${sel}`).toBe(false);
      // AA on its own field
      const ratio = await card.locator('[data-glitch-text]').evaluate((el) => {
        const lum = (s: string) => {
          const [r, g, b] = (s.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
            const k = Number(v) / 255;
            return k <= 0.03928 ? k / 12.92 : ((k + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const a = lum(getComputedStyle(el).color);
        const b = lum(getComputedStyle(el.parentElement!).backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      // the buttons are in the tab order
      await page.getByRole('button', { name: 'Track the bug' }).focus();
      await expect(page.getByRole('button', { name: 'Track the bug' })).toBeFocused();
    });
  }

  test('the glitch repeats on every pass, down and back up to the name; the card stays until it is answered (no auto close), and a glitch while it is up opens no second card', async ({ page }) => {
    test.setTimeout(45_000);
    await openHome(page, 1440, 900);
    const copy = page.locator('[data-glitch]');
    const card = page.locator('[data-glitch-card]');
    await toGlitch(page);
    await expect(card).toHaveClass(/is-in/, { timeout: 1500 });
    // no auto close: still there after ten seconds, with the focus never taken
    await page.waitForTimeout(10_000);
    await expect(card).toHaveClass(/is-in/);
    await expect(card.locator('[data-glitch-text]')).toHaveText('Glitch on the name. Track it?');
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    // back up to the name: it glitches again, and the card stays the one card, untouched
    await backUp(page);
    await expect(copy).toBeVisible();
    await expect(copy).toBeHidden({ timeout: 1200 });
    await expect(page.locator('[data-glitch-card]')).toHaveCount(1);
    await expect(card).toHaveClass(/is-in/);
    await expect(card.locator('[data-glitch-text]')).toHaveText('Glitch on the name. Track it?');
    // and down again
    await rest(page);
    await toGlitch(page);
    await expect(copy).toBeVisible();
    await expect(copy).toBeHidden({ timeout: 1200 });
    await expect(page.locator('[data-glitch-card]')).toHaveCount(1);
    await expect(card).toHaveClass(/is-in/);
  });

  test('ignore the glitch: the card closes for now, no achievement; the next pass glitches and asks again', async ({ page }) => {
    test.setTimeout(30_000);
    await openHome(page, 375, 812);
    const copy = page.locator('[data-glitch]');
    await toGlitch(page);
    const card = page.locator('[data-glitch-card]');
    await expect(card).toHaveClass(/is-in/);
    await page.getByRole('button', { name: 'Ignore' }).click();
    await expect(card).toBeHidden();
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-toast]')).not.toHaveClass(/is-in/);
    await expect(page.locator('[data-hud-ach]')).toHaveText(/^0/);
    // the next pass (back up to the name): the glitch and the card again
    await backUp(page);
    await expect(copy).toBeVisible();
    await expect(card).toHaveClass(/is-in/, { timeout: 1500 });
    await expect(card.locator('[data-glitch-text]')).toHaveText('Glitch on the name. Track it?');
    // and on a later visit too
    await page.getByRole('button', { name: 'Ignore' }).click();
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await toGlitch(page);
    await expect(card).toHaveClass(/is-in/, { timeout: 1500 });
  });

  test('track the glitch: the card says Bug tracked, then the achievement Glitch spotted unlocks with the toast and the counter goes up; the toast never sits on the card; then it never glitches again, not on the next pass and not after a reload', async ({ page }) => {
    test.setTimeout(30_000);
    await openHome(page, 1440, 900);
    await expect(page.locator('[data-hud-ach]')).toHaveText('0/6');
    await toGlitch(page);
    const card = page.locator('[data-glitch-card]');
    const copy = page.locator('[data-glitch]');
    await expect(card).toHaveClass(/is-in/);
    // while it is up, the scoreboard's card opens above it
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await page.waitForTimeout(200);
    expect(overlap(await box(page, '.score__panel'), await box(page, '[data-glitch-card]')), 'the scoreboard card above it').toBe(false);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Track the bug' }).click();
    await expect(card.locator('[data-glitch-text]')).toHaveText('Bug tracked');
    await expect(page.getByRole('button', { name: 'Track the bug' })).toBeHidden();
    const toast = page.locator('[data-toast]');
    await expect(toast).toHaveClass(/is-in/, { timeout: 3000 });
    await expect(toast).toContainText('Achievement unlocked');
    await expect(toast).toContainText('Glitch spotted');
    await expect(card).not.toHaveClass(/is-in/);
    await expect(page.locator('[data-hud-ach]')).toHaveText('1/6');
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await expect(page.locator('.score__ach li.is-done')).toHaveText(['Glitch spotted']);
    await page.keyboard.press('Escape');
    // stopped for good: back up and down, nothing
    await rest(page);
    await backUp(page);
    await page.waitForTimeout(600);
    await expect(copy).toBeHidden();
    await rest(page);
    await toGlitch(page);
    await page.waitForTimeout(900);
    await expect(copy).toBeHidden();
    await expect(card).toBeHidden();
    // and after a reload (a later visit)
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await toGlitch(page);
    await page.waitForTimeout(900);
    await expect(copy).toBeHidden();
    await expect(card).toBeHidden();
  });

  test('Reset on the scoreboard clears Glitch spotted, and the glitch and the card come back', async ({ page }) => {
    test.setTimeout(30_000);
    await openHome(page, 1440, 900);
    await toGlitch(page);
    await page.getByRole('button', { name: 'Track the bug' }).click();
    await expect(page.locator('[data-hud-ach]')).toHaveText('1/6', { timeout: 3000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('[data-hud-ach]')).toHaveText('0/6');
    await page.keyboard.press('Escape');
    await rest(page);
    await toGlitch(page);
    await expect(page.locator('[data-glitch]')).toBeVisible();
    await expect(page.locator('[data-glitch-card]')).toHaveClass(/is-in/, { timeout: 1500 });
  });

  for (const [width, height] of SIZES) {
    test(`no glitch and no card (${width}x${height}) under reduced motion, with the motion switch off or with the games off, and none for a page that opens past the line`, async ({ browser, page }) => {
      const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width, height } });
      const quiet = await reduced.newPage();
      await quiet.goto('/');
      await quiet.evaluate(() => document.fonts.ready);
      await quiet.evaluate(() => window.scrollTo(0, 600));
      await quiet.waitForTimeout(800);
      await expect(quiet.locator('[data-glitch]')).toBeHidden();
      await expect(quiet.locator('[data-glitch-card]')).toBeHidden();
      await reduced.close();
      for (const setup of [
        () => localStorage.setItem('playrun.motion', 'off'),
        () => localStorage.setItem('playrun.games', JSON.stringify({ on: false, bugs: [], achievements: [] })),
      ]) {
        const context = await browser.newContext({ viewport: { width, height } });
        const p = await context.newPage();
        await p.addInitScript(setup);
        await p.goto('/');
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(400);
        await p.evaluate(() => window.scrollTo(0, 700));
        await p.waitForTimeout(800);
        await expect(p.locator('[data-glitch]')).toBeHidden();
        await expect(p.locator('[data-glitch-card]')).toBeHidden();
        await context.close();
      }
      // a page that opens already past the line: nothing for a glitch nobody saw
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      const y = await pastBreak(page);
      await page.goto('/');
      await page.evaluate((y) => window.scrollTo(0, y + 200), y);
      await page.reload();
      await page.waitForTimeout(1000);
      await expect(page.locator('[data-glitch]')).toBeHidden();
      await expect(page.locator('[data-glitch-card]')).toBeHidden();
    });
  }

  test('the ticker rolls every title left as a plain image or its icon, named for a screen reader, the biggest names first; it pauses with the button', async ({ page }) => {
    // (a full-height desktop: on a short one, 1280 by 720, the logos are a little smaller)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const seq = page.locator('.ticker__seq').first();
    const marks = seq.locator('.wall__mark');
    expect(await marks.count()).toBe(18);
    // no links, nothing focusable, no pointer: the logos are pictures named by their alt text
    expect(await page.locator('.ticker a, .ticker [tabindex]:not([tabindex="-1"]), .ticker button:not([data-ticker-pause])').count()).toBe(0);
    const names = await marks.evaluateAll((els) => els.map((el) => el.querySelector('img')?.getAttribute('alt') || el.textContent?.replace(/\s+/g, ' ').trim() || ''));
    expect(names.slice(0, 5)).toEqual(['Beat Saber', 'NBA 2K21', 'Cyberpunk 2077', 'Ghostbusters: Rise of the Ghost Lord', "Lou's Lagoon"]);
    expect(names).toContain('The Climb 2');
    expect(names).toContain('Fracked');
    expect(names, 'Londinium shares the Historic VR logo, so it is not on the ticker').not.toContain('Londinium: AD 215');
    expect(new Set(names).size).toBe(18);
    expect(names, 'Space Pirate Trainer: its only official logo is an outline, so it stays off the ticker').not.toContain('Space Pirate Trainer');
    expect(names.every((n) => n.length > 0), 'every mark is named').toBe(true);
    expect(await marks.first().evaluate((el) => getComputedStyle(el).cursor)).toBe('auto');
    expect(await seq.locator('.wall__logo').count(), 'official logos').toBeGreaterThanOrEqual(16);
    // no boxes: the logos float on the field
    expect(await page.locator('.ticker__view').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await marks.first().evaluate((el) => [getComputedStyle(el.parentElement!).borderLeftWidth, getComputedStyle(el.parentElement!).backgroundColor])).toEqual(['0px', 'rgba(0, 0, 0, 0)']);
    const viewBox = (await page.locator('.ticker__view').boundingBox())!;
    expect(viewBox.height, 'the logos are the content of the section').toBeGreaterThanOrEqual(112);
    expect(viewBox.height).toBeLessThanOrEqual(200);
    // the title is the section-head size, smaller than the next level's title
    const sizes = await page.evaluate(() => [parseFloat(getComputedStyle(document.querySelector('#wall-title')!).fontSize), parseFloat(getComputedStyle(document.querySelector('#proof-title')!).fontSize)]);
    expect(sizes[0]).toBeLessThan(sizes[1]);
    // logos sized by eye: a tall stacked mark is taller and narrower than a wide wordmark
    const dims = await seq.locator('.wall__logo').evaluateAll((imgs) => imgs.map((img) => ({ name: img.getAttribute('alt'), w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height })));
    const by = Object.fromEntries(dims.map((d) => [d.name, d]));
    expect(by["Lou's Lagoon"].h).toBeGreaterThan(by['NBA 2K21'].h * 1.5);
    expect(by["Lou's Lagoon"].w).toBeLessThan(by['NBA 2K21'].w);
    expect(new Set(dims.map((d) => Math.round(d.h))).size, 'not one height for all').toBeGreaterThan(3);
    expect(Math.max(...dims.map((d) => d.h)), 'about twice the old size').toBeGreaterThanOrEqual(96);
    // the strip fades at both ends; the pause button is small with a thin light outline
    expect(await page.locator('.ticker__view').evaluate((el) => (getComputedStyle(el) as CSSStyleDeclaration & { webkitMaskImage?: string }).maskImage || (getComputedStyle(el) as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage || '')).toMatch(/linear-gradient\((to right|90deg), rgba\(0, 0, 0, 0\), rgb\(0, 0, 0\) 8%, rgb\(0, 0, 0\) 92%, rgba\(0, 0, 0, 0\)\)/);
    const pauseStyle = await page.getByRole('button', { name: 'Pause the logos' }).evaluate((el) => ({ border: getComputedStyle(el).borderTopWidth, color: getComputedStyle(el).borderTopColor, h: el.getBoundingClientRect().height }));
    expect(pauseStyle.border).toBe('1px');
    expect(pauseStyle.color).not.toBe('rgb(12, 21, 42)');
    expect(pauseStyle.h).toBeLessThanOrEqual(36);
    await page.getByRole('button', { name: 'Pause the logos' }).focus();
    expect(await page.getByRole('button', { name: 'Pause the logos' }).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    // the copy that makes the loop seamless is out of the accessibility tree
    const copy = page.locator('.ticker__copy');
    await expect(copy).toHaveAttribute('aria-hidden', 'true');
    expect(await copy.locator('img:not([alt=""])').count(), 'the copy names nothing twice').toBe(0);
    await expect(page.locator('.ticker')).not.toContainText(/stage|view on/i);
    // it moves left
    const x = () => page.locator('.ticker__track').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    await page.locator('.wall').scrollIntoViewIfNeeded();
    await page.mouse.move(10, 10);
    const a = await x();
    await page.waitForTimeout(700);
    const b = await x();
    expect(b, 'the logos roll left').toBeLessThan(a - 5);
    // the button pauses it, and plays it again
    const pause = page.getByRole('button', { name: 'Pause the logos' });
    await pause.click();
    await page.mouse.move(10, 10);
    await expect(page.getByRole('button', { name: 'Play the logos' })).toBeVisible();
    const c = await x();
    await page.waitForTimeout(500);
    expect(Math.abs((await x()) - c), 'paused').toBeLessThan(1);
    await page.getByRole('button', { name: 'Play the logos' }).click();
    await page.mouse.move(10, 10);
    await page.waitForTimeout(500);
    expect(await x(), 'rolling again').toBeLessThan(c - 5);
    // Tab from the pause button leaves the ticker: no logo takes focus
    await page.getByRole('button', { name: 'Pause the logos' }).focus();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.ticker__view'))).toBe(false);
  });

  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [375, 812],
  ] as const) {
    test(`with motion off the logos are a still, centred row of whole logos (${width}x${height}): as many as fit, none cut, no scrollbar, no Pause, the link under it`, async ({ browser }) => {
      for (const how of ['reduced motion', 'the motion switch'] as const) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: how === 'reduced motion' ? 'reduce' : 'no-preference' });
        const page = await context.newPage();
        if (how === 'the motion switch') await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
        await page.goto('/');
        await page.evaluate(() => document.fonts.ready);
        await page.locator('.wall').scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        expect(await page.locator('.ticker__track').evaluate((el) => getComputedStyle(el).animationName), how).toBe('none');
        await expect(page.locator('.ticker__copy')).toBeHidden();
        await expect(page.getByRole('button', { name: /the logos/ }), `${how}: no Pause`).toBeHidden();
        await expect(page.getByRole('link', { name: "See every game I've tested" })).toBeVisible();
        const row = await page.locator('.ticker__view').evaluate((view) => {
          const v = view.getBoundingClientRect();
          const marks = [...view.querySelectorAll('.ticker__seq:not(.ticker__copy) .wall__mark')].map((m) => m.getBoundingClientRect());
          const shown = marks.filter((m) => m.top < v.bottom - 0.5 && m.bottom > v.top + 0.5);
          const left = Math.min(...shown.map((m) => m.left));
          const right = Math.max(...shown.map((m) => m.right));
          const next = marks[shown.length];
          return {
            scroll: view.scrollWidth - view.clientWidth,
            overflow: getComputedStyle(view).overflowX,
            mask: getComputedStyle(view).maskImage,
            shown: shown.length,
            whole: shown.every((m) => m.left >= v.left - 0.5 && m.right <= v.right + 0.5 && m.top >= v.top - 0.5 && m.bottom <= v.bottom + 0.5),
            // the ones not shown are wholly out of the view (on the next line, clipped), never cut
            cut: marks.filter((m) => m.top < v.bottom - 0.5 && m.bottom > v.top + 0.5 && (m.left < v.left - 0.5 || m.right > v.right + 0.5)).length,
            sides: [left - v.left, v.right - right],
            nextFits: next ? right - left + next.width <= v.width : false,
            firstRow: shown.every((m) => Math.abs(m.top - shown[0].top) < 0.5),
          };
        });
        expect(row.scroll, `${how}: nothing to scroll`).toBeLessThanOrEqual(0);
        expect(row.overflow, how).toBe('hidden');
        expect(row.mask, `${how}: no fade at the ends`).toBe('none');
        expect(row.shown, how).toBeGreaterThanOrEqual(2);
        expect(row.whole, `${how}: every logo shown whole`).toBe(true);
        expect(row.cut, `${how}: no logo cut at an end`).toBe(0);
        expect(row.firstRow, `${how}: one row`).toBe(true);
        expect(Math.abs(row.sides[0] - row.sides[1]), `${how}: centred (${row.sides})`).toBeLessThanOrEqual(1);
        expect(row.nextFits, `${how}: as many as fit`).toBe(false);
        await context.close();
      }
    });
  }

  test('every stat carries a caption: Montserrat italic in cyan under the active row, fading in with it, the six all shown in the still list', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const drum = page.locator('[data-drum]');
    await drum.scrollIntoViewIfNeeded();
    await expect(drum).toHaveClass(/is-live/);
    const caps = drum.locator('.drum__row:not(.drum__clone) .drum__cap');
    await expect(caps).toHaveText(['Started in 2021. Still finding things.', 'From outsourced QA to in-house teams.', 'Released titles and games still in development.', 'Headset tan included.', 'Consoles, PC stores and VR headsets.', 'At nDreams and Historic VR.']);
    const active = drum.locator('.drum__row[data-d="0"] .drum__cap');
    await expect(active).toHaveCSS('opacity', '1', { timeout: 2000 });
    const style = await active.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily, style: cs.fontStyle, color: cs.color, size: parseFloat(cs.fontSize), top: el.getBoundingClientRect().top, labelBottom: el.parentElement!.querySelector('.drum__label')!.getBoundingClientRect().bottom };
    });
    expect(style.family).toMatch(/Montserrat/);
    expect(style.style).toBe('italic');
    expect(style.color).toBe('rgb(86, 189, 218)');
    expect(style.size).toBeGreaterThanOrEqual(16.5);
    expect(style.size).toBeLessThanOrEqual(17.5);
    expect(style.top, 'under its stat').toBeGreaterThanOrEqual(style.labelBottom - 1);
    // the neighbours' captions are not shown; the next turn fades the next one in
    expect(await drum.locator('.drum__row[data-d="1"] .drum__cap').first().evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    const before = await active.textContent();
    await page.getByRole('button', { name: 'Next stat' }).click();
    await expect(drum.locator('.drum__row[data-d="0"] .drum__cap')).not.toHaveText(before!);
    await expect(drum.locator('.drum__row[data-d="0"] .drum__cap')).toHaveCSS('opacity', '1', { timeout: 2000 });
    // without script: a still list, every caption under its stat
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const still = await context.newPage();
    await still.goto('/');
    const stillCaps = still.locator('.drum__row:not(.drum__clone) .drum__cap');
    await expect(stillCaps).toHaveCount(6);
    for (let i = 0; i < 6; i++) await expect(stillCaps.nth(i)).toBeVisible();
    expect(await stillCaps.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), '15px on a phone').toBeLessThanOrEqual(15.5);
    await context.close();
  });

  test('the stats turn on a drum: five rows, the active one centred in green, the drum turning on its own, by the arrows, resting on hover, focus and pause, each stat announced once', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const drum = page.locator('[data-drum]');
    await expect(drum).toHaveClass(/is-live/);
    const real = page.locator('.drum__row:not(.drum__clone)');
    await expect(real).toHaveCount(6);
    // the two new stats come from the data: VR games from the platform lines, lead roles from the flag
    const projects = readdirSync(join(process.cwd(), 'src/content/projects')).filter((f) => f.endsWith('.md'));
    const vr = projects.filter((f) => {
      const text = readFileSync(join(process.cwd(), 'src/content/projects', f), 'utf8');
      const platforms = text.match(/^platforms:\s*\[(.*)\]/m)?.[1] ?? '';
      return /public: true/.test(text) && (/VR|Quest/i.test(platforms) || /^vr: true/m.test(text));
    });
    expect(vr.length).toBe(11);
    // both Historic VR titles count: Guildford by its platform line, Londinium by its flag
    expect(vr).toContain('guildford-castle-vr.md');
    expect(vr).toContain('londinium-ad-215.md');
    const leads = (readFileSync(join(process.cwd(), 'src/config.ts'), 'utf8').match(/lead: true/g) ?? []).length;
    expect(leads).toBe(2);
    await expect(real).toHaveText([/5\+\s*years in QA/, /6\s*companies/, /20\s*games/, new RegExp(`${vr.length}\\s*VR games`), /10\+\s*platforms/, new RegExp(`${leads}\\s*QA lead roles`)]);
    // the copies that make the loop are out of the accessibility tree
    await expect(page.locator('.drum__clone')).toHaveCount(12);
    expect(await page.locator('.drum__clone:not([aria-hidden="true"])').count()).toBe(0);
    expect(await page.locator('.drum__row[aria-hidden="true"]').count()).toBe(12);
    // the statement on the left, the drum on the right
    const head = (await page.locator('.stats__head').boundingBox())!;
    const box = (await drum.boundingBox())!;
    expect(box.x).toBeGreaterThan(head.x + head.width - 1);
    expect(await page.locator('.stats').evaluate((el) => getComputedStyle(el).backgroundColor), 'the stats stand on navy').toBe('rgb(12, 21, 42)');
    // five rows on show, the active one in the middle: green number, white label, no offset;
    // the neighbours white at half strength and 32px right; the outer rows at a quarter and 64px
    await drum.scrollIntoViewIfNeeded();
    await page.mouse.move(10, 10);
    await page.waitForTimeout(700);
    const state = () =>
      page.evaluate(() => {
        const view = document.querySelector('.drum__view')!.getBoundingClientRect();
        const rows = [...document.querySelectorAll<HTMLElement>('.drum__row')];
        const shown = rows.filter((r) => {
          const b = r.getBoundingClientRect();
          return b.top >= view.top - 1 && b.bottom <= view.bottom + 1;
        });
        return {
          shown: shown.map((r) => ({
            d: r.dataset.d,
            text: r.textContent!.replace(/\s+/g, ' ').trim(),
            opacity: Math.round(parseFloat(getComputedStyle(r).opacity) * 100) / 100,
            x: Math.round(new DOMMatrix(getComputedStyle(r).transform).m41),
            num: getComputedStyle(r.querySelector('.drum__num')!).color,
            label: getComputedStyle(r.querySelector('.drum__label')!).color,
            size: getComputedStyle(r.querySelector('.drum__num')!).fontSize,
          })),
          viewH: view.height,
          rowH: rows[0].getBoundingClientRect().height,
        };
      });
    let s = await state();
    expect(s.shown.length, 'five rows on show').toBe(5);
    expect(Math.round(s.viewH / s.rowH)).toBe(5);
    expect(s.shown.map((r) => r.d)).toEqual(['2', '1', '0', '1', '2']);
    expect(new Set(s.shown.map((r) => r.text)).size, 'no stat shows twice at once').toBe(5);
    expect(s.shown.map((r) => r.opacity)).toEqual([0.25, 0.5, 1, 0.5, 0.25]);
    expect(s.shown.map((r) => r.x)).toEqual([64, 32, 0, 32, 64]);
    expect(s.shown[2].num).toBe('rgb(103, 193, 140)');
    expect(s.shown[2].label).toBe('rgb(255, 255, 255)');
    expect(s.shown[1].num).toBe('rgb(255, 255, 255)');
    expect(new Set(s.shown.map((r) => r.size)).size, 'one number size').toBe(1);
    // the numbers are the biggest thing in the level: about 96px, the labels about 24px, the title about 48px
    const sizes = await page.evaluate(() => ({
      num: parseFloat(getComputedStyle(document.querySelector('.drum__num')!).fontSize),
      label: parseFloat(getComputedStyle(document.querySelector('.drum__label')!).fontSize),
      title: parseFloat(getComputedStyle(document.querySelector('#stats-title')!).fontSize),
    }));
    expect(sizes.num).toBeGreaterThanOrEqual(94);
    expect(sizes.num).toBeLessThanOrEqual(98);
    expect(sizes.label).toBeGreaterThanOrEqual(22);
    expect(sizes.title).toBeGreaterThanOrEqual(44);
    expect(sizes.title).toBeLessThanOrEqual(50);
    expect(sizes.num).toBeGreaterThan(sizes.title);
    // number and label on one line, clear of the buttons
    const fit = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('.drum__row[data-d="0"]')!;
      const num = row.querySelector('.drum__num')!.getBoundingClientRect();
      const label = row.querySelector('.drum__label')!.getBoundingClientRect();
      const buttons = document.querySelector('.drum__controls')!.getBoundingClientRect();
      const lines = Math.round(label.height / (parseFloat(getComputedStyle(row.querySelector('.drum__label')!).lineHeight) || 1));
      return { oneLine: lines <= 1, labelLeft: label.left, numRight: num.right, labelRight: label.right, buttonsLeft: buttons.left, sameLine: Math.abs(num.bottom - label.bottom) < 12 };
    });
    expect(fit.oneLine).toBe(true);
    expect(fit.sameLine).toBe(true);
    expect(fit.labelLeft).toBeGreaterThanOrEqual(fit.numRight);
    expect(fit.labelRight).toBeLessThan(fit.buttonsLeft);
    const first = s.shown[2].text;
    // it turns on its own, one row every 3.5 s
    await page.waitForTimeout(4300);
    s = await state();
    expect(s.shown[2].text, 'the drum turned').not.toBe(first);
    expect(s.shown[2].d).toBe('0');
    // the arrows turn it either way, and it keeps turning after
    const next = page.getByRole('button', { name: 'Next stat' });
    const prev = page.getByRole('button', { name: 'Previous stat' });
    await expect(next).toBeVisible();
    await next.click();
    await page.mouse.move(10, 10);
    await page.waitForTimeout(800);
    const afterNext = (await state()).shown[2].text;
    await prev.click();
    await page.mouse.move(10, 10);
    await page.waitForTimeout(800);
    expect((await state()).shown[2].text).not.toBe(afterNext);
    // hovered: it rests
    await drum.hover();
    const held = (await state()).shown[2].text;
    await page.waitForTimeout(4300);
    expect((await state()).shown[2].text, 'rests under the pointer').toBe(held);
    await page.mouse.move(10, 10);
    // focus inside: it rests; the buttons show their focus
    await prev.focus();
    await page.keyboard.press('Tab');
    await expect(next).toBeFocused();
    expect(await next.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    const focusedText = (await state()).shown[2].text;
    await page.waitForTimeout(4300);
    expect((await state()).shown[2].text, 'rests while a button has focus').toBe(focusedText);
    await page.mouse.click(10, 10);
    // the pause control
    const pauseButton = page.getByRole('button', { name: 'Pause the stats' });
    await pauseButton.click();
    await page.mouse.click(10, 10);
    await expect(page.getByRole('button', { name: 'Play the stats' })).toHaveAttribute('aria-pressed', 'true');
    const pausedText = (await state()).shown[2].text;
    await page.waitForTimeout(4300);
    expect((await state()).shown[2].text, 'paused').toBe(pausedText);
    await page.getByRole('button', { name: 'Play the stats' }).click();
    await page.mouse.click(10, 10);
    // and it loops: a full turn and more comes back round with no gap, and no stat shows twice at any stop
    for (let k = 0; k < 8; k++) {
      await next.click();
      await page.waitForTimeout(700);
      await page.mouse.move(10, 10);
      s = await state();
      expect(s.shown.length, `stop ${k}: five rows`).toBe(5);
      expect(new Set(s.shown.map((r) => r.text)).size, `stop ${k}: no stat twice`).toBe(5);
    }
    expect(s.shown.map((r) => r.d)).toEqual(['2', '1', '0', '1', '2']);
    // off screen it stops
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const away = await page.locator('.drum__list').evaluate((el) => el.style.getPropertyValue('--i'));
    await page.waitForTimeout(4300);
    expect(await page.locator('.drum__list').evaluate((el) => el.style.getPropertyValue('--i')), 'still while off screen').toBe(away);
  });

  test('the drum turns one stat every 3.5 s, the slide still 0.6 s', async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator('[data-drum]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.mouse.move(5, 5);
    // every turn of the drum, timed in the page (a jump back a copy is not a turn)
    await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.drum__list')!;
      const w = window as unknown as { turns: number[] };
      w.turns = [];
      let last = Number(list.style.getPropertyValue('--i'));
      new MutationObserver(() => {
        const i = Number(list.style.getPropertyValue('--i'));
        if (Math.abs(i - last) === 1) w.turns.push(performance.now());
        last = i;
      }).observe(list, { attributes: true, attributeFilter: ['style'] });
    });
    await page.waitForTimeout(12_500);
    const turns = await page.evaluate(() => (window as unknown as { turns: number[] }).turns);
    expect(turns.length, 'three turns or so in 12.5 s').toBeGreaterThanOrEqual(3);
    for (let k = 1; k < turns.length; k++) {
      expect(turns[k] - turns[k - 1]).toBeGreaterThan(3300);
      expect(turns[k] - turns[k - 1]).toBeLessThan(3800);
    }
    const slide = await page.locator('.drum__list').evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(slide.split(',').map((d) => parseFloat(d))).toContain(0.6);
  });

  for (const width of [375, 360]) {
    test(`on a touch phone (${width}px) the drum turns on its own, and a tap on it or on its arrows only rests it a moment`, async ({ browser }) => {
      test.setTimeout(60_000);
      const context = await browser.newContext({ viewport: { width, height: 780 }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await page.goto('/');
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      const drum = page.locator('[data-drum]');
      await expect(drum).toHaveClass(/is-live/);
      await drum.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const at = () => page.locator('.drum__list').evaluate((el) => Number(el.style.getPropertyValue('--i')));
      // untouched, it turns
      const start = await at();
      await expect.poll(at, { timeout: 5000, message: 'it turns on its own' }).not.toBe(start);
      // a tap on the drum: a short rest, then it turns again
      const box = (await drum.boundingBox())!;
      await page.touchscreen.tap(box.x + 30, box.y + box.height / 2);
      const tapped = await at();
      await expect.poll(at, { timeout: 10_000, message: 'it carries on after a tap' }).not.toBe(tapped);
      // a tap on Next turns it at once, and it keeps turning on its own after (focus stays on the
      // button, which used to hold it still for good)
      await page.locator('[data-drum-next]').tap();
      await page.waitForTimeout(800);
      const after = await at();
      await expect.poll(at, { timeout: 10_000, message: 'it carries on after a tap on Next' }).not.toBe(after);
      // the Pause button still holds it until Play
      await page.locator('[data-drum-pause]').tap();
      await page.waitForTimeout(800);
      const held = await at();
      await page.waitForTimeout(8000);
      expect(await at(), 'paused').toBe(held);
      await context.close();
    });
  }

  test('on a phone the drum stacks under the title and nothing overflows; under reduced motion the four stats are a still list', async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    const p1 = await phone.newPage();
    await p1.goto('/');
    await p1.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await expect(p1.locator('[data-drum]')).toHaveClass(/is-live/);
    const head = (await p1.locator('.stats__head').boundingBox())!;
    const box = (await p1.locator('[data-drum]').boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    await p1.locator('[data-drum]').scrollIntoViewIfNeeded();
    await p1.waitForTimeout(500);
    const xs = await p1.locator('.drum__row').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
    expect(Math.max(...xs), 'the shifted rows stay inside the screen').toBeLessThanOrEqual(375);
    // the label never runs under the number or the buttons, even if it wraps
    const fit = await p1.evaluate(() => {
      const buttons = document.querySelector('.drum__controls')!.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>('.drum__row:not([data-d="3"]):not([data-d="4"]):not([data-d="5"]):not([data-d="6"]):not([data-d="7"])')].map((row) => {
        const num = row.querySelector('.drum__num')!.getBoundingClientRect();
        const label = row.querySelector('.drum__label')!.getBoundingClientRect();
        return { clearOfNumber: label.left >= num.right - 1, clearOfButtons: label.right <= buttons.left + 1 || label.width === 0 };
      });
    });
    for (const f of fit) {
      expect(f.clearOfNumber).toBe(true);
      expect(f.clearOfButtons).toBe(true);
    }
    for (const width of [768, 1280, 1920]) {
      await p1.setViewportSize({ width, height: 900 });
      await p1.waitForTimeout(200);
      expect(await p1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}: no sideways scroll`).toBeLessThanOrEqual(0);
    }
    expect(await p1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await expect(p1.getByRole('button', { name: 'Next stat' })).toBeVisible();
    await phone.close();

    const quiet = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const p2 = await quiet.newPage();
    await p2.goto('/');
    await expect(p2.locator('[data-drum]')).not.toHaveClass(/is-live/);
    const rows = p2.locator('.drum__row:not(.drum__clone)');
    await expect(rows).toHaveCount(6);
    for (const r of await rows.all()) {
      await expect(r).toBeVisible();
      await expect(r).toHaveCSS('opacity', '1');
      expect(await r.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    }
    await expect(p2.locator('.drum__clone').first()).toBeHidden();
    await expect(p2.getByRole('button', { name: 'Next stat' })).toBeHidden();
    const before = await p2.locator('.drum__list').evaluate((el) => getComputedStyle(el).transform);
    await p2.waitForTimeout(3000);
    expect(await p2.locator('.drum__list').evaluate((el) => getComputedStyle(el).transform)).toBe(before);
    await quiet.close();
  });

  test('the self test runs, reports and scores the page, and the Quality link stays visible', async ({ page }) => {
    await page.goto('/');
    // Before anyone presses the button each panel shows the suite's own checks for its area: the
    // tagged tests, counted here from Playwright's own list. A build from a run ticks them with that
    // run's passes; a local build (no run) shows the count unticked.
    const cli = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
    const list = JSON.parse(execFileSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: '', PLAYWRIGHT_JSON_OUTPUT_FILE: '' } }));
    const tagged: Record<string, number> = {};
    const walk = (s: { specs?: { tags?: string[]; tests: unknown[] }[]; suites?: unknown[] }) => {
      for (const sp of s.specs ?? []) for (const t of sp.tags ?? []) tagged[t.replace(/^@/, '')] = (tagged[t.replace(/^@/, '')] ?? 0) + sp.tests.length;
      for (const c of (s.suites ?? []) as (typeof s)[]) walk(c);
    };
    for (const s of list.suites) walk(s);
    const panels = await page.locator('.panel').evaluateAll((els) =>
      els.map((el) => ({ id: (el as HTMLElement).dataset.check!, from: (el as HTMLElement).dataset.from, cls: el.className, count: el.querySelector('[data-count]')!.textContent!.trim(), of: el.querySelector('.panel__of')!.textContent!.trim() })),
    );
    expect(panels.map((p) => p.id)).toEqual(['pages', 'console', 'links', 'viewports', 'a11y', 'brand', 'weight', 'html']);
    for (const p of panels) {
      expect(tagged[p.id], `${p.id} has tagged checks`).toBeGreaterThan(0);
      if (p.from === 'run' && p.id === 'weight') {
        // the weight from the run: Home's real figure against its budget
        expect(p.cls).toMatch(/is-pass|is-failed/);
        expect(p.count).toMatch(/^\d+ KB$/);
        expect(p.of).toMatch(/^, budget \d+ KB$/);
      } else if (p.from === 'run') {
        expect(p.cls).toMatch(/is-pass|is-failed/);
        expect(p.of).toBe(`of ${tagged[p.id]}`);
        expect(Number(p.count)).toBeLessThanOrEqual(tagged[p.id]);
      } else {
        expect(p.cls).toContain('is-idle');
        expect(p.count).toBe(String(tagged[p.id]));
        expect(p.of).toBe('checks');
      }
    }
    await expect(page.locator('#selftest-status')).toHaveText(/\d+ (of \d+ checks passed in the last run|checks run before every deploy)/);
    const quality = page.locator('.proof').getByRole('link', { name: 'How I test this site' });
    await expect(quality).toHaveAttribute('href', '/quality/');
    await page.getByRole('button', { name: 'Test this page' }).click();
    await expect(page.locator('#selftest-status')).toContainText(/on your device/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible();
    await expect(page.locator('#selftest-score')).toBeVisible();
    await expect(page.locator('#selftest-score [data-score]')).toHaveText(/^\d\/8$/);
    // the live weight is this page's own figure against Home's budget
    await expect(page.locator('[data-check="weight"] [data-count]')).toHaveText(/^\d+ KB$/);
    await expect(page.locator('[data-check="html"] [data-detail]')).toHaveText('A doctype, a language, a title, and no id used twice');
    await expect(page.locator('.panel.is-idle')).toHaveCount(0);
    await expect(page.locator('.panel.is-pass, .panel.is-failed')).toHaveCount(8);
    await expect(quality).toBeVisible();
  });

  test('Get in touch appears in the nav and the end of Home only; the hero has no buttons', async ({ page }) => {
    await page.goto('/');
    const buttons = page.getByRole('link', { name: 'Get in touch' });
    await expect(buttons).toHaveCount(2);
    await expect(page.locator('header').getByRole('link', { name: 'Get in touch' })).toHaveCount(1);
    // (one text link only: More about me, at the end of the intro)
    await expect(page.locator('.hero').getByRole('link')).toHaveText(['More about me']);
    await expect(page.locator('.hero button:not([data-bug])')).toHaveCount(0);
    await expect(page.locator('.final').getByRole('link', { name: 'Get in touch' })).toHaveCount(1);
    await expect(page.locator('footer').getByRole('link', { name: 'Get in touch' })).toHaveCount(0);
    for (const path of ['/skills/', '/portfolio/', '/quality/', '/contact/', '/terms/', '/privacy/']) {
      await page.goto(path);
      await expect(page.locator('main').getByRole('link', { name: 'Get in touch' }), path).toHaveCount(0);
    }
  });

  for (const [width, height] of [
    [1440, 900],
    [375, 780],
  ] as const) {
    test(`the hero is readable on the very first frame (${width}px): with a slow CPU the name, the post and the intro are on screen and opaque at once, and the photo loads first`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      // what the first animation frame shows, read the moment the hero exists
      await page.addInitScript(() => {
        const w = window as unknown as { first: unknown };
        const look = () => {
          const lines = Array.from(document.querySelectorAll('.hero__line'));
          const post = document.querySelector('.hero__post');
          const value = document.querySelector('.hero__value');
          if (lines.length < 2 || !post || !value) return requestAnimationFrame(look);
          const inMask = lines.map((l) => {
            const r = l.getBoundingClientRect();
            const m = l.parentElement!.getBoundingClientRect();
            return Math.max(0, Math.min(r.bottom, m.bottom) - Math.max(r.top, m.top)) / Math.max(1, r.height);
          });
          const opaque = [...lines, post, value].map((el) => {
            let o = 1;
            for (let n: Element | null = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
            return o;
          });
          w.first = { inMask, opaque };
        };
        requestAnimationFrame(look);
      });
      await page.goto('/');
      await expect.poll(() => page.evaluate(() => (window as unknown as { first?: unknown }).first !== undefined)).toBe(true);
      const first = await page.evaluate(() => (window as unknown as { first: { inMask: number[]; opaque: number[] } }).first);
      for (const k of first.inMask) expect(k, 'the name inside its mask on the first frame').toBeGreaterThanOrEqual(0.85);
      for (const o of first.opaque) expect(o, 'no hidden start').toBe(1);
      await expect(page.locator('.hero__figure img')).toHaveAttribute('fetchpriority', 'high');
      await context.close();
    });
  }

  test('hero content is in the HTML before any script runs', { tag: ['@pages'] }, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.hero__value')).toBeVisible();
    await expect(page.locator('.ticker__seq').first().locator('.wall__mark')).toHaveCount(18);
    await expect(page.getByRole('button', { name: /the logos/ })).toBeHidden();
    await expect(page.locator('.drum__row:not(.drum__clone)')).toHaveCount(6);
    await expect(page.locator('.drum__row:not(.drum__clone)').first()).toContainText('5+');
    await expect(page.locator('.drum__clone').first()).toBeHidden();
    await expect(page.locator('[data-drum-next]')).toBeHidden();
    await expect(page.locator('.final__text')).toContainText('Helldivers, The Witcher and God of War');
    await context.close();
  });

  for (const vp of VIEWPORTS) {
    test(`renders without sideways overflow at ${vp.width}px (${vp.name})`, { tag: ['@viewports'] }, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.evaluate(() => document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in')));
      await settle(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath(`home-${vp.name}.png`), fullPage: true });
    });
  }
});

for (const [width, height] of [
  [1280, 720],
  [1440, 900],
  [375, 812],
] as const) {
  test(`the games are on the first screen (${width}x${height}): the row of logos whole on screen (on a phone the clouds and the label peeking in), rolling, unlinked, its first logos there with the page; Level 2 one block on the blue (the label on the left, the logos, Pause and the link centred), even gaps, the same gap to the clouds above and below, nothing over the joins`, { tag: ['@viewports'] }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    // the first logos load with the page, not after it: there at its load event, no wait
    const loaded = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('.ticker__seq:not(.ticker__copy) img.wall__logo')].slice(0, 3).map((i) => i.complete && i.naturalWidth > 0 && i.loading === 'eager'),
    );
    expect(loaded, 'the first logos in with the page').toEqual([true, true, true]);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const geo = await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect();
      const bar = document.querySelector('.tabbar');
      const floor = bar && bar.getClientRects().length ? box(bar).top : innerHeight;
      const marks = [...document.querySelectorAll('.ticker__seq:not(.ticker__copy) .wall__mark > *')].map(box).filter((r) => r.right > 0 && r.left < innerWidth);
      const band = box(document.querySelector('.wall .join--top')!);
      const hero = [...document.querySelectorAll('.hero :is(h1, .hero__post, .hero__value)')].map(box);
      return { floor, logoBottom: Math.max(...marks.map((r) => r.bottom)), logoTop: Math.min(...marks.map((r) => r.top)), shown: marks.length, band: [band.top, band.bottom], heroBottom: Math.max(...hero.map((r) => r.bottom)) };
    });
    expect(geo.shown, 'logos on show').toBeGreaterThanOrEqual(2);
    if (width >= 768) expect(geo.logoBottom, 'the whole row on the first screen').toBeLessThanOrEqual(geo.floor);
    else {
      // a phone: the clouds and the label peek in, and the photo keeps its size
      const peek = await page.evaluate(() => ({ flag: document.querySelector('.wall .flag')!.getBoundingClientRect().bottom, photo: document.querySelector('.hero__figure img')!.getBoundingClientRect().height }));
      expect(peek.flag, 'the label on the first screen').toBeLessThanOrEqual(geo.floor);
      expect(peek.photo, 'the photo about its old size').toBeGreaterThanOrEqual(180);
    }
    expect(geo.logoTop, 'resting on the clouds').toBeGreaterThan(geo.band[0]);
    expect(geo.heroBottom, 'the hero text above the clouds').toBeLessThanOrEqual(geo.band[0]);
    // the block, measured in place (Pause and the link rise in as they enter)
    await page.evaluate(() => document.querySelectorAll('.wall [data-enter]').forEach((e) => e.classList.add('is-in')));
    await page.waitForTimeout(900);
    const block = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const top = r('.wall .join--top');
      const bottom = r('.wall .join--bottom');
      const parts = ['.wall__head', '.ticker__view', '.wall__actions'].map(r);
      const flag = r('.wall .flag');
      return {
        above: parts[0].top - top.bottom,
        below: bottom.top - parts[2].bottom,
        labelToRow: parts[1].top - flag.bottom,
        rowToActions: parts[2].top - parts[1].bottom,
        rowAbove: parts[1].top - top.bottom,
        rowBelow: bottom.top - parts[1].bottom,
        inside: [flag, ...parts].every((p) => p.top >= top.bottom - 0.5 && p.bottom <= bottom.top + 0.5),
      };
    });
    expect(block.inside, 'nothing over the cloud joins').toBe(true);
    expect(block.above).toBeGreaterThan(0);
    expect(Math.abs(block.above - block.below), `the same gap to the clouds above and below (${block.above}, ${block.below})`).toBeLessThanOrEqual(1);
    expect(Math.abs(block.labelToRow - block.rowToActions), `even gaps (${block.labelToRow}, ${block.rowToActions})`).toBeLessThanOrEqual(1);
    expect(Math.abs(block.rowAbove - block.rowBelow), 'the logos in the middle of the blue').toBeLessThanOrEqual(1);
    // rolling, unlinked; the label above the row, Pause and the link side by side under it, all
    // centred; the heading there for the outline and screen readers only
    expect(await page.locator('.ticker a').count()).toBe(0);
    expect(await page.locator('.ticker__track').evaluate((el) => el.getAnimations().length)).toBeGreaterThan(0);
    const [flag, row, pause, more] = await Promise.all(['.wall .flag', '.ticker__view', '.ticker__pause', '.wall__more'].map(async (s) => (await page.locator(s).boundingBox())!));
    expect(flag.y + flag.height).toBeLessThanOrEqual(row.y + 1);
    expect(pause.y).toBeGreaterThanOrEqual(row.y + row.height - 1);
    expect(Math.abs(pause.y + pause.height / 2 - (more.y + more.height / 2)), 'side by side').toBeLessThanOrEqual(4);
    const mid = (b: { x: number; width: number }) => b.x + b.width / 2;
    // the label on the left edge of the column, like every level's (labels.spec.ts); the rest centred
    const edge = await page.locator('.wall').evaluate((el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));
    expect(Math.abs(flag.x - edge), 'the label on the left edge').toBeLessThanOrEqual(1);
    expect(Math.abs(mid(row) - width / 2), 'the row centred').toBeLessThanOrEqual(10);
    expect(Math.abs((pause.x + more.x + more.width) / 2 - width / 2), 'Pause and the link centred').toBeLessThanOrEqual(10);
    await expect(page.getByRole('heading', { level: 2, name: "Games I've tested" })).toHaveCount(1);
    expect(await page.locator('#wall-title').evaluate((el) => el.getBoundingClientRect().width), 'not shown').toBeLessThanOrEqual(1);
    await expect(page.locator('.wall__more')).toHaveAttribute('href', '/portfolio/');
    await page.locator('.ticker__pause').click();
    await expect(page.locator('.wall')).toHaveClass(/is-paused/);
    await expect(page.locator('.ticker__pause')).toHaveAccessibleName('Play the logos');
  });
}

test('on a desktop the scoreboard never covers the row of logos, wherever the page is scrolled; the row stays centred', { tag: ['@viewports'] }, async ({ page }) => {
  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const wall = await page.locator('.wall').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    for (const y of [0, wall - height + 260, wall - height / 2, wall]) {
      await page.evaluate((y) => window.scrollTo(0, Math.max(0, y)), Math.round(y));
      await page.waitForTimeout(100);
      const [pill, row] = await Promise.all(['.score__pill', '.ticker__view'].map((s) => page.locator(s).boundingBox()));
      const meet = pill!.x < row!.x + row!.width && pill!.x + pill!.width > row!.x && pill!.y < row!.y + row!.height && pill!.y + pill!.height > row!.y;
      expect(meet, `the pill clear of the row at ${width}, scrolled ${Math.round(y)}`).toBe(false);
      expect(Math.abs(row!.x + row!.width / 2 - width / 2), 'the row centred').toBeLessThanOrEqual(10);
    }
  }
});

// A hairline of what is behind can show where a cloud join meets the level's own blue, on a screen
// scaled by a fraction (1.25, 1.5) when the two edges round to different device pixels. The field
// starts under the join's front layer (the same colour), not at its edge, on every page.
test("no hairline where a level's clouds meet its blue: the field starts under the front layer of the join", { tag: ['@brand'] }, async ({ page }) => {
  for (const path of ['/', '/skills/', '/portfolio/', '/quality/', '/contact/']) {
    await page.goto(path);
    const levels = await page.locator('.level.has-join-top').evaluateAll((els) =>
      els.map((el) => {
        const band = el.querySelector('.join--top')!.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { band: band.height, fieldTop: parseFloat(cs.backgroundPositionY), image: cs.backgroundImage };
      }),
    );
    for (const l of levels) {
      expect(l.image).toMatch(/gradient/);
      expect(l.fieldTop, `${path}: the blue starts under the clouds' front layer`).toBeLessThanOrEqual(l.band - 1);
      expect(l.fieldTop).toBeGreaterThanOrEqual(l.band - 4);
    }
  }
});
