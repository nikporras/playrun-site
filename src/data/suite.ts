/**
 * The test suite, read at build time, so no number on the site is typed by hand.
 *
 * The list of checks comes from Playwright itself (`playwright test --list`), which expands every
 * loop and parameter in the spec files. When the build runs on GitHub Actions, the suite has
 * already passed in the job before it, and that job's JSON report is downloaded into
 * tests/results/run.json first: then the counts, the passes and the time come from the run that
 * deployed the page. A local build has no run, only the list.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

type JsonTest = { status?: string; projectName?: string };
type JsonSpec = { title: string; file: string; tags?: string[]; tests: JsonTest[] };
type JsonSuite = { title: string; file?: string; specs: JsonSpec[]; suites?: JsonSuite[] };
type Report = { suites: JsonSuite[]; stats?: { startTime?: string; duration?: number }; config?: { projects?: { name: string }[] } };

export type Group = {
  id: string;
  file: string;
  title: string;
  detail: string;
  /** Checks in this file, loops expanded. */
  total: number;
  /** Set only when the numbers come from a run. */
  passed: number;
  failed: number;
};

export type Tally = { total: number; passed: number; failed: number };

export type Suite = {
  groups: Group[];
  files: number;
  total: number;
  passed: number;
  /** The one count the site shows: the checks that passed in the run that deployed the page (a
   * local build with no run: every check in the list). Skips are normal and never counted. */
  checks: number;
  failed: number;
  /** The run the numbers come from, or null when only the list is known. */
  run: { startedAt: Date; seconds: number } | null;
};

// The words for each file. The numbers never live here.
const COPY: Record<string, [title: string, detail: string]> = {
  'a11y.spec.ts': ['Accessibility everywhere', 'axe on every page at desktop and phone widths, and on what opens on demand: the scoreboard, a toast, the glitch card, Bug Sweep and the Testing steps for a phone.'],
  'about.spec.ts': ['The About page', 'The facts and the questions and answers, built from the data, in the nav and the footer, with nothing hidden at first.'],
  'brand.spec.ts': ['Brand assets', 'Both typefaces load, the logo renders, favicon and Open Graph image present.'],
  'analytics.spec.ts': ['Visit statistics', 'Umami on every page from the site itself, reporting only to its gateway on the live domain, never with Do Not Track, never from the suite.'],
  'bugs.spec.ts': ['Bugs off the text', 'Every bug sits in empty field on five pages at four widths, all along its walk.'],
  'cls.spec.ts': ['Layout shift', 'Every page at a phone and a desktop width, with the fonts arriving late, shifts its layout by no more than 0.1.'],
  'contact.spec.ts': ['Contact form', 'Validation, every answer the script can give, and the mailto fallback.'],
  'credits.spec.ts': ['Credits', 'Every typeface, tool and sprite is credited, and the page passes axe.'],
  'events.spec.ts': ['What the statistics count', 'Each counted click carries its event name, and what a click cannot see is counted by name, never with anything a visitor typed.'],
  'firefox.spec.ts': ['In Firefox', 'Every page loads clean in Firefox, the picker in the QA Lab knows it, and the five steps finish without a fail.'],
  'games.spec.ts': ['The games', 'The track, the runner, the bug hunt and the achievements by mouse, touch and keyboard, and off under reduced motion.'],
  'home.spec.ts': ['Home', 'Loads clean, the bottom bar on a phone, the curtain, the glitch and its card, the wall, the stats, three widths, axe, the self test.'],
  'indexing.spec.ts': ['Search and AI access', 'robots.txt welcomes the AI crawlers and disallows nothing, the IndexNow key and step, llms.txt and its pages, snippets kept to the content.'],
  'labels.spec.ts': ['Level labels', 'Every level label on every page starts at the same left edge, at three widths.'],
  'links.spec.ts': ['Links', 'Links that leave the site open a new tab and say so. Internal links stay.'],
  'motion.spec.ts': ['The Motion switch', 'Follows your device setting until you choose. Your choice is remembered, and turning Motion on works even when your device asks for less motion.'],
  'validity.spec.ts': ['Valid HTML', 'Every page as the server sends it passes html-validate, offline: elements, content, attributes, ids and the document.'],
  'webkit.spec.ts': ['In WebKit', "Safari's engine: the live checks in the QA Lab run, and Performance passes on the paint timing it reports or says it is not measured, never a fail for a missing figure."],
  'weight.spec.ts': ['Page weight', 'Each page under its budget on a first visit with nothing cached (Home 250 KB): HTML, CSS, script, fonts and images.'],
  'pages.spec.ts': ['Every page', 'Each route answers 200 with one h1, stacked level headers, labels that read, no stale facts, and passes axe.'],
  'polish.spec.ts': ['The finish', 'The 404 kept out of search, a commit date for every page in the sitemap, no broken or doubled attribute in any page.'],
  'portfolio.spec.ts': ['The Games page journey', 'The year on the track as you scroll, each header and card landing once from the laser, nothing under reduced motion.'],
  'phone.spec.ts': ['Home on a phone', 'A real device profile: nothing clipped, the hero on the first screen, the pages and the scoreboard in the bottom bar.'],
  'narrow.spec.ts': ['The narrowest screens', 'Every page at 300 and 320px wide, motion on and off, with no sideways scroll.'],
  'picker.spec.ts': ['The device picker', 'Testing on Chrome or Edge, Firefox, Safari, iPhone or Android: picked for your device, remembered, and only those steps shown.'],
  'pocket.spec.ts': ['Pocket DevTools', 'On a phone: the phone steps instead of the computer ones, and the console, the requests and the timings from the page itself.'],
  'qa-lab.spec.ts': ['The guided test run', 'Five live steps and the report card, the phone steps and Pocket DevTools, without script and under reduced motion.'],
  'schema.spec.ts': ['Structured data', 'One valid JSON-LD graph a page: the person with every role, the site, the page and its breadcrumb, a FAQ on About, none on the 404.'],
  'security.spec.ts': ['Content Security Policy', 'One policy at the top of every page, each inline script allowed by its hash, a blocked script caught as an error, and the games, the checks, Pocket DevTools and the form working under it.'],
  'selection.spec.ts': ['Selectable text', 'A drag selects a paragraph on every page and the highlight reads on every field.'],
};

