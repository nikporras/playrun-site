import { test, expect } from '@playwright/test';

test.describe('Brand assets', () => {
  test('both typefaces load', { tag: ['@brand'] }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => ({
      pixel: document.fonts.check('16px "Pixel Operator"'),
      montserrat: document.fonts.check('16px Montserrat'),
    }));
    expect(loaded).toEqual({ pixel: true, montserrat: true });
  });

  test('the logo renders in the header and the icon in the footer', { tag: ['@brand'] }, async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header svg').first();
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(20);
    const footer = page.locator('footer svg').first();
    await expect(footer).toBeVisible();
    expect((await footer.boundingBox())?.height ?? 0).toBeLessThanOrEqual(64);
  });

  test('favicon, touch icon and Open Graph image exist', { tag: ['@brand'] }, async ({ page, request }) => {
    await page.goto('/');
    for (const path of ['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/og.png', '/sitemap-index.xml', '/robots.txt']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og, 'the card, at an address named by its content').toMatch(/^https:\/\/playrunqa\.com\/_astro\/og-card\.[\w-]+\.png$/);
  });
});

test('the social card is a 1200 by 630 picture of Nicolás Porras, Game QA Tester; Home shares as a profile with his first and last name', { tag: ['@brand'] }, async ({ page, request }) => {
  const sharp = (await import('sharp')).default;
  const res = await request.get('/og.png');
  expect(res.status()).toBe(200);
  const meta = await sharp(await res.body()).metadata();
  expect([meta.width, meta.height]).toEqual([1200, 630]);
  for (const path of ['/', '/about/']) {
    await page.goto(path);
    const c = (sel: string) => page.locator(sel).getAttribute('content');
    const card = await c('meta[property="og:image"]');
    expect(card).toMatch(/^https:\/\/playrunqa\.com\/_astro\/og-card\.[\w-]+\.png$/);
    expect(await c('meta[name="twitter:image"]')).toBe(card);
    // the page's image in the structured data is the same card
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!) as { '@graph': { '@type': string; image?: string; primaryImageOfPage?: { url: string } }[] };
    const node = ld['@graph'].find((n) => /Page$/.test(n['@type']) && n['@type'] !== 'FAQPage')!;
    expect(node.image).toBe(card);
    expect(node.primaryImageOfPage!.url).toBe(card);
    // it answers, and it is the same picture as the old /og.png kept for old links
    const versioned = await request.get(new URL(card!).pathname);
    expect(versioned.status()).toBe(200);
    expect(Buffer.compare(await versioned.body(), await res.body()), 'the same card').toBe(0);
    expect(await c('meta[property="og:image:alt"]')).toBe('Nicolás Porras, Game QA Tester, London: his photo on a navy pixel grid, with playrunqa.com.');
    expect(await c('meta[property="og:type"]')).toBe(path === '/' ? 'profile' : 'website');
    await expect(page.locator('meta[property="profile:first_name"]')).toHaveCount(path === '/' ? 1 : 0);
  }
  await page.goto('/');
  expect(await page.locator('meta[property="profile:first_name"]').getAttribute('content')).toBe('Nicolás');
  expect(await page.locator('meta[property="profile:last_name"]').getAttribute('content')).toBe('Porras');
});

