import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path, { join } from 'node:path';

const require = createRequire(import.meta.url);

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
      "I'm a game QA tester in London. I've been testing games since 2021, on consoles, PC and VR. I've led QA teams at nDreams and Historic VR, and taken games all the way to release on several platforms. I plan the testing, run it on real hardware, and write reports developers can act on.",
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

  for (const width of [375, 360]) {
    test(`on a phone (${width}px) the pages are in a bottom bar: Home, Skills, Portfolio, Quality, Contact as real links with pixel icons and labels of 16px, the current page in green, at least 44px tall with a visible focus; the header keeps the logo and has no Menu`, async ({ page }) => {
      await page.setViewportSize({ width, height: 780 });
      await page.goto('/portfolio/');
      await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
      await expect(page.locator('.header__nav')).toBeHidden();
      await expect(page.locator('.header__brand')).toBeVisible();
      const bar = page.getByRole('navigation', { name: 'Site' });
      await expect(bar).toHaveCount(1);
      const links = bar.getByRole('link');
      await expect(links).toHaveText(['Home', 'Skills', 'Portfolio', 'Quality', 'Contact']);
      expect(await links.evaluateAll((els) => els.map((a) => a.getAttribute('href')))).toEqual(['/', '/skills/', '/portfolio/', '/quality/', '/contact/']);
      await expect(bar.getByRole('link', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page');
      await expect(bar.locator('[aria-current]')).toHaveCount(1);
      const box = (await bar.boundingBox())!;
      expect(box.x).toBe(0);
      expect(box.width).toBe(width);
      expect(box.y + box.height, 'on the foot of the screen').toBe(780);
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
    // (once the page has laid out: a page that opens past the headline shows no ticket)
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // (passing the headline docks the bug ticket's strip on the bar; the page grows by it)
    await expect(page.locator('.hero__ticket')).toHaveClass(/is-in/);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(300);
    const top = (await page.locator('.ticket__dock').boundingBox())!.y;
    const ship = (await page.locator('.hud__runner').boundingBox())!;
    expect(ship.y + ship.height, 'the ship rides on the bar (and the strip on it)').toBeLessThanOrEqual(top + 1);
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
      await expect(p.getByRole('navigation', { name: 'Site' }).getByRole('link')).toHaveText(['Home', 'Skills', 'Portfolio', 'Quality', 'Contact']);
      await expect(p.locator('.hud__runner')).toHaveCount(options.reducedMotion ? 0 : 1);
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
    // the cutout fades at the top (a short fade) and the bottom (a long one); the glow behind it is
    // an ellipse that ends inside its own box, so neither has a hard edge
    const mask = await page.locator('.hero__figure').evaluate((el) => {
      const pic = el.querySelector('picture')!;
      const cs = getComputedStyle(pic) as CSSStyleDeclaration & { webkitMaskImage?: string };
      const glow = getComputedStyle(el, '::before');
      return { mask: cs.maskImage || cs.webkitMaskImage || '', composite: (cs as CSSStyleDeclaration & { maskComposite?: string }).maskComposite || '', figMask: getComputedStyle(el).maskImage, glow: glow.backgroundImage, glowW: parseFloat(glow.width), figW: el.getBoundingClientRect().width };
    });
    // the vertical fade (short at the top, eased over the last third) meets an ellipse, so the
    // lower sides and the bottom corners fade too and no straight edge is left
    expect(mask.mask).toMatch(/linear-gradient\((to bottom, )?rgb\(0, 0, 0\) 0%, rgb\(0, 0, 0\) 68%, rgba\(0, 0, 0, 0\.9\) 75%/);
    expect(mask.mask, 'no fade at the top: the headset is whole in the picture').not.toMatch(/rgba\(0, 0, 0, 0\) 0%/);
    expect(mask.mask).toContain('radial-gradient(');
    expect(mask.mask.match(/gradient\(/g)?.length).toBe(2);
    expect(mask.composite, 'the two masks intersect').toMatch(/^intersect/);
    expect(mask.figMask, 'the figure itself is not masked, so the glow is not cut at its edges').toBe('none');
    expect(mask.glow).toContain('radial-gradient');
    expect(mask.glow, 'the glow reaches transparent inside its box').toMatch(/rgba\(0, 0, 0, 0\) 72%/);
    expect(mask.glowW, 'the glow is wider than the figure').toBeGreaterThan(mask.figW * 1.5);
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

  test("the hero's exit, triggered at thresholds and played on the clock: the name breaks and its pixels land, the hero fades on the next title's top edge without covering it, the first ticket waits for the fix, a later one shows for three seconds, and everything mends on the way back", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const h1 = page.locator('h1');
    const canvas = page.locator('.hero__break');
    const ticket = page.locator('.hero__ticket');
    await expect(canvas).toBeHidden();
    await expect(ticket).toBeHidden();
    const opacity = () => page.locator('.hero').evaluate((el) => Number(getComputedStyle(el).opacity));
    const at = async (y: number) => {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(120);
    };
    // above the threshold nothing moves: the scroll alone never scrubs it
    await at(120);
    await page.waitForTimeout(500);
    await expect(canvas).toBeHidden();
    expect(await opacity()).toBe(1);
    // past it, the break plays by itself on the clock, the pixels landed in about 0.6 s whatever the
    // scroll does meanwhile (here it stands still); the hero stays, the photo showing through the clouds
    await at(260);
    await expect(canvas).toBeVisible();
    await expect(h1).toHaveCSS('opacity', '0');
    await expect(h1).toHaveText(/Nicolás\s*Porras/);
    await page.waitForTimeout(700);
    expect(await opacity(), 'the hero still there early in the slide').toBe(1);
    // once Level 2 covers most of it, the hero fades out on the clock too, in about 0.4 s
    await at(850);
    await expect.poll(opacity, { timeout: 1000 }).toBe(0);
    // then the page scrolls on with the heap riding on the title by itself
    await at(1000);
    await page.waitForTimeout(1300);
    await expect(canvas).toBeVisible();
    expect(await canvas.evaluate((el) => getComputedStyle(el).position), 'in the page, so it scrolls with the title').toBe('absolute');
    // the pixels: landed on the tops of the title's letters, none on them, a heap along them. The
    // letters are read from a screenshot with the copy hidden (the copy is the same colour)
    await page.waitForTimeout(200);
    const text = await page.locator('.wall__title').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return { x: Math.floor(r.left), y: Math.floor(r.top), w: Math.ceil(r.width), h: Math.ceil(r.height) };
    });
    expect(text.y, 'the title is on screen').toBeGreaterThan(0);
    await page.addStyleTag({ content: '.hero__break, .hero__ticket { visibility: hidden !important; }' }).then((h) => h.evaluate((el) => el.setAttribute('id', 'zz-hide')));
    const png = await page.screenshot({ clip: { x: text.x, y: text.y, width: text.w, height: text.h } });
    await page.evaluate(() => document.getElementById('zz-hide')!.remove());
    const { data: shot, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const letters: boolean[] = [];
    for (let i = 0; i < info.width * info.height; i++) letters.push(shot[i * info.channels] > 200 && shot[i * info.channels + 1] > 200 && shot[i * info.channels + 2] > 200);
    const inkTop = text.y + Math.floor(letters.findIndex(Boolean) / info.width);
    const land = await page.evaluate(
      ({ text, letters, width, inkTop }) => {
        // every lit pixel of the canvas, on the screen
        const points: [number, number][] = [];
        for (const c of document.querySelectorAll<HTMLCanvasElement>('.hero__break')) {
          if (c.hidden) continue;
          const r = c.getBoundingClientRect();
          const k = c.width / r.width;
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] >= 128) points.push([r.left + x / k, r.top + y / k]);
        }
        const lit = new Set(points.map(([x, y]) => `${Math.floor(x)},${Math.floor(y)}`));
        let onLetters = 0;
        for (let y = 0; y < text.h; y++) for (let x = 0; x < width; x++) if (letters[y * width + x] && lit.has(`${text.x + x},${text.y + y}`)) onLetters++;
        const onEdge = points.filter(([, vy]) => vy >= inkTop - 16 && vy <= inkTop).length;
        const below = points.filter(([, vy]) => vy > inkTop + 0.5).length;
        return { onLetters, onEdge, below };
      },
      { text, letters, width: info.width, inkTop },
    );
    expect(land.onLetters, 'no pixel on the letters').toBe(0);
    expect(land.below, 'nothing drawn below their tops').toBe(0);
    expect(land.onEdge, 'a heap along their tops').toBeGreaterThan(20);
    // on the way back the pixels fly home on the clock and the name is whole again
    await at(0);
    await expect(canvas).toBeHidden({ timeout: 2000 });
    await expect(h1).toHaveCSS('opacity', '1');
    await expect.poll(opacity, { timeout: 1000 }).toBe(1);
    await expect(ticket).toContainText('Fixed');
    await expect(ticket.locator('.ticket__hint')).toBeHidden();
    await expect(ticket).not.toHaveClass(/is-in/, { timeout: 5000 });
    // a later break in the same visit: Open with the hint for three seconds, then it tucks away
    await at(300);
    await expect(ticket).toHaveClass(/is-in/);
    await expect(ticket).toContainText('BUG-001');
    await expect(ticket).toContainText('Open');
    await expect(ticket).not.toHaveClass(/is-kept/);
    await expect(ticket.locator('.ticket__hint')).toHaveText('Scroll back up to fix');
    await expect(ticket.locator('.ticket__hint')).toBeVisible();
    const t0 = Date.now();
    await at(700);
    await page.waitForTimeout(Math.max(0, 2500 - (Date.now() - t0)));
    await expect(ticket, 'still there after two and a half seconds').toHaveClass(/is-in/);
    await expect(ticket).not.toHaveClass(/is-in/, { timeout: 1500 });
    expect(Date.now() - t0).toBeLessThan(4000);
  });

  for (const [width, height] of [
    [1440, 900],
    [768, 1000],
    [375, 780],
  ] as const) {
    test(`the bug ticket (${width}px) docks by the scoreboard in one spot that never moves, hides or fades at any scroll position and covers nothing outside the game layer; the first shows the card for four seconds and then the pulsing chip until fixed or dismissed; the toast and the scoreboard's card open above it; Fixed, then gone; later ones for three seconds; Dismiss`, async ({ page, browser }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      const ticket = page.locator('.hero__ticket');
      const card = ticket.locator('.ticket__cardin');
      const chip = ticket.locator('[data-ticket-chip]');
      const spot = width < 768 ? ticket.locator('.ticket__dock') : chip;
      const box = async () => (await spot.boundingBox())!;
      const wallTop = await page.locator('.wall').evaluate((el) => el.getBoundingClientRect().top + scrollY);
      const breakAt = width < 768 ? Math.round(wallTop - height + 260) : 300;
      await page.evaluate((y) => window.scrollTo(0, y), breakAt);
      // the first time in a visit: kept, the card open
      await expect(ticket).toHaveClass(/is-in/);
      await expect(ticket).toHaveClass(/is-kept/);
      await expect(card).toBeVisible();
      await expect(chip).toHaveAttribute('aria-expanded', 'true');
      await expect(card).toContainText('Scroll back up to fix');
      // the same family as the toasts: the light field, navy ink, a navy outline, Pixel Operator
      const look = await page.evaluate(() => {
        const t = getComputedStyle(document.querySelector('.ticket__cardin')!);
        const o = getComputedStyle(document.querySelector('.toast')!);
        return { bg: [t.backgroundColor, o.backgroundColor], outline: [t.outlineColor, o.outlineColor], font: [t.fontFamily, o.fontFamily] };
      });
      for (const [k, [a, b]] of Object.entries(look)) expect(a, k).toBe(b);
      // every piece of text reads at AA on what is behind it
      const ratios = await ticket.evaluate((el) => {
        const lum = (c: string) => {
          const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
            const s = Number(v) / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const bgOf = (n: Element | null): string => {
          for (; n; n = n.parentElement) {
            const c = getComputedStyle(n).backgroundColor;
            if (c !== 'rgba(0, 0, 0, 0)') return c;
          }
          return 'rgb(12, 21, 42)';
        };
        return Array.from(el.querySelectorAll('.ticket__key, .ticket__title, dt, .ticket__status, .ticket__hint, .ticket__close, .ticket__chipkey, .ticket__chipstatus, .ticket__chiphint'))
          .filter((n) => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden')
          .map((n) => {
            const a = lum(getComputedStyle(n).color);
            const b = lum(bgOf(n));
            return { what: n.className || n.tagName, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
          });
      });
      expect(ratios.length).toBeGreaterThanOrEqual(6);
      for (const r of ratios) expect(r.ratio, `${r.what} at AA`).toBeGreaterThanOrEqual(4.5);
      // the first ticket of a visit: the full card for four seconds (none of these widths fits it in
      // the gutter), then folded into the chip, which stays, pulsing, and never moves
      const first = await box();
      if (width >= 1024) {
        // the card stacked above the chip and the pill, right-aligned with them
        const c = (await card.boundingBox())!;
        expect(c.y + c.height).toBeLessThanOrEqual(first.y + 1);
        expect(Math.abs(c.x + c.width - (first.x + first.width))).toBeLessThanOrEqual(4);
      }
      await page.waitForTimeout(3300);
      await expect(chip, 'the card for four seconds').toHaveAttribute('aria-expanded', 'true');
      await expect(chip).toHaveAttribute('aria-expanded', 'false', { timeout: 2000 });
      await expect(card).toBeHidden();
      await expect(ticket, 'folded, not gone').toHaveClass(/is-in/);
      expect(await chip.evaluate((el) => getComputedStyle(el, '::after').animationName), 'a gentle pulse while it is still open').toBe('chip-pulse');
      await page.waitForTimeout(500);
      const home = await box();
      expect(home, 'folding never moves the chip').toEqual(first);
      // where it lives
      const pill = (await page.locator('.score__pill').boundingBox())!;
      if (width >= 1024) {
        // above the pill, right-aligned with it, in the gutter beside the column
        expect(Math.abs(home.x + home.width - (pill.x + pill.width))).toBeLessThanOrEqual(1);
        expect(home.y + home.height).toBeLessThanOrEqual(pill.y);
        const column = await page.locator('.level').first().evaluate((el) => innerWidth - parseFloat(getComputedStyle(el).paddingRight));
        expect(home.x, 'in the gutter, clear of the column').toBeGreaterThanOrEqual(column);
      } else if (width >= 768) {
        // inside the bottom bar, beside the pill
        const bar = (await page.locator('#hud').boundingBox())!;
        expect(home.y).toBeGreaterThanOrEqual(bar.y - 1);
        expect(home.y + home.height).toBeLessThanOrEqual(bar.y + bar.height + 1);
        expect(home.x + home.width).toBeLessThanOrEqual(pill.x);
      } else {
        // a strip the whole width on the bar's top edge, the track riding on top of it
        const bar = (await page.locator('.tabbar').boundingBox())!;
        const line = (await page.locator('#hud').boundingBox())!;
        expect(home.x).toBe(0);
        expect(home.width).toBe(width);
        expect(Math.abs(home.y + home.height - bar.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(line.y + line.height - home.y)).toBeLessThanOrEqual(1);
      }
      // at every scroll position: the same spot, on show, not faded, and (on a desktop, where it
      // stands beside the column rather than in a bar) over no heading, link, button or field
      const end = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      for (let y = breakAt; y <= end + height; y += Math.round(height * 0.3)) {
        await page.evaluate((y) => window.scrollTo(0, y), Math.min(y, end));
        await page.waitForTimeout(80);
        expect(await box(), `the same spot at ${y}`).toEqual(home);
        const shown = await ticket.evaluate((el) => {
          const cs = getComputedStyle(el);
          return el.classList.contains('is-in') && cs.visibility === 'visible' && cs.opacity === '1';
        });
        expect(shown, `on show at ${y}`).toBe(true);
        if (width >= 1024) {
          const hits = await page.evaluate((b) => {
            return Array.from(document.querySelectorAll<HTMLElement>(':is(main, footer) :is(h1, h2, h3, h4, a, button, input, textarea, select)'))
              .filter((el) => !el.closest('.hero__ticket, .bug, .dock, .hud') && el.getClientRects().length)
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.left < b.x + b.width && r.right > b.x && r.top < b.y + b.height && r.bottom > b.y;
              })
              .map((el) => `${el.tagName} ${(el.textContent ?? '').trim().slice(0, 30)}`);
          }, home);
          expect(hits, `clear at ${y}`).toEqual([]);
        }
      }
      // at the foot of the page the last line and button end above it
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      const legal = (await page.locator('.footer__legal').boundingBox())!;
      if (width < 1024) expect(legal.y + legal.height, 'the page ends above the ticket').toBeLessThanOrEqual(home.y);
      else expect(legal.x + legal.width <= home.x || legal.y + legal.height <= home.y).toBe(true);
      // the chip opens the card and closes it, and folds it after three seconds
      await chip.click();
      await expect(chip).toHaveAttribute('aria-expanded', 'true');
      await expect(card).toBeVisible();
      expect(await box(), 'opening never moves it').toEqual(home);
      // the toast and the scoreboard's card open above it, open card and all
      const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('playrun:achieve', { detail: 'selftest' })));
      await expect(page.locator('[data-toast]')).toHaveClass(/is-in/);
      await page.waitForTimeout(450);
      const toast = (await page.locator('[data-toast]').boundingBox())!;
      expect(overlap(toast, (await card.boundingBox())!), 'the toast above the open card').toBe(false);
      expect(overlap(toast, home), 'the toast above the chip').toBe(false);
      await chip.click();
      await expect(chip).toHaveAttribute('aria-expanded', 'false');
      await page.locator('.score__pill').click();
      const panel = page.locator('.score__panel');
      await expect(panel).toBeVisible();
      expect(overlap((await panel.boundingBox())!, home), "the scoreboard's card above the chip").toBe(false);
      await page.keyboard.press('Escape');
      // opened again, it folds again after four seconds
      await chip.click();
      await expect(card).toBeVisible();
      expect(await chip.evaluate((el) => getComputedStyle(el, '::after').animationName), 'no pulse while open').toBe('none');
      await page.waitForTimeout(3300);
      await expect(chip).toHaveAttribute('aria-expanded', 'true');
      await expect(chip).toHaveAttribute('aria-expanded', 'false', { timeout: 2000 });
      // back to the top: the name is whole, Fixed for three seconds, then it goes; the visit is done
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(ticket).toContainText('Fixed', { timeout: 2500 });
      await expect(card).toBeVisible();
      await expect(ticket).not.toHaveClass(/is-in/, { timeout: 4500 });
      expect(await page.evaluate(() => sessionStorage.getItem('playrun.ticket'))).toBe('done');
      // later in the visit (a reload too): the card for three seconds, then away
      await page.reload();
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      await page.evaluate((y) => window.scrollTo(0, y), breakAt);
      await expect(ticket).toHaveClass(/is-in/);
      await expect(ticket).not.toHaveClass(/is-kept/);
      await expect(card).toBeVisible();
      await expect(ticket).not.toHaveClass(/is-in/, { timeout: 4500 });
      // Dismiss: a real button, closes it, counts as done, and no Fixed after it
      const fresh = await browser.newContext({ viewport: { width, height } });
      const p2 = await fresh.newPage();
      await p2.goto('/');
      await p2.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      await p2.evaluate(() => document.fonts.ready);
      await p2.waitForTimeout(400);
      await p2.evaluate((y) => window.scrollTo(0, y), breakAt);
      const t2 = p2.locator('.hero__ticket');
      await expect(t2).toHaveClass(/is-kept/);
      await p2.getByRole('button', { name: 'Dismiss ticket' }).click();
      await expect(t2).not.toHaveClass(/is-in/);
      expect(await p2.evaluate(() => sessionStorage.getItem('playrun.ticket'))).toBe('done');
      await p2.evaluate(() => window.scrollTo(0, 0));
      await p2.waitForTimeout(1500);
      await expect(t2).not.toHaveClass(/is-in/);
      await fresh.close();
    });
  }

  for (const [width, height] of [
    [1440, 900],
    [768, 1000],
    [375, 780],
  ] as const) {
    test(`the scoreboard's card with the bug ticket docked (${width}px): it opens and closes on the pill, Escape and a click outside; Reset clears the progress at once; Games toggles; the ticket and the card never block each other's clicks`, async ({ browser }) => {
      test.setTimeout(60_000);
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 768 });
      const page = await context.newPage();
      // some progress to clear
      await page.addInitScript(() => {
        if (!sessionStorage.getItem('seeded')) {
          localStorage.setItem('playrun.games', JSON.stringify({ on: true, bugs: ['hero-1', 'wall-1'], achievements: ['first-bug', 'selftest'] }));
          sessionStorage.setItem('seeded', '1');
        }
      });
      await page.goto('/');
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const wallTop = await page.locator('.wall').evaluate((el) => el.getBoundingClientRect().top + scrollY);
      await page.evaluate((y) => window.scrollTo(0, y), width < 768 ? Math.round(wallTop - height + 260) : 300);
      const ticket = page.locator('.hero__ticket');
      const chip = ticket.locator('[data-ticket-chip]');
      await expect(ticket).toHaveClass(/is-in/);
      await page.waitForTimeout(500);
      const pill = page.getByRole('button', { name: /^Scoreboard/ });
      const panel = page.locator('.score__panel');
      const press = (l: typeof pill) => (width < 768 ? l.tap() : l.click());
      // the pill opens it and closes it, with the pointer still on it
      await press(pill);
      await expect(panel).toBeVisible();
      await expect(pill).toHaveAttribute('aria-expanded', 'true');
      await press(pill);
      await expect(panel).toBeHidden();
      await expect(pill).toHaveAttribute('aria-expanded', 'false');
      // Escape
      await press(pill);
      await expect(panel).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      // a click (or a tap) anywhere outside, on the page or on the ticket
      await press(pill);
      await expect(panel).toBeVisible();
      if (width < 768) await page.touchscreen.tap(width / 2, 120);
      else await page.mouse.click(width / 2, 120);
      await expect(panel).toBeHidden();
      await press(pill);
      await expect(panel).toBeVisible();
      // the ticket is not under the card: its chip takes the click (and that closes the card)
      const c = (await chip.boundingBox())!;
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-ticket-chip]') !== null, [c.x + c.width / 2, c.y + c.height / 2])).toBe(true);
      const was = await chip.getAttribute('aria-expanded');
      await press(chip);
      await expect(chip).not.toHaveAttribute('aria-expanded', was!);
      await expect(panel).toBeHidden();
      // nothing lies over the card's buttons
      await press(pill);
      await expect(panel).toBeVisible();
      for (const sel of ['[data-hud-toggle]', '[data-hud-reset]']) {
        const b = (await page.locator(sel).boundingBox())!;
        expect(await page.evaluate(([x, y, s]) => document.elementFromPoint(x as number, y as number)?.closest(s as string) !== null, [b.x + b.width / 2, b.y + b.height / 2, sel] as const), `${sel} takes the click`).toBe(true);
      }
      // Reset: bugs and achievements cleared, the card, the pill and the stored progress at once
      await expect(page.locator('[data-panel-bugs]')).toHaveText('2');
      await expect(page.locator('[data-hud-ach]')).toHaveText('2/4');
      await press(page.locator('[data-hud-reset]'));
      await expect(page.locator('[data-panel-bugs]')).toHaveText('0');
      await expect(page.locator('[data-panel-ach]')).toHaveText('0');
      await expect(page.locator('[data-hud-bugs]')).toHaveText('00');
      await expect(page.locator('[data-hud-ach]')).toHaveText('0/4');
      await expect(page.locator('.score__ach li.is-done')).toHaveCount(0);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('playrun.games')!))).toMatchObject({ bugs: [], achievements: [] });
      await expect(panel, 'Reset keeps the card open').toBeVisible();
      // Games off and on again
      const toggle = page.locator('[data-hud-toggle]');
      await press(toggle);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('html')).toHaveClass(/games-off/);
      await press(toggle);
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('html')).not.toHaveClass(/games-off/);
      await context.close();
    });
  }

  test("the first ticket's full card covers no content on a desktop: it stays open where it fits the gutter (1920), and folds into the chip in the gutter where it does not (1440), with no room kept for the card", async ({ browser }) => {
    test.setTimeout(60_000);
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
    ] as const) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await page.goto('/');
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 300));
      const card = page.locator('.ticket__cardin');
      const chip = page.locator('[data-ticket-chip]');
      await expect(card).toBeVisible();
      await page.waitForTimeout(600);
      const column = await page.locator('.level').first().evaluate((el) => innerWidth - parseFloat(getComputedStyle(el).paddingRight));
      const c = (await card.boundingBox())!;
      await page.waitForTimeout(4400);
      if (width === 1920) {
        expect(c.x, 'the card in the gutter').toBeGreaterThanOrEqual(column);
        await expect(chip, 'and it stays open').toHaveAttribute('aria-expanded', 'true');
      } else {
        expect(c.x, 'the card does not fit the gutter').toBeLessThan(column);
        await expect(chip, 'so it folds').toHaveAttribute('aria-expanded', 'false');
        expect((await chip.boundingBox())!.x, 'the chip in the gutter').toBeGreaterThanOrEqual(column);
      }
      // the room at the foot is the chip's only, never the card's
      const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ticket-pad')));
      expect(pad).toBeLessThan(80);
      await context.close();
    }
  });

  test('Reset on the scoreboard starts the bug ticket over: after it, the next break shows the first-time ticket again', async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('playrun.ticket', 'done');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const ticket = page.locator('.hero__ticket');
    // the visit has had its first ticket: this one is a three-second one
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect(ticket).toHaveClass(/is-in/);
    await expect(ticket).not.toHaveClass(/is-kept/);
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await page.locator('[data-hud-reset]').click();
    expect(await page.evaluate(() => sessionStorage.getItem('playrun.ticket'))).toBeNull();
    await page.keyboard.press('Escape');
    // back up and down again: the first-time ticket, kept until the fix
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.hero__break')).toBeHidden({ timeout: 2500 });
    await expect(ticket).not.toHaveClass(/is-in/, { timeout: 4500 });
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect(ticket).toHaveClass(/is-in/);
    await expect(ticket).toHaveClass(/is-kept/);
    await page.waitForTimeout(5500);
    await expect(ticket, 'still there, folded into the chip').toHaveClass(/is-in/);
  });

  test("the hero's exit is triggered, not scrubbed: it plays for a fixed time (1.2 s down, 1 s back) whatever the scroll speed, holds still at the threshold, and draws nothing while the page scrolls between crossings", async ({ page }) => {
    test.setTimeout(60_000);
    // count every pixel drawn on the break's canvas
    await page.addInitScript(() => {
      const w = window as unknown as { draws: number };
      w.draws = 0;
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (...args: [number, number, number, number]) {
        if (this.canvas.classList.contains('hero__break')) w.draws++;
        return fill.apply(this, args);
      };
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const draws = () => page.evaluate(() => (window as unknown as { draws: number }).draws);
    const canvas = page.locator('.hero__break');
    // the two markers: the break lower than the mend, so a stop at the threshold cannot flicker
    const markAt = (k: string) => page.locator(`.wall__trip[data-trip="${k}"]`).evaluate((el) => el.getBoundingClientRect().top + scrollY);
    const [breakY, mendY] = (await Promise.all([markAt('break'), markAt('mend')])).map((m) => Math.round(m - 900));
    expect(breakY - mendY, 'a gap between the two').toBeGreaterThanOrEqual(16);
    // one jump far past the threshold: the animation still takes its own time
    await page.evaluate((y) => window.scrollTo(0, y), breakY + 600);
    await expect(canvas).toBeVisible();
    const t0 = Date.now();
    await page.waitForTimeout(150);
    const early = await draws();
    await page.waitForTimeout(850);
    const later = await draws();
    expect(later, 'still drawing a second after the jump, on its own clock (1.2 s)').toBeGreaterThan(early);
    await page.waitForTimeout(800);
    const done = await draws();
    expect(done, 'and still a little more before it settles').toBeGreaterThan(later);
    // settled: scrolling around this side of the threshold draws nothing at all
    for (const y of [breakY + 300, breakY + 900, breakY + 80, breakY + 1400]) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(150);
    }
    expect(await draws(), 'no drawing on scroll').toBe(done);
    expect(Date.now() - t0).toBeGreaterThan(600);
    // between the two markers it holds whichever state it was in
    await page.evaluate((y) => window.scrollTo(0, y), Math.round((breakY + mendY) / 2));
    await page.waitForTimeout(1500);
    await expect(canvas, 'still broken between the markers').toBeVisible();
    await page.evaluate((y) => window.scrollTo(0, y), mendY - 40);
    await page.waitForTimeout(600);
    await expect(canvas, 'the way home takes about a second').toBeVisible();
    await expect(canvas).toBeHidden({ timeout: 2000 });
    await page.evaluate((y) => window.scrollTo(0, y), Math.round((breakY + mendY) / 2));
    await page.waitForTimeout(1500);
    await expect(canvas, 'still whole between the markers').toBeHidden();
    await expect(page.locator('h1')).toHaveCSS('opacity', '1');
  });

  test("the hero's exit is off under reduced motion and with the games off: the name stays whole, the hero simply goes behind, no ticket", async ({ page, browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const quiet = await context.newPage();
    await quiet.goto('/');
    await quiet.evaluate(() => window.scrollTo(0, 500));
    await quiet.waitForTimeout(300);
    await expect(quiet.locator('.hero__break')).toBeHidden();
    await expect(quiet.locator('.hero__ticket')).toBeHidden();
    await expect(quiet.locator('h1')).toHaveCSS('opacity', '1');
    await expect(quiet.locator('.hero')).toHaveCSS('opacity', '1');
    await context.close();
    // games off from the scoreboard
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await page.getByRole('button', { name: 'Games on' }).click();
    await page.mouse.click(700, 120);
    await page.evaluate(() => document.fonts.ready);
    for (const y of [200, 500, 800]) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(250);
      await expect(page.locator('.hero__break')).toBeHidden();
      await expect(page.locator('.hero__ticket')).not.toHaveClass(/is-in/);
      await expect(page.locator('h1')).toHaveCSS('opacity', '1');
      await expect(page.locator('.hero')).toHaveCSS('opacity', '1');
    }
  });

  test('the ticker rolls every title left as a plain image or its icon, named for a screen reader, the biggest names first; it pauses with the button', async ({ page }) => {
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
    expect(viewBox.height, 'the logos are the content of the section').toBeGreaterThanOrEqual(120);
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

  test('under reduced motion the ticker is a still row', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const track = page.locator('.ticker__track');
    expect(await track.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await expect(page.locator('.ticker__copy')).toBeHidden();
    await expect(page.getByRole('button', { name: /the logos/ })).toBeHidden();
    expect(await page.locator('.ticker__view').evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto');
    await context.close();
  });

  test('every stat carries a caption: Montserrat italic in cyan under the active row, fading in with it, the six all shown in the still list', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const drum = page.locator('[data-drum]');
    await drum.scrollIntoViewIfNeeded();
    await expect(drum).toHaveClass(/is-live/);
    const caps = drum.locator('.drum__row:not(.drum__clone) .drum__cap');
    await expect(caps).toHaveText(['Started in 2021. Still finding things.', 'Six sets of house rules learned.', 'Every one played to the credits.', 'Headset tan included.', 'Each one with its own cable.', 'Test plans, rotas and the odd pep talk.']);
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
      lead: parseFloat(getComputedStyle(document.querySelector('.stats__head .level__lead')!).fontSize),
    }));
    expect(sizes.num).toBeGreaterThanOrEqual(94);
    expect(sizes.num).toBeLessThanOrEqual(98);
    expect(sizes.label).toBeGreaterThanOrEqual(22);
    expect(sizes.title).toBeGreaterThanOrEqual(44);
    expect(sizes.title).toBeLessThanOrEqual(50);
    expect(sizes.num).toBeGreaterThan(sizes.title);
    expect(sizes.lead).toBeGreaterThanOrEqual(16);
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
    await expect(page.locator('.hero').getByRole('link')).toHaveCount(0);
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
