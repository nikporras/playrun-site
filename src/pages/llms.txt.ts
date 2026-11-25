/**
 * /llms.txt, built with the site: who the site is about, in the shared summary, where to read
 * more, and his profile. Every number comes from the data. Not in the sitemap.
 */
import type { APIRoute } from 'astro';
import { contact, since, site, social } from '../config';
import { about } from '../data/about';

export const GET: APIRoute = async () => {
  const { summary, games, vrCount } = await about();
  const url = (path: string) => `${site.url}${path}`;
  const text = `# ${contact.name}

> ${summary}

This site is a portfolio and CV. All facts here match his LinkedIn profile.

## Pages

- [About](${url('/about/')}): what ${contact.name} tests (functional testing, platforms and certification, performance, playtesting and bug reporting), the platforms, headsets, tools and languages he works with, his story, and key facts and short answers.
- [Games](${url('/portfolio/')}): the ${games} games he has tested since ${since} (${vrCount} of them in VR), by studio, with his part in each.
- [Testing](${url('/testing/')}): how I test a build, live on the page: five checks you can watch and check yourself, and the test suite this site runs on every push.
- [Contact](${url('/contact/')}): how to get in touch.

## Profiles

${social.map((s) => `- [${s.label}](${s.href})`).join('\n')}
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
