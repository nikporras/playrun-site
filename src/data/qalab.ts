/**
 * The QA Lab's written work: the test plan for Bug Sweep (Level 3) and two bug reports (Level 4),
 * written the way I log them at work. Only real facts: the commits, the tests and the devices are
 * the real ones. Every count and every test title comes from the suite (src/data/suite.ts), never
 * from here.
 */

export type Field = [label: string, text: string];

export type Ticket = {
  id: string;
  title: string;
  status: string;
  /** green for fixed, blue for open or kept */
  state: 'fixed' | 'open';
  environment: Field[];
  severity: Field;
  priority: Field;
  frequency: string;
  preconditions: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence: { alt: string; caption: string };
  cause: string[];
  resolution: string[];
};

export const tickets: Ticket[] = [
  {
    id: 'QA-001',
    title: "Pocket DevTools: the Network table's columns overlap on Android phones",
    status: 'Fixed, verified',
    state: 'fixed',
    environment: [
      ['Found on', 'Samsung Galaxy S25 Ultra, Firefox for Android.'],
      ['Reproduced on', 'Playwright Pixel 7 profile (Chromium, Android), 390 by 844 CSS pixels.'],
      ['Browser', 'Not browser-specific: the same in Firefox and Chromium.'],
      ['Screen', '390 pixels wide and narrower.'],
      ['Build', '299e74b, 25 November 2026.'],
    ],
    severity: ['Medium', "The Network tab's data cannot be read on phones; the rest of the panel works."],
    priority: ['Medium', 'It is on the page that shows how I test, so it should not wait.'],
    frequency: 'Always, on every load at 390 pixels wide and narrower.',
    preconditions: 'A phone-width screen with the device picker on Android or iPhone, so Pocket DevTools shows.',
    steps: ['Open the QA Lab page on an Android phone.', 'Scroll to Pocket DevTools under the live checks.', 'Look at the Network table.'],
    expected: 'Each request on one row, with the file, type, status and size in their own columns.',
    actual: 'Long script names (Header.astro_astro_type_script_index_0_lang plus a hash, .js) run over the Type, Status and Size columns, so the rows cannot be read.',
    evidence: {
      alt: "Pocket DevTools' Network table at 390 pixels wide: long script names run over the Type, Status and Size columns.",
      caption: 'Reproduced from build 299e74b at 390 pixels wide.',
    },
    cause: [
      'The table rows are written by a script after the page loads.',
      "Astro's scoped styles only reach elements in the page's own markup, so the table cell rules never applied to them.",
      'While fixing it, the first fixed layout cut the Status header to "Stat…" at 390 pixels; the columns were widened before the fix shipped.',
    ],
    resolution: [
      'Fixed in e5ad238, 25 November 2026: the rules now reach the rows the script writes, and the table has a fixed layout with an ellipsis on the file name.',
      'Script names read short ("Header.astro"), with the full address in the title and for screen readers. Under 360 pixels each row stacks.',
      'Guarded by tests/pocket.spec.ts: at 300, 375 and 390 pixels no cell of the network table overlaps another.',
      'Verified in CI and on the live site.',
    ],
  },
  {
    id: 'QA-002',
    title: 'Bug Sweep: one enemy bug glitches when it returns to formation',
    status: "Won't fix (known issue)",
    state: 'open',
    environment: [
      ['Found on', 'Any browser, phone or desktop: About page, Bug Sweep.'],
      ['Screen', 'Any width.'],
      ['Build', 'cb5bcbf onwards, 26 November 2026.'],
    ],
    severity: ['Low', "Cosmetic: the bug's hitbox, movement and score are unaffected."],
    priority: ['Low', 'It does not affect play.'],
    frequency: 'Always, every time that bug returns from a dive.',
    preconditions: 'The game playing, with the third bug in the top row not yet shot.',
    steps: [
      'Open the About page and press Play Bug Sweep.',
      'Leave the third bug in the top row alone.',
      'Wait for it to dive and come back round. Dives are picked at random, so this can take several dives.',
      'Watch it as it lands in its place.',
    ],
    expected: 'It settles in formation looking like the other bugs.',
    actual: 'For about 0.3 seconds its sprite splits into slices that jump sideways, then it looks normal again.',
    evidence: {
      alt: 'The Bug Sweep field: ten bugs in two rows, the third in the top row drawn as slices shifted sideways.',
      caption: 'Captured in a test build with the glitch triggered on demand.',
    },
    cause: ["Intentional. I left it in on purpose as a live example: the slice offset is drawn for 0.3 seconds after that bug's dive ends, and only the drawing changes."],
    resolution: ["Won't fix: kept on purpose as a live example. Try to reproduce it yourself in Bug Sweep on my About page."],
  },
];

/** The test plan for Bug Sweep. Counts, titles, browsers and results come from the suite. */
export const testPlan = {
  scope: {
    in: [
      'The game on the About page, from Play to a cleared level or the last life lost.',
      'Its controls: the keyboard, the touch buttons and pausing.',
      'The achievement Bug Sweep cleared and its visit statistics events.',
    ],
    out: ['The rest of the About page.', 'The games layer outside Bug Sweep (the bugs to catch, the scoreboard).'],
  },
  automatedSizes: '1440 by 900, 768 by 1024, and 375 by 812 as a touch screen',
  byHand: ['Samsung Galaxy S25 Ultra, Firefox for Android (touch).', 'Windows PC, Firefox (keyboard).'],
  checkedByHand: ['Playing to a win and to game over.', 'The touch buttons.', 'Pausing when switching apps or tabs.'],
  risks: [
    'Touch buttons too small or too slow for thumbs.',
    'The canvas going blurry at fractional screen scales.',
    'The arrow keys or Space scrolling the page while playing.',
    'The game not pausing when the tab is hidden or the field leaves the screen.',
    'The game being unwinnable on a touch screen.',
    'Reduced motion stopping a game the player started on purpose.',
    "The site's security policy blocking the game's code.",
  ],
  types: [
    ['Functional', 'The rules, lives, winning and losing.'],
    ['Controls', 'The keyboard, the touch buttons and holding them down.'],
    ['Performance', 'Whole device pixels per game pixel, the game loading only on Play, pausing.'],
    ['Accessibility', 'axe while playing, paused and over; focus; the status text.'],
    ['Compatibility', 'Desktop, tablet and touch sizes; the security policy on the live site.'],
  ] as [string, string][],
  entry: ['The change is pushed to main and CI starts.'],
  exit: ['Every check tagged for Bug Sweep passes.', 'No open issue above Low.'],
  run: [
    ['Build received', 'The change lands on main.'],
    ['Test plan', 'This page.'],
    ['Functional pass', 'The rules, winning and losing.'],
    ['Platform pass', 'Desktop, tablet and touch.'],
    ['Performance pass', 'Crisp pixels, pausing, loading on demand.'],
    ['Report sent', "CI's report, and bugs as tickets below."],
    ['Shipped', 'It deploys only when every check passes.'],
  ] as [string, string][],
};
