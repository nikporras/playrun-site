import { test, expect } from '@playwright/test';

/**
 * The dealt deck on Testing Level 2: on a desktop with motion the level pins for a few screens of
 * scroll and the five test steps are dealt as cards, each rising from below, tilting a few degrees
 * and stacking on the last, scrubbed by the scroll. Phones slide the cards in one at a time;
 * reduced motion and no script keep them still. The content stays readable and selectable, and
 * nothing overlaps the track or the scoreboard. About's What I test uses the same deck (about.spec.ts).
 */
test.describe('The QA Lab deck', () => {
  test('pins and deals the five steps and the report with the scroll, transform only, clear of the track and the scoreboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/qa-lab/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    await page.mouse.move(640, 300);
    const deck = page.locator('[data-deck]');
    await expect(deck).toHaveClass(/is-deck/);
    const cards = page.locator('.deck__card');
    await expect(cards).toHaveCount(6);
    await expect(cards.locator('.step__title')).toHaveText(['Smoke test', 'Responsive', 'Accessibility', 'Links', 'Performance', 'Test report']);
    const box = (await deck.boundingBox())!;
    const pinH = await page.locator('.deck__pin').evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(box.height, 'the stage on show and 0.7 of a screen per further card').toBeGreaterThanOrEqual(pinH + 5 * 630 - 2);
    expect(box.height).toBeLessThanOrEqual(pinH + 5 * 630 + 2);
    expect(await page.locator('.deck__pin').evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    // (the scroll at which the pin catches: the deck's top at the pin's centred top)
    const pinTop = await page.locator('.deck__pin').evaluate((el) => parseFloat(getComputedStyle(el).top));
    const top = (await deck.evaluate((el) => el.getBoundingClientRect().top + scrollY)) - pinTop;
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
    await expect.poll(async () => (await state()).slice(1).every((c) => !c.onScreen)).toBe(true);
    let s = await state();
    expect(s[0].onScreen).toBe(true);
    expect(s.slice(1).every((c) => !c.onScreen), 'the other five are off screen').toBe(true);
    // half way: the third card has landed, the fifth has not; the pinned content has not moved
    const range = box.height - pinH;
    await page.evaluate((y) => window.scrollTo(0, y), top + range / 2);
    await expect.poll(async () => (await state())[2].e).toBeGreaterThanOrEqual(0.99);
    s = await state();
    expect(s[2].e, 'card three dealt').toBeGreaterThanOrEqual(0.99);
    expect(s[4].e, 'card five still to come').toBeLessThan(0.5);
    expect(s[2].onScreen).toBe(true);
    expect(await page.locator('.deck__pin').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(Math.round(pinTop));
    // at the end: all six dealt, each tilted its own few degrees, each a little lower than the last
    await page.evaluate((y) => window.scrollTo(0, y), top + range);
    await expect.poll(async () => (await state()).every((c) => c.e >= 0.99)).toBe(true);
    s = await state();
    expect(s.every((c) => c.e >= 0.99)).toBe(true);
    expect(s.map((c) => Math.abs(c.tilt) >= 1 && Math.abs(c.tilt) <= 4)).toEqual([true, true, true, true, true, true]);
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
    // the top card's text (the report's) is readable and selectable
    const line = cards.last().locator('.report__where');
    await expect(line).toBeVisible();
    // (the card settled first: a drag on a card still moving can miss its text)
    let last = '';
    await expect
      .poll(async () => {
        const b = JSON.stringify(await line.boundingBox());
        const still = b === last;
        last = b;
        return still;
      })
      .toBe(true);
    // (the card is tilted, so the drag keeps to the middle of the first line of text and runs a short
    // way along it, from 1px inside its first glyph)
    const r = await line.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const first = [...range.getClientRects()].find((q) => q.width > 0)!;
      return { x: first.left, y: first.top + first.height / 2, w: first.width };
    });
    await page.mouse.move(r.x + 1, r.y);
    await page.mouse.down();
    await page.mouse.move(r.x + Math.min(160, r.w - 4), r.y, { steps: 6 });
    await page.mouse.up();
    expect((await page.evaluate(() => getSelection()?.toString() ?? '')).length).toBeGreaterThan(10);
    // each step ran as it was dealt
    await expect(page.locator('.step.is-pass')).toHaveCount(5, { timeout: 15_000 });
    // after the report normal scrolling resumes: the test plan follows
    await page.evaluate((y) => window.scrollTo(0, y), top + range + 900);
    await expect.poll(() => page.locator('.testplan').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(900);
    // a jump to a step lands where it has been dealt
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => (location.hash = '#step-performance'));
    await expect.poll(async () => (await state())[4].e).toBeGreaterThanOrEqual(0.99);
  });

  test('a phone swipes the cards, one on show, with Pocket DevTools under the row; reduced motion and no script keep them still', async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p1 = await phone.newPage();
    await p1.goto('/qa-lab/');
    // (a phone: Pocket DevTools comes with it)
    await p1.getByRole('button', { name: 'iPhone' }).tap();
    await expect(p1.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    const cards = p1.locator('.deck__card');
    expect(await cards.first().evaluate((el) => getComputedStyle(el).position)).toBe('static');
    // the cards side by side in one row (no entrance: they are all there, the row scrolls)
    await expect(cards.first()).not.toHaveAttribute('data-enter');
    const boxes = await cards.evaluateAll((els) => els.map((el) => ({ top: el.getBoundingClientRect().top + scrollY, left: el.getBoundingClientRect().left, bottom: el.getBoundingClientRect().bottom + scrollY })));
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].top).toBe(boxes[0].top);
      expect(boxes[i].left).toBeGreaterThan(boxes[i - 1].left);
    }
    // then the buttons, then Pocket DevTools, nothing overlapping
    const controls = await p1.locator('.plan .swipe__controls').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    expect(controls).toBeGreaterThanOrEqual(Math.max(...boxes.map((b) => b.bottom)));
    const dev = await p1.locator('.devtools').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    expect(dev).toBeGreaterThan(controls);
    expect(await p1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await phone.close();

    const tablet = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const p4 = await tablet.newPage();
    await p4.goto('/qa-lab/');
    await expect(p4.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    await expect(p4.locator('.step__for[data-for="chrome"]').first()).toBeVisible();
    await expect(p4.locator('.devtools')).toBeHidden();
    expect(await p4.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await tablet.close();

    const quiet = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const p2 = await quiet.newPage();
    await p2.goto('/qa-lab/');
    await expect(p2.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    expect(await p2.locator('.deck__card').last().evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await expect(p2.locator('.step').last().locator('.step__for:not([hidden]) .step__list')).toBeVisible();
    await expect(p2.locator('.deck__card').last()).toHaveCSS('opacity', '1');
    await quiet.close();

    const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const p3 = await plain.newPage();
    await p3.goto('/qa-lab/');
    await expect(p3.locator('[data-deck]')).not.toHaveClass(/is-deck/);
    await expect(p3.locator('.deck__card').last()).toBeVisible();
    await plain.close();
  });

  test("the deck on About deals What I test the same way: one deck to a page, its cards tilted, transform only", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/about/');
    await expect(page.locator('[data-deck]')).toHaveCount(1);
    await expect(page.locator('[data-deck]')).toHaveClass(/is-deck/);
    const top = await page.locator('[data-deck]').evaluate((el) => el.getBoundingClientRect().top + scrollY);
    const range = await page.locator('[data-deck]').evaluate((el) => (el as HTMLElement).offsetHeight - (el.querySelector('.deck__pin') as HTMLElement).offsetHeight);
    await page.evaluate((y) => scrollTo(0, y), top + range);
    await expect.poll(() => page.locator('.area').last().evaluate((el) => getComputedStyle(el).getPropertyValue('--e').trim())).toBe('1');
    const looks = await page.locator('.area').evaluateAll((els) => els.map((el) => ({ pos: getComputedStyle(el).position, transform: getComputedStyle(el).transform })));
    for (const l of looks) expect(l.pos).toBe('absolute');
    expect(looks.slice(1).every((l) => l.transform.startsWith('matrix(') && !l.transform.startsWith('matrix(1, 0, 0, 1,')), 'tilted').toBe(true);
  });
});

