import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The About page: the facts about Nicolás Porras in the first person, for people and for AI, from
 * the site's own data, in six levels: the intro, What I test (the five areas, dealt on a desktop and
 * swiped on phones and tablets), the Kit, My story, Bug Sweep (sweep.spec.ts) and the closed Quick
 * facts and FAQ dropdown, all of it in the HTML. One bug to catch on each level. The old /skills/
 * address leads to What I test.
 */
const projects = () => {
  const dir = path.join(process.cwd(), 'src', 'content', 'projects');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .filter((t) => /^public: true/m.test(t))
    .map((t) => ({ title: t.split('\n').find((l) => l.startsWith('title:'))!.slice(6).trim().replace(/^"|"$/g, ''), vr: /^vr: true/m.test(t) || /^platforms:.*(VR|Quest)/m.test(t) }));
};

test('the About page: one h1, the two-paragraph intro, What I test, the Kit, My story, then Bug Sweep and the closed Quick facts and FAQ dropdown holding a real table of key facts and the questions as h4s, all from the data', { tag: ['@pages'] }, async ({ page }) => {
  await page.goto('/about/');
  await expect(page).toHaveTitle('About Nicolás Porras, game QA tester in London: skills, platforms and story');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Nicolás Porras is a game QA tester in London: the five areas he tests, the platforms, headsets and tools he tests with, his story, and quick facts and answers.');
  await expect(page.locator('h1')).toHaveText('About Nicolás Porras');
  const all = projects();
  const vr = all.filter((p) => p.vr).length;
  // in the first person, like the rest of the site (machines get the third person, see schema and llms.txt)
  await expect(page.locator('.about__summary')).toHaveText([
    "I've tested console, PC and VR games since 2021, at Universally Speaking, nDreams, Historic VR, Nexus Studios and now Aonic. I went from tester to Lead QA at nDreams in a year, then ran QA as QA Manager at Historic VR. My credits include Cyberpunk 2077, NBA 2K21, Ghostbusters: Rise of the Ghost Lord, Synapse and Lou's Lagoon.",
    'PlayRun is the name I work under. I built this site myself and test it like one of my games; you can see how in the QA Lab.',
  ]);
  await expect(page.locator('.about__summary').last().getByRole('link', { name: 'QA Lab', exact: true })).toHaveAttribute('href', '/qa-lab/');
  // every credit named in the summary is a public title
  for (const credit of ['Cyberpunk 2077', 'NBA 2K21', 'Ghostbusters: Rise of the Ghost Lord', 'Synapse', "Lou's Lagoon"]) expect(all.map((p) => p.title)).toContain(credit);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['What I test', 'Platforms, tools and languages', 'My story', 'I love playing and making games', 'Quick facts and FAQ']);
  // My story is a level of its own, in my own words
  await expect(page.locator('.story__text p')).toHaveText([
    'My first QA job had nothing to do with games. My family makes clothes in Colombia, and my summer job for some extra cash (not forced haha) was checking every garment before it was packed and shipped. Being part of that process, and seeing up close what my parents had built, is where it all started.',
    "I've been on the move since school: two years of high school in New Jersey, then four years in China, where I learned Mandarin and worked as a translator and shipping agent, finding products for clients, checking their quality and making sure every shipment to Colombia and South America went through properly.",
    'Then came three years in Australia, studying IT in Melbourne and working as head bartender at Rod Laver Arena and Marvel Stadium for the Australian Open, Formula 1, the Melbourne Cup and big concerts, which meant working the green rooms for artists like Elton John, Pink and Harry Styles. I also had the chance to meet great athletes in all different sports. Back in the UK I became an assistant food and beverage manager for a hotel. Hospitality taught me to keep calm when everything moves fast, and to lead a team through it.',
    "Since arriving in London I've worked in games, which have always been my hobby and my passion. Living in all those places is why I speak five languages and why I'm comfortable working with teams from anywhere. Outside work I play a lot of games, I'm always learning something new, and I love music, especially Latin music. Put some on and I'll be dancing.",
  ]);
  // the order: intro, What I test, the Kit, My story, Bug Sweep, the dropdown
  await expect(page.locator('[data-level] .flag')).toHaveText(['About', 'Level 2 · Skills', 'Level 3 · Kits & tools', 'Level 4 · My story', 'Level 5 · Play', 'Level 6 · Facts and FAQ']);
  const tops = await page.locator('.about__summary, #skills, .kit__board, .story__text, [data-sweep], details.faq').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  // the dropdown starts closed, its whole content in the HTML (search and AI read it), then opens
  const faq = page.locator('details.faq');
  await expect(faq).not.toHaveAttribute('open');
  await expect(page.locator('details.faq table.facts tr')).toHaveCount(13);
  await expect(page.locator('details.faq .qa__item')).toHaveCount(9);
  await expect(page.locator('#facts-title')).toBeHidden();
  await page.getByText('Quick facts and FAQ').click();
  await expect(faq).toHaveAttribute('open', '');
  // a real table: a row header per fact
  const table = page.getByRole('table', { name: 'Key facts about Nicolás Porras' });
  await expect(table.getByRole('rowheader')).toHaveText(['Name', 'Work', 'Based in', 'From', 'Lived in', 'Studios', 'Lead roles', 'Platforms', 'Games tested', 'Tools', 'Languages', 'Education', 'Profiles']);
  const cell = (k: string) => table.getByRole('row', { name: new RegExp(`^${k}`) }).getByRole('cell');
  await expect(cell('From')).toHaveText('Colombia');
  await expect(cell('Lived in')).toHaveText('Colombia, the United States (New Jersey), China (Guangzhou), Australia (Melbourne) and the United Kingdom (London)');
  await expect(cell('Games tested')).toHaveText(`${all.length}, of them ${vr} in VR`);
  await expect(cell('Lead roles')).toHaveText('Lead Quality Assurance Tester, nDreams, Apr 2023 to Oct 2024; QA Manager, Historic VR, Feb 2025 to Feb 2026');
  await expect(cell('Work')).toHaveText('Game QA tester; Senior Quality Assurance Tester at Aonic since Jul 2026');
  await expect(cell('Education')).toContainText('Diploma of Information Technology, Swinburne University of Technology, 2017 to 2019');
  await expect(cell('Profiles').getByRole('link', { name: /LinkedIn/ })).toHaveAttribute('href', /linkedin\.com/);
  // the questions
  await expect(page.locator('details.faq').getByRole('heading', { level: 3 })).toHaveText(['Key facts', 'Questions and answers']);
  await expect(page.getByRole('heading', { level: 4 })).toHaveText([
    'Who are you?',
    "What's your current role?",
    'Which games have you tested?',
    'Do you have VR QA experience?',
    'Have you led QA teams?',
    'Which platforms have you tested on?',
    'Which tools do you use?',
    'Where are you based, and which languages do you speak?',
    'What is PlayRun?',
  ]);
  const answer = (q: string) => page.locator('.qa__item').filter({ has: page.getByRole('heading', { name: q }) }).locator('p');
  await expect(answer('Who are you?')).toHaveText("I'm Nicolás Porras, a game QA tester based in London. I've tested console, PC and VR games since 2021 and have led QA teams at nDreams and Historic VR.");
  await expect(answer("What's your current role?")).toHaveText("I'm a Senior Quality Assurance Tester at Aonic, since July 2026, on titles published by Megabit, from milestone builds to compliance, certification and release.");
  await expect(answer('Which games have you tested?')).toContainText(`${all.length} games: at Universally Speaking, `);
  await expect(answer('Which games have you tested?')).toContainText('The Games page shows my part in each.');
  for (const t of all) await expect(answer('Which games have you tested?')).toContainText(t.title);
  // in the Portfolio's order
  const games = (await answer('Which games have you tested?').textContent())!;
  await page.goto('/portfolio/');
  const order = await page.locator('.card__title').allTextContents();
  const at = order.map((t) => games.indexOf(t.trim()));
  for (const name of ['Universally Speaking', 'nDreams', 'Historic VR', 'Aonic']) {
    const titles = await page.locator('.group').filter({ has: page.locator('.group__name', { hasText: name }) }).locator('.card__title').allTextContents();
    const pos = titles.map((t) => games.indexOf(t.trim()));
    expect(pos, `${name} in the Portfolio's order`).toEqual([...pos].sort((a, b) => a - b));
  }
  expect(at.every((i) => i >= 0)).toBe(true);
  await page.goto('/about/');
  await page.getByText('Quick facts and FAQ').click();
  await expect(answer('Do you have VR QA experience?')).toContainText(`Yes. ${vr} of the ${all.length} games I've tested are VR titles`);
  await expect(answer('Have you led QA teams?')).toHaveText('Yes. At nDreams I grew from QA Tester to Lead Quality Assurance Tester (Apr 2023 to Oct 2024), leading a QA team and managing an external QA vendor. At Historic VR, as QA Manager (Feb 2025 to Feb 2026), I ran test strategy and VR platform compliance, with an outsourced test team that grew to about 10 testers.');
  await expect(answer('Where are you based, and which languages do you speak?')).toHaveText("I'm based in London, UK. I speak Spanish and English fluently, and Chinese, Portuguese and Italian at an intermediate level.");
  await expect(answer('What is PlayRun?')).toHaveText("PlayRun is the name I work under. playrunqa.com is my QA portfolio: the games I've tested, how I test, and a site that runs its own test suite. It does not offer services.");
  // no third person left in the answers
  for (const a of await page.locator('.qa__item p').allTextContents()) expect(a).not.toMatch(/\b(he|his|him)\b/i);
  // nothing that waits to show; six bugs to catch (Skills' five moved here, under their old ids so
  // a catch already made still counts): two on the intro, one on each level up to Bug Sweep, none on
  // the Quick facts and FAQ level
  await expect(page.locator('[data-enter], [data-load]')).toHaveCount(0);
  await expect(page.locator('[data-bug]')).toHaveCount(6);
  const spots: [number, string][] = [[1, 'about-1'], [1, 'skills-5'], [2, 'skills-1'], [3, 'skills-2'], [4, 'skills-3'], [5, 'skills-4']];
  for (const [level, id] of spots) await expect(page.locator(`[data-level="${level}"] > [data-bug="${id}"]`), id).toHaveCount(1);
  await expect(page.locator('[data-level="6"] [data-bug]')).toHaveCount(0);
  await expect(page.locator('[data-level]')).toHaveCount(6);
  await expect(page.locator('#hud')).toHaveCount(1);
  await expect(page.locator('#dock')).toHaveCount(1);
});

