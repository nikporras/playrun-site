import { test, expect, type Page } from '@playwright/test';

/**
 * Tab through the cards: About's What I test, the QA Lab's live checks and the Games cards. A
 * card with only text is passed over (nothing in it takes focus), but every link or button in a
 * card is reached by Tab, and whatever takes focus is on screen and on top: not under the bottom
 * bar on a phone, not under a later card in the pinned deck.
 */

const FOCUSABLE = ':is(a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"]))';

// Tab until the footer (or a limit), recording each stop inside the cards.
async function tabThrough(page: Page, cards: string) {
  const stops: { name: string; onScreen: boolean; onTop: boolean; cover: string }[] = [];
  for (let i = 0; i < 200; i++) {
    await page.keyboard.press('Tab');
    // (two frames: the deck brings a focused card up on the next one)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const r = await page.evaluate((cards) => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body) return null;
      const b = a.getBoundingClientRect();
      const x = Math.min(innerWidth - 1, Math.max(0, b.left + Math.min(b.width / 2, 12)));
      const y = Math.min(innerHeight - 1, Math.max(0, b.top + b.height / 2));
      const top = document.elementFromPoint(x, y);
      return {
        inCard: !!a.closest(cards),
        footer: !!a.closest('footer'),
        name: (a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        onScreen: b.width > 0 && b.top >= 0 && b.bottom <= innerHeight,
        onTop: !!top && (top === a || a.contains(top)),
        cover: top ? `${top.tagName}.${top.className}` : 'none',
      };
    }, cards);
    if (!r) continue;
    if (r.inCard) stops.push(r);
    if (r.footer) break;
  }
  return stops;
}

for (const [path, cards, width, height] of [
  ['/about/', '#skills .area', 1440, 900],
  ['/about/', '#skills .area', 375, 812],
  ['/qa-lab/', '.deck__card', 1440, 900],
  ['/qa-lab/', '.deck__card', 375, 812],
  ['/portfolio/', '.card', 1440, 900],
  ['/portfolio/', '.card', 375, 812],
] as const) {
  test(`${path} at ${width}px: Tab reaches every link and button in the cards, each on screen and on top when focused`, { tag: ['@a11y'] }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(path);
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.evaluate(() => document.fonts.ready);
    // (what a visitor can reach: shown, not inside a folded card)
    const expected = await page.locator(`${cards} ${FOCUSABLE}`).evaluateAll((els) =>
      els.filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert]')).length,
    );
    const stops = await tabThrough(page, cards);
    expect(stops.length, 'every link and button in the cards reached').toBe(expected);
    for (const s of stops) {
      expect(s.onScreen, `${s.name}: on screen`).toBe(true);
      expect(s.onTop, `${s.name}: on top (under ${s.cover})`).toBe(true);
    }
  });
}

// On a phone a folded Games row opens from the keyboard, and Tab then reaches its store link,
// above the bottom bar.
test('a folded Games row opens with Enter and Tab reaches its store link, clear of the bottom bar', { tag: ['@a11y'] }, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/portfolio/');
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  const toggle = page.locator('.card__toggle').last();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  const link = page.locator('.card').last().locator('a[href]');
  await expect(link).toBeFocused();
  await page.waitForTimeout(400);
  const b = (await link.boundingBox())!;
  const bar = (await page.locator('.tabbar').boundingBox())!;
  expect(b.y + b.height, 'above the bottom bar').toBeLessThanOrEqual(bar.y);
});

// The pinned deck shows what takes focus: a button put in a card under the stack is brought to
// the top when Tab reaches it, with the cards after it still below the screen.
for (const path of ['/about/', '/qa-lab/']) {
  test(`${path}: focus on something in a pinned card brings that card up, on top and on screen`, { tag: ['@a11y'] }, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await expect(page.locator('[data-deck]')).toHaveClass(/is-deck/);
    // (a test button in the third card, and the scroll at the end of the deck, every card dealt)
    await page.evaluate(() => {
      const card = document.querySelectorAll('.deck__card')[2];
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'zz-probe';
      b.textContent = 'Probe';
      card.append(b);
      const deck = document.querySelector<HTMLElement>('[data-deck]')!;
      scrollTo(0, deck.getBoundingClientRect().top + scrollY + deck.offsetHeight);
    });
    await page.waitForTimeout(100);
    await page.locator('#zz-probe').focus();
    await expect
      .poll(() =>
        page.locator('#zz-probe').evaluate((el) => {
          const b = el.getBoundingClientRect();
          const top = document.elementFromPoint(b.left + 4, b.top + b.height / 2);
          return b.top >= 0 && b.bottom <= innerHeight && !!top && (top === el || el.contains(top));
        }),
      )
      .toBe(true);
    // the next card waits below the screen
    expect(await page.locator('.deck__card').nth(3).evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(900);
  });
}
