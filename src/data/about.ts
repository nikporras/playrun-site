/**
 * The facts about Nicolás Porras, built from the site's own data (the posts
 * in `employers`, the public projects, the platforms, tools, languages and education in config):
 * the About page shows them, the structured data and llms.txt reuse them. Nothing here is typed in
 * twice; the counts, studios, titles and dates all come from the data.
 */
import { getCollection } from 'astro:content';
import { contact, education, employers, languages, languagesByLevel, leadRoles, listed, platforms, postsOldestFirst, since, site, social, studios, summary, summaryFirstPerson, tools, vrPlatforms } from '../config';

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
    ['From', 'Colombia'],
    ['Lived in', 'Colombia, the United States (New Jersey), China (Guangzhou), Australia (Melbourne) and the United Kingdom (London)'],
    ['Studios', listed(studios)],
    ['Lead roles', leadRoles.map((r) => `${r.title}, ${r.at}, ${r.when}`).join('; ')],
    ['Platforms', `${flatNames.join(', ')}; VR: ${vrNames.join(', ')}`],
    ['Games tested', `${projects.length}, of them ${vrCount} in VR`],
    ['Tools', toolList.join(', ')],
    ['Languages', languagesByLevel().join('; ')],
    ['Education', education.map((e) => `${e.course}, ${e.school}, ${e.when}`).join('; ')],
  ];

  // the questions put to me, answered in the first person like the rest of the site
  const qa: { q: string; a: string }[] = [
    { q: 'Who are you?', a: `I'm ${contact.name}, a game QA tester based in London. I've tested console, PC and VR games since ${since} and have led QA teams at ${listed([...new Set(leadRoles.map((r) => r.at))])}.` },
    { q: "What's your current role?", a: `I'm a ${nowRole.title} at ${now.name}, since ${longMonth(nowSince)}, on ${now.focus}.` },
    {
      q: 'Which games have you tested?',
      a: `${projects.length} games: ${byStudio.map((s) => `at ${s.name}, ${listed(s.titles)}`).join('; ')}. The Portfolio shows my part in each.`,
    },
    {
      q: 'Do you have VR QA experience?',
      a: `Yes. ${vrCount} of the ${projects.length} games I've tested are VR titles, on ${listed(vrNames)}. As ${lead(historic).title} at ${historic.name} I ran QA across the studio's VR projects, and at Nexus Studios I tested an Apple Vision Pro experience.`,
    },
    {
      q: 'Have you led QA teams?',
      a: `Yes. At ${ndreams.name} I grew from ${ndreams.roles[0].title} to ${lead(ndreams).title} (${lead(ndreams).when}), leading a QA team and managing an external QA vendor. At ${historic.name}, as ${lead(historic).title} (${lead(historic).when}), I ran test strategy and VR platform compliance, with an outsourced test team that grew to about 10 testers.`,
    },
    { q: 'Which platforms have you tested on?', a: `${listed(flatNames)}; in VR, ${listed(vrNames)}.` },
    { q: 'Which tools do you use?', a: 'Jira and Confluence, TestRail, and Unreal Engine for debugging, profiling and Blueprint, in Agile and Scrum teams.' },
    {
      q: 'Where are you based, and which languages do you speak?',
      a: `I'm based in ${contact.location}. I speak ${listed(languages.filter((l) => l.level === 'fluent').map((l) => l.name))} fluently, and ${listed(languages.filter((l) => l.level === 'intermediate').map((l) => l.name))} at an intermediate level.`,
    },
    { q: `What is ${site.name}?`, a: `${site.name}, at playrunqa.com, is my personal QA portfolio: the games I've tested, how I test, and a site that runs its own test suite. It does not offer services.` },
  ];

  // a bit more about me, in my own words (approved wording)
  const personal = [
    "I'm from Colombia, and I've been on the move since school. I spent two years of high school in New Jersey, then four years in China, where I learned Mandarin and worked as a translator and shipping agent: finding products for clients, checking their quality, and making sure every shipment to Colombia and South America went through properly. That's where I first did QA, long before games.",
    "Then came three years in Australia, studying IT in Melbourne and working in hospitality, as head bartender at Rod Laver Arena and Marvel Stadium during events like the Australian Open, Formula 1 and the Melbourne Cup. Back in the UK I became an assistant food and beverage manager, and hospitality has stayed with me on and off ever since, leading teams at large events. Now I'm in London.",
    "Living in all those places is why I speak five languages and why I'm comfortable working with teams from anywhere. Outside work I play a lot of games, I'm always learning something new, and I love music, especially Latin music. Put some on and I'll be dancing.",
  ];

  return { summary, summaryFirstPerson, personal, facts, qa, linkedin, games: projects.length, vrCount, vrNames, flatNames };
}
