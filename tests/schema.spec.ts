import { test, expect, type Page } from '@playwright/test';
import { employers, social } from '../src/config';

/**
 * Structured data: one valid JSON-LD graph a page (none on the 404), describing a person and a
 * portfolio: the Person with LinkedIn among its profiles and every role from the employers data,
 * the WebSite, the page itself (a ProfilePage on Home, an AboutPage and a FAQPage on About) and a
 * breadcrumb on every page but Home. Nothing that offers work, and no organisation for PlayRun.
 */
const PAGES = ['/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/about/', '/privacy/', '/terms/', '/accessibility/'];
type Node = Record<string, unknown> & { '@type': string };
const graphOf = async (page: Page) => {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return { blocks, graph: blocks.length ? ((JSON.parse(blocks[0]) as { '@graph': Node[] })['@graph'] ?? []) : [] };
};

for (const path of PAGES) {
  test(`${path} carries one valid JSON-LD graph: the person, the site, the page${path === '/' ? ' as a ProfilePage' : ' and its breadcrumb'}`, { tag: ['@pages'] }, async ({ page }) => {
    await page.goto(path);
    const { blocks, graph } = await graphOf(page);
    expect(blocks, 'one block').toHaveLength(1);
    const raw = blocks[0];
    const of = (t: string) => graph.filter((n) => n['@type'] === t);
    // the person
    const [person] = of('Person');
    expect(person['@id']).toBe('https://playrunqa.com/#person');
    expect(person.name).toBe('Nicolás Porras');
    expect(person.alternateName).toBe('Nicolas Porras');
    expect(person.jobTitle).toBe('Game QA Tester');
    expect(person.sameAs as string[]).toContain(social.find((s) => s.label === 'LinkedIn')!.href);
    expect(person.knowsLanguage).toEqual(['es', 'en', 'zh', 'pt', 'it']);
    expect(person.knowsAbout as string[]).toEqual(expect.arrayContaining(['Virtual reality testing', 'Meta Quest', 'PlayStation VR2', 'Apple Vision Pro']));
    expect((person.alumniOf as Node[]).map((a) => a.name)).toEqual(['Swinburne University of Technology', 'South China Normal University']);
    const roles = person.worksFor as Node[];
    expect(roles, 'a role for every role in the data').toHaveLength(employers.flatMap((e) => e.roles).length);
    for (const r of roles) {
      expect(r['@type']).toBe('EmployeeRole');
      expect(r.startDate).toMatch(/^\d{4}(-\d{2})?$/);
      expect((r.worksFor as Node).name).not.toBe('PlayRun');
    }
    expect(String(person.image)).toMatch(/^https:\/\/playrunqa\.com\/.+\.jpe?g$/);
    // (the photo itself is in the build)
    expect((await page.request.get(new URL(String(person.image)).pathname)).status()).toBe(200);
    // the site and the page
    const [site] = of('WebSite');
    expect(site).toMatchObject({ '@id': 'https://playrunqa.com/#website', name: 'Nicolás Porras', alternateName: 'PlayRun', inLanguage: 'en-GB', publisher: { '@id': 'https://playrunqa.com/#person' } });
    const kind = path === '/' ? 'ProfilePage' : path === '/about/' ? 'AboutPage' : 'WebPage';
    const [pageNode] = of(kind);
    expect(pageNode.name).toBe(await page.title());
    expect(pageNode.description).toBe(await page.locator('meta[name="description"]').getAttribute('content'));
    expect(pageNode).toMatchObject({ isPartOf: { '@id': 'https://playrunqa.com/#website' }, about: { '@id': 'https://playrunqa.com/#person' } });
    if (path === '/') {
      expect(pageNode).toMatchObject({ mainEntity: { '@id': 'https://playrunqa.com/#person' }, dateCreated: '2026-10-27T00:00:00+00:00' });
      expect(pageNode.dateModified, 'the build time, a full date-time with its zone').toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/);
      expect(Number.isNaN(Date.parse(String(pageNode.dateModified)))).toBe(false);
      expect(of('BreadcrumbList')).toHaveLength(0);
    } else {
      const [crumbs] = of('BreadcrumbList');
      expect((crumbs.itemListElement as Node[]).map((i) => i.item)).toEqual(['https://playrunqa.com/', `https://playrunqa.com${path}`]);
    }
    // every date in the graph is a full date-time with a zone, but a role's start and end (year or year-month)
    const dates: [string, string][] = [];
    const walk = (v: unknown, key = '') => {
      if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k));
      else if (/^date|Date$/.test(key)) dates.push([key, String(v)]);
    };
    walk(graph);
    for (const [k, v] of dates) {
      if (k === 'startDate' || k === 'endDate') expect(v, k).toMatch(/^\d{4}(-\d{2})?$/);
      else expect(v, k).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
    }
    // a person and a portfolio only (the studios appear only inside the roles)
    expect(graph.filter((n) => n['@type'] === 'Organization'), 'no organisation node').toHaveLength(0);
    expect(raw).not.toMatch(/"(founder|makesOffer|seeks|availability|email|offers)"\s*:/);
    expect(raw).not.toMatch(/"@type"\s*:\s*"(Service|Offer|Corporation|LocalBusiness)"/);
    expect(raw, 'PlayRun only as the site name').not.toMatch(/"name"\s*:\s*"PlayRun"/);
  });
}

test('About carries a FAQPage of its own questions and answers, and the 404 carries no structured data', { tag: ['@pages'] }, async ({ page }) => {
  await page.goto('/about/');
  const { graph } = await graphOf(page);
  const [faq] = graph.filter((n) => n['@type'] === 'FAQPage');
  const questions = (faq.mainEntity as Node[]).map((q) => q.name);
  expect(questions).toEqual(await page.getByRole('heading', { level: 3 }).allTextContents());
  const answers = (faq.mainEntity as Node[]).map((q) => (q.acceptedAnswer as Node).text);
  expect(answers).toEqual((await page.locator('.qa__item p').allTextContents()).map((t) => t.trim()));
  await page.goto('/this-page-is-not-in-the-build/');
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
});
