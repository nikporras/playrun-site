/**
 * The facts about Nicolás Porras, in the third person, built from the site's own data (the posts
 * in `employers`, the public projects, the platforms, tools, languages and education in config):
 * the About page shows them, the structured data and llms.txt reuse them. Nothing here is typed in
 * twice; the counts, studios, titles and dates all come from the data.
 */
import { getCollection } from 'astro:content';
import { contact, education, employers, languages, languagesByLevel, leadRoles, listed, platforms, postsOldestFirst, since, site, social, studios, summary, tools, vrPlatforms } from '../config';

const MONTHS: Record<string, string> = { Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December' };
const longMonth = (when: string) => when.replace(/\b([A-Z][a-z]{2})\b/g, (m) => MONTHS[m] ?? m);

export async function about() {
  // the public titles in the Portfolio's order: released newest first, those in development last
  const projects = (await getCollection('projects'))
    .filter((p) => p.data.public)
    .sort((a, b) => (a.data.status === 'in-development' ? 1 : 0) - (b.data.status === 'in-development' ? 1 : 0) || (b.data.year ?? 0) - (a.data.year ?? 0));
  const isVR = (p: (typeof projects)[number]) => p.data.vr || p.data.platforms.some((n) => /VR|Quest/i.test(n));
  const vrCount = projects.filter(isVR).length;
  const vrNames = vrPlatforms.filter((v) => projects.some((p) => p.data.platforms.some((n) => v.match.test(n)))).map((v) => v.name);
  const flatNames = platforms.map(([name]) => name);
  // the current post: the newest role still running
  const now = employers.find((e) => e.roles.some((r) => /present/.test(r.when)))!;
  const nowRole = now.roles.find((r) => /present/.test(r.when))!;
  const nowSince = nowRole.when.split(' to ')[0];
  // the games by studio, from the first post to the latest, each studio once
  const byStudio = studios
    .map((name) => ({ name, titles: postsOldestFirst.filter((e) => e.name === name).flatMap((e) => projects.filter((p) => p.data.employer === e.id).map((p) => p.data.title)) }))
    .filter((s) => s.titles.length);
  const ndreams = employers.find((e) => e.id === 'ndreams')!;
  const historic = employers.find((e) => e.id === 'historic-vr')!;
  const lead = (e: typeof ndreams) => e.roles.find((r) => r.lead)!;
  const toolList = tools.map((t) => t.replace(/: (.*)$/, ' ($1)'));
  const linkedin = social.find((s) => s.label === 'LinkedIn');

  const facts: [string, string][] = [
    ['Name', contact.name],
    ['Work', `Game QA tester; ${nowRole.title} at ${now.name} since ${nowSince}`],
    ['Based in', contact.location],
    ['Studios', listed(studios)],
    ['Lead roles', leadRoles.map((r) => `${r.title}, ${r.at}, ${r.when}`).join('; ')],
    ['Platforms', `${flatNames.join(', ')}; VR: ${vrNames.join(', ')}`],
    ['Games tested', `${projects.length}, of them ${vrCount} in VR`],
    ['Tools', toolList.join(', ')],
    ['Languages', languagesByLevel().join('; ')],
    ['Education', education.map((e) => `${e.course}, ${e.school}, ${e.when}`).join('; ')],
  ];

  const qa: { q: string; a: string }[] = [
    { q: `Who is ${contact.name}?`, a: `${contact.name} is a game QA tester based in London. He has tested console, PC and VR games since ${since} and has led QA teams at ${listed([...new Set(leadRoles.map((r) => r.at))])}.` },
    { q: 'What is his current role?', a: `He is a ${nowRole.title} at ${now.name}, since ${longMonth(nowSince)}, on ${now.focus}.` },
    {
      q: 'Which games has he tested?',
      a: `${projects.length} games: ${byStudio.map((s) => `at ${s.name}, ${listed(s.titles)}`).join('; ')}. The Portfolio shows his part in each.`,
    },
    {
      q: 'Does he have VR QA experience?',
      a: `Yes. ${vrCount} of the ${projects.length} games he has tested are VR titles, on ${listed(vrNames)}. As ${lead(historic).title} at ${historic.name} he ran QA across the studio's VR projects, and at Nexus Studios he tested an Apple Vision Pro experience.`,
    },
    {
      q: 'Has he led QA teams?',
      a: `Yes. At ${ndreams.name} he grew from ${ndreams.roles[0].title} to ${lead(ndreams).title} (${lead(ndreams).when}), leading a QA team and managing an external QA vendor. At ${historic.name}, as ${lead(historic).title} (${lead(historic).when}), he ran test strategy and VR platform compliance, with an outsourced test team that grew to about 10 testers.`,
    },
    { q: 'Which platforms has he tested on?', a: `${listed(flatNames)}; in VR, ${listed(vrNames)}.` },
    { q: 'Which tools does he use?', a: 'Jira and Confluence, TestRail, and Unreal Engine for debugging, profiling and Blueprint, in Agile and Scrum teams.' },
    {
      q: 'Where is he based, and which languages does he speak?',
      a: `He is based in ${contact.location}. He speaks ${listed(languages.filter((l) => l.level === 'fluent').map((l) => l.name))} fluently, and ${listed(languages.filter((l) => l.level === 'intermediate').map((l) => l.name))} at an intermediate level.`,
    },
    { q: `What is ${site.name}?`, a: `${site.name}, at playrunqa.com, is his personal QA portfolio: the games he has tested, how he tests, and a site that runs its own test suite. It does not offer services.` },
  ];

  return { summary, facts, qa, linkedin, games: projects.length, vrCount, vrNames, flatNames };
}
