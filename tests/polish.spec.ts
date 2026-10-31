import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The finish: the 404 stays out of search, every page in the sitemap carries the date of the last
 * commit to its sources, and no built page has a broken or doubled attribute.
 */
test('the 404 asks not to be indexed and carries no canonical, share address or structured data', { tag: ['@pages'] }, async ({ page }) => {
  await page.goto('/this-page-is-not-in-the-build/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  // and the real pages are indexable
  await page.goto('/skills/');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
});

test('every page in the sitemap carries the date of the last commit to its sources', { tag: ['@links'] }, async ({ request }) => {
  const xml = await (await request.get('/sitemap-0.xml')).text();
  const entries = [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => ({ path: new URL(m[1]).pathname, lastmod: m[2] }));
  expect(entries.length).toBeGreaterThan(5);
  const git = (paths: string[]) => execFileSync('git', ['log', '-1', '--format=%cI', '--', ...paths], { encoding: 'utf8' }).trim();
  const data = ['src/content/projects', 'src/config.ts'];
  const sources: Record<string, string[]> = {
    '/': ['src/pages/index.astro', ...data],
    '/portfolio/': ['src/pages/portfolio.astro', 'src/components/GameCard.astro', ...data],
    '/about/': ['src/pages/about.astro', 'src/data/about.ts', ...data],
  };
  for (const e of entries) {
    expect(e.lastmod, `${e.path} has a date`).toBeTruthy();
    const expected = git(sources[e.path] ?? [`src/pages${e.path.replace(/\/$/, '')}.astro`]);
    expect(new Date(e.lastmod!).getTime(), e.path).toBe(new Date(expected).getTime());
  }
});

test('no built page carries a broken or doubled attribute', { tag: ['@html'] }, async () => {
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : f.endsWith('.html') && files.push(path.join(d, f))));
  walk(path.join(process.cwd(), 'dist'));
  expect(files.length).toBeGreaterThan(5);
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    expect(html, `${f}: an attribute with no name`).not.toContain('"="');
    for (const tag of html.match(/<[a-z][^<>]*>/gi) ?? []) {
      // (the values blanked first, so only the names are left)
      const bare = tag.replace(/"[^"]*"|'[^']*'/g, '""');
      const names = [...bare.matchAll(/\s([a-zA-Z:@-][\w:.-]*)(?==|\s|\/?>)/g)].map((m) => m[1].toLowerCase());
      expect(names.length - new Set(names).size, `${f}: ${tag.slice(0, 80)}`).toBe(0);
    }
  }
});