test('About is in the desktop nav, the footer and second in the bottom bar of phones and tablets, after Home, and Home links to it from the intro', { tag: ['@links'] }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.header__nav').getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about/');
  // the desktop nav and the bottom bar share one order: Home first on desktop only, Contact last on both
  await expect(page.locator('.header__nav').getByRole('link')).toHaveText(['Home', 'About', 'Games', 'QA Lab', 'Get in touch']);
  await expect(page.locator('footer').getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about/');
  await expect(page.locator('.hero__value').getByRole('link', { name: 'More about me' })).toHaveAttribute('href', '/about/');
  await page.setViewportSize({ width: 375, height: 780 });
  await expect(page.locator('.tabbar').getByRole('link')).toHaveText(['Home', 'About', 'Games', 'QA Lab', 'Contact']);
  await expect(page.locator('.tabbar').getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about/');
  await expect(page.locator('footer').getByRole('link', { name: 'About' })).toBeVisible();
});

// ------------------------------------------------------------------------------------------------
// What I test, the Kit, the old Skills address

const AREAS = [
  ['Functional testing', 'Every path a player can take, with a test plan agreed before the build lands and a regression pass on every build after.', ['Clear test plans, agreed before testing', 'Regression passes on every build', 'Build acceptance before a milestone']],
  ['Platforms and certification', 'The same build on every console, PC store and handheld, checked against its requirements before submission, not after a rejection.', ['Platform requirement checks', 'Platform certification checks (TRC, XR, Lotcheck)', 'One report per platform build']],
  ['Performance and stress', 'Frame rate, memory and load times on low and recommended spec rigs, with Unreal Engine profiling and long sessions.', ['Unreal Engine profiling', 'Low and recommended spec rigs', 'Long session and soak tests']],
  ['Playtesting and UX', 'Where players get lost, bored or stuck: the onboarding, the difficulty, the readability and the first ten minutes.', ['Onboarding notes', 'Difficulty and pacing notes', 'Readability on every screen']],
  ['Bug reporting', "Steps, severity, media and a build number on every bug, in the team's own tracker, and a quality report at each milestone.", ['Jira, Confluence or TestRail', 'Steps, severity, media, build number', 'Milestone quality reports']],
] as const;

