import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    expect(await page.locator('.stats').evaluate((el) => getComputedStyle(el).backgroundColor), 'the stats stand on the navy field').toBe('rgb(22, 36, 77)');
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
    // it turns on its own, one row every 2.5 s
    await page.waitForTimeout(3300);
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
    await page.waitForTimeout(3300);
    expect((await state()).shown[2].text, 'rests under the pointer').toBe(held);
    await page.mouse.move(10, 10);
    // focus inside: it rests; the buttons show their focus
    await prev.focus();
    await page.keyboard.press('Tab');
    await expect(next).toBeFocused();
    expect(await next.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    const focusedText = (await state()).shown[2].text;
    await page.waitForTimeout(3300);
    expect((await state()).shown[2].text, 'rests while a button has focus').toBe(focusedText);
    await page.mouse.click(10, 10);
    // the pause control
    const pauseButton = page.getByRole('button', { name: 'Pause the stats' });
    await pauseButton.click();
    await page.mouse.click(10, 10);
    await expect(page.getByRole('button', { name: 'Play the stats' })).toHaveAttribute('aria-pressed', 'true');
    const pausedText = (await state()).shown[2].text;
    await page.waitForTimeout(3300);
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
    await page.waitForTimeout(3300);
    expect(await page.locator('.drum__list').evaluate((el) => el.style.getPropertyValue('--i')), 'still while off screen').toBe(away);
  });

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
    // Nothing is ticked before the test runs: idle boxes and blank counts, the last run as text only
    await expect(page.locator('.panel.is-idle')).toHaveCount(6);
    await expect(page.locator('.panel.is-pass, .panel.is-failed')).toHaveCount(0);
    await expect(page.locator('#selftest-status')).toHaveText(/\d+ (of \d+ checks passed in the last run|checks run before every deploy)/);
    const quality = page.locator('.proof').getByRole('link', { name: 'How I test this site' });
    await expect(quality).toHaveAttribute('href', '/quality/');
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
    for (const path of ['/skills/', '/portfolio/', '/quality/', '/contact/', '/terms/', '/privacy/']) {
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
    test(`renders without sideways overflow at ${vp.width}px (${vp.name})`, async ({ page }) => {
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
