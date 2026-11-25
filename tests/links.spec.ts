import { test, expect } from '@playwright/test';

/**
 * Links that leave the site open in a new tab, hand nothing to the other site, and say so to
 * assistive tech. Links inside the site stay in the same tab.
 */
const PAGES = ['/', '/portfolio/', '/contact/', '/testing/', '/about/', '/privacy/', '/terms/', '/accessibility/'];
const SITE = 'https://playrunqa.com';

for (const path of PAGES) {
  test(`${path}: external links open in a new tab with a hint, internal links do not`, { tag: ['@links'] }, async ({ page }) => {
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

test('on every page and width the logo in the header is the way home: a visible link named PlayRun home', { tag: ['@links'] }, async ({ page }) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/portfolio/', '/testing/', '/contact/', '/about/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/']) {
      await page.goto(path);
      const home = page.locator('header').getByRole('link', { name: 'PlayRun home', exact: true });
      await expect(home, `${path} at ${width}`).toBeVisible();
      await expect(home).toHaveAttribute('href', '/');
    }
  }
});

test('the logo shows it is a link: the pointer, cyan with a bar under it on hover, a ring on keyboard focus', { tag: ['@links'] }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/about/');
  const home = page.locator('header').getByRole('link', { name: 'PlayRun home', exact: true });
  const look = () => home.evaluate((a) => ({ cursor: getComputedStyle(a).cursor, color: getComputedStyle(a).color, bar: getComputedStyle(a, '::after').transform, outline: getComputedStyle(a).outlineStyle }));
  const rest = await look();
  expect(rest.cursor).toBe('pointer');
  await home.hover();
  await expect.poll(async () => (await look()).bar).toBe('matrix(1, 0, 0, 1, 0, 0)');
  expect((await look()).color, 'cyan on hover').toBe('rgb(86, 189, 218)');
  expect(rest.color).not.toBe('rgb(86, 189, 218)');
  await page.mouse.move(700, 600);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await home.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(home).toBeFocused();
  expect((await look()).outline, 'a ring on keyboard focus').toBe('solid');
});