const achieved = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('playrun.games') ?? '{}').achievements ?? []) as string[]);

test('What I test: Level 2 at #skills, the lead, five cards each with a pixel icon, its title, one line and three bullets, each labelled n of 5', { tag: ['@pages'] }, async ({ page }) => {
  await page.goto('/about/');
  const level = page.locator('section#skills');
  await expect(level).toHaveAttribute('data-level', '2');
  await expect(level.locator('h2')).toHaveText('What I test');
  await expect(level.locator('.level__lead')).toHaveText('Five areas I cover on every project.');
  const cards = level.locator('.area');
  await expect(cards).toHaveCount(5);
  for (const [i, [title, line, bullets]] of AREAS.entries()) {
    const card = cards.nth(i);
    await expect(card).toHaveAttribute('role', 'group');
    await expect(card).toHaveAttribute('aria-label', `${i + 1} of 5`);
    await expect(card.locator('h3')).toHaveText(title);
    await expect(card.locator('.area__line')).toHaveText(line);
    await expect(card.locator('.area__list li')).toHaveText([...bullets]);
    await expect(card.locator('svg.area__icon path')).toHaveAttribute('d', /^M\d/);
    await expect(card.locator('svg.area__icon')).toHaveAttribute('aria-hidden', 'true');
  }
  await expect(page.getByRole('region', { name: 'The five areas I test' })).toHaveCount(1);
});

