import { test, expect, type Browser } from '@playwright/test';

/**
 * Cumulative Layout Shift on every page, at a phone's width and a desktop's, in the worst case a
 * first visit on a slow connection meets: the web fonts held back until after the first paint, so
 * the text is set in the fallback face first and swapped. Every layout shift until three seconds
 * after load is added up (none follows an input here); over 0.1 fails, with what moved.
 */
const PAGES = ['/', '/about/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/'];

const measure = async (browser: Browser, path: string, width: number, height: number, mobile: boolean) => {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 1.75 : 1 });
  const page = await context.newPage();
  // (the fonts late: they arrive after the first paint, as on a slow first visit)
  await page.route(/\.woff2$/, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: { value: number; sources: string[] }[] };
    w.__cls = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node | null }[] })[]) {
        if (e.hadRecentInput) continue;
        w.__cls.push({
          value: e.value,
          sources: (e.sources ?? []).map((s) => {
            const n = s.node;
            return n && n.nodeType === 1 ? `${(n as Element).tagName.toLowerCase()}.${String((n as Element).className).split(' ')[0]}` : (n?.nodeName ?? '?');
          }),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const shifts = await page.evaluate(() => (window as unknown as { __cls: { value: number; sources: string[] }[] }).__cls);
  await context.close();
  return { total: shifts.reduce((s, x) => s + x.value, 0), shifts };
};

for (const [width, height, mobile] of [
  [375, 812, true],
  [1440, 900, false],
] as const) {
  test(`no page shifts its layout by more than 0.1 (CLS) at ${width}px, with the fonts arriving late`, { tag: ['@viewports'] }, async ({ browser }) => {
    test.setTimeout(120_000);
    for (const path of PAGES) {
      const { total, shifts } = await measure(browser, path, width, height, mobile);
      test.info().annotations.push({ type: 'cls', description: `${path} at ${width}px: ${total.toFixed(4)}` });
      expect(total, `${path} at ${width}px: ${shifts.map((s) => `${s.value.toFixed(4)} ${s.sources.join(', ')}`).join(' | ')}`).toBeLessThanOrEqual(0.1);
    }
  });
}
