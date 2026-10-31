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
  for (const path of ['/', '/skills/', '/about/']) {
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