test('What I test on a desktop: dealt as a deck with motion, a column of five with motion off', { tag: ['@viewports'] }, async ({ browser }) => {
  for (const motion of ['on', 'off']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript((m) => localStorage.setItem('playrun.motion', m), motion);
    await page.goto('/about/');
    const deck = page.locator('[data-deck]');
    if (motion === 'on') {
      await expect(deck).toHaveClass(/is-deck/);
      expect((await deck.boundingBox())!.height, 'the deck is several screens tall').toBeGreaterThan(900 * 2);
      // pinned, then dealt: half way through, the first cards are down and the last is still below the screen
      const top = await deck.evaluate((el) => el.getBoundingClientRect().top + scrollY);
      await page.evaluate((y) => scrollTo(0, y + (document.querySelector('[data-deck]') as HTMLElement).offsetHeight / 2 - innerHeight / 2), top);
      await expect.poll(() => page.locator('.area').last().evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(900);
      expect(await page.locator('.area').first().evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(900);
      // the swipe's buttons are for phones and tablets only
      await expect(page.locator('.swipe__controls')).toBeHidden();
    } else {
      await expect(deck).not.toHaveClass(/is-deck/);
      const boxes = await page.locator('.area').evaluateAll((els) => els.map((e) => ({ top: e.getBoundingClientRect().top + scrollY, pos: getComputedStyle(e).position, w: e.getBoundingClientRect().width })));
      for (const b of boxes) expect(b.pos).toBe('static');
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].top);
      await expect(page.locator('.swipe__controls')).toBeHidden();
    }
    await context.close();
  }
});

