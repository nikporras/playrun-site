import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The inner pages: Skills, Portfolio, Quality, and the legal pages. */
const PAGES = [
  {
    path: '/skills/',
    h1: /What I test\s*and how/,
    must: [
      'Functional testing',
      'Bug reporting',
      'GOG',
      'Tools, methods, languages and education',
      'TestRail',
      'Swinburne University of Technology',
      'I test the same build on Nintendo Switch, Switch 2, Xbox and PS5, and on PC against the requirements of Steam, Epic Games Store and GOG. Each platform and store has its own rules, so I check them before submission, not after a rejection.',
      'Then I report exactly what broke down, and where.',
    ],
  },
  {
    path: '/portfolio/',
    h1: /Games I've\s*tested/,
    must: [
      'Senior Quality Assurance Tester',
      'VR Robotics Operator, client Google DeepMind, contract',
      'Nexus Studios',
      'Build and Distribution Technician, contract',
      'QA Manager, contract',
      'Lead Quality Assurance Tester on one cancelled project.',
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
  { path: '/quality/', h1: /Let's test this\s*page together/, must: ['Smoke test', 'Responsive', 'Accessibility', 'Links', 'Performance', 'Bug report template', 'Playwright 1.'] },
  { path: '/privacy/', h1: /Privacy notice/, must: ['Nicolás Porras (PlayRun)', 'deleted after 24 months', 'ico.org.uk'] },
  { path: '/terms/', h1: /Terms of use/, must: ['not licensed for reuse', 'law of England and Wales', 'Credits and trademarks', 'Pixel Operator by Jayvee Enaguas (CC0)', 'Montserrat by Julieta Ulanovsky and contributors (SIL Open Font License)', 'Game names and logos are trademarks of their respective owners'] },
  { path: '/accessibility/', h1: /Accessibility/, must: ['WCAG', 'reduced motion', 'Report a problem'] },
];

async function settle(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in'));
    return Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.timeline instanceof DocumentTimeline) // (a scroll-driven join drift never finishes)
        .map((a) => a.finished.catch(() => null)),
    );
  });
}

