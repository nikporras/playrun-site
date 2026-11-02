import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { contactEndpoint } from '../src/config';

/**
 * The weekly check of the live site, https://playrunqa.com (playwright.live.config.ts): every page
 * in the sitemap loads clean under its policy, every link answers, the contact form's script is up,
 * and the files for crawlers are served. Read only: no form is ever sent (the script gets a GET),
 * and Umami is never reached, so the check is never counted as a visit.
 */
const UMAMI = /umami\.(is|dev)/;
// An answer that only means "not now" or "not for robots": a warning, never a failure. 429 is a rate
// limit; LinkedIn answers 999 to anything that is not a person in a browser; and some sites (2K, the
// ICO) answer 403 to requests from a data centre, such as GitHub's runners, while serving people
// normally. A page that is really gone answers 404 or 410, or nothing, and that fails.
const SOFT = new Set([403, 429, 999]);

let pages: string[] = [];
test.beforeAll(async ({ request }) => {
  const xml = await (await request.get('/sitemap-0.xml')).text();
  pages = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
});

// (Umami blocked in the page too, in case a host slips past the resolver rules)
const quiet = async (page: Page) => page.route(UMAMI, (route) => route.abort('blockedbyclient'));

test('robots.txt, the sitemap and llms.txt are served', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap: https://playrunqa.com/sitemap-index.xml');
  const index = await request.get('/sitemap-index.xml');
  expect(index.status()).toBe(200);
  expect(await index.text()).toContain('https://playrunqa.com/sitemap-0.xml');
  expect(pages.length, 'pages in the sitemap').toBeGreaterThanOrEqual(8);
  const llms = await request.get('/llms.txt');
  expect(llms.status()).toBe(200);
  expect((await llms.text()).split('\n')[0]).toBe('# Nicolás Porras');
});

test('every page in the sitemap answers 200, carries its security policy first in the head, and loads with no console errors and no failed requests', async ({ page }) => {
  await quiet(page);
  const problems: string[] = [];
  let at = '';
  // (Umami's requests are blocked here on purpose: the browser's note about that is not the site's error)
  page.on('console', (m) => m.type() === 'error' && !UMAMI.test(m.location().url) && problems.push(`${at}: console: ${m.text()}`));
  page.on('pageerror', (e) => problems.push(`${at}: script error: ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${at}: ${r.status()} ${r.url()}`));
  page.on('requestfailed', (r) => !UMAMI.test(r.url()) && problems.push(`${at}: failed ${r.url()} (${r.failure()?.errorText})`));
  for (const url of pages) {
    at = new URL(url).pathname;
    const res = await page.goto(url, { waitUntil: 'load' });
    expect(res?.status(), `${at} answered`).toBe(200);
    const html = await res!.text();
    expect(html, `${at}: the policy right after the charset`).toMatch(/<meta charset="utf-8"><meta http-equiv="content-security-policy" content="default-src 'self';/);
    await page.evaluate(() => document.fonts.ready);
    // (what the page itself caught: script errors and policy violations)
    const caught = await page.evaluate(() => (window as unknown as { __playrunErrors?: string[] }).__playrunErrors ?? []);
    for (const c of caught) problems.push(`${at}: ${c}`);
  }
  expect(problems).toEqual([]);
});

// Every link on the site, from every page in the sitemap, split into ours and everyone else's.
const links = async (page: Page) => {
  const found = new Set<string>();
  for (const url of pages) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    for (const href of await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))) {
      if (/^https?:/.test(href)) found.add(href.split('#')[0]);
    }
  }
  const ours = [...found].filter((u) => new URL(u).hostname === 'playrunqa.com');
  return { ours, theirs: [...found].filter((u) => !ours.includes(u)) };
};

// One GET, then a second after a pause if the first did not answer well.
const fetchTwice = async (request: APIRequestContext, url: string) => {
  const once = async () => {
    try {
      return (await request.get(url, { maxRedirects: 10, timeout: 30_000, headers: { 'user-agent': 'Mozilla/5.0 (playrunqa.com weekly link check)' } })).status();
    } catch {
      return 0;
    }
  };
  const first = await once();
  if (first > 0 && first < 400) return first;
  await new Promise((r) => setTimeout(r, 3000));
  return once();
};

test('every internal link answers, and every external link answers without an error (a rate limit is a warning)', async ({ page, request }) => {
  await quiet(page);
  const { ours, theirs } = await links(page);
  expect(ours.length).toBeGreaterThanOrEqual(8);
  expect(theirs.length).toBeGreaterThan(10);
  const broken: string[] = [];
  for (const url of ours) {
    const status = await fetchTwice(request, url);
    if (status !== 200) broken.push(`${status} ${url}`);
  }
  const warnings: string[] = [];
  for (const url of theirs) {
    const status = await fetchTwice(request, url);
    if (SOFT.has(status)) warnings.push(`${status} ${url}`);
    else if (status === 0 || status >= 400) broken.push(`${status || 'no answer'} ${url}`);
  }
  for (const w of warnings) test.info().annotations.push({ type: 'warning', description: `rate limited or refused to a robot: ${w}` });
  // (shown on the run in GitHub as warnings, so they are seen without failing it)
  for (const w of warnings) console.log(`::warning title=Link refused to the check::${w} (a rate limit or a block on robots; check it by hand if it stays)`);
  expect(broken, 'links that do not answer').toEqual([]);
});

test("the contact form's script is up: its GET health check answers ok (nothing is ever posted)", async ({ request }) => {
  const res = await request.get(contactEndpoint, { maxRedirects: 10 });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
});
