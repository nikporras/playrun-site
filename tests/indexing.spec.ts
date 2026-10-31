import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Open to search and to AI: robots.txt welcomes the AI crawlers by name and disallows nothing, an
 * IndexNow key is published and the deploy reports new pages with it, /llms.txt says who the site
 * is about and where to read more, and only the decorative game UI is kept out of snippets.
 */
const BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot'];

test('robots.txt allows every named AI and search crawler, then everyone, lists the sitemap and disallows nothing', { tag: ['@links'] }, async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).not.toMatch(/^\s*Disallow/im);
  const groups = text.split(/\n\s*\n/).map((g) => g.trim()).filter((g) => /User-agent/i.test(g));
  const agents = groups.map((g) => g.match(/User-agent:\s*(\S+)/i)![1]);
  expect(agents).toEqual([...BOTS, '*']);
  for (const g of groups) expect(g).toMatch(/^Allow: \/$/m);
  expect(text).toMatch(/^Sitemap: https:\/\/playrunqa\.com\/sitemap-index\.xml$/m);
});

test('an IndexNow key is published at the site root, and the deploy reports the sitemap with it without ever failing on it', { tag: ['@links'] }, async ({ request }) => {
  const keys = readdirSync(path.join(process.cwd(), 'public')).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  expect(keys).toHaveLength(1);
  const key = keys[0].replace(/\.txt$/, '');
  const res = await request.get(`/${key}.txt`);
  expect(res.status()).toBe(200);
  expect((await res.text()).trim()).toBe(key);
  const workflow = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'deploy.yml'), 'utf8');
  const job = workflow.slice(workflow.indexOf('  indexnow:'));
  expect(job).toContain('needs: deploy');
  expect(job).toContain("github.ref == 'refs/heads/main'");
  expect(job).toContain('continue-on-error: true');
  expect(job).toContain('https://api.indexnow.org/indexnow');
  expect(job).toContain(`key: "${key}"`);
});

test('/llms.txt says who the site is about in the shared summary, lists the pages and the profile, every page in it answers, and it stays out of the sitemap', { tag: ['@links'] }, async ({ request, page }) => {
  const res = await request.get('/llms.txt');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/plain');
  const text = await res.text();
  expect(text.split('\n')[0]).toBe('# Nicolás Porras');
  // the third-person summary, the same as the Person's description in the structured data
  await page.goto('/about/');
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!) as { '@graph': { '@type': string; description?: string }[] };
  const summary = ld['@graph'].find((n) => n['@type'] === 'Person')!.description!;
  expect(summary).toBe("Nicolás Porras is a game QA tester based in London. He has tested console, PC and VR games since 2021, at Universally Speaking, nDreams, Historic VR, Nexus Studios and Aonic, and has led QA as Lead Quality Assurance Tester at nDreams and QA Manager at Historic VR. His credits include Cyberpunk 2077, NBA 2K21, Ghostbusters: Rise of the Ghost Lord, Synapse and Lou's Lagoon. PlayRun, at playrunqa.com, is his personal QA portfolio.");
  expect(text).toContain(`> ${summary}`);
  expect(text).toContain('This site is a portfolio and CV. All facts here match his LinkedIn profile.');
  const pages = [...text.slice(text.indexOf('## Pages'), text.indexOf('## Profiles')).matchAll(/^- \[([^\]]+)\]\((https:\/\/playrunqa\.com[^)]*)\): .{20,}$/gm)];
  expect(pages.map((m) => m[1])).toEqual(['About', 'Portfolio', 'Skills', 'Quality', 'Contact']);
  for (const [, , url] of pages) expect((await request.get(new URL(url).pathname)).status(), url).toBe(200);
  // (LinkedIn turns automated requests away, so the profile is checked as an address, not fetched)
  expect(text.slice(text.indexOf('## Profiles'))).toMatch(/^- \[LinkedIn\]\(https:\/\/www\.linkedin\.com\/in\/[^)]+\)$/m);
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  expect(sitemap).not.toContain('llms.txt');
});

test('only the decorative game UI is kept out of snippets: level labels, +1s, the bug ticket, the HUD and scoreboard, the Proof status; never a heading, the hero intro, a card or Skills content', { tag: ['@pages'] }, async ({ page }) => {
  await page.goto('/');
  for (const sel of ['.flag', '.bug__plus', '.hero__ticket', '#hud', '#dock', '#selftest-status', '#selftest-score']) {
    const marked = await page.locator(sel).evaluateAll((els) => els.map((el) => el.hasAttribute('data-nosnippet')));
    expect(marked.length, sel).toBeGreaterThan(0);
    expect(marked.every(Boolean), `${sel} carries data-nosnippet`).toBe(true);
  }
  const kept = (sel: string) => page.locator(sel).evaluateAll((els) => els.filter((el) => el.closest('[data-nosnippet]')).map((el) => el.textContent?.trim().slice(0, 40)));
  for (const path of ['/', '/skills/', '/portfolio/', '/about/']) {
    await page.goto(path);
    expect(await kept('h1, h2, h3, h4'), `${path}: headings`).toEqual([]);
    expect(await kept('.hero__value, .card__title, .card__summary, .card__did, .card__tags, .about__summary, .qa__item, .facts'), `${path}: content`).toEqual([]);
    if (path === '/skills/') expect(await kept('main p:not(.flag), main li'), 'Skills content').toEqual([]);
  }
});
