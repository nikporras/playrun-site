import { test, expect, type Page } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * The games' logos show whole: every file has a clear margin all round (nothing of the logo on its
 * edge rows or columns), and on the page no logo image is cut by its own box or by anything round
 * it, nor stretched out of its shape: on Home's row of logos (moving and still), on the Games
 * cards and on the phone rows.
 */
const DIR = join(process.cwd(), 'src/assets/logos');

test('every logo file has a clear margin all round, so no part of a logo sits on its edge', { tag: ['@brand'] }, async () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.png'));
  expect(files.length).toBeGreaterThan(10);
  for (const f of files) {
    const { data, info } = await sharp(join(DIR, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const a = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    let edge = 0;
    for (let x = 0; x < info.width; x++) edge += Number(a(x, 0) > 24) + Number(a(x, info.height - 1) > 24);
    for (let y = 0; y < info.height; y++) edge += Number(a(0, y) > 24) + Number(a(info.width - 1, y) > 24);
    expect(edge, `${f}: pixels of the logo on its outer edge`).toBe(0);
  }
});

// Each visible logo image: its drawn picture (the box, or the part object-fit: contain fills) inside
// every box that clips it, and its shape the file's own.
async function unclipped(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((imgs) =>
    (imgs as HTMLImageElement[])
      .filter((img) => img.getClientRects().length && img.naturalWidth)
      .map((img) => {
        const r = img.getBoundingClientRect();
        const cs = getComputedStyle(img);
        const nat = img.naturalWidth / img.naturalHeight;
        const fits = cs.objectFit === 'contain' || cs.objectFit === 'scale-down';
        // the drawn picture: with contain, the largest box of the file's shape inside the image box
        let [w, h] = [r.width, r.height];
        if (fits) [w, h] = w / h > nat ? [h * nat, h] : [w, w / nat];
        const left = r.left + (r.width - w) / 2;
        const top = r.top + (r.height - h) / 2;
        const problems: string[] = [];
        if (!fits && Math.abs(r.width / r.height / nat - 1) > 0.02) problems.push(`stretched: box ${(r.width / r.height).toFixed(2)}, file ${nat.toFixed(2)}, fit ${cs.objectFit}`);
        if (cs.objectFit === 'cover') problems.push('object-fit: cover crops it');
        for (let e = img.parentElement; e && e !== document.body; e = e.parentElement) {
          const s = getComputedStyle(e);
          if (s.overflowX === 'visible' && s.overflowY === 'visible' && s.clipPath === 'none') continue;
          const b = e.getBoundingClientRect();
          // (a moving row scrolls its logos past its ends on purpose: only its top and bottom count)
          const sideways = !!img.closest('.ticker') && !document.documentElement.classList.contains('motion-off');
          const cut = [b.left - left, left + w - b.right, b.top - top, top + h - b.bottom].map((v) => Math.round(v * 10) / 10);
          if (!sideways && (cut[0] > 0.5 || cut[1] > 0.5)) problems.push(`cut at the side by ${e.className} (${cut[0]}, ${cut[1]})`);
          if (cut[2] > 0.5 || cut[3] > 0.5) problems.push(`cut at the top or bottom by ${e.className} (${cut[2]}, ${cut[3]})`);
        }
        // (a still row shows only its first line: a logo wrapped below it is out of sight on purpose)
        const view = img.closest('.ticker__view')?.getBoundingClientRect();
        const wrapped = !!view && document.documentElement.classList.contains('motion-off') && r.top >= view.bottom - 0.5;
        return { name: img.currentSrc.split('/').pop()!.split('.')[0], problems, wrapped };
      }),
  );
}

for (const [width, height] of [[1440, 900], [768, 1024], [375, 812]] as const) {
  test(`at ${width}px no logo is clipped by its box or stretched: Home's moving row, its still row, the Games cards and rows`, { tag: ['@brand'] }, async ({ browser }) => {
    test.setTimeout(90_000);
    for (const motion of ['on', 'off']) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await page.addInitScript((m) => localStorage.setItem('playrun.motion', m), motion);
      await page.goto('/');
      await page.evaluate(async () => {
        document.querySelectorAll('img').forEach((i) => (i.loading = 'eager'));
        await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
      });
      // the moving row: its first copy; the still row: the logos on its one line (the rest wrap out of
      // sight on purpose and are read only as alt text)
      const row = motion === 'on' ? '.ticker__seq:not([aria-hidden="true"]) img' : '.ticker img';
      const logos = (await unclipped(page, row)).filter((l) => !l.wrapped);
      expect(logos.length, `Home, motion ${motion}: logos checked`).toBeGreaterThanOrEqual(motion === 'on' ? 10 : 1);
      for (const l of logos) expect(l.problems, `Home, motion ${motion}: ${l.name}`).toEqual([]);
      await context.close();
    }
    // the Games cards: every card whole on a desktop, each card opened in turn on a phone
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
    await page.goto('/portfolio/');
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach((i) => (i.loading = 'eager'));
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    });
    const cards = page.locator('article.card');
    const n = await cards.count();
    let checked = 0;
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const toggle = card.locator('.card__toggle');
      if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') {
        // the folded row's small logo first, then the opened card's
        for (const l of await unclipped(page, `article.card >> nth=${i} >> .card__mini img`)) expect(l.problems, `Games row: ${l.name}`).toEqual([]);
        await toggle.click();
        await expect(card).toHaveClass(/is-open/);
      }
      for (const l of await unclipped(page, `article.card >> nth=${i} >> .card__logo img`)) {
        expect(l.problems, `Games card: ${l.name}`).toEqual([]);
        checked++;
      }
    }
    expect(checked, 'Games cards checked').toBeGreaterThan(10);
    await context.close();
  });
}
