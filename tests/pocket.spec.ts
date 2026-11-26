import { test, expect, devices } from '@playwright/test';

/**
 * Pocket DevTools: with a phone picked (an Android phone here, picked for itself) the Testing page
 * shows the phone's steps and a panel that shows what F12 would: the console errors the page
 * caught, the requests it made and its load timings, from its own records.
 */
test.use({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 } });

test('a phone picks itself: its steps show, and the panel shows the console, the requests and the timings', async ({ page }) => {
  await page.goto('/qa-lab/');
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  // (an Android phone: the picker chose it, so its steps show and no computer's)
  await expect(page.locator('[data-picker] [aria-pressed="true"]')).toHaveText('Android');
  for (const text of ['Rotate the phone', 'Pinch to zoom', 'TalkBack', 'Remove animations']) await expect(page.locator('.step__for:not([hidden])').getByText(text).first()).toBeVisible();
  await expect(page.getByText('Press F12').first()).toBeHidden();
  const dev = page.locator('.devtools');
  await dev.scrollIntoViewIfNeeded();
  await expect(dev).toBeVisible();
  await expect(page.locator('[data-dev-console] li').first()).toHaveText('No errors since this page loaded.');
  await expect.poll(() => page.locator('[data-dev-network] tr').count()).toBeGreaterThan(5);
  await expect(page.locator('[data-dev-network] td.is-ok').first()).toBeVisible();
  await expect(page.locator('[data-dev-network] td.is-bad')).toHaveCount(0);
  const perf = page.locator('[data-dev-perf]');
  await expect(perf).toContainText(/First paint\s*\d+ ms/);
  await expect(perf).toContainText(/Loaded\s*\d+ ms/);
  await expect(perf).toContainText(/Requests\s*\d+/);
  await expect(perf).toContainText(/Transferred\s*\d+ KB/);
  // the steps run on the phone too, each as its card comes on show in the swipe
  await page.locator('.plan .swipe__track').scrollIntoViewIfNeeded();
  for (let k = 2; k <= 5; k++) {
    await page.getByRole('button', { name: 'Next card' }).click();
    await expect(page.locator('.plan [data-swipe-pos]')).toHaveText(`${k} of 6`);
  }
  await expect(page.locator('.step.is-pass')).toHaveCount(5, { timeout: 15_000 });
});

// The network table never lets one cell's text run into another, from 300px up: short names for
// Astro's script chunks (the full address in the title and for screen readers), a fixed layout with
// the file cut short by an ellipsis, and under 360px each row stacked.
for (const width of [300, 375, 390]) {
  test(`at ${width}px no cell of the network table overlaps another, and the script chunks read by their short names`, { tag: ['@viewports', '@a11y'] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/qa-lab/');
    const table = page.locator('.devtools__table');
    await table.scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator('[data-dev-network] tr').count()).toBeGreaterThan(5);
    await page.evaluate(() => document.fonts.ready);
    const rows = await page.locator('.devtools__table tr').evaluateAll((trs) =>
      trs.map((tr) => {
        const cells = [...tr.children] as HTMLElement[];
        return cells.map((c, i) => {
          const r = c.getBoundingClientRect();
          const cs = getComputedStyle(c);
          // (the text's own width against the cell's content box: an ellipsis hides an overflow
          // from scrollWidth)
          const range = document.createRange();
          range.selectNodeContents(c.querySelector('[aria-hidden="true"]') ?? c);
          const inner = c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
          return { i, text: c.textContent ?? '', left: r.left, right: r.right, top: r.top, bottom: r.bottom, fits: range.getBoundingClientRect().width <= inner + 0.5, clipped: cs.overflowX === 'hidden' && cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap' };
        });
      }),
    );
    const pane = await page.locator('.devtools__table').evaluate((el) => el.getBoundingClientRect().right);
    for (const cells of rows) {
      if (cells.length < 4) continue;
      for (const c of cells) {
        // what does not fit is cut at the cell's edge (the file only), never painted past it
        if (c.i === 0) expect(c.fits || c.clipped, `${c.text}: cut short at its edge`).toBe(true);
        else expect(c.fits, `"${c.text}" fits its column`).toBe(true);
        expect(c.right, `${c.text}: inside the table`).toBeLessThanOrEqual(pane + 0.5);
      }
      for (let a = 0; a < cells.length; a++)
        for (let b = a + 1; b < cells.length; b++) {
          const p = cells[a];
          const q = cells[b];
          const overlap = Math.min(p.right, q.right) - Math.max(p.left, q.left) > 0.5 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0.5;
          expect(overlap, `"${p.text}" and "${q.text}" overlap`).toBe(false);
        }
    }
    // the chunks by their short names, the full address kept
    const files = page.locator('[data-dev-network] td:first-child');
    const shown = await files.evaluateAll((tds) => tds.map((td) => ({ shown: td.querySelector('[aria-hidden="true"]')?.textContent ?? '', full: td.querySelector('.visually-hidden')?.textContent ?? '', title: td.getAttribute('title') ?? '' })));
    expect(shown.some((f) => f.shown === 'qa-lab.astro'), 'qa-lab.astro by its short name').toBe(true);
    for (const f of shown) {
      expect(f.shown).not.toMatch(/_astro_type_/);
      expect(f.title).toMatch(/^https?:\/\//);
      expect(f.full).toBe(f.title);
    }
    // under 360px each row stacks: the file on a line of its own
    if (width < 360) {
      const first = rows.find((c) => c.length === 4 && c[0].text !== 'File')!;
      expect(first[1].top, 'type under the file').toBeGreaterThanOrEqual(first[0].bottom - 1);
    }
  });
}

test('at 390px bug quality-3 is wholly on screen and catchable above the bottom bar, with Pocket DevTools shown', async ({ page }) => {
  await page.goto('/qa-lab/');
  const bug = page.locator('[data-bug="quality-3"]');
  // scrolled until the bug just clears the bar, and at the foot of the page
  for (const where of ['above the bar', 'page end'] as const) {
    await bug.evaluate((el, where) => {
      const bar = document.querySelector('.tabbar')!.getBoundingClientRect().height;
      const r = el.getBoundingClientRect();
      window.scrollTo({ top: where === 'page end' ? document.documentElement.scrollHeight : r.bottom + scrollY - (innerHeight - bar) + 24, behavior: 'instant' });
    }, where);
    await page.waitForTimeout(200);
    const m = await bug.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const bar = document.querySelector('.tabbar')!.getBoundingClientRect();
      const lvl = el.closest('.level')!.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { top: r.top, bottom: r.bottom, barTop: bar.top, lvlBottom: lvl.bottom, hit: !!hit && el.contains(hit) };
    });
    expect(m.top, where).toBeGreaterThanOrEqual(0);
    expect(m.bottom, `${where}: clear of the bar`).toBeLessThanOrEqual(m.barTop);
    expect(m.bottom, `${where}: inside its level`).toBeLessThanOrEqual(m.lvlBottom);
    expect(m.hit, `${where}: nothing over it`).toBe(true);
  }
  await page.evaluate(() => document.querySelectorAll('[data-bug]').forEach((b) => b.getAnimations({ subtree: true }).forEach((a) => a.pause())));
  await bug.locator('button, [role="button"]').first().or(bug).first().click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('playrun.games') ?? '{}').bugs ?? [])).toContain('quality-3');
});