// The build bundles this module under dist/, so the project root is the working directory, not a
// path relative to the file.
const root = process.cwd();
const runFile = path.join(root, 'tests', 'results', 'run.json');

function load(): { report: Report; fromRun: boolean } {
  // A run's report counts only in CI, where it is always the run just finished; a local one could be stale.
  if (process.env.CI && existsSync(runFile)) return { report: JSON.parse(readFileSync(runFile, 'utf8')), fromRun: true };
  const require = createRequire(import.meta.url);
  const cli = path.join(path.dirname(require.resolve('@playwright/test/package.json')), 'cli.js');
  try {
    const out = execFileSync(process.execPath, [cli, 'test', '--list', '--reporter=json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      // (the list goes to stdout, whatever report file the run around this build may be writing)
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: '', PLAYWRIGHT_JSON_OUTPUT_FILE: '' },
    });
    return { report: JSON.parse(out), fromRun: false };
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    throw new Error(`Could not list the test suite: ${err.message}
${err.stderr ?? ''}
${(err.stdout ?? '').slice(0, 2000)}`);
  }
}

function collect(suite: JsonSuite, into: Map<string, Tally>) {
  for (const spec of suite.specs ?? []) {
    const file = path.basename(spec.file);
    const g = into.get(file) ?? { total: 0, passed: 0, failed: 0 };
    for (const t of spec.tests ?? []) {
      const passed = t.status === 'expected' || t.status === 'flaky';
      const failed = t.status === 'unexpected';
      g.total++;
      if (passed) g.passed++;
      if (failed) g.failed++;
    }
    into.set(file, g);
  }
  for (const s of suite.suites ?? []) collect(s, into);
}

const { report, fromRun } = load();

const counts = new Map<string, Tally>();
for (const s of report.suites) collect(s, counts);
if (counts.size === 0) throw new Error('No tests found: the QA Lab cannot be built without the suite.');

const groups: Group[] = [...counts.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([file, n]) => {
    const [title, detail] = COPY[file] ?? [file.replace(/\.spec\.ts$/, ''), ''];
    return { id: file.replace(/\.spec\.ts$/, ''), file, title, detail, ...n };
  });