for (const [width, height] of [[300, 640], [375, 812], [768, 1024]] as const) {
  test(`What I test at ${width}px is a swipe: one card at a time with the next peeking in, n of 5, Previous and Next and the arrow keys, no auto-advance`, { tag: ['@viewports', '@a11y'] }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/about/');
    const region = page.getByRole('region', { name: 'The five areas I test' });
    await expect(region).toHaveAttribute('aria-roledescription', 'carousel');
    const track = region.locator('.swipe__track');
    await track.scrollIntoViewIfNeeded();
    const pos = region.locator('[data-swipe-pos]');
    const prev = region.getByRole('button', { name: 'Previous card' });
    const next = region.getByRole('button', { name: 'Next card' });
    await expect(pos).toHaveText('1 of 5');
    await expect(pos).toHaveAttribute('aria-live', 'polite');
    await expect(prev).toHaveAttribute('aria-disabled', 'true');
    // the first card fills the column, the next one peeks in from the edge
    const boxes = await page.locator('.area').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    expect(boxes[0].left).toBeGreaterThanOrEqual(0);
    expect(boxes[0].right).toBeLessThan(width);
    expect(boxes[1].left, 'the next card peeks in').toBeLessThan(width);
    expect(width - boxes[1].left, 'only a peek').toBeLessThan(80);
    // no auto-advance
    await page.waitForTimeout(1500);
    await expect(pos).toHaveText('1 of 5');
    for (let k = 2; k <= 5; k++) {
      await next.click();
      await expect(pos).toHaveText(`${k} of 5`);
    }
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await expect(next).toBeFocused();
    // (the count turns as the row passes half way; the smooth scroll then settles on the last card)
    const lastBox = () => page.locator('.area').last().evaluate((e) => e.getBoundingClientRect().toJSON());
    await expect.poll(async () => (await lastBox()).right).toBeLessThanOrEqual(width);
    expect((await lastBox()).left).toBeGreaterThanOrEqual(0);
    await prev.click();
    await expect(pos).toHaveText('4 of 5');
    // the row takes the keyboard's focus with a visible ring (Shift+Tab from Previous), and the arrows move it
    await page.keyboard.press('Shift+Tab');
    await expect(track).toBeFocused();
    expect(await track.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    await page.keyboard.press('ArrowLeft');
    await expect(pos).toHaveText('3 of 5');
    await page.keyboard.press('ArrowRight');
    await expect(pos).toHaveText('4 of 5');
    // a finger swipe moves it too (the dots follow)
    await track.evaluate((el) => el.scrollTo({ left: 0, behavior: 'instant' }));
    await expect(pos).toHaveText('1 of 5');
    await expect(region.locator('.swipe__dot.is-on')).toHaveCount(1);
    await expect(region.locator('.swipe__dot').first()).toHaveClass(/is-on/);
    // nothing sideways on the page
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test('with motion off the swipe still works, and the buttons move it at once, with no smooth scroll', { tag: ['@viewports'] }, async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem('playrun.motion', 'off'));
  await page.goto('/about/');
  const track = page.locator('.swipe__track');
  expect(await track.evaluate((el) => [getComputedStyle(el).scrollBehavior, getComputedStyle(el).scrollSnapType])).toEqual(['auto', 'x mandatory']);
  await track.scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Next card' }).click();
  // at once: the very next frame already shows the second card at the start
  const left = await track.evaluate((el) => new Promise<number>((r) => requestAnimationFrame(() => r(el.scrollLeft))));
  const step = await page.locator('.area').evaluateAll((els) => (els[1] as HTMLElement).offsetLeft - (els[0] as HTMLElement).offsetLeft);
  expect(Math.abs(left - step)).toBeLessThanOrEqual(2);
  await expect(page.locator('[data-swipe-pos]')).toHaveText('2 of 5');
});

test('without script the five cards still show: a column on a desktop, a scrolling row on a phone, no buttons', async ({ browser }) => {
  for (const [w, h] of [[1440, 900], [375, 812]] as const) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: w, height: h } });
    const page = await context.newPage();
    await page.goto('/about/');
    await expect(page.locator('.area')).toHaveCount(5);
    await expect(page.locator('.swipe__controls')).toBeHidden();
    const overflow = await page.locator('.swipe__track').evaluate((el) => getComputedStyle(el).overflowX);
    expect(overflow).toBe(w < 1024 ? 'auto' : 'visible');
    await context.close();
  }
});

test('Read every skill is earned once all five cards have been seen: dealt on a desktop, swiped to on a phone, or in the column', async ({ browser }) => {
  const ways = [
    { name: 'dealt', viewport: { width: 1440, height: 900 }, motion: 'on' },
    { name: 'column', viewport: { width: 1440, height: 900 }, motion: 'off' },
    { name: 'swiped', viewport: { width: 375, height: 812 }, motion: 'on' },
  ];
  for (const way of ways) {
    const context = await browser.newContext({ viewport: way.viewport });
    const page = await context.newPage();
    await page.addInitScript((m) => localStorage.getItem('playrun.motion') || localStorage.setItem('playrun.motion', m), way.motion);
    await page.goto('/about/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    if (way.name === 'swiped') {
      await page.locator('.swipe__track').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      for (let k = 1; k < 5; k++) {
        expect(await achieved(page), `${way.name}: not before card ${k + 1}`).not.toContain('skills');
        await page.getByRole('button', { name: 'Next card' }).click();
        await expect(page.locator('[data-swipe-pos]')).toHaveText(`${k + 1} of 5`);
        await page.waitForTimeout(250);
      }
    } else {
      // down through the level in small steps, as a reader would
      const [from, to] = await page.locator('#skills').evaluate((el) => [el.getBoundingClientRect().top + scrollY, el.getBoundingClientRect().bottom + scrollY]);
      // (never before the last card is mostly on screen)
      const shown = () => page.locator('.area').last().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height;
      });
      let seen = false;
      for (let y = from; y < to; y += 150) {
        await page.evaluate((yy) => scrollTo(0, yy), y);
        await page.waitForTimeout(60);
        const f = await shown();
        if (!seen && f < 0.5) expect(await achieved(page), `${way.name}: not before the last card`).not.toContain('skills');
        if (f >= 0.6) seen = true;
      }
    }
    await expect.poll(() => achieved(page), way.name).toContain('skills');
    await context.close();
  }
});

