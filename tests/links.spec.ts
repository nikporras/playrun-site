import { test, expect } from '@playwright/test';

/**
 * Links that leave the site open in a new tab, hand nothing to the other site, and say so to
 * assistive tech. Links inside the site stay in the same tab.
 */
const PAGES = ['/', '/skills', '/portfolio', '/contact', '/quality', '/credits', '/privacy', '/terms', '/accessibility'];
const SITE = 'https://playrunqa.com';

for (const path of PAGES) {
  test(`${path}: external links open in a new tab with a hint, internal links do not`, async ({ page }) => {
    await page.goto(path);
    const links = await page.locator('a[href]').evaluateAll((as) =>
      (as as HTMLAnchorElement[]).map((a) => ({
        href: a.getAttribute('href')!,
        target: a.getAttribute('target'),
        rel: (a.getAttribute('rel') ?? '').split(/\s+/),
        text: (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
      })),
    );
    expect(links.length).toBeGreaterThan(5);
    let external = 0;
    for (const l of links) {
      const leaves = /^https?:\/\//.test(l.href) && !l.href.startsWith(SITE);
      if (leaves) {
        external++;
        expect(l.target, `${l.href} target`).toBe('_blank');
        expect(l.rel, `${l.href} rel`).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
        expect(l.text, `${l.href} hint`).toContain('(opens in a new tab)');
      } else {
        expect(l.target, `${l.href} should stay in this tab`).toBeNull();
      }
    }
    // Every page has at least the footer's profile link.
    expect(external).toBeGreaterThan(0);
  });
}