// The first card starts close under the level head (and the QA Lab's picker), inside the pinned
// unit: a small, steady gap, never a big one.
for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
  for (const path of ['/about/', '/qa-lab/']) {
    test(`${path} at ${width}x${height}: the first card of the deck sits under the level head (and the QA Lab's picker) at the usual gap`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      const deck = page.locator('[data-deck]');
      await expect(deck).toHaveClass(/is-deck/);
      // (the level head on screen, the deck not yet pinned: its top a little below the pin's centred top)
      await deck.evaluate((el) => {
        const pinTop = parseFloat(getComputedStyle(el.querySelector('.deck__pin')!).top) || 0;
        window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - Math.max(300, pinTop + 40), behavior: 'instant' });
      });
      await page.waitForTimeout(100);
      // (the stage's top: the cards stand at it, the first one tilted a little round its foot)
      const gap = await deck.evaluate((el) => {
        // (what stands above the cards in the unit: the head on About, the device picker on the QA Lab)
        const above = (el.querySelector('.picker') ?? el.querySelector('.level__head'))!.getBoundingClientRect();
        return el.querySelector('.deck__stage')!.getBoundingClientRect().top - above.bottom;
      });
      expect(gap, 'the gap from the head to the first card').toBeGreaterThanOrEqual(16);
      expect(gap).toBeLessThanOrEqual(32);
    });
  }
}