const KIT = [
  ['Consoles and handhelds', ['Nintendo Switch', 'Nintendo Switch 2', 'Xbox', 'PS5', 'Handhelds']],
  ['PC stores', ['Steam', 'Epic Games Store', 'GOG']],
  ['VR', ['Meta Quest 2, 3 and Pro', 'PC VR', 'PS VR', 'PS VR2']],
  ['Tools', ['Jira and Confluence', 'TestRail', 'Unreal Engine: debugging, profiling, Blueprint', 'Agile and Scrum']],
  ['Languages', ['Spanish, fluent', 'English, fluent', 'Chinese, intermediate', 'Portuguese, intermediate', 'Italian, intermediate']],
  ['Education', ['Diploma of Information Technology, Swinburne University of Technology, 2017 to 2019', 'Mandarin, South China Normal University, Guangzhou, 2015 to 2017']],
] as const;

test('the Kit: six labelled groups of chips from the data; a platform or headset chip opens a bubble under it with its detail, one at a time, closing four ways', { tag: ['@pages', '@a11y'] }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/about/');
  const kit = page.locator('section.kit');
  await expect(kit.locator('h2')).toHaveText('Platforms, tools and languages');
  await expect(kit.locator('.level__lead')).toHaveText('What I test on, and what I test with.');
  await expect(kit.locator('.kit__title')).toHaveText(KIT.map(([t]) => t));
  for (const [title, chips] of KIT) {
    const group = kit.locator('.kit__group').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).first();
    await expect(group.locator('.chip'), title).toHaveText([...chips]);
  }
  // which chips open a detail: the platforms and the headsets, nothing else
  const buttons = kit.locator('button[data-chip]');
  await expect(buttons).toHaveCount(5 + 3 + 4);
  const handhelds = kit.getByRole('button', { name: 'Handhelds', exact: true });
  const detail = 'Steam Deck and Windows handhelds: Deck Verified checks, controller-only play, text size on a small screen, sleep and resume.';
  const tip = page.locator(`#${await handhelds.getAttribute('aria-controls')}`);
  await expect(handhelds).toHaveAttribute('aria-expanded', 'false');
  await expect(tip).toBeHidden();
  // hover alone opens nothing
  await handhelds.hover();
  await expect(tip).toBeHidden();
  await page.mouse.move(5, 5);
  // a press: the bubble with the line, the chip pressed, the line read out, the focus on the chip
  await handhelds.click();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(detail);
  await expect(handhelds).toHaveAttribute('aria-expanded', 'true');
  await expect(handhelds).toHaveCSS('background-color', 'rgb(229, 231, 234)');
  await expect(page.locator('[data-kit-live]')).toHaveText(`Handhelds: ${detail}`);
  await expect(handhelds).toBeFocused();
  // 1. the chip again
  await handhelds.click();
  await expect(tip).toBeHidden();
  await expect(handhelds).toHaveAttribute('aria-expanded', 'false');
  // 2. the bubble's Close, the focus back on the chip
  await handhelds.click();
  await tip.getByRole('button', { name: 'Close' }).click();
  await expect(tip).toBeHidden();
  await expect(handhelds).toBeFocused();
  // 3. Escape, from the keyboard: Enter opens it, Escape closes it, the focus stays
  await page.keyboard.press('Enter');
  await expect(tip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await expect(handhelds).toBeFocused();
  // one at a time
  await handhelds.click();
  await kit.getByRole('button', { name: 'GOG' }).click();
  await expect(tip).toBeHidden();
  await expect(kit.locator('.chip__tip:visible')).toHaveCount(1);
  await expect(kit.locator('.chip__tip:visible')).toContainText('DRM-free build, Galaxy features, offline play.');
  await expect(kit.locator('button[data-chip][aria-expanded="true"]')).toHaveCount(1);
  // 4. a click elsewhere
  await page.mouse.click(700, 60);
  await expect(kit.locator('.chip__tip:visible')).toHaveCount(0);
  // axe with one open
  await handhelds.click();
  const axe = await new AxeBuilder({ page }).include('section.kit').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  // tools, languages and education are plain items, not buttons
  for (const name of ['TestRail', 'Spanish, fluent']) await expect(kit.getByRole('button', { name })).toHaveCount(0);
});

