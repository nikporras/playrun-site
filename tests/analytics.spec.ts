import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Visit statistics with Umami Cloud: the tracker is the site's own copy (script-src stays 'self'),
 * deferred on every page, reports only to Umami's gateway (the one host added to connect-src),
 * only on playrunqa.com and never with Do Not Track on. The suite never sends anything: Umami's
 * hosts do not resolve in its browsers, and the pages here are never playrunqa.com, except below,
 * where the live domain is played by the preview and the gateway is answered here.
 */
const PAGES = ['/', '/about/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/privacy/', '/terms/', '/accessibility/', '/404.html'];
const UMAMI = /umami\.(is|dev)/;
const ID = '1b852413-81ed-4ebf-bbfc-fd63237d3cc4';

test("every page carries the tracker, the site's own copy, deferred, for the live domain only and with Do Not Track respected; the policy adds only Umami's gateway", { tag: ['@pages'] }, async ({ request }) => {
  for (const path of PAGES) {
    const html = await (await request.get(path)).text();
    const tags = [...html.matchAll(/<script([^>]*\bdata-website-id[^>]*)><\/script>/g)].map((m) => m[1]);
    expect(tags, path).toHaveLength(1);
    const attr = (name: string) => tags[0].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
    expect(attr('src'), path).toBe('/umami.js');
    expect(tags[0], `${path}: deferred`).toMatch(/\bdefer\b/);
    expect(attr('data-website-id')).toBe(ID);
    expect(attr('data-host-url')).toBe('https://gateway.umami.is');
    expect(attr('data-domains')).toBe('playrunqa.com');
    expect(attr('data-do-not-track')).toBe('true');
    const csp = html.match(/<meta http-equiv="content-security-policy" content="([^"]*)">/)![1];
    const script = csp.split(';').find((d) => d.trim().startsWith('script-src'))!;
    expect(script, `${path}: no outside script`).not.toMatch(UMAMI);
    const connect = csp.split(';').find((d) => d.trim().startsWith('connect-src'))!.trim().split(/\s+/).slice(1);
    expect(connect).toEqual(["'self'", 'https://script.google.com', 'https://script.googleusercontent.com', 'https://gateway.umami.is']);
  }
  const copy = await request.get('/umami.js');
  expect(copy.status()).toBe(200);
  expect(await copy.text()).toContain('api/send');
});

test('nothing is ever sent to Umami from the suite: not one request to its hosts, on any page', async ({ page }) => {
  const hits: string[] = [];
  page.on('request', (r) => UMAMI.test(new URL(r.url()).hostname) && hits.push(r.url()));
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: 'load' });
    await page.evaluate(() => (window as unknown as { umami?: { track: (e: string) => void } }).umami?.track('suite-probe'));
  }
  await page.waitForLoadState('networkidle');
  expect(hits).toEqual([]);
});

test('with Umami blocked, as an ad blocker would, every page still works: no script errors, and what counts clicks carries on', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/umami.js', (route) => route.abort('blockedbyclient'));
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: 'load' });
    await expect(page.locator('h1'), path).toHaveCount(1);
  }
  await page.goto('/quality/');
  await page.getByRole('button', { name: 'Firefox' }).click();
  await expect(page.locator('[data-picker] [aria-pressed="true"]')).toHaveText('Firefox');
  await page.getByRole('button', { name: /^Motion/ }).click();
  await expect(page.locator('html')).toHaveClass(/motion-off/);
  expect(errors).toEqual([]);
});

// The preview, playing the live domain: every request to https://playrunqa.com is answered from it,
// and Umami's gateway is answered here, so nothing leaves the machine.
const asLive = async (page: Page) => {
  const base = test.info().project.use.baseURL!;
  await page.route('https://playrunqa.com/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  const sent: { host: string; path: string; body: { type: string; payload: Record<string, unknown> } }[] = [];
  await page.route(UMAMI, async (route: Route) => {
    const u = new URL(route.request().url());
    sent.push({ host: u.hostname, path: u.pathname, body: JSON.parse(route.request().postData() ?? '{}') });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  return sent;
};

test("on the live domain the tracker reports to Umami's gateway and nowhere else (answered here, so nothing really leaves)", async ({ page }) => {
  const sent = await asLive(page);
  const outside: string[] = [];
  page.on('request', (r) => {
    const h = new URL(r.url()).hostname;
    if (h !== 'playrunqa.com') outside.push(h);
  });
  await page.goto('https://playrunqa.com/about/');
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(new Set(sent.map((s) => `${s.host}${s.path}`))).toEqual(new Set(['gateway.umami.is/api/send']));
  expect(sent[0].body.type).toBe('event');
  expect(sent[0].body.payload).toMatchObject({ website: ID, hostname: 'playrunqa.com', url: 'https://playrunqa.com/about/' });
  expect(new Set(outside)).toEqual(new Set(['gateway.umami.is']));
});

test('with Do Not Track on, nothing is sent even on the live domain', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }));
  const sent = await asLive(page);
  await page.goto('https://playrunqa.com/');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => (window as unknown as { umami?: { track: (e: string) => void } }).umami?.track('probe'));
  await page.waitForTimeout(500);
  expect(sent).toEqual([]);
});

test('the Privacy page says what is counted and how, and that Do Not Track is respected; no page claims there are no analytics', async ({ page, request }) => {
  await page.goto('/privacy/');
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  expect(text).toContain('I use Umami for anonymous, cookieless visit statistics.');
  expect(text).toContain('If your browser sends Do Not Track, nothing is sent at all.');
  expect(text).toContain('There are no cookies.');
  expect(text).toMatch(/LinkedIn links, a game's store link \(with the game's name\)/);
  await expect(page.getByRole('link', { name: /privacy policy/ })).toHaveAttribute('href', 'https://umami.is/privacy');
  for (const path of PAGES) {
    const html = await (await request.get(path)).text();
    expect(html, path).not.toMatch(/no analytics|no third-party requests/i);
  }
});
