import { test, expect } from '@playwright/test';

/**
 * The dealt deck on Skills Level 2: on a desktop with motion the level pins for two screens of
 * scroll and the five areas are dealt as cards, each rising from below, tilting a few degrees and
 * stacking on the last, scrubbed by the scroll. Phones, reduced motion and no script keep the
 * plain rows. The content stays readable and selectable.
 */
test.describe('The Skills deck', () => {
  test('pins for two screens and deals the five cards with the scroll, transform only', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/skills');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const deck = page.locator('[data-deck]');
    await expect(deck).toHaveClass(/is-deck/);
    const cards = page.locator('.six__card');
    await expect(cards).toHaveCount(5);
    const box = (await deck.boundingBox())!;
    expect(box.height, 'three screens tall: one on show, two of scroll').toBeGreaterThanOrEqual(2700 - 2);
    expect(box.height).toBeLessThanOrEqual(2700 + 2);
    expect(await page.locator('.six__pin').evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    const top = await deck.evaluate((el) => el.getBoundingClientRect().top + scrollY);
    const state = () =>
      cards.evaluateAll((els) =>
        els.map((el) => {
          const m = new DOMMatrix(getComputedStyle(el).transform);
          const r = el.getBoundingClientRect();
          return { e: parseFloat(el.style.getPropertyValue('--e') || (el.matches(':first-child') ? '1' : '0')), y: Math.round(m.m42), tilt: Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI * 10) / 10, top: Math.round(r.top), onScreen: r.top < innerHeight && r.bottom > 0 };
        }),
      );
    // at the start only the first card is on the stage; the rest wait below the screen
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.waitForTimeout(150);
    let s = await state();
    expect(s[0].onScreen).toBe(true);
    expect(s.slice(1).every((c) => !c.onScreen), 'the other four are off screen').toBe(true);
    // half way: the third card has landed, the fifth has not
    await page.evaluate((y) => window.scrollTo(0, y + 900), top);
    await page.waitForTimeout(150);
    s = await state();
    expect(s[2].e, 'card three dealt').toBeGreaterThanOrEqual(0.99);
    expect(s[4].e, 'card five still to come').toBeLessThan(0.5);
    expect(s[2].onScreen).toBe(true);
    // the pinned content stays where it is while the cards come in
    const pinTop = await page.locator('.six__pin').evaluate((el) => el.getBoundingClientRect().top);
    expect(pinTop).toBe(0);
    // at the end: all five dealt, each tilted its own few degrees, each a little lower than the last
    await page.evaluate((y) => window.scrollTo(0, y + 1800), top);
    await page.waitForTimeout(150);
    s = await state();
    expect(s.every((c) => c.e >= 0.99)).toBe(true);
    expect(s.map((c) => Math.abs(c.tilt) >= 1 && Math.abs(c.tilt) <= 4)).toEqual([true, true, true, true, true]);
    expect(new Set(s.map((c) => Math.sign(c.tilt))).size, 'tilted both ways').toBe(2);
    for (let i = 1; i < s.length; i++) expect(s[i].y).toBeGreaterThan(s[i - 1].y);
    // the top card's text is readable and selectable
    const text = cards.last().locator('.six__text');
    await expect(text).toBeVisible();
    const r = (await text.boundingBox())!;
    await page.mouse.move(r.x + 2, r.y + 10);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width - 10, r.y + 10, { steps: 6 });
    await page.mouse.up();
    expect((await page.evaluate(() => getSelection()?.toString() ?? '')).length).toBeGreaterThan(10);
    // after the fifth card normal scrolling resumes: the next level follows
    await page.evaluate((y) => window.scrollTo(0, y + 2700), top);
    await page.waitForTimeout(150);
    expect(await page.locator('.bring').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    // a jump to a card lands where it has been dealt
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => (location.hash = '#reporting'));
    await page.waitForTimeout(300);
    s = await state();
    expect(s[4].e).toBeGreaterThanOrEqual(0.99);
  });

  test('a phone, reduced motion and no script keep the plain rows', async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p1 = await phone.newPage();
    await p1.goto('/skills');
    await expect(p1.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    expect(await p1.locator('.six__card').first().evaluate((el) => getComputedStyle(el).position)).toBe('static');
    await phone.close();
    const quiet = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const p2 = await quiet.newPage();
    await p2.goto('/skills');
    await expect(p2.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    expect(await p2.locator('.six__card').last().evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await quiet.close();
    const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const p3 = await plain.newPage();
    await p3.goto('/skills');
    await expect(p3.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    await expect(p3.locator('.six__card').last()).toBeVisible();
    await plain.close();
  });
});