// Open, a bubble moves nothing: every chip and what follows the Kit stay where they were; the bubble
// is wholly on screen, shifted sideways near an edge, its arrow on the chip's middle.
for (const width of [300, 375, 768, 1440]) {
  test(`at ${width}px a Kit bubble moves no chip, stays on screen and points at its chip`, { tag: ['@viewports', '@a11y'] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/about/');
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const kit = page.locator('section.kit');
    const layout = () =>
      kit.evaluate((el) => ({
        chips: [...el.querySelectorAll('.chip')].map((c) => {
          const r = c.getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.top + scrollY)];
        }),
        next: Math.round(el.nextElementSibling!.getBoundingClientRect().top + scrollY),
      }));
    for (const chip of await kit.locator('button[data-chip]').all()) {
      await chip.scrollIntoViewIfNeeded();
      const before = await layout();
      await chip.click();
      const tip = page.locator(`#${await chip.getAttribute('aria-controls')}`);
      await expect(tip).toBeVisible();
      expect(await layout(), 'nothing moves').toEqual(before);
      const m = await page.evaluate(
        ([c, t]) => {
          const chipBox = document.querySelector(`[aria-controls="${c}"]`)!.getBoundingClientRect();
          const tipEl = document.getElementById(t)!;
          const tipBox = tipEl.getBoundingClientRect();
          const x = parseFloat(getComputedStyle(tipEl).getPropertyValue('--x'));
          return { left: tipBox.left, right: tipBox.right, top: tipBox.top, chipBottom: chipBox.bottom, chipMid: chipBox.left + chipBox.width / 2, arrow: tipBox.left + x, vw: document.documentElement.clientWidth };
        },
        [(await chip.getAttribute('aria-controls'))!, (await chip.getAttribute('aria-controls'))!] as const,
      );
      expect(m.left, 'inside the screen').toBeGreaterThanOrEqual(0);
      expect(m.right).toBeLessThanOrEqual(m.vw);
      expect(m.top, 'under its chip').toBeGreaterThan(m.chipBottom);
      expect(Math.abs(m.arrow - m.chipMid), 'the arrow on the chip').toBeLessThanOrEqual(2);
      await chip.click();
      await expect(tip).toBeHidden();
    }
    // axe with one open
    await kit.locator('button[data-chip]').last().click();
    // (the bug's CLICK ME hint fades out after 5 s, part way through this long test: left out)
    const axe = await new AxeBuilder({ page }).include('section.kit').exclude('.bug__anchor').analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary?.slice(0, 160)}`).join(' | ')}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test('without script the platform and headset details are plain lines under each group', { tag: ['@a11y'] }, async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto('/about/');
  const tips = page.locator('section.kit .chip__tip');
  await expect(tips).toHaveCount(12);
  for (const t of await tips.all()) {
    await expect(t).toBeVisible();
    expect(await t.evaluate((el) => getComputedStyle(el).position)).toBe('static');
  }
  await expect(page.locator('section.kit .chip__close').first()).toBeHidden();
  await context.close();
});

test('on a touch screen a tap opens a chip bubble and a second tap closes it', { tag: ['@viewports'] }, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/about/');
  const chip = page.getByRole('button', { name: 'PS VR2' });
  await chip.scrollIntoViewIfNeeded();
  await chip.tap();
  const tip = page.locator('.chip__tip:visible');
  await expect(tip).toContainText("PS VR2 on PS5, the Sense controllers and the console's own checks.");
  const box = (await tip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await chip.tap();
  await expect(tip).toHaveCount(0);
  await context.close();
});

for (const width of [300, 320, 375, 768]) {
  test(`at ${width}px the Kit wraps cleanly: every chip inside the column, nothing cut or sideways`, { tag: ['@viewports'] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/about/');
    const column = await page.locator('section.kit').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { left: el.getBoundingClientRect().left + parseFloat(cs.paddingLeft), right: el.getBoundingClientRect().right - parseFloat(cs.paddingRight) };
    });
    for (const b of await page.locator('.kit .chip').evaluateAll((els) => els.map((e) => ({ r: e.getBoundingClientRect().toJSON(), cut: e.scrollWidth > e.clientWidth + 1 })))) {
      expect(b.r.left).toBeGreaterThanOrEqual(column.left - 1);
      expect(b.r.right).toBeLessThanOrEqual(column.right + 1);
      expect(b.cut).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

for (const [width, height] of [[375, 812], [1024, 768], [1440, 900]] as const) test(`at ${width}px the bug from Quick facts and FAQ walks on the intro, in the strip at its foot, and can be caught`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await page.goto('/about/');
  await expect(page.locator('details.faq')).not.toHaveAttribute('open');
  const bug = page.locator('[data-bug="skills-5"]');
  // under the intro's last line and above the clouds
  const [last, join, box] = await page.evaluate(() => [
    document.querySelector('.about__summary:last-of-type')!.getBoundingClientRect().bottom,
    document.querySelector('[data-level="1"] > .join')!.getBoundingClientRect().top,
    document.querySelector('[data-bug="skills-5"]')!.getBoundingClientRect().toJSON(),
  ]);
  expect(box.top).toBeGreaterThan(last);
  expect(box.bottom).toBeLessThanOrEqual(join + 1);
  await bug.evaluate((b) => {
    b.getAnimations().forEach((a) => a.pause());
    b.scrollIntoView({ block: 'center' });
  });
  await expect(bug).toBeVisible();
  await bug.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('playrun.games') ?? '{}').bugs ?? [])).toContain('skills-5');
  await expect(page.locator('details.faq')).not.toHaveAttribute('open');
});

test('the old Skills address is a small page that sends visitors to What I test: script and meta refresh, a canonical to About, never indexed, out of the sitemap', { tag: ['@pages', '@links'] }, async ({ request }) => {
  const res = await request.get('/skills/');
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toMatch(/<meta http-equiv="refresh" content="0;url=\/about\/#skills">/);
  expect(html).toContain('<link rel="canonical" href="https://playrunqa.com/about/">');
  expect(html).toContain('<meta name="robots" content="noindex">');
  expect(html).toMatch(/<script[^>]*>location\.replace\(`\/about\/#skills`\);?<\/script>/);
  expect(html).toContain('This page is now part of About.');
  expect(html).toMatch(/<a href="\/about\/#skills"[^>]*>Go to What I test<\/a>/);
  const sitemap = await (await request.get('/sitemap-0.xml')).text();
  expect(sitemap).not.toContain('/skills/');
});

