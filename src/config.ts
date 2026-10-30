// Site-wide constants. Everything the pages need to know about the site lives here.
export const site = {
  name: 'PlayRun',
  tagline: 'test experts',
  url: 'https://playrunqa.com',
  description:
    'PlayRun is the game QA portfolio of Nicolás Porras in London: game QA, platform compliance and release testing since 2021, on Nintendo Switch, Xbox, PS5 and the PC stores, with reports developers can act on.',
  locale: 'en_GB',
  themeColor: '#0C152A',
  ogImageAlt: 'The PlayRun logo on navy: the pixel icon above the name playrun and the words test experts.',
};

export const contact = {
  name: 'Nicolás Porras',
  email: 'studio@playrunqa.com',
  location: 'London, UK',
};

// The contact form posts a JSON string to this Google Apps Script web app (text/plain body, so
// there is no CORS preflight). It answers {ok:true} or {ok:false, errors:[...]}.
export const contactEndpoint =
  'https://script.google.com/macros/s/AKfycbxuVMg4V94B0QBAu-bLOox8zFTYRgZgWnPRiilkS7Sl0qt7w_R8dYw3gts3sy6Mk5CYMQ/exec';

// Profiles linked from the footer. A link is rendered only when its URL is set. No link to a code
// repository anywhere on the site.
export const social: { label: string; href: string }[] = [{ label: 'LinkedIn', href: 'https://www.linkedin.com/in/nicolas-porras-918774116/' }].filter((s) => s.href !== '');

// PlayRun is a brand, not a post: the footer and the hero name it.
export const playrun = { role: 'Founder & Lead QA', when: 'Oct 2025 to present' };

// `lead`: a lead or management QA role, counted on the Home stats drum.
export type Role = { title: string; when: string; contract?: boolean; lead?: boolean };
export type Employer = {
  id: string;
  name: string;
  accent: 'green' | 'cyan' | 'blue' | 'light';
  roles: Role[];
  lead: string;
  note?: string;
  via?: string;
};

// Where I have tested, in the order the Portfolio shows them. Titles and dates match LinkedIn
// exactly; each company keeps one accent colour. Projects point at a group through `employer`.
export const employers: Employer[] = [
  {
    id: 'aonic',
    name: 'Aonic',
    accent: 'green',
    roles: [{ title: 'Senior Quality Assurance Tester', when: 'Jul 2026 to present' }],
    lead:
      "Embedded QA on several Megabit indie titles at once, from milestone builds to compliance (CQA), certification and release on Switch, Switch 2, Xbox, PS5 and the PC stores. Test cases, milestone build reports with severity and risk ratings, and bugs logged straight into the studios' own trackers.",
  },
  {
    id: 'hcltech',
    name: 'HCLTech',
    accent: 'cyan',
    roles: [{ title: 'VR Robotics Operator, client Google DeepMind', when: 'Apr 2026 to Jul 2026', contract: true }],
    lead: 'Operated robots through VR teleoperation for an AI research project, following strict processes to produce clean, consistent data, and flagging issues with the robots, tools and workflows.',
  },
  {
    id: 'nexus-studios',
    name: 'Nexus Studios',
    accent: 'blue',
    roles: [{ title: 'Quality Assurance Tester', when: 'Oct 2025 to Dec 2025', contract: true }],
    lead: 'QA on an Apple Vision Pro experience with the NBA.',
  },
  {
    id: 'universally-speaking-2025',
    name: 'Universally Speaking',
    accent: 'light',
    roles: [{ title: 'Build and Distribution Technician', when: 'Jun 2025 to Aug 2025', contract: true }],
    lead: 'Prepared, configured and distributed consoles and builds across the studio to support game testing, and gave technical support to the test teams.',
  },
  {
    id: 'historic-vr',
    name: 'Historic VR',
    accent: 'cyan',
    roles: [{ title: 'QA Manager', when: 'Feb 2025 to Feb 2026', contract: true, lead: true }],
    lead: "Ran QA across the studio's VR projects: test strategy, compliance checks for each VR platform, schedules with development and production, the test hardware and low and recommended spec rigs, Unreal Engine profiling to hit performance targets, and an outsourced team scaled to 10 testers.",
  },
  {
    id: 'ndreams',
    name: 'nDreams',
    accent: 'blue',
    roles: [
      { title: 'QA Tester', when: 'Mar 2022 to Sep 2022' },
      { title: 'Senior QA Tester', when: 'Sep 2022 to Apr 2023' },
      { title: 'Lead QA Tester', when: 'Apr 2023 to Oct 2024', lead: true },
    ],
    lead: 'Grew from tester to lead. Sole tester on a project, then led a QA team: test planning, the bug lifecycle in Jira and Confluence, QA in sprint planning and retrospectives, mentoring testers and managing an external QA vendor. Lead QA Tester on one cancelled project.',
  },
  {
    id: 'universally-speaking-2021',
    name: 'Universally Speaking',
    accent: 'light',
    roles: [{ title: 'Quality Assurance Tester', when: '2021 to 2022' }],
    lead: 'Functional and compliance (CQA) testing for major studios on VR and console titles: test cases in TestRail, bugs in Jira, fix verification and build release notes.',
    via: 'via Universally Speaking',
  },
];

/** The year the testing started: the hero and the stats count from it. */
export const since = 2021;

export const nav = [
  { label: 'Home', href: '/' },
  { label: 'Skills', href: '/skills' },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'Quality', href: '/quality' },
];

// The one action. It appears in the nav, in the hero and at the end of Home, nowhere else.
export const primaryAction = { label: 'Get in touch', href: '/contact' };

// Legal pages. Put the business address in `address` when there is one to show; while it is
// empty the pages fall back to the location in `contact`.
export const legal = {
  controller: 'Nicolás Porras (PlayRun)',
  address: '',
  updated: '2026-10-27',
};

export const legalNav = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Accessibility', href: '/accessibility' },
];
