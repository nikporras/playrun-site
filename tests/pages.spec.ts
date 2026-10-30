import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The inner pages: Skills, Portfolio, Quality, and the legal pages. */
const PAGES = [
  { path: '/skills', h1: /What I test\s*and how/, must: ['Functional testing', 'Bug reporting', 'GOG', 'What I bring', 'TestRail', 'Swinburne University of Technology'] },
  {
    path: '/portfolio',
    h1: /Games I've\s*tested/,
    must: [
      'Senior Quality Assurance Tester',
      'VR Robotics Operator, client Google DeepMind, contract',
      'Nexus Studios',
      'Build and Distribution Technician, contract',
      'QA Manager, contract',
      'Lead QA Tester on one cancelled project.',
      'Apple Vision Pro',
      "Lou's Lagoon",
      'Hello Sunshine',
      'Vaewolf',
      'Pathfinder: Abomination Vaults',
      'Guildford Castle VR',
      'Londinium: AD 215',
      'Ghostbusters: Rise of the Ghost Lord',
      'Cyberpunk 2077',
      'A Township Tale',
      'The Climb 2',
    ],
  },
  { path: '/quality', h1: /This site is\s*a test subject/, must: ['checks, read from the code', 'Deploy only if green', 'Playwright 1.'] },
  { path: '/privacy', h1: /Privacy notice/, must: ['Nicolás Porras (PlayRun)', 'deleted after 24 months', 'ico.org.uk'] },
  { path: '/terms', h1: /Terms of use/, must: ['not licensed for reuse', 'law of England and Wales'] },
  { path: '/accessibility', h1: /Accessibility/, must: ['WCAG', 'reduced motion', 'Report a problem'] },
];

async function settle(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in'));
    return Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => null)),
    );
  });
}

