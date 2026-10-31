import { test, expect, devices, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';

/**
 * The Content Security Policy: one meta tag at the top of every page's head, the inline script
 * allowed by its hash and nothing else inline, and the referrer kept to the origin across sites.
 * Anything the policy blocks is a console error and lands in the page's own error list, so the
 * clean-console checks everywhere fail on a violation; the tour below works the parts of the site
 * that do the most (the games, the checks, Pocket DevTools, the form) under the policy.
 */
const POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
  "form-action 'self' mailto:",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
  "style-src 'self' 'unsafe-inline'",
];
const PAGES = ['/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/about/', '/privacy/', '/terms/', '/accessibility/', '/404.html', '/services/', '/portfolio/clawpunk/'];

const directives = (csp: string) => new Map(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.split(/\s+/)[0], d.split(/\s+/).slice(1)] as const));

/** Console errors, page errors and policy violations, from the moment the page starts. */
async function watch(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
  return errors;
}

test('every page carries the policy first in its head, allows each inline script by its hash, and sets the referrer policy', { tag: ['@pages'] }, async ({ request }) => {
  for (const path of PAGES) {
    const html = await (await request.get(path)).text();
    const metas = [...html.matchAll(/<meta http-equiv="content-security-policy" content="([^"]*)">/g)];
    expect(metas, path).toHaveLength(1);
    // before any script or stylesheet, right after the charset
    const at = html.indexOf(metas[0][0]);
    expect(html.slice(0, at), path).toMatch(/<meta charset="utf-8">$/);
    const csp = directives(metas[0][1]);
    for (const line of POLICY) {
      const [name, ...values] = line.split(' ');
      expect(csp.get(name), `${path}: ${name}`).toEqual(values);
    }
    const script = csp.get('script-src')!;
    expect(script[0], path).toBe("'self'");
    expect(script.filter((s) => !/^'sha256-[\w+/=]+'$/.test(s)), `${path}: only 'self' and hashes`).toEqual(["'self'"]);
    for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=/.test(attrs) || /application\/ld\+json/.test(attrs)) continue;
      expect(script, `${path}: an inline script is in the policy`).toContain(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    }
    expect(html, `${path}: no inline event handlers`).not.toMatch(/<[^>]+\son[a-z]+=/);
    if (!/Redirecting to/.test(html)) expect(html, path).toContain('<meta name="referrer" content="strict-origin-when-cross-origin">');
  }
});

test('a violation is caught: the console reports it and the page counts it among its own errors', { tag: ['@console'] }, async ({ page }) => {
  const errors = await watch(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(errors, errors.join('\n')).toEqual([]);
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__injected = true';
    document.body.append(s);
    const img = new Image();
    img.src = 'https://example.com/pixel.png';
    document.body.append(img);
  });
  await expect.poll(() => errors.filter((e) => /Content Security Policy|CSP violation/.test(e)).length).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
  const own = await page.evaluate(() => (window as unknown as { __playrunErrors: string[] }).__playrunErrors);
  expect(own.join('\n')).toMatch(/Content Security Policy blocked inline \(script-src-elem\)/);
  expect(own.join('\n')).toMatch(/Content Security Policy blocked https:\/\/example\.com\/pixel\.png \(img-src\)/);
});

test.describe('under the policy', () => {
  test('Home: the self test, a bug caught and the scoreboard, with nothing blocked', { tag: ['@console'] }, async ({ page }) => {
    const errors = await watch(page);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const bug = page.locator('[data-bug]:visible').first();
    await bug.evaluate((el) => el.getAnimations().forEach((a) => a.pause()));
    await bug.scrollIntoViewIfNeeded();
    await bug.click();
    await expect(page.locator('[data-hud-bugs]')).toHaveText('01');
    await page.getByRole('button', { name: /^Scoreboard/ }).click();
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Test this page' }).click();
    await expect(page.locator('#selftest-status')).toContainText(/on your device/, { timeout: 15_000 });
    await expect(page.locator('[data-check="console"]')).toHaveClass(/is-pass/);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the Portfolio scan and the Quality run, with nothing blocked', { tag: ['@console'] }, async ({ page }) => {
    const errors = await watch(page);
    await page.goto('/portfolio/');
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.card').first().scrollIntoViewIfNeeded();
    await expect(page.locator('.card__pass').first()).toBeVisible({ timeout: 10_000 });
    await page.goto('/quality/');
    await page.mouse.move(640, 300);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: 'Run every step' }).click();
    await expect(page.locator('.step.is-pass')).toHaveCount(5, { timeout: 15_000 });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the contact form posts to the script, and the page may reach both its hosts and no other', { tag: ['@console'] }, async ({ page }) => {
    const errors = await watch(page);
    // (never the real script: the answers are the script's own shapes)
    const json = { status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' };
    await page.route('**/script.google.com/**', (route) => route.fulfill(json));
    await page.route('**/script.googleusercontent.com/**', (route) => route.fulfill(json));
    await page.goto('/contact/');
    await page.fill('#f-name', 'Ada');
    await page.fill('#f-email', 'ada@example.com');
    await page.fill('#f-message', 'Hello from the test suite.');
    await page.getByRole('button', { name: 'Send the message' }).click();
    await expect(page.locator('.form')).toHaveClass(/is-sent/);
    expect(errors, errors.join('\n')).toEqual([]);
    // the live script answers a post with a redirect to script.googleusercontent.com, which holds the answer
    const reach = (url: string) => page.evaluate((u) => fetch(u).then((r) => r.status, () => 'blocked'), url);
    expect(await reach('https://script.googleusercontent.com/macros/echo?user_content_key=test')).toBe(200);
    expect(errors, errors.join('\n')).toEqual([]);
    expect(await reach('https://example.com/')).toBe('blocked');
    await expect.poll(() => errors.some((e) => /connect-src/.test(e))).toBe(true);
  });
});

test.describe('on a phone, under the policy', () => {
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  test.use({ ...phone, viewport: { width: 390, height: 844 } });
  test('Pocket DevTools lists the requests and no errors, with nothing blocked', { tag: ['@console'] }, async ({ page }) => {
    const errors = await watch(page);
    await page.goto('/quality/');
    const dev = page.locator('.devtools');
    await dev.scrollIntoViewIfNeeded();
    await expect(page.locator('[data-dev-console] li').first()).toHaveText('No errors since this page loaded.');
    await expect.poll(() => page.locator('[data-dev-network] tr').count()).toBeGreaterThan(5);
    await expect(page.locator('[data-dev-network] td.is-bad')).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
