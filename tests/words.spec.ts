import { test, expect } from '@playwright/test';

/**
 * No word is ever split across two lines. On a Galaxy S25 Ultra the footer once showed
 * "Link/edIn" and the QA Lab tables "Functi/onal", "CHECK/S" and "a11y.spec/.ts": a rule let the
 * browser break inside a word. Every page, at 300, 375 and 390px, every visible word in the page
 * (headings, table cells, labels, chips, buttons, lists, paragraphs and the footer) must sit on one
 * line. An email address, URL or file name may wrap only after "@" or "/", or before a dot, so a
 * word here is a run of letters and digits between spaces, hyphens, dots, slashes and "@".
 */
const PAGES = ['/', '/about/', '/portfolio/', '/qa-lab/', '/contact/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/'];

for (const width of [300, 375, 390]) {
  test(`no word is split across two lines at ${width}px on any page`, { tag: ['@viewports'] }, async ({ browser }) => {
    test.setTimeout(120_000);
    // (motion off: everything is in place at once, the drum and the deck are still lists)
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      // (open every disclosure, so the text inside is laid out and checked too)
      await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
      const split = await page.evaluate(() => {
        // (decorative, hidden or written by the page's tools: the console lines are code output)
        const SKIP = '.visually-hidden, .join, .bug, .hero__glitch, .hero__break, .ticker__view, .devtools__list, script, style, noscript, svg';
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
          const host = node.parentElement;
          if (!host || host.closest(SKIP) || !host.getClientRects().length) continue;
          const box = host.getBoundingClientRect();
          if (box.width < 4 || box.height < 4) continue;
          for (const m of node.data.matchAll(/[^\s.\/@\-‐–·,:;()!?"'’“”…]+/g)) {
            if (m[0].length < 2) continue;
            const range = document.createRange();
            range.setStart(node, m.index!);
            range.setEnd(node, m.index! + m[0].length);
            const tops = [...range.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top));
            if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 4) {
              out.push(`"${m[0]}" in <${host.tagName.toLowerCase()} class="${host.className}">`);
            }
          }
        }
        return [...new Set(out)];
      });
      expect(split, `${path} at ${width}px`).toEqual([]);
    }
    await context.close();
  });
}