// The fonts load once per page, each when the first layout asks for it: no preload (a preload left
// unused, or used under other attributes, makes Firefox warn and can fetch a font twice), and no
// font file is ever requested twice on a page.
test('every page asks for each font once, and no font is preloaded', { tag: ['@brand'] }, async ({ page }) => {
  const twice: string[] = [];
  for (const path of ['/', '/about/', '/portfolio/', '/testing/', '/contact/', '/privacy/']) {
    const fonts: string[] = [];
    const listen = (r: import('@playwright/test').Request) => /\.woff2?$/.test(r.url()) && fonts.push(r.url());
    page.on('request', listen);
    await page.goto(path, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    page.off('request', listen);
    expect(await page.locator('link[rel="preload"][as="font"]').count(), `${path}: no font preload`).toBe(0);
    expect(fonts.length, `${path}: the fonts load`).toBeGreaterThanOrEqual(2);
    for (const f of new Set(fonts)) if (fonts.filter((x) => x === f).length > 1) twice.push(`${path}: ${f}`);
  }
  expect(twice).toEqual([]);
});

// Two faces, two jobs: Pixel Operator for display (titles, nav, flags, chips, buttons, stats, the
// scoreboard, Pocket DevTools), Montserrat for everything people read.
const READ: Record<string, string[]> = {
  '/': ['.hero__value', '.proof__line', '.final__text'],
  '/about/': ['.level__lead', '.area__line', '.area__list li', '.facts th', '.facts td', '.story__text p'],
  '/portfolio/': ['.level__lead', '.group__lead', '.group__roles', '.card__summary', '.card__makers'],
  '/testing/': ['.level__lead', '.step__ask', '.step__list li'],
  '/contact/': ['.level__lead', '.msg__list', '.form__label'],
  '/privacy/': ['.level__lead', '.row p'],
};
const SHOW: Record<string, string[]> = {
  '/': ['h1', '.flag', '.hero__post', '.drum__num'],
  '/about/': ['h2', '.flag', '.chip', '.button'],
  '/portfolio/': ['h1', '.flag', '.status', '.card__id'],
  '/testing/': ['h1', '.step__num', '.picker__btn', '.devtools__tab', '.report__score'],
  '/contact/': ['h1', '.flag', '.contact__key'],
  '/privacy/': ['h1', '.flag'],
};
for (const path of Object.keys(READ)) {
  test(`${path}: what people read is Montserrat, the display is Pixel Operator`, { tag: ['@brand'] }, async ({ page }) => {
    await page.goto(path);
    const face = (sel: string) => page.locator(sel).evaluateAll((els) => els.map((el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()));
    for (const sel of READ[path]) {
      const faces = await face(sel);
      expect(faces.length, `${path} ${sel} exists`).toBeGreaterThan(0);
      for (const f of faces) expect(f, `${path} ${sel}`).toBe('Montserrat');
    }
    for (const sel of SHOW[path]) {
      const faces = await face(sel);
      expect(faces.length, `${path} ${sel} exists`).toBeGreaterThan(0);
      for (const f of faces) expect(f, `${path} ${sel}`).toBe('Pixel Operator');
    }
  });
}

// Comfortable lines on a large monitor: no line of a paragraph or a lead runs past about 75
// characters at 1920.
test('at 1920 no line of reading text runs past 75 characters', { tag: ['@brand'] }, async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // (motion off: the cards are at rest, not scaled down by their entrance)
  await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
  for (const path of ['/', '/about/', '/portfolio/', '/testing/', '/contact/', '/privacy/', '/terms/', '/accessibility/']) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const longest = await page.evaluate(() => {
      let worst = { n: 0, text: '' };
      for (const p of document.querySelectorAll<HTMLElement>('main p, main li:not(:has(p, div, ul, ol, h3, h4))')) {
        if (getComputedStyle(p).fontFamily.startsWith('"Pixel') || !p.getClientRects().length) continue;
        if (p.closest('.devtools, .visually-hidden, [aria-hidden="true"]')) continue;
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        const lines = new Map<number, number>();
        const range = document.createRange();
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          const s = t.textContent ?? '';
          // (only the reading face's own text: a card's chips and IDs are display)
          const host = t.parentElement!;
          if (!getComputedStyle(host).fontFamily.startsWith('Montserrat') || host.closest('.visually-hidden, [aria-hidden="true"]')) continue;
          for (let i = 0; i < s.length; i++) {
            range.setStart(t, i);
            range.setEnd(t, i + 1);
            const r = range.getClientRects()[0];
            if (!r) continue;
            const y = Math.round(r.top / 4);
            lines.set(y, (lines.get(y) ?? 0) + 1);
          }
        }
        for (const n of lines.values()) if (n > worst.n) worst = { n, text: (p.textContent ?? '').slice(0, 60) };
      }
      return worst;
    });
    expect(longest.n, `${path}: "${longest.text}"`).toBeLessThanOrEqual(75);
  }
});