for (const p of PAGES) {
  test.describe(p.path, () => {
    test('loads with one h1, its content and no console errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(p.h1);
      for (const text of p.must) await expect(page.getByText(text).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(errors, errors.join('\n')).toEqual([]);
    });

    test('headings are in order, images have alt text, internal links resolve', async ({ page, request }) => {
      await page.goto(p.path);
      const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
      expect(levels[0]).toBe(1);
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `heading jump: ${levels.join(',')}`).toBeLessThanOrEqual(1);
      expect(await page.locator('img:not([alt])').count()).toBe(0);
      const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => [...new Set((as as HTMLAnchorElement[]).map((a) => a.getAttribute('href')!.split('#')[0]).filter(Boolean))]);
      for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
    });

    test('the canonical link and the share address are the clean page address', async ({ page }) => {
      await page.goto(p.path);
      const expected = `https://playrunqa.com${p.path}`;
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', expected);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', expected);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://playrunqa.com/og.png');
      await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', /logo/);
    });

    test('every level header is one stacked block: label, title, lead, then the button', async ({ page }) => {
      await page.goto(p.path);
      await settle(page);
      const heads = await page.locator('[data-level] .level__head').evaluateAll((els) =>
        els.map((el) => {
          const kids = [...el.children].filter((k) => k.getClientRects().length);
          const kinds = kids.map((k) => (k.matches('.flag') ? 'label' : k.matches('h1, h2') ? 'title' : k.matches('.button, .level__actions') ? 'button' : 'lead'));
          const tops = kids.map((k) => k.getBoundingClientRect().top);
          const lefts = kids.map((k) => Math.round(k.getBoundingClientRect().left));
          const lead = el.querySelector<HTMLElement>('.level__lead');
          const lines = lead ? Math.round(lead.getBoundingClientRect().height / parseFloat(getComputedStyle(lead).lineHeight)) : 0;
          return { kinds, stacked: tops.every((t, i) => i === 0 || t >= tops[i - 1]), aligned: Math.max(...lefts) - Math.min(...lefts) <= 4, lines };
        }),
      );
      expect(heads.length).toBeGreaterThan(0);
      for (const h of heads) {
        expect(h.kinds[0], h.kinds.join(',')).toBe('label');
        expect(h.kinds[1], h.kinds.join(',')).toBe('title');
        expect(h.stacked, 'one under the other').toBe(true);
        expect(h.aligned, 'all left-aligned').toBe(true);
        expect(h.lines, 'the lead is at most two lines').toBeLessThanOrEqual(2);
      }
    });

    test('the level label reads on its field (WCAG AA)', async ({ page }) => {
      await page.goto(p.path);
      const flags = await page.locator('.level .flag span').evaluateAll((els) =>
        els.map((el) => {
          const level = el.closest('.level')!;
          return { field: level.className.match(/level--(\w+)/)?.[1], bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color };
        }),
      );
      const navy = 'rgb(12, 21, 42)';
      const green = 'rgb(103, 193, 140)';
      const light = 'rgb(229, 231, 234)';
      for (const f of flags) {
        if (f.field === 'navy' || f.field === 'blue') expect(f, `${f.field}: green label, navy text`).toEqual(expect.objectContaining({ bg: green, ink: navy }));
        else expect(f, `${f.field}: navy label, light text`).toEqual(expect.objectContaining({ bg: navy, ink: light }));
      }
    });

    test('has no accessibility violations (axe)', async ({ page }) => {
      await page.goto(p.path);
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    for (const width of [375, 1440]) {
      test(`renders without sideways overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(p.path);
        await settle(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

test('the content sits in a centred column of at most 1280px with wide margins, at every width', async ({ page }) => {
  for (const width of [390, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/skills');
    const m = await page.locator('.level').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { left: parseFloat(cs.paddingLeft), right: parseFloat(cs.paddingRight), content: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
    });
    expect(m.left, `${width}: margins are equal`).toBe(m.right);
    expect(m.content, `${width}: content width`).toBeLessThanOrEqual(1280);
    expect(m.left, `${width}: a wide margin`).toBeGreaterThanOrEqual(width < 768 ? 16 : 56);
  }
});

test('every card has a logo or its icon, the labels and one store button in a new tab; the old project addresses go to the portfolio', async ({ page, request }) => {
  await page.goto('/portfolio');
  // seven posts, newest first, in LinkedIn's words, each with its own accent
  await expect(page.locator('.group__name')).toHaveText(['Aonic', 'HCLTech', 'Nexus Studios', 'Universally Speaking', 'Historic VR', 'nDreams', 'Universally Speaking']);
  await expect(page.locator('.group__role')).toHaveText([
    'Senior Quality Assurance Tester · Jul 2026 to present',
    'VR Robotics Operator, client Google DeepMind, contract · Apr 2026 to Jul 2026',
    'Quality Assurance Tester, contract · Oct 2025 to Dec 2025',
    'Build and Distribution Technician, contract · Jun 2025 to Aug 2025',
    'QA Manager, contract · Feb 2025 to Feb 2026',
    'QA Tester · Mar 2022 to Sep 2022',
    'Senior QA Tester · Sep 2022 to Apr 2023',
    'Lead QA Tester · Apr 2023 to Oct 2024',
    'Quality Assurance Tester · 2021 to 2022',
  ]);
  const accents = await page.locator('.group').evaluateAll((gs) => gs.map((g) => getComputedStyle(g).getPropertyValue('--g-accent').trim()));
  expect(accents.every((a) => a.length > 0)).toBe(true);
  await expect(page.locator('.group').last().locator('.card__via')).toHaveCount(8);
  const cards = await page.locator('.card').evaluateAll((els) =>
    els.map((el) => {
      const links = el.querySelectorAll('a');
      const a = links[0] as HTMLAnchorElement | undefined;
      return {
        title: el.querySelector('.card__title')?.textContent?.trim() ?? '',
        titleIsLink: !!el.querySelector('.card__title a'),
        links: links.length,
        href: a?.getAttribute('href') ?? '',
        text: (a?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        target: a?.getAttribute('target'),
        rel: a?.getAttribute('rel') ?? '',
        logo: el.querySelectorAll('.card__logo img').length,
        icon: el.querySelectorAll('.card__logo .gameicon').length,
        tags: [...el.querySelectorAll('.card__tags li')].map((t) => t.textContent?.trim()),
        did: el.querySelector('.card__did')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        when: el.querySelector('.card__when')?.textContent?.trim() ?? '',
        stage: /stage/i.test(el.textContent ?? ''),
      };
    }),
  );
  expect(cards.length).toBe(20);
  for (const c of cards) {
    expect(c.titleIsLink, `${c.title}: the title is not a link`).toBe(false);
    expect(c.links, `${c.title}: one link per card`).toBe(1);
    expect(c.href).toMatch(/^https:\/\/(store\.steampowered\.com|www\.meta\.com|store\.playstation\.com|nba\.2k\.com)\//);
    expect(c.text).toMatch(/^View on (Steam|Meta Quest|PlayStation Store|2K) \(opens in a new tab\)$/);
    expect(c.target).toBe('_blank');
    expect(c.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    expect(c.logo + c.icon, `${c.title}: a logo or an icon`).toBe(1);
    expect(c.tags.length, `${c.title}: labels`).toBeGreaterThan(0);
    expect(c.when).toMatch(/^(\d{4} · Released|In development)$/);
    expect(c.stage, `${c.title}: no stage numbers`).toBe(false);
    for (const t of c.tags) expect(c.did.toLowerCase(), `${c.title}: "${t}" is a label, not repeated in what I did`).not.toContain(t!.toLowerCase());
  }
  expect(cards.filter((c) => c.logo).length, 'official logos').toBeGreaterThanOrEqual(16);
  // the old pages are gone from the build and the sitemap; their addresses send visitors to the portfolio
  for (const slug of ['lous-lagoon', 'synapse', 'cyberpunk-2077', 'the-climb', 'pathfinder-abomination-vaults']) {
    const res = await request.get(`/portfolio/${slug}`);
    expect(res.status(), slug).toBe(200);
    expect(await res.text(), slug).toMatch(/http-equiv="refresh"[^>]*url=\/portfolio"?/);
  }
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  expect(sitemap).toContain('/portfolio<');
  expect(sitemap).not.toContain('/portfolio/');
  expect(sitemap).not.toContain('/about');
});

test('the skills jump list lands on each skill', async ({ page }) => {
  await page.goto('/skills');
  const ids = await page.locator('.svc__jump a').evaluateAll((as) => (as as HTMLAnchorElement[]).map((a) => a.getAttribute('href')!.slice(1)));
  expect(ids.length).toBe(5);
  for (const id of ids) await expect(page.locator(`#${id}`)).toHaveCount(1);
});

test('the old services and about addresses send visitors on', async ({ request }) => {
  const services = await request.get('/services');
  expect(services.status()).toBe(200);
  expect(await services.text()).toMatch(/http-equiv="refresh"[^>]*url=\/skills/);
  const about = await request.get('/about');
  expect(about.status()).toBe(200);
  expect(await about.text()).toMatch(/http-equiv="refresh"[^>]*url=\/"?/);
});

test('the built site is a portfolio, offers no work, links to no repository and carries no stale facts', async () => {
  const dist = join(process.cwd(), 'dist');
  const html: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.html')) html.push(full);
    }
  };
  walk(dist);
  expect(html.length).toBeGreaterThan(10);
  // The words a site that sells work would use, plus facts that went stale once: the old job
  // titles, the old Node version, the old span of VR work, the empty score, the phone number, SKU
  // counts, the NDA cards, the stage numbers, the ticker. Scripts are skipped: the form still
  // posts the message in the field the Apps Script calls 'brief', which no visitor sees.
  const offers = /quote|brief|start a project|Node 22|Three years|0\/0|7830 303383|SKU|30\+|every one of them|redacted|under NDA|QA Technician|Senior Game Quality Tester|Stage \d|marquee|I break games/i;
  const titles = [
    'Senior Quality Assurance Tester',
    'VR Robotics Operator, client Google DeepMind',
    'Founder &amp; Lead QA',
    'Build and Distribution Technician',
    'QA Manager',
    'Lead QA Tester',
  ];
  let portfolio = '';
  for (const file of html) {
    const text = readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    const hit = text.match(offers);
    expect(hit, `${file}: ${hit?.[0]}`).toBeNull();
    expect(text, `${file} links to a repository`).not.toMatch(/href="https?:\/\/github\.com/);
    if (file.endsWith('portfolio.html')) portfolio = text;
  }
  for (const t of titles) expect(portfolio, t).toContain(t);
});
