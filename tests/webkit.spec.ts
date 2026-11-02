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
