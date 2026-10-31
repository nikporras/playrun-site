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

- [About](${url('/about/')}): key facts and short answers about ${contact.name}: his roles, the games he has tested, VR, tools and languages.
- [Portfolio](${url('/portfolio/')}): the ${games} games he has tested since ${since} (${vrCount} of them in VR), by studio, with his part in each.
- [Skills](${url('/skills/')}): how he tests games, from functional and compliance testing to performance, playtesting and bug reports, and the platforms he tests on.
- [Quality](${url('/quality/')}): a live QA run on the page itself, and the test suite this site runs on every push.
- [Contact](${url('/contact/')}): how to get in touch.

## Profiles

${social.map((s) => `- [${s.label}](${s.href})`).join('\n')}
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
