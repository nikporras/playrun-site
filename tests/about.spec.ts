import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The About page: the facts about Nicolás Porras in the third person, for people and for AI, from
 * the site's own data. A page for reading: no games, no bugs, nothing hidden at first.
 */
const projects = () => {
  const dir = path.join(process.cwd(), 'src', 'content', 'projects');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    .filter((t) => /^public: true/m.test(t))
    .map((t) => ({ title: t.split('\n').find((l) => l.startsWith('title:'))!.slice(6).trim().replace(/^"|"$/g, ''), vr: /^vr: true/m.test(t) || /^platforms:.*(VR|Quest)/m.test(t) }));
};

test('the About page: one h1, the summary, a real table of key facts and the questions as h3s, all from the data', { tag: ['@pages'] }, async ({ page }) => {
  await page.goto('/about/');
  await expect(page).toHaveTitle('About Nicolás Porras, game QA tester in London');
  await expect(page.locator('h1')).toHaveText('About Nicolás Porras');
  const all = projects();
  const vr = all.filter((p) => p.vr).length;
  // in the first person, like the rest of the site (machines get the third person, see schema and llms.txt)
  await expect(page.locator('.about__summary')).toHaveText(
    "I'm a game QA tester based in London. I've tested console, PC and VR games since 2021, at Universally Speaking, nDreams, Historic VR, Nexus Studios and Aonic, and I've led QA as Lead Quality Assurance Tester at nDreams and QA Manager at Historic VR. My credits include Cyberpunk 2077, NBA 2K21, Ghostbusters: Rise of the Ghost Lord, Synapse and Lou's Lagoon. PlayRun, at playrunqa.com, is my personal QA portfolio.",
  );
  // every credit named in the summary is a public title
  for (const credit of ['Cyberpunk 2077', 'NBA 2K21', 'Ghostbusters: Rise of the Ghost Lord', 'Synapse', "Lou's Lagoon"]) expect(all.map((p) => p.title)).toContain(credit);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Key facts', 'Questions and answers']);
  // a real table: a row header per fact
  const table = page.getByRole('table', { name: 'Key facts about Nicolás Porras' });
  await expect(table.getByRole('rowheader')).toHaveText(['Name', 'Work', 'Based in', 'Studios', 'Lead roles', 'Platforms', 'Games tested', 'Tools', 'Languages', 'Education', 'Profiles']);
  const cell = (k: string) => table.getByRole('row', { name: new RegExp(`^${k}`) }).getByRole('cell');
  await expect(cell('Games tested')).toHaveText(`${all.length}, of them ${vr} in VR`);
  await expect(cell('Lead roles')).toHaveText('Lead Quality Assurance Tester, nDreams, Apr 2023 to Oct 2024; QA Manager, Historic VR, Feb 2025 to Feb 2026');
  await expect(cell('Work')).toHaveText('Game QA tester; Senior Quality Assurance Tester at Aonic since Jul 2026');
  await expect(cell('Education')).toContainText('Diploma of Information Technology, Swinburne University of Technology, 2017 to 2019');
  await expect(cell('Profiles').getByRole('link', { name: /LinkedIn/ })).toHaveAttribute('href', /linkedin\.com/);
  // the questions
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
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
  await expect(answer("What's your current role?")).toHaveText("I'm a Senior Quality Assurance Tester at Aonic, since July 2026, on indie titles published by Megabit, from milestone builds to compliance, certification and release.");
  await expect(answer('Which games have you tested?')).toContainText(`${all.length} games: at Universally Speaking, `);
  await expect(answer('Which games have you tested?')).toContainText('The Portfolio shows my part in each.');
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
  await expect(answer('Do you have VR QA experience?')).toContainText(`Yes. ${vr} of the ${all.length} games I've tested are VR titles`);
  await expect(answer('Have you led QA teams?')).toHaveText('Yes. At nDreams I grew from QA Tester to Lead Quality Assurance Tester (Apr 2023 to Oct 2024), leading a QA team and managing an external QA vendor. At Historic VR, as QA Manager (Feb 2025 to Feb 2026), I ran test strategy and VR platform compliance, with an outsourced test team that grew to about 10 testers.');
  await expect(answer('Where are you based, and which languages do you speak?')).toHaveText("I'm based in London, UK. I speak Spanish and English fluently, and Chinese, Portuguese and Italian at an intermediate level.");
  await expect(answer('What is PlayRun?')).toHaveText("PlayRun, at playrunqa.com, is my personal QA portfolio: the games I've tested, how I test, and a site that runs its own test suite. It does not offer services.");
  // no third person left in the answers
  for (const a of await page.locator('.qa__item p').allTextContents()) expect(a).not.toMatch(/\b(he|his|him)\b/i);
  // a page for reading: no games, no bugs, nothing that waits to show
  await expect(page.locator('.bug, #hud, #dock, [data-enter], [data-load]')).toHaveCount(0);
});

test('About is in the desktop nav and the footer, the phone bar keeps its five, and Home links to it from the intro', { tag: ['@links'] }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.header__nav').getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about/');
  await expect(page.locator('footer').getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about/');
  await expect(page.locator('.hero__value').getByRole('link', { name: 'More about me' })).toHaveAttribute('href', '/about/');
  await page.setViewportSize({ width: 375, height: 780 });
  await expect(page.locator('.tabbar').getByRole('link')).toHaveText(['Home', 'Skills', 'Portfolio', 'Quality', 'Contact']);
  await expect(page.locator('footer').getByRole('link', { name: 'About' })).toBeVisible();
});