const total = groups.reduce((n, g) => n + g.total, 0);
const passed = groups.reduce((n, g) => n + g.passed, 0);
const failed = groups.reduce((n, g) => n + g.failed, 0);
// (a run with a real failure never deploys; skips are normal, browser or device specific)
if (fromRun && failed > 0) throw new Error(`The run handed to this build has ${failed} failed checks: the site is not built from a failing run.`);

export const suite: Suite = {
  groups,
  files: groups.length,
  total,
  passed,
  failed,
  checks: fromRun ? passed : total,
  run:
    fromRun && report.stats?.startTime
      ? { startedAt: new Date(report.stats.startTime), seconds: Math.round((report.stats.duration ?? 0) / 1000) }
      : null,
};

/** "2 minutes 14 seconds", for the run time. */
export function spell(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const parts = [];
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s || !m) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** The browsers the suite runs in, from Playwright's projects (in the report, or the list). */
const ENGINES: [string, string][] = [
  ['chromium', 'Chromium'],
  ['firefox', 'Firefox'],
  ['webkit', 'WebKit'],
];
const projects = new Set((report.config?.projects ?? []).map((p) => p.name));
export const browsers = ENGINES.filter(([id]) => projects.has(id)).map(([, name]) => name);
if (browsers.length === 0) throw new Error('No browsers in the suite: the QA Lab names them.');

/** The day the live site is checked, from the schedule in .github/workflows/live-check.yml. */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const cron = readFileSync(path.join(root, '.github', 'workflows', 'live-check.yml'), 'utf8').match(/cron:\s*['"]([^'"]+)['"]/)?.[1];
const weekday = cron?.trim().split(/\s+/)[4];
export const liveDay = weekday && /^[0-7]$/.test(weekday) ? DAYS[Number(weekday) % 7] : null;

/**
 * Where the suite runs, from the same list or report: the full suite is the browser that runs the
 * most checks (every spec file), the others run only their own targeted files. One sentence for
 * the report card, the Accessibility page and llms.txt, so no page claims more than the config does.
 */
