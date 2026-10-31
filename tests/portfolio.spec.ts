import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The Portfolio journey: newest first, the track shows the year of the post on screen, and the
 * scan: a bonus on a game card that is already on screen. Nothing waits for the laser; every
 * header, block and card shows with the normal entrance as it enters the screen. Once the scroll
 * settles, the card wholly on screen nearest the middle gets one shot (a beam from the ship on a
 * desktop, the sweep alone on a phone), one at a time, each card at most once. With the games
 * off, under reduced motion and without script there is no laser and everything is simply there.
 */
const noSmooth = (page: Page) => page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });

test.describe('The Portfolio journey', () => {
  test('the track shows the year as the page scrolls, 2026 down to 2021, with a marker where each year begins', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portfolio/');
    await noSmooth(page);
    const year = page.locator('[data-hud-year]');
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await expect(year).toBeVisible();
    await expect(year).toHaveText('2026');
    await expect(page.getByRole('button', { name: /^Scoreboard/ })).toHaveAccessibleName(/year 2026/);
    await expect(page.locator('.hud__levels li')).toHaveText(['26', '25', '22', '21']);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(year).toHaveText('2021');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(year).toHaveText('2026');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.hud__levels li').first()).toHaveText('2026');
  });

  test("on a phone each company's games are a folded list: one-line rows (logo, title, year and status, chevron) that are real buttons opening the whole card in place, one open at a time, the first open to begin with; the scan plays on an opened card; the desktop keeps the grid of whole cards", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/portfolio/');
    await noSmooth(page);
    const region = page.locator('.group__row').first();
    await expect(region).toHaveAttribute('role', 'region');
    await expect(region).toHaveAttribute('aria-label', /^Aonic games, Jul 2026 to present$/);
    const list = region.locator('.group__grid');
    await expect(list).toHaveAttribute('role', 'list');
    const cards = list.locator('.card');
    await expect(cards).toHaveCount(7);
    const rows = list.locator('[data-card-toggle]');
    // every row a button with a name, a chevron, its panel, at least 44px tall; only the first open
    for (let i = 0; i < 7; i++) {
      const row = rows.nth(i);
      await expect(row).toBeVisible();
      await expect(row).toHaveAttribute('aria-expanded', i === 0 ? 'true' : 'false');
      const panel = page.locator(`#${await row.getAttribute('aria-controls')}`);
      await expect(panel).toHaveCount(1);
      expect(await cards.nth(i).locator('.card__body').evaluate((el) => el.id)).toBe(await row.getAttribute('aria-controls'));
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(row.locator('.card__chevron')).toBeVisible();
      await expect(row).toHaveAccessibleName(new RegExp(`^${(await cards.nth(i).locator('.card__title').textContent())!.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${i === 0 ? '' : ' (\\d{4} · Released|In development)'}$`));
      if (i > 0) await expect(cards.nth(i).locator('.card__title')).toBeHidden();
    }
    // the open card shows the whole card in the desktop's order
    const open = cards.nth(0);
    for (const k of ['.card__logo', '.card__when', '.card__title', '.card__summary', '.card__makers', '.card__did', '.card__tags', '.card__platforms', '.card__store']) await expect(open.locator(k).first()).toBeVisible();
    // a closed row is one line: about a row tall
    expect((await cards.nth(1).boundingBox())!.height).toBeLessThan(80);
    // a tap on the third row opens it and folds the first; the row stays under the finger
    const before = (await rows.nth(2).boundingBox())!.y;
    await rows.nth(2).click();
    await expect(rows.nth(2)).toHaveAttribute('aria-expanded', 'true');
    await expect(rows.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(cards.nth(2).locator('.card__store')).toBeVisible();
    await expect(cards.nth(0).locator('.card__title')).toBeHidden();
    await page.waitForTimeout(400);
    // (the open card may be brought up into view, so the row only ever moves up)
    expect((await rows.nth(2).boundingBox())!.y).toBeLessThanOrEqual(before + 2);
    // the scan plays on the opened card, and never on a folded one
    await cards.nth(2).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(cards.nth(2)).toHaveClass(/is-scanned/, { timeout: 4000 });
    await page.waitForTimeout(1500);
    for (const i of [1, 3, 4, 5, 6]) await expect(cards.nth(i)).not.toHaveClass(/is-scanned/);
    // the keyboard: Enter and Space open and close it, focus stays on the row with a ring
    await rows.nth(3).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(rows.nth(3)).toBeFocused();
    expect(await rows.nth(3).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(rows.nth(3)).toHaveAttribute('aria-expanded', 'true');
    await expect(rows.nth(2)).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Space');
    await expect(rows.nth(3)).toHaveAttribute('aria-expanded', 'false');
    await expect(rows.nth(3)).toBeFocused();
    // each company keeps its own first card open
    await expect(page.locator('.group__grid').nth(1).locator('[data-card-toggle]').first()).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'no sideways page scroll').toBeLessThanOrEqual(0);
    // a desktop keeps the grid of whole cards: no rows, every card open
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    expect(await list.evaluate((el) => getComputedStyle(el).display)).toBe('grid');
    await expect(rows.first()).toBeHidden();
    for (let i = 0; i < 7; i++) await expect(cards.nth(i).locator('.card__title')).toBeVisible();
  });

  test('on a phone the folded list opens and closes at once under reduced motion, and without script every card is whole', async ({ browser }) => {
    const still = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 375, height: 812 } });
    const page = await still.newPage();
    await page.goto('/portfolio/');
    const card = page.locator('.card').nth(1);
    await card.locator('[data-card-toggle]').click();
    expect(await card.locator('.card__body').evaluate((el) => getComputedStyle(el).transitionDuration.split(',').every((d) => parseFloat(d) === 0))).toBe(true);
    await expect(card.locator('.card__store')).toBeVisible();
    await still.close();
    const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
    const p2 = await plain.newPage();
    await p2.goto('/portfolio/');
    await expect(p2.locator('[data-card-toggle]').first()).toBeHidden();
    const titles = p2.locator('.card__title');
    for (let i = 0; i < (await titles.count()); i++) await expect(titles.nth(i)).toBeVisible();
    await plain.close();
  });

  test('nothing waits for the laser: every header and card shows as it enters the screen, and a fast scroll to the foot shows them all at once', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portfolio/');
    await noSmooth(page);
    const entrances = page.locator('.group__head[data-enter], .card[data-enter]');
    expect(await entrances.count()).toBe(27);
    await expect(page.locator('[data-land], [data-landing], .is-landed')).toHaveCount(0);
    // a card entering at the foot of the screen shows straight away, with no shot involved
    const third = page.locator('.card').nth(5);
    const y = await third.evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight * 0.85), y);
    await expect(third).toHaveClass(/is-in/, { timeout: 1500 });
    await expect(third).toHaveCSS('opacity', '1', { timeout: 2000 });
    await expect(third).not.toHaveClass(/is-scanned/);
    // straight to the foot: whatever is on screen is shown within a second, scanned or not, and
    // on the way back up every screen is shown as soon as it is reached
    // (a card still peeking into the bottom strip, below the entrance line, is not counted yet)
    const onScreen = () => page.locator('.card').evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().bottom > 0 && el.getBoundingClientRect().top < innerHeight * 0.9).map((el) => el.classList.contains('is-in') && parseFloat(getComputedStyle(el).opacity) > 0.5));
    // (the foot of the page is the closing level and the footer, so the jump lands on the last card)
    const lastY = await page.locator('.card').last().evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight * 0.5), lastY);
    await page.waitForTimeout(1200);
    let seen = await onScreen();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean), 'the last screen is shown at once').toBe(true);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let s = height; s > 0; s -= 800) {
      await page.evaluate((s) => window.scrollTo(0, s), s);
      await page.waitForTimeout(1200);
      seen = await onScreen();
      expect(seen.every(Boolean), `at ${s}: every card on screen is shown`).toBe(true);
    }
    await expect(entrances.locator(':scope.is-in')).toHaveCount(27, { timeout: 1500 });
  });

  test('a settled card with a clear line of fire gets one shot: a pixel bolt from the nose to its logo, a muzzle flash, a burst at the hit, then the card flashes, a scan band sweeps it and a PASS stamp stays; one at a time, cards only, each once', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portfolio/');
    await noSmooth(page);
    await page.mouse.move(640, 300);
    await page.evaluate(() => {
      const w = window as unknown as { __shots: number[] };
      w.__shots = [];
      new MutationObserver((muts) => {
        for (const m of muts) {
          if ((m.target as HTMLElement).matches('[data-shot]') && m.attributeName === 'data-to') w.__shots.push(performance.now());
        }
      }).observe(document.querySelector('[data-shot]')!, { attributes: true });
    });
    // bring the first card to the middle and let the scroll settle
    const first = page.locator('.card').first();
    const y = await first.evaluate((el) => el.getBoundingClientRect().top + el.offsetHeight / 2 + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
    await page.waitForFunction(() => document.querySelector('[data-shot]')?.getAttribute('data-to'), null, { timeout: 4000, polling: 16 });
    // the bolt: twelve pixel squares, a bright glowing head and a thinning trail, each flying the path in a third of a second
    const bolt = await page.evaluate(() => {
      const px = [...document.querySelectorAll<HTMLElement>('.bolt__px')];
      return px.map((el) => {
        const a = el.getAnimations()[0];
        const cs = getComputedStyle(el);
        return { w: parseFloat(cs.width), h: parseFloat(cs.height), bg: cs.backgroundColor, duration: Number(a?.effect?.getComputedTiming().duration ?? 0), delay: Number(a?.effect?.getComputedTiming().delay ?? 0) };
      });
    });
    expect(bolt.length).toBe(12);
    for (const p of bolt) {
      expect(p.w, 'a 10px square').toBe(10);
      expect(p.h).toBe(10);
      expect(p.duration, 'a third of a second along the path').toBe(350);
    }
    expect(bolt.slice(0, 2).map((p) => p.bg)).toEqual(['rgb(229, 231, 234)', 'rgb(229, 231, 234)']);
    expect(bolt.slice(2, 4).map((p) => p.bg)).toEqual(['rgb(103, 193, 140)', 'rgb(103, 193, 140)']);
    for (const p of bolt.slice(4)) expect(p.bg).toBe('rgb(86, 189, 218)');
    for (let i = 1; i < bolt.length; i++) expect(bolt[i].delay, 'each square a beat behind the last').toBeGreaterThan(bolt[i - 1].delay);
    const glow = await page.locator('.bolt__px').evaluateAll((els) => els.map((el) => getComputedStyle(el).boxShadow));
    for (const g of glow.slice(0, 4)) expect(g, 'a glow around the head').toContain('rgb(103, 193, 140)');
    for (const g of glow.slice(4)) expect(g, 'none on the trail').toBe('none');
    expect(await page.locator('.muzzle__px').evaluateAll((els) => els.filter((el) => el.getAnimations().length).length), 'a muzzle flash').toBe(5);
    expect(await page.locator('.burst__px').evaluateAll((els) => els.filter((el) => el.getAnimations().length).length), 'a burst at the hit').toBe(12);
    expect(
      await page.locator('.burst__px').evaluateAll((els) => {
        const a = els[0].getAnimations()[0] as Animation;
        const k = (a.effect as KeyframeEffect).getKeyframes();
        const from = new DOMMatrix(String(k[0].transform));
        const to = new DOMMatrix(String(k[k.length - 1].transform));
        return Math.hypot(to.m41 - from.m41, to.m42 - from.m42);
      }),
      'the burst spreads',
    ).toBeGreaterThanOrEqual(24);
    // the recoil: the ship sprite kicks back 3px and returns, on top of its own pose
    expect(
      await page.locator('.hud__runner .sprite').evaluate((el) => el.getAnimations().some((a) => ((a.effect as KeyframeEffect).getKeyframes() as { transform?: string }[]).some((f) => /translateX\(-3px\)/.test(String(f.transform))) && (a.effect as KeyframeEffect).composite === 'add')),
      'a 3px recoil composited onto the pose',
    ).toBe(true);
    await expect(first).toHaveClass(/is-scanned/, { timeout: 2500 });
    // the path: from the ship's nose to the card's logo, crossing no other card and no company block
    const path = await page.evaluate(() => {
      const shot = document.querySelector('[data-shot]')!;
      const [fx, fy] = shot.getAttribute('data-from')!.split(',').map(Number);
      const [tx, ty] = shot.getAttribute('data-to')!.split(',').map(Number);
      const ship = document.querySelector('.hud__runner')!.getBoundingClientRect();
      const target = document.querySelector('.card.is-scanned')!;
      const logo = target.querySelector('.card__logo')!.getBoundingClientRect();
      const boxes = [...document.querySelectorAll<HTMLElement>('.card, .group__head')].filter((el) => el !== target).map((el) => el.getBoundingClientRect().toJSON());
      return { fx, fy, tx, ty, ship: ship.toJSON(), logo: logo.toJSON(), boxes };
    });
    expect(Math.abs(path.fx - path.ship.right)).toBeLessThan(2);
    expect(path.tx).toBeGreaterThan(path.logo.left - 1);
    expect(path.tx).toBeLessThan(path.logo.right + 1);
    expect(path.ty).toBeGreaterThan(path.logo.top - 1);
    expect(path.ty).toBeLessThan(path.logo.bottom + 1);
    const hits = path.boxes.filter((r: { left: number; right: number; top: number; bottom: number }) => {
      // sample the segment finely and look for a point inside the box
      for (let t = 0; t <= 1; t += 0.01) {
        const x = path.fx + (path.tx - path.fx) * t;
        const yy = path.fy + (path.ty - path.fy) * t;
        if (x >= r.left && x <= r.right && yy >= r.top && yy <= r.bottom) return true;
      }
      return false;
    });
    expect(hits, 'the bolt never flies over another card or block').toEqual([]);
    // the card's reaction: a green flash, a scan band with scanlines and a glowing edge, no layout shift
    const before = await first.locator('.card__title').evaluate((el) => el.getBoundingClientRect().top);
    expect(await first.evaluate((el) => getComputedStyle(el).animationName)).toBe('card-flash');
    const band = await first.evaluate((el) => {
      const cs = getComputedStyle(el, '::before');
      return { name: cs.animationName, duration: cs.animationDuration, h: parseFloat(cs.height), bg: cs.backgroundImage, edge: cs.borderBottomColor, glow: cs.boxShadow };
    });
    expect(band.name).toBe('scan-band');
    expect(band.duration).toBe('0.5s');
    expect(band.h).toBeGreaterThanOrEqual(40);
    expect(band.h).toBeLessThanOrEqual(60);
    expect(band.bg).toContain('repeating-linear-gradient');
    expect(band.edge).toBe('rgb(86, 189, 218)');
    expect(band.glow).toContain('rgb(86, 189, 218)');
    // the stamp: PASS in the pixel face, green on navy, top right inside the padding, over nothing, and it stays
    const stamp = first.locator('.card__pass');
    await expect(stamp).toHaveAttribute('aria-hidden', 'true');
    await expect(stamp).toHaveText(/Pass/i);
    await page.waitForTimeout(1200);
    const st = await stamp.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const card = el.closest('.card')!;
      const kids = [...card.querySelectorAll<HTMLElement>('.card__top, .card__logo, .card__when, .card__title, .card__did, .card__summary, .card__tags, .card__platforms, .card__store')];
      const overlaps = kids.filter((k) => {
        const b = k.getBoundingClientRect();
        return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
      }).map((k) => k.className);
      return { opacity: cs.opacity, family: cs.fontFamily, color: cs.color, bg: cs.backgroundColor, overlaps, right: card.getBoundingClientRect().right - r.right, top: r.top - card.getBoundingClientRect().top };
    });
    expect(st.opacity).toBe('1');
    expect(st.family).toMatch(/Pixel Operator/);
    expect(st.color).toBe('rgb(103, 193, 140)');
    expect(st.bg).toBe('rgb(12, 21, 42)');
    expect(st.overlaps, 'the stamp covers nothing').toEqual([]);
    expect(st.right).toBeLessThan(12);
    expect(st.top).toBeLessThan(12);
    expect(Math.abs((await first.locator('.card__title').evaluate((el) => el.getBoundingClientRect().top)) - before), 'no layout shift').toBeLessThan(0.5);
    // only scanned cards carry a stamp; cards never scanned show none
    expect(await page.locator('.card:not(.is-scanned) .card__pass').evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === '0'))).toBe(true);
    expect(await page.locator('.is-scanned:not(.card)').count(), 'only cards are scanned').toBe(0);
    // one at a time: a walk down the page, pausing on each screen, never fires two shots within a shot's length
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let s = 0; s < height; s += 700) {
      await page.evaluate((s) => window.scrollTo(0, s), s);
      await page.waitForTimeout(1500);
    }
    const shots = await page.evaluate(() => (window as unknown as { __shots: number[] }).__shots);
    // (only cards with a clear line of fire are shot, so a walk fires a few times, not at every card)
    expect(shots.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < shots.length; i++) expect(shots[i] - shots[i - 1], 'a shot at a time').toBeGreaterThanOrEqual(1250);
    // every shot on the page kept a clear line of fire, and the stamps stayed
    expect(await page.locator('.card.is-scanned .card__pass').evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === '1'))).toBe(true);
    // each card at most once: coming back to a screen whose cards are all scanned fires nothing new
    const back = async () => {
      await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(1500);
      await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
      await page.waitForTimeout(1500);
    };
    await back();
    const scannedOnce = await page.locator('.card.is-scanned').count();
    const shotsOnce = await page.evaluate(() => (window as unknown as { __shots: number[] }).__shots.length);
    await back();
    expect(await page.locator('.card.is-scanned').count(), 'no card scanned twice').toBe(scannedOnce);
    expect(await page.evaluate(() => (window as unknown as { __shots: number[] }).__shots.length), 'no second shot at a scanned card').toBe(shotsOnce);
  });

  test('every card gets the reaction and the stamp: a settled row plays left to right, the bolt only on the clear line, one reaction at a time, and a card skipped on a fast scroll gets its turn later', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portfolio/');
    await noSmooth(page);
    await page.mouse.move(640, 300);
    // the entrances first, so the cards' boxes are their settled ones
    await page.evaluate(() => document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in')));
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const w = window as unknown as { __scans: { title: string; t: number; left: number; top: number }[]; __shots: string[] };
      w.__scans = [];
      w.__shots = [];
      new MutationObserver((muts) => {
        for (const m of muts) {
          const el = m.target as HTMLElement;
          if (el.matches('.card') && el.classList.contains('is-scanned') && !el.dataset.seen) {
            el.dataset.seen = '1';
            const r = el.getBoundingClientRect();
            w.__scans.push({ title: el.querySelector('.card__title')!.textContent!.trim(), t: performance.now(), left: r.left, top: r.top + scrollY });
          }
          if (el.matches('[data-shot]') && m.attributeName === 'data-to') w.__shots.push(el.getAttribute('data-to')!);
        }
      }).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-to'], subtree: true });
    });
    // a fast scroll straight to the foot and back: nothing fires on the way
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    // then row by row, settling on each long enough for three reactions
    const rowTops = await page.locator('.card').evaluateAll((els) => [...new Set(els.map((el) => Math.round((el.getBoundingClientRect().top + scrollY) / 8) * 8))].sort((a, b) => a - b));
    for (const top of rowTops) {
      const h = await page.evaluate((top) => {
        const el = [...document.querySelectorAll<HTMLElement>('.card')].find((c) => Math.abs(c.getBoundingClientRect().top + scrollY - top) < 8)!;
        return el.offsetHeight;
      }, top);
      await page.evaluate(([top, h]) => window.scrollTo(0, top + h / 2 - innerHeight / 2), [top, h] as const);
      await page.waitForTimeout(3600);
    }
    const total = await page.locator('.card').count();
    await expect(page.locator('.card.is-scanned')).toHaveCount(total);
    expect(await page.locator('.card .card__pass').evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === '1')), 'every card carries the stamp').toBe(true);
    const log = await page.evaluate(() => {
      const w = window as unknown as { __scans: { title: string; t: number; left: number; top: number }[]; __shots: string[] };
      return { __scans: w.__scans, __shots: w.__shots };
    });
    expect(log.__scans.length).toBe(total);
    // one reaction at a time: never two within a plain scan's length
    const times = log.__scans.map((s) => s.t);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1], `${log.__scans[i].title} waited its turn`).toBeGreaterThanOrEqual(750);
    // a row plays left to right
    const byRow = new Map<number, typeof log.__scans>();
    for (const s of log.__scans) {
      const key = Math.round(s.top / 8);
      if (!byRow.has(key)) byRow.set(key, []);
      byRow.get(key)!.push(s);
    }
    for (const row of byRow.values()) {
      const inOrder = [...row].sort((a, b) => a.t - b.t);
      for (let i = 1; i < inOrder.length; i++) expect(inOrder[i].left, `${inOrder[i].title} came after ${inOrder[i - 1].title}`).toBeGreaterThan(inOrder[i - 1].left);
    }
    // bolts only flew on clear lines: one per row at most, each ending in a left-column logo
    const contentLeft = await page.locator('.group__grid').first().evaluate((el) => el.getBoundingClientRect().left);
    expect(log.__shots.length).toBeGreaterThan(0);
    expect(log.__shots.length).toBeLessThanOrEqual(byRow.size);
    for (const to of log.__shots) {
      const x = Number(to.split(',')[0]);
      expect(x, 'a bolt ends in the left column').toBeLessThan(contentLeft + 200);
    }
  });

  test('with the games off there is no laser and no scan, and everything still shows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/portfolio/');
    await noSmooth(page);
    await page.mouse.move(640, 300);
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await page.getByRole('button', { name: /Games on/ }).click();
    await page.mouse.click(640, 300);
    const first = page.locator('.card').first();
    const y = await first.evaluate((el) => el.getBoundingClientRect().top + el.offsetHeight / 2 + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
    await page.waitForTimeout(1300);
    expect(await page.locator('.bolt__px').evaluateAll((els) => els.filter((el) => el.getAnimations().length).length), 'no bolt').toBe(0);
    await expect(page.locator('.is-scanned')).toHaveCount(0);
    await expect(first).toHaveCSS('opacity', '1');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await expect(page.locator('.card').last()).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await page.getByRole('button', { name: /Games off/ }).click();
  });

  test('on a phone the card reacts without a bolt', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto('/portfolio/');
    await noSmooth(page);
    const first = page.locator('.card').first();
    const y = await first.evaluate((el) => el.getBoundingClientRect().top + el.offsetHeight / 2 + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
    await expect(first).toHaveClass(/is-scanned/, { timeout: 2500 });
    expect(await page.locator('.bolt__px, .muzzle__px, .burst__px').evaluateAll((els) => els.filter((el) => el.getAnimations().length).length), 'no bolt, no muzzle, no burst').toBe(0);
    await expect(first.locator('.card__pass')).toHaveCSS('opacity', '1', { timeout: 2000 });
    await context.close();
  });

  test('under reduced motion there is no laser and no sweep and everything is simply there; without script too', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('/portfolio/');
    await expect(page.locator('.card').first()).toHaveCSS('opacity', '1');
    const first = page.locator('.card').first();
    const y = await first.evaluate((el) => el.getBoundingClientRect().top + el.offsetHeight / 2 + scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - innerHeight / 2), y);
    await page.waitForTimeout(1300);
    await expect(page.locator('[data-shot]')).toHaveCount(0);
    await expect(page.locator('.is-scanned')).toHaveCount(0);
    expect(await first.evaluate((el) => getComputedStyle(el, '::before').animationName)).toBe('none');
    await expect(first.locator('.card__pass')).toHaveCSS('opacity', '0');
    await expect(page.locator('.card').last()).toHaveCSS('opacity', '1');
    await context.close();

    const plain = await browser.newContext({ javaScriptEnabled: false });
    const page2 = await plain.newPage();
    await page2.goto('/portfolio/');
    await expect(page2.locator('.card').last()).toBeVisible();
    await expect(page2.locator('.card').last()).toHaveCSS('opacity', '1');
    await plain.close();
  });
});

