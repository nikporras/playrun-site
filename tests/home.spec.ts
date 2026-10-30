import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
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
  test('loads with one h1 and no console errors or failed requests', async ({ page }) => {
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
      "I've been testing games since 2021, on consoles, PC and VR. I've led QA teams at nDreams and Historic VR, and taken games all the way to release on several platforms. I plan the testing, run it on real hardware, and write reports developers can act on.",
    );
    await page.waitForLoadState('networkidle');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('every internal link resolves', async ({ page, request }) => {
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

  test('has no accessibility violations (axe)', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('headings are in order and images have alt text', async ({ page }) => {
    await page.goto('/');
    const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1], `heading jump at index ${i}: ${levels.join(',')}`).toBeLessThanOrEqual(1);
    }
    const missingAlt = await page.locator('img:not([alt])').count();
    expect(missingAlt).toBe(0);
  });

  test('keyboard focus is visible on the first interactive element', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip');
    await expect(skip).toBeFocused();
    const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('menu toggle works on a phone, and the nav holds Home, the three pages and the button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'Menu' });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
    const nav = page.getByRole('navigation', { name: 'Site' });
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Skills', 'Portfolio', 'Quality', 'Get in touch']);
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('the hero is pinned and the next level slides over it; it scrolls away under reduced motion', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const hero = page.locator('.hero');
    expect(await hero.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    const figure = page.locator('.hero__figure img');
    await expect(figure).toBeVisible();
    expect(await page.locator('main img:not([alt=""])').count(), 'the photo appears once on the site').toBe(1);
    // the cutout fades at the top (a short fade) and the bottom (a long one); the glow behind it is
    // an ellipse that ends inside its own box, so neither has a hard edge
    const mask = await page.locator('.hero__figure').evaluate((el) => {
      const pic = el.querySelector('picture')!;
      const cs = getComputedStyle(pic) as CSSStyleDeclaration & { webkitMaskImage?: string };
      const glow = getComputedStyle(el, '::before');
      return { mask: cs.maskImage || cs.webkitMaskImage || '', figMask: getComputedStyle(el).maskImage, glow: glow.backgroundImage, glowW: parseFloat(glow.width), figW: el.getBoundingClientRect().width };
    });
    expect(mask.mask).toMatch(/linear-gradient\((to bottom, )?rgba\(0, 0, 0, 0\) 0%, rgb\(0, 0, 0\) 7%, rgb\(0, 0, 0\) 74%, rgba\(0, 0, 0, 0\) 100%\)/);
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

  test('the headline breaks with the scroll and mends on the way back; the ticket reads Open, then Fixed; nothing under reduced motion', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => document.fonts.ready);
    const h1 = page.locator('h1');
    const canvas = page.locator('.hero__break');
    const ticket = page.locator('.hero__ticket');
    await expect(canvas).toBeHidden();
    await expect(ticket).toBeHidden();
    // the centre of the drawn pixels, to see them move with the scroll
    const centre = () =>
      page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>('.hero__break')!;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        let sum = 0;
        for (let i = 3; i < d.length; i += 4 * 7) {
          if (d[i] > 100) {
            n++;
            sum += Math.floor(i / 4 / c.width);
          }
        }
        return { n, y: sum / Math.max(1, n) };
      });
    await page.evaluate(() => window.scrollTo(0, 120));
    await expect(canvas).toBeVisible();
    await expect(h1).toHaveCSS('opacity', '0');
    await expect(h1).toHaveText(/Nicolás\s*Porras/);
    await expect(ticket).toHaveClass(/is-in/);
    await expect(ticket).toContainText('BUG-001');
    await expect(ticket).toContainText('Open');
    const near = await centre();
    expect(near.n).toBeGreaterThan(20);
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(100);
    const far = await centre();
    expect(far.y, 'the pixels have fallen further').toBeGreaterThan(near.y + 10);
    await page.evaluate(() => window.scrollTo(0, 120));
    await page.waitForTimeout(100);
    expect((await centre()).y, 'and come back up').toBeLessThan(far.y - 10);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(canvas).toBeHidden();
    await expect(h1).toHaveCSS('opacity', '1');
    await expect(ticket).toContainText('Fixed');
    await expect(ticket).toHaveClass(/is-in/);
    await expect(ticket).not.toHaveClass(/is-in/, { timeout: 5000 });
    // every time, not once a visit
    await page.evaluate(() => window.scrollTo(0, 120));
    await expect(ticket).toContainText('Open');
    await expect(ticket).toHaveClass(/is-in/);

    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const quiet = await context.newPage();
    await quiet.goto('/');
    await quiet.evaluate(() => window.scrollTo(0, 300));
    await quiet.waitForTimeout(200);
    await expect(quiet.locator('.hero__break')).toBeHidden();
    await expect(quiet.locator('.hero__ticket')).toBeHidden();
    await expect(quiet.locator('h1')).toHaveCSS('opacity', '1');
    await context.close();
  });

  test('the ticker rolls every title left as a logo or its icon, the biggest names first, each linking to the portfolio; it pauses with the button and on focus', async ({ page }) => {
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const seq = page.locator('.ticker__seq').first();
    const links = seq.locator('.wall__link');
    expect(await links.count()).toBe(19);
    const names = await links.evaluateAll((as) => as.map((a) => a.getAttribute('aria-label') ?? ''));
    expect(names.slice(0, 5)).toEqual(['Beat Saber', 'NBA 2K21', 'Cyberpunk 2077', 'Ghostbusters: Rise of the Ghost Lord', "Lou's Lagoon"]);
    expect(names).toContain('The Climb 2');
    expect(names, 'Londinium shares the Historic VR logo, so it is not on the ticker').not.toContain('Londinium: AD 215');
    expect(new Set(names).size).toBe(19);
    for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) expect(href).toBe('/portfolio');
    expect(await seq.locator('.wall__logo').count(), 'official logos').toBeGreaterThanOrEqual(16);
    // no boxes: the logos float on the field
    expect(await page.locator('.ticker__view').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await links.first().evaluate((el) => [getComputedStyle(el.parentElement!).borderLeftWidth, getComputedStyle(el.parentElement!).backgroundColor])).toEqual(['0px', 'rgba(0, 0, 0, 0)']);
    const viewBox = (await page.locator('.ticker__view').boundingBox())!;
    expect(viewBox.height, 'the logos are the content of the section').toBeGreaterThanOrEqual(120);
    expect(viewBox.height).toBeLessThanOrEqual(200);
    // the title is the section-head size, smaller than the next level's title
    const sizes = await page.evaluate(() => [parseFloat(getComputedStyle(document.querySelector('#wall-title')!).fontSize), parseFloat(getComputedStyle(document.querySelector('#stats-title')!).fontSize)]);
    expect(sizes[0]).toBeLessThan(sizes[1]);
    // logos sized by eye: a tall stacked mark is taller and narrower than a wide wordmark
    const dims = await seq.locator('.wall__logo').evaluateAll((imgs) => imgs.map((img) => ({ name: img.closest('a')!.getAttribute('aria-label'), w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height })));
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
    // the copy that makes the loop seamless is out of the accessibility tree and the tab order
    const copy = page.locator('.ticker__copy');
    await expect(copy).toHaveAttribute('aria-hidden', 'true');
    expect(await copy.locator('a:not([tabindex="-1"])').count()).toBe(0);
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
    // a logo that takes keyboard focus is brought on screen and the ticker holds still
    const last = links.last();
    await last.focus();
    const r = (await last.boundingBox())!;
    const v = (await page.locator('.ticker__view').boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(v.x - 1);
    expect(r.x + r.width).toBeLessThanOrEqual(v.x + v.width + 1);
    const d = await x();
    await page.waitForTimeout(400);
    expect(Math.abs((await x()) - d), 'still while focused').toBeLessThan(1);
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

  test('the stats are counted from the data and count up into view', async ({ page }) => {
    await page.goto('/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const nums = page.locator('.stat__num');
    await expect(nums).toHaveCount(4);
    const labels = await page.locator('.stat__label').allTextContents();
    expect(labels).toEqual(['years in QA', 'companies', 'games', 'platforms']);
    // one row, thin lines between, no boxes; the label under its number
    const row = await page.locator('.stat').evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        const num = el.querySelector('.stat__num')!.getBoundingClientRect();
        const label = el.querySelector('.stat__label')!.getBoundingClientRect();
        return { top: Math.round(el.getBoundingClientRect().top), bg: cs.backgroundColor, left: cs.borderLeftWidth, under: label.top >= num.bottom - 2, numSize: parseFloat(getComputedStyle(el.querySelector('.stat__num')!).fontSize) };
      }),
    );
    expect(new Set(row.map((r) => r.top)).size, 'one row').toBe(1);
    expect(row.map((r) => r.left)).toEqual(['0px', '1px', '1px', '1px']);
    for (const r of row) {
      expect(r.bg).toBe('rgba(0, 0, 0, 0)');
      expect(r.under).toBe(true);
      expect(r.numSize).toBeGreaterThanOrEqual(64);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const tops = await page.locator('.stat').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'two per row on a phone').toBe(2);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.locator('.stats').scrollIntoViewIfNeeded();
    await expect(nums.nth(0)).toHaveText('5+', { timeout: 5000 });
    await expect(nums.nth(1)).toHaveText('6');
    await expect(nums.nth(2)).toHaveText('20');
    await expect(nums.nth(3)).toHaveText('10+');
  });

  test('the self test runs, reports and scores the page, and the Quality link stays visible', async ({ page }) => {
    await page.goto('/');
    // Nothing is ticked before the test runs: idle boxes and blank counts, the last run as text only
    await expect(page.locator('.panel.is-idle')).toHaveCount(6);
    await expect(page.locator('.panel.is-pass, .panel.is-failed')).toHaveCount(0);
    await expect(page.locator('#selftest-status')).toHaveText(/\d+ (of \d+ checks passed in the last run|checks run before every deploy)/);
    const quality = page.locator('.proof').getByRole('link', { name: 'How I test this site' });
    await expect(quality).toHaveAttribute('href', '/quality');
    await page.getByRole('button', { name: 'Test this page' }).click();
    await expect(page.locator('#selftest-status')).toContainText(/on your device/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible();
    await expect(page.locator('#selftest-score')).toBeVisible();
    await expect(page.locator('#selftest-score [data-score]')).toHaveText(/^\d\/6$/);
    await expect(page.locator('.panel.is-idle')).toHaveCount(0);
    await expect(page.locator('.panel.is-pass, .panel.is-failed')).toHaveCount(6);
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
    for (const path of ['/skills', '/portfolio', '/quality', '/contact', '/terms', '/privacy']) {
      await page.goto(path);
      await expect(page.locator('main').getByRole('link', { name: 'Get in touch' }), path).toHaveCount(0);
    }
  });

  test('hero content is in the HTML before any script runs', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.hero__value')).toBeVisible();
    await expect(page.locator('.ticker__seq').first().locator('.wall__link')).toHaveCount(19);
    await expect(page.getByRole('button', { name: /the logos/ })).toBeHidden();
    await expect(page.locator('.stat__num').first()).toHaveText('5+');
    await expect(page.locator('.final__text')).toContainText('Helldivers, The Witcher and God of War');
    await context.close();
  });

  for (const vp of VIEWPORTS) {
    test(`renders without sideways overflow at ${vp.width}px (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.evaluate(() => document.querySelectorAll('[data-enter], [data-land]').forEach((e) => e.classList.add('is-in', 'is-landed')));
      await settle(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
      await page.screenshot({ path: test.info().outputPath(`home-${vp.name}.png`), fullPage: true });
    });
  }
});
