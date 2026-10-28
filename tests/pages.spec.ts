import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The inner pages: About, Skills, Portfolio and its project pages, Quality, and the legal pages. */
const PAGES = [
  { path: '/about', h1: /Nicolás\s*Porras/, must: ['LinkedIn profile', 'via Universally Speaking'] },
  { path: '/skills', h1: /What I test\s*and how/, must: ['Functional testing', 'Bug reporting', 'GOG'] },
  { path: '/portfolio', h1: /Games I have\s*tested/, must: ["Lou's Lagoon", 'Gang of Frogs', 'Ghostbusters: Rise of the Ghost Lord', 'Cyberpunk 2077', 'All via Universally Speaking, 2021.'] },
  { path: '/portfolio/lous-lagoon', h1: /Lou's Lagoon/, must: ['Tiny Roar', 'On Steam', 'Back to the portfolio'] },
  { path: '/portfolio/synapse', h1: /Synapse/, must: ['nDreams', 'On the PlayStation Store', 'Senior QA Technician'] },
  { path: '/portfolio/cyberpunk-2077', h1: /Cyberpunk 2077/, must: ['CD PROJEKT RED', 'Universally Speaking, 2021', 'On PlayStation'] },
  { path: '/quality', h1: /This site is\s*a test subject/, must: ['tests, read from the code', 'Deploy only if green'] },
  { path: '/privacy', h1: /Privacy notice/, must: ['Nicolás Porras (PlayRun)', 'deleted after 24 months', 'ico.org.uk'] },
  { path: '/terms', h1: /Terms of use/, must: ['not licensed for reuse', 'law of England and Wales'] },
  { path: '/accessibility', h1: /Accessibility/, must: ['WCAG', 'reduced motion', 'Report a problem'] },
];

async function settle(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in'));
    return Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    );
  });
}

for (const p of PAGES) {
  test.describe(p.path, () => {
    test('loads with one h1, its content and no console errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(p.h1);
      for (const text of p.must) await expect(page.getByText(text).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(errors, errors.join('\n')).toEqual([]);
    });

    test('headings are in order, images have alt text, internal links resolve', async ({ page, request }) => {
      await page.goto(p.path);
      const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
      expect(levels[0]).toBe(1);
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `heading jump: ${levels.join(',')}`).toBeLessThanOrEqual(1);
      expect(await page.locator('img:not([alt])').count()).toBe(0);
      const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => [...new Set((as as HTMLAnchorElement[]).map((a) => a.getAttribute('href')!.split('#')[0]).filter(Boolean))]);
      for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
    });

    test('has no accessibility violations (axe)', async ({ page }) => {
      await page.goto(p.path);
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    for (const width of [375, 1440]) {
      test(`renders without sideways overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(p.path);
        await settle(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

test('every public project has its own page, linked from the portfolio', async ({ page, request }) => {
  await page.goto('/portfolio');
  const links = await page.locator('.stage__link').evaluateAll((as) => (as as HTMLAnchorElement[]).map((a) => a.getAttribute('href')!));
  // every card carries its own game icon
  expect(await page.locator('.stage .gameicon').count()).toBe(links.length);
  expect(links.length).toBeGreaterThanOrEqual(12);
  for (const href of links) {
    expect(href).toMatch(/^\/portfolio\/[a-z0-9-]+$/);
    expect((await request.get(href)).status(), href).toBe(200);
  }
});

test('the skills jump list lands on each skill', async ({ page }) => {
  await page.goto('/skills');
  const ids = await page.locator('.svc__jump a').evaluateAll((as) => (as as HTMLAnchorElement[]).map((a) => a.getAttribute('href')!.slice(1)));
  expect(ids.length).toBe(5);
  for (const id of ids) await expect(page.locator(`#${id}`)).toHaveCount(1);
});

test('the old services address sends visitors to the skills page', async ({ request }) => {
  const res = await request.get('/services');
  expect(res.status()).toBe(200);
  expect(await res.text()).toMatch(/http-equiv="refresh"[^>]*url=\/skills/);
  expect((await request.get('/skills')).status()).toBe(200);
});

test('the built site is a portfolio, offers no work and carries no stale facts', async () => {
  const dist = join(process.cwd(), 'dist');
  const html: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.html')) html.push(full);
    }
  };
  walk(dist);
  expect(html.length).toBeGreaterThan(10);
  // The words a site that sells work would use, plus facts that went stale once: the old Node
  // version, the old span of VR work, the empty score, the phone number, SKU counts, the NDA cards. Scripts are skipped: the
  // form still posts the message in the field the Apps Script calls 'brief', which no visitor sees.
  const offers = /quote|brief|start a project|Node 22|Three years|0\/0|7830 303383|SKU|30\+|every one of them|redacted|under NDA/i;
  for (const file of html) {
    const text = readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    const hit = text.match(offers);
    expect(hit, `${file}: ${hit?.[0]}`).toBeNull();
  }
});