for (const [width, height] of [[375, 812], [390, 844], [1440, 900]] as const) {
  test(`at ${width}x${height} /skills/ lands on the What I test heading, not the top of About`, { tag: ['@links'] }, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/skills/');
    await page.waitForURL('**/about/#skills');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('load');
    await page.waitForTimeout(500);
    const head = await page.locator('#skills-title').evaluate((el) => el.getBoundingClientRect().toJSON());
    expect(await page.evaluate(() => scrollY), 'scrolled down from the top of About').toBeGreaterThan(200);
    // the heading on screen near the top, clear of the header
    const header = await page.locator('header').evaluate((el) => (getComputedStyle(el).position === 'fixed' || getComputedStyle(el).position === 'sticky' ? el.getBoundingClientRect().bottom : 0));
    expect(head.top, 'the heading under the header').toBeGreaterThanOrEqual(header);
    expect(head.bottom, 'the heading in the top half of the screen').toBeLessThan(height / 2);
  });
}

test('no link on the site goes to the old Skills page', { tag: ['@links'] }, async ({ page }) => {
  for (const path of ['/', '/about/', '/portfolio/', '/qa-lab/', '/contact/']) {
    await page.goto(path);
    expect(await page.locator('a[href^="/skills"]').count(), path).toBe(0);
  }
});
