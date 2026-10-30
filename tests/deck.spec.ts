import { test, expect } from '@playwright/test';

/**
 * The dealt deck on Quality Level 2: on a desktop with motion the level pins for a few screens of
 * scroll and the five test steps are dealt as cards, each rising from below, tilting a few degrees
 * and stacking on the last, scrubbed by the scroll. Phones slide the cards in one at a time;
 * reduced motion and no script keep them still. The content stays readable and selectable, and
 * nothing overlaps the track or the scoreboard. Skills Level 2 is plain rows again.
 */
test.describe('The Quality deck', () => {
  test('pins and deals the five steps with the scroll, transform only, clear of the track and the scoreboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/quality');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.mouse.move(640, 300);
    const deck = page.locator('[data-deck]');
    await expect(deck).toHaveClass(/is-deck/);
    const cards = page.locator('.deck__card');
    await expect(cards).toHaveCount(5);
    await expect(cards.locator('.step__title')).toHaveText(['Smoke test', 'Responsive', 'Accessibility', 'Links', 'Performance']);
    const box = (await deck.boundingBox())!;
    expect(box.height, 'one screen on show and 0.7 of a screen per further card').toBeGreaterThanOrEqual(900 + 4 * 630 - 2);
    expect(box.height).toBeLessThanOrEqual(900 + 4 * 630 + 2);
    expect(await page.locator('.deck__pin').evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    const top = await deck.evaluate((el) => el.getBoundingClientRect().top + scrollY);
    const state = () =>
      cards.evaluateAll((els) =>
        els.map((el) => {
          const m = new DOMMatrix(getComputedStyle(el).transform);
          const r = el.getBoundingClientRect();
          return { e: parseFloat(el.style.getPropertyValue('--e') || (el.matches(':first-child') ? '1' : '0')), y: Math.round(m.m42), tilt: Math.round(((Math.atan2(m.b, m.a) * 180) / Math.PI) * 10) / 10, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), onScreen: r.top < innerHeight && r.bottom > 0 };
        }),
      );
    // at the start only the first card is on the stage; the rest wait below the screen
    await page.evaluate((y) => window.scrollTo(0, y), top);
    await page.waitForTimeout(150);
    let s = await state();
    expect(s[0].onScreen).toBe(true);
    expect(s.slice(1).every((c) => !c.onScreen), 'the other four are off screen').toBe(true);
    // half way: the third card has landed, the fifth has not; the pinned content has not moved
    const range = box.height - 900;
    await page.evaluate((y) => window.scrollTo(0, y), top + range / 2);
    await page.waitForTimeout(150);
    s = await state();
    expect(s[2].e, 'card three dealt').toBeGreaterThanOrEqual(0.99);
    expect(s[4].e, 'card five still to come').toBeLessThan(0.5);
    expect(s[2].onScreen).toBe(true);
    expect(await page.locator('.deck__pin').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0);
    // at the end: all five dealt, each tilted its own few degrees, each a little lower than the last
    await page.evaluate((y) => window.scrollTo(0, y), top + range);
    await page.waitForTimeout(150);
    s = await state();
    expect(s.every((c) => c.e >= 0.99)).toBe(true);
    expect(s.map((c) => Math.abs(c.tilt) >= 1 && Math.abs(c.tilt) <= 4)).toEqual([true, true, true, true, true]);
    expect(new Set(s.map((c) => Math.sign(c.tilt))).size, 'tilted both ways').toBe(2);
    for (let i = 1; i < s.length; i++) expect(s[i].y).toBeGreaterThan(s[i - 1].y);
    // clear of the track on the left and the scoreboard pill in the corner; no sideways scroll
    const track = (await page.locator('#hud').boundingBox())!;
    const pill = (await page.locator('.score__pill').boundingBox())!;
    const right = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
    for (const [i, c] of s.entries()) {
      expect(c.left, 'clear of the track').toBeGreaterThan(track.x + track.width + 8);
      expect(c.bottom, 'the whole card is on screen').toBeLessThanOrEqual(900);
      expect(c.bottom < pill.y - 4 || right[i] < pill.x - 4, 'clear of the scoreboard').toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // the top card's text is readable and selectable
    const line = cards.last().locator('.step__desktop .step__list li').first();
    await expect(line).toBeVisible();
    const r = (await line.boundingBox())!;
    await page.mouse.move(r.x + 2, r.y + 10);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width - 10, r.y + 10, { steps: 6 });
    await page.mouse.up();
    expect((await page.evaluate(() => getSelection()?.toString() ?? '')).length).toBeGreaterThan(10);
    // each step ran as it was dealt
    await expect(page.locator('.step.is-pass')).toHaveCount(5, { timeout: 15_000 });
    // after the fifth card normal scrolling resumes: the report follows
    await page.evaluate((y) => window.scrollTo(0, y), top + range + 900);
    await page.waitForTimeout(150);
    expect(await page.locator('.report').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(900);
    // a jump to a step lands where it has been dealt
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => (location.hash = '#step-performance'));
    await page.waitForTimeout(300);
    s = await state();
    expect(s[4].e).toBeGreaterThanOrEqual(0.99);
  });

  test('a phone slides the cards in one at a time beside Pocket DevTools; reduced motion and no script keep them still', async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p1 = await phone.newPage();
    await p1.goto('/quality');
    await expect(p1.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    const cards = p1.locator('.deck__card');
    expect(await cards.first().evaluate((el) => getComputedStyle(el).position)).toBe('static');
    const delays = await cards.evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).transitionDelay)));
    for (let i = 1; i < delays.length; i++) expect(delays[i], 'one at a time').toBeGreaterThan(delays[i - 1]);
    await expect(cards.first()).toHaveAttribute('data-enter', '');
    // the cards stand one above the other, then Pocket DevTools, nothing overlapping
    const boxes = await cards.evaluateAll((els) => els.map((el) => ({ top: el.getBoundingClientRect().top + scrollY, bottom: el.getBoundingClientRect().bottom + scrollY })));
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
    const dev = await p1.locator('.devtools').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    expect(dev).toBeGreaterThanOrEqual(boxes[4].bottom);
    expect(await p1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await phone.close();

    const tablet = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const p4 = await tablet.newPage();
    await p4.goto('/quality');
    await expect(p4.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    await expect(p4.locator('.step__fold').first()).toBeHidden();
    await expect(p4.locator('.step__desktop').first()).toBeVisible();
    await expect(p4.locator('.devtools')).toBeHidden();
    expect(await p4.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await tablet.close();

    const quiet = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const p2 = await quiet.newPage();
    await p2.goto('/quality');
    await expect(p2.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    expect(await p2.locator('.deck__card').last().evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await expect(p2.locator('.deck__card').last().locator('.step__desktop .step__list')).toBeVisible();
    await expect(p2.locator('.deck__card').last()).toHaveCSS('opacity', '1');
    await quiet.close();

    const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const p3 = await plain.newPage();
    await p3.goto('/quality');
    await expect(p3.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    await expect(p3.locator('.deck__card').last()).toBeVisible();
    await plain.close();
  });

  test('Skills Level 2 is plain rows again', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/skills');
    await expect(page.locator('[data-deck]')).toHaveCount(0);
    await expect(page.locator('.six__row')).toHaveCount(5);
    const rows = await page.locator('.six__row').evaluateAll((els) => els.map((el) => ({ pos: getComputedStyle(el).position, transform: getComputedStyle(el).transform, top: el.getBoundingClientRect().top + scrollY })));
    for (const r of rows) expect(r.pos).toBe('static');
    for (let i = 1; i < rows.length; i++) expect(rows[i].top).toBeGreaterThan(rows[i - 1].top);
    expect((await page.locator('.six').boundingBox())!.height, 'no pinned height').toBeLessThan(2000);
    await expect(page.locator('.six__row').first().locator('.row__title')).toHaveText('Functional testing');
  });
});