const perEngine = new Map<string, number>();
const countEngines = (s: JsonSuite) => {
  for (const spec of s.specs ?? []) for (const t of spec.tests ?? []) if (t.projectName) perEngine.set(t.projectName, (perEngine.get(t.projectName) ?? 0) + 1);
  for (const c of s.suites ?? []) countEngines(c);
};
for (const s of report.suites) countEngines(s);
const byCount = ENGINES.filter(([id]) => perEngine.has(id)).sort(([a], [b]) => perEngine.get(b)! - perEngine.get(a)!);
if (byCount.length === 0) throw new Error('No checks carry a browser: the QA Lab names where the suite runs.');
const and = (items: string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
/** The browser the whole suite runs in ("Chromium"). */
export const fullBrowser = byCount[0][1];
/** The browsers that run only targeted checks, in the usual order ("Firefox and WebKit"). */
export const targetedBrowsers = ENGINES.filter(([id]) => perEngine.has(id) && id !== byCount[0][0]).map(([, name]) => name);
/** "The full suite runs in Chromium on every push, with targeted checks in Firefox and WebKit, and against the live site every Monday." */
export const whereLine = `The full suite runs in ${fullBrowser} on every push${targetedBrowsers.length ? `, with targeted checks in ${and(targetedBrowsers)}` : ''}${liveDay ? `, and against the live site every ${liveDay}` : ''}.`;

/** The versions the loop names, read from the files that set them. */
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');
export const versions = {
  node: workflow.match(/node-version:\s*['"]?(\d+)/)?.[1] ?? null,
  playwright: (JSON.parse(readFileSync(path.join(root, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')) as { version: string }).version,
};

/**
 * The checks on Bug Sweep, for the QA Lab's test plan: every test tagged @bugsweep, with its file,
 * its title, the browsers it runs in and, from a run, how many passed. Read from the same list or
 * report as everything above, so no count or title is ever typed in.
 */
export type TaggedCheck = { file: string; title: string; total: number; passed: number; failed: number; projects: string[]; tags: string[] };
const tagged = (tag: string): TaggedCheck[] => {
  const out: TaggedCheck[] = [];
  const walk = (s: JsonSuite) => {
    for (const spec of s.specs ?? []) {
      if (!(spec.tags ?? []).includes(tag.replace(/^@/, '')) && !(spec.tags ?? []).includes(tag)) continue;
      const tests = spec.tests ?? [];
      out.push({
        file: path.basename(spec.file),
        title: spec.title,
        total: tests.length,
        passed: tests.filter((t) => t.status === 'expected' || t.status === 'flaky').length,
        failed: tests.filter((t) => t.status === 'unexpected').length,
        projects: [...new Set(tests.map((t) => t.projectName ?? ''))].filter(Boolean),
        tags: (spec.tags ?? []).map((t) => t.replace(/^@/, '')),
      });
    }
    for (const c of s.suites ?? []) walk(c);
  };
  for (const s of report.suites) walk(s);
  return out;
};
/**
 * The plain summary of the Bug Sweep checks on the QA Lab: each check carries exactly one of these
 * tags beside @bugsweep, and the counts come from the tags. The words live here; the numbers never.
 */
// (a ticket, when given, is shown after the name as a link to its report further down the page)
const COVERAGE: { tag: string; name: string; ticket?: string; line: string }[] = [
  { tag: 'gameplay', name: 'Gameplay', line: 'Loading, rules, lives, winning, losing and pausing.' },
  { tag: 'controls', name: 'Controls', line: 'Keyboard and touch, and a swipe still scrolls the page.' },
  { tag: 'a11y', name: 'Accessibility', line: 'Axe while playing, paused and over, and play with motion reduced.' },
  { tag: 'events', name: 'Analytics events', line: 'A start, a clear, a game over and the achievement.' },
  { tag: 'known', name: 'Known issue', ticket: 'QA-002', line: 'The glitch stays visual and only ever hits one bug.' },
];

// Checks that differ only by the screen size in their title ("(1440x900)", "at 375px") read as one
// line: "... (at 1440, 768 and 375px)".
const SIZE = /\s*\((\d{3,4})x\d{3,4}\)|\s+at (\d{3,4})(?:x\d{3,4}|px)\b/;
const and = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a.join(''));
const merged = (checks: TaggedCheck[]) => {
  const lines = new Map<string, { title: string; widths: string[]; total: number }>();
  for (const c of checks) {
    const m = c.title.match(SIZE);
    const key = m ? c.title.replace(SIZE, '') : c.title;
    const e = lines.get(key) ?? { title: c.title, widths: [], total: 0 };
    if (m) e.widths.push(m[1] ?? m[2]);
    e.total += c.total;
    lines.set(key, e);
  }
  return [...lines.entries()].map(([key, e]) => ({ title: e.widths.length > 1 ? `${key} (at ${and(e.widths)}px)` : e.title, total: e.total }));
};

export const bugSweep = (() => {
  const checks = tagged('@bugsweep');
  if (checks.length === 0) throw new Error('No checks tagged @bugsweep: the QA Lab test plan lists them.');
  for (const c of checks) {
    const n = COVERAGE.filter((g) => c.tags.includes(g.tag)).length;
    if (n !== 1) throw new Error(`"${c.title}" (${c.file}) needs exactly one of ${COVERAGE.map((g) => '@' + g.tag).join(', ')} beside @bugsweep (it has ${n}).`);
  }
  const groups = COVERAGE.map((g) => ({ ...g, total: checks.filter((c) => c.tags.includes(g.tag)).reduce((n, c) => n + c.total, 0) })).filter((g) => g.total > 0);
  const files = [...new Set(checks.map((c) => c.file))].map((file) => ({ file, checks: checks.filter((c) => c.file === file), lines: merged(checks.filter((c) => c.file === file)) }));
  const engines = new Set(checks.flatMap((c) => c.projects));
  return {
    checks,
    groups,
    files,
    total: checks.reduce((n, c) => n + c.total, 0),
    passed: checks.reduce((n, c) => n + c.passed, 0),
    failed: checks.reduce((n, c) => n + c.failed, 0),
    browsers: ENGINES.filter(([id]) => engines.has(id)).map(([, name]) => name),
  };
})();

