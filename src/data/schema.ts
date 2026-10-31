/**
 * The structured data: one JSON-LD graph per page, built from the site's data. Every page carries
 * the Person (Nicolás Porras), the WebSite and its own WebPage (a ProfilePage on Home, an
 * AboutPage with a FAQPage on About), and every page but Home a BreadcrumbList. It describes a
 * person and a portfolio, nothing else: no organisation for PlayRun, no founder, no service or
 * offer, no availability, no email.
 */
import { contact, education, employers, languages, social, site, summary } from '../config';

export const PERSON = `${site.url}/#person`;
export const WEBSITE = `${site.url}/#website`;
// The day the site in its portfolio form was first published, and the build's own time: full
// ISO 8601 date-times with a time zone, as rich results expect.
const CREATED = '2026-10-27T00:00:00+00:00';
const built = () => new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');

const KNOWS_ABOUT = [
  'Video game quality assurance',
  'Functional testing',
  'Regression testing',
  'Compliance testing (CQA)',
  'Console certification',
  'Nintendo Switch',
  'Xbox',
  'PlayStation 5',
  'Steam',
  'Virtual reality testing',
  'Meta Quest',
  'PlayStation VR2',
  'Apple Vision Pro',
  'Jira',
  'TestRail',
  'Unreal Engine',
  'Bug reporting',
];

const MONTH: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
/** "Jul 2026" as 2026-07, "2021" as 2021; "present" has no date. */
const isoMonth = (when: string) => {
  const m = when.trim().match(/^(?:([A-Z][a-z]{2}) )?(\d{4})$/);
  return m ? (m[1] ? `${m[2]}-${MONTH[m[1]]}` : m[2]) : undefined;
};

/** Every role in `employers`, as an EmployeeRole at its studio, oldest first. */
export const roles = () =>
  [...employers].reverse().flatMap((e) =>
    e.roles.map((r) => {
      const [from, to] = r.when.split(' to ');
      const end = to && !/present/.test(to) ? isoMonth(to) : undefined;
      return {
        '@type': 'EmployeeRole',
        roleName: r.title,
        startDate: isoMonth(from),
        ...(end ? { endDate: end } : {}),
        worksFor: { '@type': 'Organization', name: e.name },
      };
    }),
  );

export function person(image: string) {
  return {
    '@type': 'Person',
    '@id': PERSON,
    name: contact.name,
    alternateName: 'Nicolas Porras',
    jobTitle: 'Game QA Tester',
    description: summary,
    url: `${site.url}/`,
    image,
    sameAs: social.map((s) => s.href),
    homeLocation: { '@type': 'Place', name: 'London', address: { '@type': 'PostalAddress', addressLocality: 'London', addressCountry: 'GB' } },
    alumniOf: education.map((e) => ({ '@type': 'CollegeOrUniversity', name: e.school, sameAs: e.wikipedia })),
    worksFor: roles(),
    knowsLanguage: languages.map((l) => l.code),
    hasOccupation: { '@type': 'Occupation', name: 'Video game quality assurance tester', occupationLocation: { '@type': 'City', name: 'London' } },
    knowsAbout: KNOWS_ABOUT,
  };
}

export type PageKind = 'WebPage' | 'ProfilePage' | 'AboutPage';

export function graph(o: { url: string; title: string; description: string; kind: PageKind; crumb: string; image: string; card: string; faq?: { q: string; a: string }[] }) {
  const home = o.kind === 'ProfilePage';
  const page = {
    '@type': o.kind,
    '@id': `${o.url}#webpage`,
    url: o.url,
    name: o.title,
    description: o.description,
    inLanguage: 'en-GB',
    isPartOf: { '@id': WEBSITE },
    about: { '@id': PERSON },
    // the page's image: the social card, at its versioned address
    primaryImageOfPage: { '@type': 'ImageObject', url: o.card, width: 1200, height: 630 },
    image: o.card,
    ...(home ? { mainEntity: { '@id': PERSON }, dateCreated: CREATED, dateModified: built() } : {}),
  };
  const nodes: object[] = [
    person(o.image),
    { '@type': 'WebSite', '@id': WEBSITE, url: `${site.url}/`, name: contact.name, alternateName: site.name, inLanguage: 'en-GB', publisher: { '@id': PERSON } },
    page,
  ];
  if (!home)
    nodes.push({
      '@type': 'BreadcrumbList',
      '@id': `${o.url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${site.url}/` },
        { '@type': 'ListItem', position: 2, name: o.crumb, item: o.url },
      ],
    });
  if (o.faq)
    nodes.push({
      '@type': 'FAQPage',
      '@id': `${o.url}#faq`,
      isPartOf: { '@id': `${o.url}#webpage` },
      mainEntity: o.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  return { '@context': 'https://schema.org', '@graph': nodes };
}
