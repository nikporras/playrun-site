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
  await expect(page.locator('.about__summary')).toHaveText(
    "Nicolás Porras is a game QA tester based in London. He has tested console, PC and VR games since 2021, at Universally Speaking, nDreams, Historic VR, Nexus Studios and Aonic, and has led QA as Lead Quality Assurance Tester at nDreams and QA Manager at Historic VR. His credits include Cyberpunk 2077, NBA 2K21, Ghostbusters: Rise of the Ghost Lord, Synapse and Lou's Lagoon. PlayRun, at playrunqa.com, is his personal QA portfolio.",
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
    'Who is Nicolás Porras?',
    'What is his current role?',
    'Which games has he tested?',
    'Does he have VR QA experience?',
    'Has he led QA teams?',
    'Which platforms has he tested on?',
    'Which tools does he use?',
    'Where is he based, and which languages does he speak?',
    'What is PlayRun?',
  ]);
  const answer = (q: string) => page.locator('.qa__item').filter({ has: page.getByRole('heading', { name: q }) }).locator('p');
  await expect(answer('What is his current role?')).toHaveText('He is a Senior Quality Assurance Tester at Aonic, since July 2026, on indie titles published by Megabit, from milestone builds to compliance, certification and release.');
  await expect(answer('Which games has he tested?')).toContainText(`${all.length} games: at Universally Speaking, `);
  for (const t of all) await expect(answer('Which games has he tested?')).toContainText(t.title);
  // in the Portfolio's order
  const games = (await answer('Which games has he tested?').textContent())!;
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
  await expect(answer('Does he have VR QA experience?')).toContainText(`Yes. ${vr} of the ${all.length} games he has tested are VR titles`);
  await expect(answer('Has he led QA teams?')).toHaveText('Yes. At nDreams he grew from QA Tester to Lead Quality Assurance Tester (Apr 2023 to Oct 2024), leading a QA team and managing an external QA vendor. At Historic VR, as QA Manager (Feb 2025 to Feb 2026), he ran test strategy and VR platform compliance, with an outsourced test team that grew to about 10 testers.');
  await expect(answer('What is PlayRun?')).toHaveText('PlayRun, at playrunqa.com, is his personal QA portfolio: the games he has tested, how he tests, and a site that runs its own test suite. It does not offer services.');
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
