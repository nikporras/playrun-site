import { test, expect, type Page } from '@playwright/test';

/**
 * The events counted in the visit statistics. Clicks carry their name in data-umami-event (Umami's
 * tracker counts them); what a click cannot see goes through track() in src/scripts/track.ts. Here
 * window.umami is a stand-in that only records, set before the tracker loads (which then leaves it
 * alone), so nothing is sent. Names in kebab-case, no personal data, nothing a visitor typed.
 */
type Event = [string, Record<string, unknown> | undefined];
const record = (page: Page) =>
  page.addInitScript(() => {
    const events: unknown[] = [];
    (window as unknown as { __events: unknown[] }).__events = events;
    (window as unknown as { umami: unknown }).umami = { track: (name: string, data?: unknown) => events.push([name, data]) };
  });
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: unknown[] }).__events) as Promise<Event[]>;
const named = async (page: Page, name: string) => (await events(page)).filter(([n]) => n === name);

test('the clicks that count carry their event names: Get in touch everywhere, LinkedIn, See every game, store links with the game, the Quality run and device, the glitch', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.header__action')).toHaveAttribute('data-umami-event', 'get-in-touch');
  await expect(page.locator('.header__action')).toHaveAttribute('data-umami-event-where', 'header');
  await expect(page.getByRole('link', { name: "See every game I've tested" })).toHaveAttribute('data-umami-event', 'see-all-games');
  await expect(page.locator('[data-glitch-yes]')).toHaveAttribute('data-umami-event', 'glitch-tracked');
  await expect(page.locator('[data-glitch-no]')).toHaveAttribute('data-umami-event', 'glitch-ignored');
  // every link to the contact page and every email link counts as Get in touch, on every page
  for (const path of ['/', '/about/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/privacy/', '/terms/', '/accessibility/']) {
    const html = await (await request.get(path)).text();
    const links = [...html.matchAll(/<a\b[^>]*href="(\/contact\/|mailto:studio@playrunqa\.com)"[^>]*>/g)]
      .map((m) => m[0])
      // (the form's Email me instead is the email way round itself, counted as contact-fallback when offered)
      .filter((a) => !a.includes('data-fallback-link'));
    expect(links.length, path).toBeGreaterThan(0);
    for (const a of links) expect(a, `${path}: ${a.slice(0, 80)}`).toMatch(/data-umami-event="get-in-touch"[^>]*data-umami-event-where="[a-z-]+"/);
    // every LinkedIn link counts as linkedin
    for (const [a] of html.matchAll(/<a\b[^>]*href="https:\/\/www\.linkedin\.com[^"]*"[^>]*>/g)) expect(a, path).toContain('data-umami-event="linkedin"');
    // and no other outside link is counted under a name it should not have
    for (const [a] of html.matchAll(/<a\b[^>]*data-external[^>]*>/g)) expect(a, path).toMatch(/data-umami-event="(linkedin|store-link)"|^(?![\s\S]*data-umami-event=)/);
  }
  // a game's store link, with the game's name
  await page.goto('/portfolio/');
  const stores = page.locator('a.card__store');
  expect(await stores.count()).toBeGreaterThan(5);
  for (const a of await stores.all()) {
    await expect(a).toHaveAttribute('data-umami-event', 'store-link');
    const game = await a.getAttribute('data-umami-event-game');
    const title = await a.locator('xpath=ancestor::article[1]').locator('.card__title').textContent();
    expect(game, 'the game named').toBe(title?.trim());
  }
  // Quality: Run every step, and each device with its option
  await page.goto('/quality/');
  await expect(page.getByRole('button', { name: 'Run every step' })).toHaveAttribute('data-umami-event', 'quality-run');
  for (const b of await page.locator('[data-picker] [data-device]').all()) {
    await expect(b).toHaveAttribute('data-umami-event', 'quality-device');
    await expect(b).toHaveAttribute('data-umami-event-device', (await b.getAttribute('data-device'))!);
  }
});

test('what a click cannot see is counted by name: a message sent, the email way round offered, nothing anyone typed', async ({ page }) => {
  await record(page);
  await page.route('**/script.google.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto('/contact/');
  await page.fill('#f-name', 'Ada');
  await page.fill('#f-email', 'ada@example.com');
  await page.fill('#f-message', 'Hello from the test suite.');
  await page.getByRole('button', { name: 'Send the message' }).click();
  await expect(page.locator('#form-status')).toHaveText(/^Sent/);
  expect(await named(page, 'contact-sent')).toHaveLength(1);
  expect((await named(page, 'contact-sent'))[0][1], 'no data with it').toBeFalsy();
  // a press that does not send counts nothing
  expect(await named(page, 'contact-fallback')).toEqual([]);
  await page.unroute('**/script.google.com/**');
  await page.route('**/script.google.com/**', (route) => route.abort('failed'));
  await page.reload();
  await page.fill('#f-name', 'Ada');
  await page.fill('#f-email', 'ada@example.com');
  await page.fill('#f-message', 'Hello from the test suite.');
  await page.getByRole('button', { name: 'Send the message' }).click();
  await expect(page.getByRole('link', { name: 'Email me instead' })).toBeVisible();
  expect(await named(page, 'contact-fallback')).toHaveLength(1);
  expect(await named(page, 'contact-sent')).toEqual([]);
  // nothing personal in any event
  expect(JSON.stringify(await events(page))).not.toMatch(/Ada|example\.com|Hello from/);
});

test('Bug Sweep counts a start, a clear and a game over; an achievement counts with its name; the Motion switch counts on and off', async ({ page }) => {
  await record(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/about/');
  await page.getByRole('button', { name: 'Play Bug Sweep' }).click();
  const sweep = (fn: string) => page.locator('[data-sweep]').evaluate((el, f) => (el as unknown as { sweepTest: Record<string, (x?: unknown) => unknown> }).sweepTest[f](true), fn);
  await expect.poll(async () => (await named(page, 'bug-sweep-play')).length).toBe(1);
  await sweep('calm');
  await sweep('clear');
  await sweep('aim');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await named(page, 'bug-sweep-cleared')).length).toBe(1);
  // the achievement it unlocks, by name
  await expect.poll(() => named(page, 'achievement')).toEqual([['achievement', { name: 'Bug Sweep cleared' }]]);
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect.poll(async () => (await named(page, 'bug-sweep-play')).length).toBe(2);
  await page.locator('[data-sweep]').evaluate((el) => {
    const t = (el as unknown as { sweepTest: { hit: () => void } }).sweepTest;
    for (let i = 0; i < 3; i++) t.hit();
  });
  await expect.poll(async () => (await named(page, 'bug-sweep-game-over')).length).toBe(1);
  // the Motion switch
  const motion = page.getByRole('button', { name: /^Motion/ });
  await motion.click();
  await motion.click();
  expect((await events(page)).filter(([n]) => n.startsWith('motion-')).map(([n]) => n)).toEqual(['motion-off', 'motion-on']);
  // every name in kebab-case
  for (const [n] of await events(page)) expect(n).toMatch(/^[a-z]+(-[a-z]+)*$/);
});