for (const [width, height] of [
  [1440, 900],
  [375, 780],
] as const) {
  test(`each company reads as a level card at ${width}px: Level N counted from the first post, Allegiance, the titles in order, and the games cleared with a pip each`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/portfolio/');
    const heads = page.locator('.group__head');
    const n = await heads.count();
    expect(n).toBe(7);
    await expect(page.locator('.group__level')).toHaveText(Array.from({ length: n }, (_, i) => `Level ${n - i}`));
    for (let i = 0; i < n; i++) {
      const head = heads.nth(i);
      await expect(head.locator('.group__key')).toHaveText(['Allegiance', 'Titles', 'Cleared']);
      const cards = await page.locator('.group').nth(i).locator('.card').count();
      await expect(head.locator('.group__cleared')).toHaveText(`${cards} ${cards === 1 ? 'game' : 'games'}`);
      await expect(head.locator('.group__pip')).toHaveCount(cards);
      await expect(head.locator('.group__pips')).toHaveAttribute('aria-hidden', 'true');
      for (const el of await head.locator('.group__level, .group__key, .group__cleared, .group__role').all()) await expect(el).toBeVisible();
    }
    // the titles in order, as on LinkedIn
    const ndreams = page.locator('.group').filter({ has: page.locator('.group__name', { hasText: 'nDreams' }) });
    await expect(ndreams.locator('.group__role')).toHaveText(['QA Tester · Apr 2022 to Sep 2022', 'Senior Quality Assurance Tester · Sep 2022 to Apr 2023', 'Lead Quality Assurance Tester · Apr 2023 to Oct 2024']);
    // the first job is Level 1
    await expect(page.locator('.group').last().locator('.group__level')).toHaveText('Level 1');
  });
}

