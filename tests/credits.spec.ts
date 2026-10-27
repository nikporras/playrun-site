import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Credits', () => {
  test('loads, has one h1, lists every photograph and passes axe', async ({ page }) => {
    const response = await page.goto('/credits');
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Credits');
    const photos = page.locator('.credits__list').first().locator('li');
    expect(await photos.count()).toBeGreaterThanOrEqual(4);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test('the footer links to the credits page and no longer lists photographs itself', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer').getByRole('link', { name: 'Credits', exact: true })).toHaveAttribute('href', '/credits');
    await expect(page.locator('footer')).not.toContainText('Photographs:');
  });
});