for (const p of PAGES) {
  test.describe(p.path, () => {
    test('loads with one h1, its content and no console errors', { tag: ['@pages', '@console'] }, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(p.h1);
      for (const text of p.must) await expect(page.getByText(text).filter({ visible: true }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(errors, errors.join('\n')).toEqual([]);
    });

    test('headings are in order, images have alt text, internal links resolve', { tag: ['@a11y', '@links'] }, async ({ page, request }) => {
      await page.goto(p.path);
      const levels = await page.locator('h1, h2, h3').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
      expect(levels[0]).toBe(1);
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `heading jump: ${levels.join(',')}`).toBeLessThanOrEqual(1);
      expect(await page.locator('img:not([alt])').count()).toBe(0);
      const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => [...new Set((as as HTMLAnchorElement[]).map((a) => a.getAttribute('href')!.split('#')[0]).filter(Boolean))]);
      for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
    });

    test('the canonical link and the share address are the clean page address', { tag: ['@pages'] }, async ({ page }) => {
      await page.goto(p.path);
      const expected = `https://playrunqa.com${p.path}`;
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', expected);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', expected);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://playrunqa.com/og.png');
      await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', /logo/);
    });

    test('every level header is one stacked block: label, title, lead, then the button', { tag: ['@pages'] }, async ({ page }) => {
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

    test('the level label is a short line and small text that reads on its field (WCAG AA)', { tag: ['@a11y'] }, async ({ page }) => {
      await page.goto(p.path);
      const flags = await page.locator('.level .flag').evaluateAll((els) =>
        els.map((el) => {
          const level = el.closest('.level')!;
          const cs = getComputedStyle(el);
          const line = getComputedStyle(el, '::before');
          return {
            field: level.className.match(/level--(\w+)/)?.[1],
            ink: cs.color,
            box: cs.backgroundColor,
            spanBox: getComputedStyle(el.querySelector('span')!).backgroundColor,
            line: line.backgroundColor,
            lineW: parseFloat(line.width),
            size: parseFloat(cs.fontSize),
          };
        }),
      );
      const navy = 'rgb(12, 21, 42)';
      const green = 'rgb(103, 193, 140)';
      const white = 'rgb(255, 255, 255)';
      const none = 'rgba(0, 0, 0, 0)';
      expect(flags.length).toBeGreaterThan(0);
      for (const f of flags) {
        expect(f.box, 'no filled box').toBe(none);
        expect(f.spanBox, 'no filled box').toBe(none);
        expect(f.lineW, 'a short line before the text').toBeGreaterThanOrEqual(16);
        expect(f.size, 'small text').toBeLessThanOrEqual(16);
        if (f.field === 'navy' || f.field === 'field') expect(f, 'green on navy').toEqual(expect.objectContaining({ ink: green, line: green }));
        else if (f.field === 'blue') expect(f, 'white text, green line on blue').toEqual(expect.objectContaining({ ink: white, line: green }));
        else expect(f, `navy on ${f.field}`).toEqual(expect.objectContaining({ ink: navy, line: navy }));
      }
    });

    test('has no accessibility violations (axe)', { tag: ['@a11y'] }, async ({ page }) => {
      await page.goto(p.path);
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    for (const width of [375, 1440]) {
      test(`renders without sideways overflow at ${width}px`, { tag: ['@viewports'] }, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(p.path);
        await settle(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  });
}

test('the content sits in a centred column of at most 1280px with wide margins, at every width', { tag: ['@viewports'] }, async ({ page }) => {
  for (const width of [390, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/skills/');
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
  await page.goto('/portfolio/');
  // seven posts, newest first, in LinkedIn's words, each with its own accent
  await expect(page.locator('.group__name')).toHaveText(['Aonic', 'HCLTech', 'Nexus Studios', 'Universally Speaking', 'Historic VR', 'nDreams', 'Universally Speaking']);

  // the dates, large and in the accent, right under the name; a post with several roles keeps
  // each role's own dates on its line
  await expect(page.locator('.group__when')).toHaveText(['Jul 2026 to present', 'Apr 2026 to Jul 2026', 'Oct 2025 to Dec 2025', 'Jun 2025 to Aug 2025', 'Feb 2025 to Feb 2026', 'Apr 2022 to Oct 2024', '2021 to 2022']);
  await expect(page.locator('.group__role')).toHaveText([
    'Senior Quality Assurance Tester',
    'VR Robotics Operator, client Google DeepMind, contract',
    'Quality Assurance Tester, contract',
    'Build and Distribution Technician, contract',
    'QA Manager, contract',
    'QA Tester · Apr 2022 to Sep 2022',
    'Senior Quality Assurance Tester · Sep 2022 to Apr 2023',
    'Lead Quality Assurance Tester · Apr 2023 to Oct 2024',
    'Quality Assurance Tester',
  ]);
  const head = await page.locator('.group__head').first().evaluate((el) => {
    const name = el.querySelector('.group__name')!.getBoundingClientRect();
    const when = el.querySelector('.group__when')!;
    const role = el.querySelector('.group__role')!;
    return { nameBottom: name.bottom, whenTop: when.getBoundingClientRect().top, whenSize: parseFloat(getComputedStyle(when).fontSize), roleSize: parseFloat(getComputedStyle(role).fontSize), whenColor: getComputedStyle(when).color, accent: getComputedStyle(el).getPropertyValue('--g-ink').trim() || getComputedStyle(el).getPropertyValue('--g-accent').trim() };
  });
  expect(head.whenTop).toBeGreaterThanOrEqual(head.nameBottom - 2);
  expect(head.whenSize).toBeGreaterThan(head.roleSize);
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
        wordmark: el.querySelectorAll('.card__wordmark').length,
        tags: [...el.querySelectorAll('.card__tags li')].map((t) => t.textContent?.trim()),
        did: el.querySelector('.card__did')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        order: [...el.querySelectorAll('.card__title, .card__summary, .card__makers, .card__part, .card__did, .card__tags, .card__platforms, .card__store')].map((k) => [...k.classList].find((n) => n.startsWith('card__'))),
        rule: parseFloat(getComputedStyle(el.querySelector('.card__part')!).borderTopWidth),
        didColor: getComputedStyle(el.querySelector('.card__did') ?? el).color,
        summaryColor: getComputedStyle(el.querySelector('.card__summary')!).color,
        didSize: parseFloat(getComputedStyle(el.querySelector('.card__did') ?? el).fontSize),
        summarySize: parseFloat(getComputedStyle(el.querySelector('.card__summary')!).fontSize),
        platforms: el.querySelector('.card__platforms')?.textContent?.trim() ?? '',
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
    expect(c.logo + c.icon + c.wordmark, `${c.title}: a logo, a wordmark or an icon`).toBe(1);
    expect(c.tags.length, `${c.title}: labels`).toBeGreaterThan(0);
    expect(c.when).toMatch(/^(\d{4} · Released|In development)$/);
    expect(c.stage, `${c.title}: no stage numbers`).toBe(false);
    for (const t of c.tags) expect(c.did.toLowerCase(), `${c.title}: "${t}" is a label, not repeated in what I did`).not.toContain(t!.toLowerCase());
    // two blocks: the game (title, the line on it, the makers), a thin rule, then my part (what I
    // did, its labels right under it, the platforms, the button)
    expect(c.order, `${c.title}: the game first, then my part`).toEqual(['card__title', 'card__summary', 'card__makers', 'card__part', ...(c.did ? ['card__did'] : []), 'card__tags', 'card__platforms', 'card__store']);
    expect(c.rule, `${c.title}: a thin rule between the blocks`).toBe(1);
    if (c.did) {
      expect(c.didSize, `${c.title}: what I did is the most prominent text`).toBeGreaterThan(c.summarySize);
      expect(c.didColor, `${c.title}: what I did is brighter than the line on the game`).toBe('rgb(229, 231, 234)');
      expect(c.summaryColor).not.toBe('rgb(229, 231, 234)');
    }
  }
  // unreleased titles list only the platforms with a store page
  const byTitle = Object.fromEntries(cards.map((c) => [c.title, c]));
  expect(byTitle['Pathfinder: Abomination Vaults'].platforms).toBe('PC (Steam)');
  expect(byTitle['Londinium: AD 215'].platforms).toBe('Steam');
  expect(byTitle['Vaewolf'].platforms).not.toMatch(/Switch/);
  expect(byTitle['Gang of Frogs'].platforms).toBe('PC (Steam)');
  expect(byTitle['Hello Sunshine'].platforms).toBe('PC (Steam)');
  expect(byTitle['Londinium: AD 215'].logo, 'Londinium carries the Historic VR logo').toBe(1);
  expect(byTitle['Space Pirate Trainer'].tags).toEqual(['CQA', 'Functional', 'Multiplayer']);
  expect(byTitle['Ghostbusters: Rise of the Ghost Lord'].did).toContain('Supported the main QA team near milestones, on Meta Quest and PS VR2, including co-op sessions.');
  expect(byTitle['Synapse'].did).toContain('Supported the main QA team near milestones on PS VR2.');
  expect(cards.filter((c) => c.logo).length, 'official logos').toBeGreaterThanOrEqual(16);
  // the store button is an outline: green edge and text on the navy tile, pixel-notched corners,
  // at least 44px tall, smaller than the solid button; filled green with navy text on hover and
  // focus, with a ring inside the fill
  const store = page.locator('.card__store').first();
  await store.scrollIntoViewIfNeeded();
  // (the card's entrance scales it for a moment; measure once it has settled)
  await expect.poll(() => store.evaluate((el) => el.getBoundingClientRect().height), { timeout: 4000 }).toBeGreaterThanOrEqual(44);
  const outline = await store.evaluate((el) => {
    const cs = getComputedStyle(el);
    const fill = getComputedStyle(el, '::before');
    return { h: el.getBoundingClientRect().height, color: cs.color, edge: cs.backgroundColor, fill: fill.backgroundColor, clip: cs.clipPath, size: parseFloat(cs.fontSize), radius: cs.borderTopLeftRadius };
  });
  expect(outline.h).toBeGreaterThanOrEqual(44);
  expect(outline.color).toBe('rgb(103, 193, 140)');
  expect(outline.edge, 'the green edge').toBe('rgb(103, 193, 140)');
  expect(outline.fill, 'navy inside').toBe('rgb(12, 21, 42)');
  expect(outline.clip, 'notched corners').toMatch(/^polygon\(/);
  expect(outline.radius).toBe('0px');
  expect(outline.size).toBeLessThan(parseFloat(await page.locator('.next .button').first().evaluate((el) => getComputedStyle(el).fontSize)));
  await store.hover();
  await expect.poll(() => store.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(103, 193, 140)');
  expect(await store.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(12, 21, 42)');
  await page.mouse.move(0, 0);
  await store.focus();
  await expect.poll(() => store.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(103, 193, 140)');
  expect(await store.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el, '::after').opacity, getComputedStyle(el, '::after').boxShadow])).toEqual(['rgb(12, 21, 42)', '1', expect.stringContaining('rgb(12, 21, 42)')]);
  // the old pages are gone from the build and the sitemap; their addresses send visitors to the portfolio
  for (const slug of ['lous-lagoon', 'synapse', 'cyberpunk-2077', 'the-climb', 'pathfinder-abomination-vaults']) {
    const res = await request.get(`/portfolio/${slug}/`);
    expect(res.status(), slug).toBe(200);
    expect(await res.text(), slug).toMatch(/http-equiv="refresh"[^>]*url=\/portfolio"?/);
  }
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  expect(sitemap).toContain('/portfolio/<');
  expect(sitemap, 'no page per game in the map').not.toMatch(/\/portfolio\/[a-z0-9-]+/);
  expect(sitemap, 'the About page is a page again').toContain('/about/<');
});

test('every Skills paragraph is full first-person sentences, and the In practice items are readable labels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/skills/');
  const texts = await page.locator('.six__text').allTextContents();
  expect(texts).toHaveLength(5);
  for (const t of texts) {
    for (const sentence of t.split(/(?<=[.!?])\s+/)) {
      expect(sentence, `${sentence}: starts with a capital and ends with a full stop`).toMatch(/^[A-Z].*[.!?]$/);
      expect(sentence, `${sentence}: has a subject, I or a noun phrase with a verb`).toMatch(/\b(I|I've|I'm|Each|Then|Every)\b/);
    }
  }
  const tags = page.locator('.six__tags li');
  expect(await tags.count()).toBe(15);
  const style = await tags.first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { size: parseFloat(cs.fontSize), border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, color: cs.color, family: cs.fontFamily };
  });
  expect(style.size, 'readable').toBeGreaterThanOrEqual(16);
  expect(style.border).toBe('1px');
  expect(style.radius).not.toBe('0px');
  expect(style.bg).toBe('rgb(12, 21, 42)');
  expect(style.color).toBe('rgb(229, 231, 234)');
  expect(style.family).toMatch(/mono|Consolas|Courier/i);
  // on a phone the labels wrap into rows inside the column, none cut off
  await page.setViewportSize({ width: 375, height: 812 });
  const rows = await tags.evaluateAll((els) => els.slice(0, 3).map((el) => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, top: Math.round(el.getBoundingClientRect().top) })));
  for (const r of rows) {
    expect(r.right).toBeLessThanOrEqual(375);
    expect(r.left).toBeGreaterThanOrEqual(16);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('the skills jump list lands on each skill', async ({ page }) => {
  await page.goto('/skills/');
  const ids = await page.locator('.svc__jump a').evaluateAll((as) => (as as HTMLAnchorElement[]).map((a) => a.getAttribute('href')!.slice(1)));
  expect(ids.length).toBe(5);
  for (const id of ids) await expect(page.locator(`#${id}`)).toHaveCount(1);
});

test('the trailing-slash address is the one official form: every internal link answers 200 with no redirect, the canonical and og:url match it, the sitemap lists it, and a missing page is still the 404', { tag: ['@pages', '@links'] }, async ({ request, page }) => {
  const routes = ['/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/about/', '/privacy/', '/terms/', '/accessibility/'];
  const seen = new Set<string>();
  for (const route of routes) {
    const res = await request.get(route, { maxRedirects: 0 });
    expect(res.status(), `${route} answers 200 with no redirect`).toBe(200);
    const html = await res.text();
    expect(html, `${route} is not the 404 page`).not.toContain('Game over');
    expect(html, `${route} carries its own canonical`).toContain(`<link rel="canonical" href="https://playrunqa.com${route}">`);
    expect(html, `${route} shares the same address`).toContain(`<meta property="og:url" content="https://playrunqa.com${route}">`);
    for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
      const href = m[1];
      if (/\.[a-z0-9]+$/i.test(href) || seen.has(href)) continue; // files (css, fonts, icons) are not pages
      seen.add(href);
      expect(href, `${href} on ${route} carries the trailing slash`).toMatch(/\/$/);
      const linked = await request.get(href, { maxRedirects: 0 });
      expect(linked.status(), `${href} (linked from ${route}) answers 200 with no redirect`).toBe(200);
    }
  }
  expect(seen.size, 'the pages link to each other').toBeGreaterThanOrEqual(routes.length);
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  const listed = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1]);
  expect(listed.sort()).toEqual(routes.map((r) => `https://playrunqa.com${r}`).sort());
  for (const url of listed) {
    const path = new URL(url).pathname;
    expect(path, `${url} carries the trailing slash`).toMatch(/\/$/);
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), `${url} answers 200 with no redirect`).toBe(200);
  }
  // the slash-free form is never a second copy of a page: the host sends it to the slash form
  const bare = await request.get('/skills', { maxRedirects: 0 });
  expect([301, 302, 308, 404], '/skills is a redirect or nothing, never a copy').toContain(bare.status());
  const missing = await request.get('/this-page-is-not-in-the-build/');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain('Game over');
  await page.goto('/portfolio/');
  await expect(page.locator('h1')).toHaveText(/Games I've\s*tested/);
  await expect(page.locator('header').getByRole('link', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page');
});

test('the old services and credits addresses send visitors on', { tag: ['@pages', '@links'] }, async ({ request, page }) => {
  const services = await request.get('/services/');
  expect(services.status()).toBe(200);
  expect(await services.text()).toMatch(/http-equiv="refresh"[^>]*url=\/skills\//);
  const credits = await request.get('/credits/');
  expect(credits.status()).toBe(200);
  expect(await credits.text()).toMatch(/http-equiv="refresh"[^>]*url=\/terms\/#credits/);
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  expect(sitemap).not.toContain('/credits/');
  await page.goto('/');
  await expect(page.locator('footer').getByRole('link', { name: 'Credits' })).toHaveCount(0);
  await expect(page.locator('footer').getByRole('link')).toContainText(['Home', 'Skills', 'Portfolio', 'Quality', 'About', 'Contact']);
  expect(await page.locator('footer').getByRole('link', { name: 'Home' }).count(), 'Home once in the footer').toBe(1);
});

test('no controller or headset sprite anywhere, and nothing stands in their place', async ({ page }) => {
  for (const path of ['/', '/skills/', '/portfolio/', '/contact/', '/quality/', '/terms/']) {
    await page.goto(path);
    await expect(page.locator('.sprite--controller, .sprite--headset'), path).toHaveCount(0);
    await expect(page.locator('.plat__photo'), path).toHaveCount(0);
  }
  await expect(page.locator('.sprite--ship')).toHaveCount(1);
});

test('the built site is a portfolio, offers no work, links to no repository and carries no stale facts', { tag: ['@brand'] }, async () => {
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
    'Lead Quality Assurance Tester',
  ];
  let portfolio = '';
  for (const file of html) {
    const text = readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    const hit = text.match(offers);
    expect(hit, `${file}: ${hit?.[0]}`).toBeNull();
    expect(text, `${file} links to a repository`).not.toMatch(/href="https?:\/\/github\.com/);
    if (file.replace(/\\/g, '/').endsWith('/portfolio/index.html')) portfolio = text;
  }
  for (const t of titles) expect(portfolio, t).toContain(t);
});

test('every h1 reads with its words apart in the HTML, as it does on screen (the two-line titles included)', { tag: ['@pages'] }, async ({ page }) => {
  for (const path of ['/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/']) {
    await page.goto(path);
    const h1 = await page.locator('h1').evaluate((el) => ({ text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(), seen: (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() }));
    expect(h1.text, `${path}: the h1 in the HTML`).toBe(h1.seen);
  }
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Nicolás Porras');
});

test('every page has its own title and description, the same in the og and Twitter tags, and no "test experts" suffix', { tag: ['@pages'] }, async ({ page }) => {
  const expected: Record<string, [string, string]> = {
    '/': ['Nicolás Porras, Game QA Tester in London | PlayRun', 'Game QA portfolio of Nicolás Porras in London: testing console, PC and VR games since 2021, from compliance (CQA) to release, including two QA lead roles.'],
    '/skills/': ['Game QA skills and how I test | Nicolás Porras', 'How Nicolás Porras tests games: functional and regression testing, platform compliance on Switch, Xbox and PS5, performance, playtesting and bug reports.'],
    '/portfolio/': ["Games I've tested, QA portfolio | Nicolás Porras", "The 20 games Nicolás Porras has tested since 2021, from Cyberpunk 2077 and NBA 2K21 to VR titles at nDreams and Historic VR, with his part in each."],
    '/quality/': ['How I test: a live QA run on this page | Nicolás Porras', 'A five step QA run you can watch on this page: smoke, responsive, accessibility, links and performance checks, plus a bug report template.'],
    '/contact/': ['Contact | Nicolás Porras, game QA tester', 'Get in touch with Nicolás Porras, a game QA tester in London, about networking, opportunities, a game QA question or just to say hello.'],
    '/privacy/': ['Privacy notice | Nicolás Porras', ''],
    '/terms/': ['Terms of use | Nicolás Porras', ''],
    '/accessibility/': ['Accessibility | Nicolás Porras', ''],
    '/this-page-is-not-in-the-build/': ['Game over | Nicolás Porras', ''],
  };
  for (const [path, [title, description]] of Object.entries(expected)) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
    const meta = await page.evaluate(() => {
      const c = (sel: string) => document.querySelector(sel)?.getAttribute('content') ?? '';
      return { description: c('meta[name="description"]'), ogTitle: c('meta[property="og:title"]'), ogDescription: c('meta[property="og:description"]'), twTitle: c('meta[name="twitter:title"]'), twDescription: c('meta[name="twitter:description"]') };
    });
    if (description) expect(meta.description, path).toBe(description);
    expect(meta.description.length, `${path}: a description`).toBeGreaterThan(40);
    expect(meta.ogTitle).toBe(title);
    expect(meta.twTitle).toBe(title);
    expect(meta.ogDescription).toBe(meta.description);
    expect(meta.twDescription).toBe(meta.description);
    for (const text of [title, meta.description, meta.ogTitle, meta.twTitle]) expect(text, `${path}: no old suffix`).not.toMatch(/test experts/i);
  }
  // the counts in the descriptions come from the data
  await page.goto('/portfolio/');
  const cards = await page.locator('.card').count();
  expect(expected['/portfolio/'][1]).toContain(`The ${cards} games`);
});

test('Skills lists the VR headsets the games were tested on beside the consoles and stores, and Home links from the logo ticker to every game', { tag: ['@pages'] }, async ({ page }) => {
  await page.goto('/skills/');
  await expect(page.locator('#plat-title')).toHaveText('Platforms I test on');
  await expect(page.locator('#plat-title ~ .level__lead')).toHaveText("Flat screen and VR. Every build has to pass its platform's own checks, from console certification to the VR store requirements.");
  await expect(page.locator('.plat__title')).toHaveText(['Nintendo Switch', 'Nintendo Switch 2', 'Xbox', 'PS5', 'Steam', 'Epic Games Store', 'GOG', 'Meta Quest 2, 3 and Pro', 'PC VR', 'PS VR', 'PS VR2']);
  await page.goto('/');
  const more = page.locator('.wall').getByRole('link', { name: "See every game I've tested" });
  await expect(more).toHaveAttribute('href', '/portfolio/');
  // the logos themselves stay pictures, not links
  await expect(page.locator('.ticker a')).toHaveCount(0);
});