test('every game carries a tracker ID like the bug ticket’s (PR-001...), the same on its card and its phone row, numbered from the data in a stable order, and hidden from assistive tech and snippets', async ({ page }) => {
  // the expected IDs, worked out here from the content files and the posts' order: the first post
  // first, then by year (titles in development last), then by slug
  const { employers } = await import('../src/config');
  const dir = path.join(process.cwd(), 'src', 'content', 'projects');
  const projects = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const text = readFileSync(path.join(dir, f), 'utf8');
      const field = (k: string) =>
        text
          .split('\n')
          .find((l) => l.startsWith(`${k}:`))
          ?.slice(k.length + 1)
          .trim()
          .replace(/^"|"$/g, '');
      return { id: f.replace(/\.md$/, ''), title: field('title')!, employer: field('employer')!, year: Number(field('year')) || Infinity, dev: field('status') === 'in-development', public: field('public') === 'true' };
    })
    .filter((p) => p.public);
  const post = (p: (typeof projects)[number]) => employers.length - 1 - employers.findIndex((e) => e.id === p.employer);
  projects.sort((a, b) => post(a) - post(b) || (a.dev ? Infinity : a.year) - (b.dev ? Infinity : b.year) || a.id.localeCompare(b.id));
  const expected = new Map(projects.map((p, i) => [p.title, `PR-${String(i + 1).padStart(3, '0')}`]));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/portfolio/');
  const cards = await page.locator('.card').evaluateAll((els) =>
    els.map((el) => {
      const id = el.querySelector('.card__inner .card__id')!;
      const row = el.querySelector('.card__toggle .card__id')!;
      return { title: el.querySelector('.card__title')!.textContent!.trim(), id: id.textContent!.trim(), row: row.textContent!.trim(), hidden: id.getAttribute('aria-hidden'), snippet: id.hasAttribute('data-nosnippet'), rowHidden: row.getAttribute('aria-hidden'), rowSnippet: row.hasAttribute('data-nosnippet') };
    }),
  );
  expect(cards).toHaveLength(expected.size);
  for (const c of cards) {
    expect(c.id, c.title).toBe(expected.get(c.title));
    expect(c.row, `${c.title}: the row carries the same ID`).toBe(c.id);
    expect(c.hidden).toBe('true');
    expect(c.rowHidden).toBe('true');
    expect(c.snippet && c.rowSnippet).toBe(true);
  }
  expect(new Set(cards.map((c) => c.id)).size, 'no two alike').toBe(cards.length);
  // the row's name is still the game's own
  await page.setViewportSize({ width: 375, height: 780 });
  await expect(page.locator('.card').nth(1).locator('[data-card-toggle]')).not.toHaveAccessibleName(/PR-/);
  await expect(page.locator('.card').nth(1).locator('[data-card-toggle] .card__id')).toBeVisible();
});
