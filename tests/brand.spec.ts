import { test, expect } from '@playwright/test';

test.describe('Brand assets', () => {
  test('both typefaces load', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => ({
      pixel: document.fonts.check('16px "Pixel Operator"'),
      montserrat: document.fonts.check('16px Montserrat'),
    }));
    expect(loaded).toEqual({ pixel: true, montserrat: true });
  });

  test('the logo renders in the header and the hero', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header svg').first();
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(20);
    await expect(page.getByRole('img', { name: 'PlayRun icon' })).toBeVisible();
  });

  test('favicon, touch icon and Open Graph image exist', async ({ page, request }) => {
    await page.goto('/');
    for (const path of ['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/og.png', '/sitemap-index.xml', '/robots.txt']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toContain('/og.png');
  });
});
