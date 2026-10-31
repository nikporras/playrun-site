import { test, expect } from '@playwright/test';

/**
 * Page weight: what each page transfers on a first visit, with nothing cached (the HTML, the CSS,
 * the script, the fonts and the images it loads before anyone scrolls), counted from the browser's
 * own network events. Each page has a budget and the check fails over it. Home's figure is kept
 * with the run (an annotation), so the Proof board on Home shows the real number.
 */
// in KB, with room to grow (each page was well under when the budgets were set)
const BUDGETS: Record<string, number> = {
  '/': 250,
  '/skills/': 150,
  '/portfolio/': 200,
  '/quality/': 150,
  '/contact/': 150,
  '/about/': 120,
  '/privacy/': 120,
  '/terms/': 120,
  '/accessibility/': 120,
};

for (const [path, budget] of Object.entries(BUDGETS)) {
  test(`${path} weighs under ${budget} KB on a first visit`, { tag: ['@weight'] }, async ({ browser }, info) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    let bytes = 0;
    cdp.on('Network.loadingFinished', (e: { encodedDataLength: number }) => (bytes += e.encodedDataLength));
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const kb = Math.round(bytes / 1024);
    info.annotations.push({ type: 'page-weight', description: JSON.stringify({ path, kb, budget }) });
    expect(kb, `${path}: ${kb} KB of a ${budget} KB budget`).toBeLessThanOrEqual(budget);
    await context.close();
  });
}