// No empty tail: the pin lets go as the last card lands, and the next level follows the deck at
// the level's own foot (its padding, the join included), never a screen of empty field.
for (const path of ['/about/', '/qa-lab/']) {
  for (const [width, height] of [[1280, 720], [1440, 900], [1915, 910], [1920, 1080]] as const) {
    test(`${path} at ${width}x${height}: once the last card lands the next level follows the deck at the normal gap, with no empty tail`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      await page.evaluate(() => document.fonts.ready);
      const deck = page.locator('[data-deck]');
      await expect(deck).toHaveClass(/is-deck/);
      // (top: the scroll at which the pin catches, the deck's top at the pin's top, below the screen's top for a unit taller than the screen)
      const g = await deck.evaluate((d) => ({ top: d.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(d.querySelector('.deck__pin')!).top), range: (d as HTMLElement).offsetHeight - (d.querySelector('.deck__pin') as HTMLElement).offsetHeight }));
      // just past the last landing
      await page.evaluate((y) => window.scrollTo(0, y), g.top + g.range + 2);
      await expect.poll(() => page.locator('.deck__card').last().evaluate((el) => parseFloat((el as HTMLElement).style.getPropertyValue('--e') || '0'))).toBeGreaterThanOrEqual(0.99);
      const m = await deck.evaluate((d) => {
        const level = d.closest('.level')!;
        const next = level.nextElementSibling!;
        const stack = Math.max(...[...d.querySelectorAll('.deck__card')].map((c) => c.getBoundingClientRect().bottom));
        return { deckBottom: d.getBoundingClientRect().bottom, stack, next: next.getBoundingClientRect().top, gap: parseFloat(getComputedStyle(level).paddingBottom), pinTop: d.querySelector('.deck__pin')!.getBoundingClientRect().top };
      });
      expect(m.next - m.deckBottom, 'the deck to the next level: the normal gap').toBeLessThanOrEqual(m.gap + 2);
      // (the stack ends at the deck's foot: nothing empty under it inside the deck)
      expect(m.deckBottom - m.stack, 'no empty field under the stack').toBeLessThanOrEqual(64);
    });
  }
}


// While the deck is pinned the level head (with the QA Lab's picker) and the cards are one unit in
// the middle of the screen, the title over the cards for the whole deal. A unit taller than the
// screen (the QA Lab at 720px tall) pins with its foot on the screen's foot: the cards and the
// picker stay whole and only the top of the head goes off the top.
for (const path of ['/about/', '/qa-lab/']) {
  for (const [width, height] of [[1280, 720], [1440, 900], [1915, 910], [1920, 1080]] as const) {
    test(`${path} at ${width}x${height}: the head and the cards pin as one unit, centred where it fits, the cards whole`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
      await page.evaluate(() => document.fonts.ready);
      const deck = page.locator('[data-deck]');
      await expect(deck).toHaveClass(/is-deck/);
      const g = await deck.evaluate((d) => {
        const pin = d.querySelector('.deck__pin') as HTMLElement;
        const pinTop = parseFloat(getComputedStyle(pin).top);
        return { start: d.getBoundingClientRect().top + scrollY - pinTop, range: (d as HTMLElement).offsetHeight - pin.offsetHeight, pinH: pin.offsetHeight };
      });
      for (const k of [0.02, 0.5, 0.98]) {
        await page.evaluate((y) => window.scrollTo(0, y), g.start + g.range * k);
        const pin = await page.locator('.deck__pin').evaluate((el) => {
          const r = el.getBoundingClientRect();
          const title = el.querySelector('.level__title')!.getBoundingClientRect();
          const stage = el.querySelector('.deck__stage')!.getBoundingClientRect();
          const picker = el.querySelector('.picker')?.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, titleTop: title.top, titleBottom: title.bottom, stageTop: stage.top, stageBottom: stage.bottom, pickerTop: picker?.top ?? null };
        });
        if (g.pinH <= height) {
          // the room above the unit and below it match, to a few pixels, and the title is on show over the cards
          expect(Math.abs(pin.top - (height - pin.bottom)), `centred at ${k}`).toBeLessThanOrEqual(3);
          expect(pin.titleTop, `the title on screen at ${k}`).toBeGreaterThanOrEqual(0);
          expect(pin.titleBottom).toBeLessThanOrEqual(pin.stageTop);
        } else {
          // taller than the screen: its foot on the screen's foot, the cards and the picker whole
          expect(Math.abs(pin.bottom - height), `foot on the screen's foot at ${k}`).toBeLessThanOrEqual(2);
          expect(pin.stageTop).toBeGreaterThanOrEqual(0);
          if (pin.pickerTop !== null) expect(pin.pickerTop, 'the picker on screen').toBeGreaterThanOrEqual(0);
        }
      }
      // the last card lands inside the centred stage
      await page.evaluate((y) => window.scrollTo(0, y), g.start + g.range);
      await expect.poll(() => page.locator('.deck__card').last().evaluate((el) => parseFloat((el as HTMLElement).style.getPropertyValue('--e') || '0'))).toBeGreaterThanOrEqual(0.99);
      const card = await page.locator('.deck__card').last().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
      expect(card.top).toBeGreaterThanOrEqual(0);
      expect(card.bottom).toBeLessThanOrEqual(height);
    });
  }
}
