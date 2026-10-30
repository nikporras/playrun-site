import { test, expect, type Page } from '@playwright/test';

/**
 * The phone is the same site as the desktop: every page, every section, heading, paragraph, stat,
 * card, tag, image and link that shows at 1440 shows at 375, in the same order; only the layout
 * changes. The few things that are phone-specific by design are listed here and nowhere else: on
 * Quality, the phone steps, Pocket DevTools and the computer steps folded under "Checking on a
 * computer?"; the Menu button; the bottom bar; the swipe rows' count. Decorations (bugs, joins,
 * the shot) are not content.
 */
const PAGES = ['/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/'];
const EXCEPT = '.step__fold, .step__phone, .step__desktop, .devtools, .header__toggle, .hud, .dock, [data-shot], .group__pos, .bug, .join';

const content = (page: Page) =>
  page.evaluate((except) => {
    const sel = 'main [data-level], main :is(h1, h2, h3, h4, p, li, dt, dd, th, td, img, canvas, a, button, input, textarea, select, pre)';
    // (a descendant of a display: none ancestor keeps its own computed display, so ask for boxes)
    const shown = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden], [aria-hidden="true"]');
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest(except) || !shown(el)) continue;
      const tag = el.tagName.toLowerCase();
      let text: string;
      if (el.matches('[data-level]')) text = `#${el.getAttribute('data-level')} ${el.getAttribute('aria-labelledby') ?? el.getAttribute('aria-label') ?? ''}`;
      else if (tag === 'img') text = `alt=${el.getAttribute('alt') ?? ''}`;
      else if (tag === 'input' || tag === 'textarea' || tag === 'select') text = `name=${el.getAttribute('name') ?? ''}`;
      else if (tag === 'canvas') text = 'canvas';
      else text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
      out.push(`${tag}: ${text}`);
    }
    return out;
  }, EXCEPT);

const order = (page: Page) =>
  page.evaluate((except) => {
    const shown = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden], [aria-hidden="true"]');
    return Array.from(document.querySelectorAll('main [data-level], main :is(h1, h2, h3)'))
      .filter((el) => !el.closest(except) && shown(el))
      .map((el) => ({ key: el.matches('[data-level]') ? `#${el.getAttribute('data-level')}` : (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60), top: el.getBoundingClientRect().top + scrollY }));
  }, EXCEPT);

for (const path of PAGES) {
  test(`${path}: the phone shows every section, heading and piece of content the desktop shows, in the same order`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await page.waitForTimeout(400);
    const desk = await content(page);
    const deskOrder = await order(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(400);
    const phone = await content(page);
    const phoneOrder = await order(page);
    expect(desk.length, 'the page has content').toBeGreaterThan(5);
    // the same content, in the same order
    expect(phone).toEqual(desk);
    // the sections and headings run top to bottom in the same order at both widths
    expect(phoneOrder.map((o) => o.key)).toEqual(deskOrder.map((o) => o.key));
    for (const list of [deskOrder, phoneOrder]) {
      for (let i = 1; i < list.length; i++) expect(list[i].top, `${list[i].key} comes after ${list[i - 1].key}`).toBeGreaterThanOrEqual(list[i - 1].top - 2);
    }
  });
}
