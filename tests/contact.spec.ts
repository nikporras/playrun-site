import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The contact form posts to a Google Apps Script web app. The tests never reach it: every call
 * is answered by page.route with the shapes the script can return.
 */
const ENDPOINT = '**/script.google.com/**';

async function fillValid(page: Page) {
  await page.fill('#f-name', 'Ada');
  await page.fill('#f-email', 'ada@example.com');
  await page.fill('#f-message', 'Hello from the test suite.');
}

function answer(page: Page, body: unknown, status = 200) {
  return page.route(ENDPOINT, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test.describe('Contact', () => {
  test('loads with one h1, the direct details and no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    const res = await page.goto('/contact/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(/Get in\s*touch/);
    await expect(page.getByRole('link', { name: 'studio@playrunqa.com' }).first()).toHaveAttribute('href', 'mailto:studio@playrunqa.com');
    await expect(page.locator('.form').getByRole('link', { name: 'privacy notice' })).toHaveAttribute('href', '/privacy/');
    for (const name of ['Privacy', 'Terms', 'Accessibility']) await expect(page.locator('footer').getByRole('link', { name, exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('an empty form is stopped with named errors and focus on the first field', async ({ page }) => {
    await page.goto('/contact/');
    await page.getByRole('button', { name: 'Send the message' }).click();
    await expect(page.locator('.form__error:visible')).toHaveCount(3);
    await expect(page.locator('#f-name')).toBeFocused();
    await expect(page.locator('#f-name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#form-status')).toHaveText('3 fields need a look.');
    expect(page.url()).toContain('/contact/');
  });

  test('a bad email is named, and fixing it clears the error', async ({ page }) => {
    await page.goto('/contact/');
    await page.fill('#f-name', 'Ada');
    await page.fill('#f-email', 'not-an-email');
    await page.fill('#f-message', 'Hello from the test suite.');
    await page.getByRole('button', { name: 'Send the message' }).click();
    await expect(page.locator('#e-email')).toBeVisible();
    await expect(page.locator('#f-email')).toBeFocused();
    await page.fill('#f-email', 'ada@example.com');
    await expect(page.locator('#e-email')).toBeHidden();
    await expect(page.locator('#f-email')).toHaveAttribute('aria-invalid', 'false');
  });

  test('a valid message posts a JSON string as text/plain with every field, and shows Sent', async ({ page }) => {
    let sent: { headers: Record<string, string>; body: Record<string, unknown> } | undefined;
    await page.route(ENDPOINT, (route) => {
      const req = route.request();
      sent = { headers: req.headers(), body: JSON.parse(req.postData() ?? '{}') };
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto('/contact/');
    await fillValid(page);
    await page.getByRole('button', { name: 'Send the message' }).click();
    await expect(page.locator('#form-status')).toHaveText(/^Sent/);
    await expect(page.locator('#f-name')).toBeHidden();
    expect(sent?.headers['content-type']).toBe('text/plain;charset=utf-8');
    // The message travels in the field the script already knows.
    expect(sent?.body).toMatchObject({ name: 'Ada', email: 'ada@example.com', brief: 'Hello from the test suite.', page: '/contact/', website: '' });
    expect(sent?.body).not.toHaveProperty('studio');
    expect(typeof sent?.body.startedAt).toBe('number');
  });

  test('field errors from the script are shown beside the fields', async ({ page }) => {
    await answer(page, { ok: false, errors: ['email'] });
    await page.goto('/contact/');
    await fillValid(page);
    await page.getByRole('button', { name: 'Send the message' }).click();
    await expect(page.locator('#e-email')).toBeVisible();
    await expect(page.locator('#f-email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#f-email')).toBeFocused();
    await expect(page.locator('#form-status')).toHaveText('One field needs a look.');
  });

  test("the script's error for the message field lands on the message box", async ({ page }) => {
    await answer(page, { ok: false, errors: ['brief'] });
    await page.goto('/contact/');
    await fillValid(page);
    await page.getByRole('button', { name: 'Send the message' }).click();
    await expect(page.locator('#e-message')).toBeVisible();
    await expect(page.locator('#f-message')).toBeFocused();
  });

  test('a rate limit asks for a minute', async ({ page }) => {
    await answer(page, { ok: false, errors: ['rate_limited'] });
    await page.goto('/contact/');
    await fillValid(page);
    await page.getByRole('button', { name: 'Send the message' }).click();
    await expect(page.locator('#form-status')).toHaveText("You've just sent a message, give it a minute.");
    await expect(page.locator('#f-name')).toBeVisible();
  });

  test('a server error or a network failure keeps the mail fallback', async ({ page }) => {
    await answer(page, { ok: false, errors: ['server'] });
    await page.goto('/contact/');
    await fillValid(page);
    await page.getByRole('button', { name: 'Send the message' }).click();
    await expect(page.locator('#form-status')).toContainText('did not send');
    const mail = page.getByRole('link', { name: 'Email me instead' });
    await expect(mail).toBeVisible();
    await expect(mail).toHaveAttribute('href', /^mailto:studio@playrunqa\.com\?subject=Hello%20from%20playrunqa\.com&body=Ada/);

    await page.unroute(ENDPOINT);
    await page.route(ENDPOINT, (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Send the message' }).click();
    await expect(page.locator('#form-status')).toContainText('did not send');
    await expect(mail).toBeVisible();
  });

  test('the honeypot is out of the tab order and hidden from assistive tech', async ({ page }) => {
    await page.goto('/contact/');
    const trap = page.locator('#f-website');
    await expect(trap).toHaveAttribute('tabindex', '-1');
    await expect(trap).toHaveAttribute('autocomplete', 'off');
    await expect(page.locator('.form__trap')).toHaveAttribute('aria-hidden', 'true');
    await expect(trap).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Website' })).toHaveCount(0);
  });

  test('has no accessibility violations (axe)', async ({ page }) => {
    await page.goto('/contact/');
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.timeline instanceof DocumentTimeline) // (a scroll-driven join drift never finishes)
          .map((a) => a.finished.catch(() => null)),
      ),
    );
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  for (const width of [375, 1440]) {
    test(`renders without sideways overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/contact/');
      await page.evaluate(() => document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in')));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
