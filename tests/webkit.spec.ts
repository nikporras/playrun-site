import { test, expect } from '@playwright/test';

/**
 * In WebKit, Safari's engine (every iPhone): it reports no first-paint, so the Performance step
 * rests on first-contentful-paint, or says it is not measured; it never fails for a missing figure.
 */
test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });

// WebKit applies the policy's upgrade-insecure-requests even to the local http preview (Chromium
// exempts localhost), so every file would be asked for over https and fail. The live site is https;
// here the page is served with that one directive taken out, the rest of the policy as it is.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    const body = (await response.text()).replace(/upgrade-insecure-requests;?\s*/g, '');
    await route.fulfill({ response, body });
  });
});

test('in WebKit the Quality steps run, and Performance passes on first contentful paint or is not measured, never a fail for a missing figure', async ({ page }) => {
  await page.goto('/quality/');
  await expect(page.locator('.step.is-pass, .step.is-fail, .step.is-unmeasured')).toHaveCount(5, { timeout: 20_000 });
  const step = page.locator('#step-performance');
  const detail = (await step.locator('[data-step-result]').textContent()) ?? '';
  // (what WebKit reported, kept with the run)
  test.info().annotations.push({ type: 'webkit-performance', description: detail });
  const paints = await page.evaluate(() => performance.getEntriesByType('paint').map((p) => p.name));
  expect(paints, 'no first-paint in WebKit').not.toContain('first-paint');
  if (paints.includes('first-contentful-paint')) {
    await expect(step, detail).toHaveClass(/is-pass/);
    expect(detail).toMatch(/^First contentful paint at \d/);
  } else {
    await expect(step, detail).toHaveClass(/is-unmeasured/);
    expect(detail).toContain('not reported by this browser');
  }
  expect(detail).not.toMatch(/n\/a|\b0ms/);
  // the picker knows it as Safari
  await expect(page.locator('[data-picker] [aria-pressed="true"]')).toHaveText('Safari');
});

test('in WebKit the joins between levels draw their tones from colours worked out at build time, never black', async ({ page }) => {
  await page.goto('/');
  const fills = await page.locator('.join').evaluateAll((joins) =>
    joins.flatMap((j) =>
      ['back', 'mid', 'front'].map((l) => {
        const f = j.querySelector(`.join__layer--${l} .join__fill`);
        const light = j.querySelector(`.join__layer--${l} .join__light`);
        return { fill: f ? getComputedStyle(f).fill : '', light: light ? getComputedStyle(light).fill : 'none' };
      }),
    ),
  );
  expect(fills.length).toBeGreaterThan(6);
  for (const f of fills) {
    expect(f.fill).toMatch(/^rgb\(/);
    expect(f.fill).not.toBe('rgb(0, 0, 0)');
    expect(f.light).not.toBe('rgb(0, 0, 0)');
  }
  // the tones are plain colours in the page itself, no color-mix() needed
  expect(await page.locator('.join').first().getAttribute('style')).toMatch(/--join-back: #[0-9a-f]{6}/);
});
