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

type JsonTest = { status?: string };
type JsonSpec = { title: string; file: string; tags?: string[]; tests: JsonTest[] };
type JsonSuite = { title: string; file?: string; specs: JsonSpec[]; suites?: JsonSuite[] };
type Report = { suites: JsonSuite[]; stats?: { startTime?: string; duration?: number } };

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
  /** The checks tagged for each area of the Home scoreboard (`@pages`, `@a11y` and so on). */
  areas: Record<string, Tally>;
  files: number;
  total: number;
  passed: number;
  failed: number;
  /** The run the numbers come from, or null when only the list is known. */
  run: { startedAt: Date; seconds: number } | null;
};

// The words for each file. The numbers never live here.
const COPY: Record<string, [title: string, detail: string]> = {
  'brand.spec.ts': ['Brand assets', 'Both typefaces load, the logo renders, favicon and Open Graph image present.'],
  'bugs.spec.ts': ['Bugs off the text', 'Every bug sits in empty field on five pages at four widths, all along its walk.'],
  'contact.spec.ts': ['Contact form', 'Validation, every answer the script can give, and the mailto fallback.'],
  'credits.spec.ts': ['Credits', 'Every typeface, tool and sprite is credited, and the page passes axe.'],
  'games.spec.ts': ['The games', 'The track, the runner, the bug hunt and the achievements by mouse, touch and keyboard, and off under reduced motion.'],
  'home.spec.ts': ['Home', 'Loads clean, the curtain, the headline break, the wall, the stats, three widths, axe, the self test.'],
  'links.spec.ts': ['Links', 'Links that leave the site open a new tab and say so. Internal links stay.'],
  'pages.spec.ts': ['Every page', 'Each route answers 200 with one h1, stacked level headers, labels that read, no stale facts, and passes axe.'],
  'portfolio.spec.ts': ['The Portfolio journey', 'The year on the track as you scroll, each header and card landing once from the laser, nothing under reduced motion.'],
  'phone.spec.ts': ['Home on a phone', 'A real device profile: nothing clipped, the button on the first screen, a slim HUD.'],
  'pocket.spec.ts': ['Pocket DevTools', 'On a phone: the phone steps instead of the computer ones, and the console, the requests and the timings from the page itself.'],
  'quality.spec.ts': ['The guided test run', 'Five live steps, the report, the template, the phone steps and Pocket DevTools, without script and under reduced motion.'],
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
    });
    return { report: JSON.parse(out), fromRun: false };
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    throw new Error(`Could not list the test suite: ${err.message}
${err.stderr ?? ''}
${(err.stdout ?? '').slice(0, 2000)}`);
  }
}

function collect(suite: JsonSuite, into: Map<string, Tally>, areas: Record<string, Tally>) {
  for (const spec of suite.specs ?? []) {
    const file = path.basename(spec.file);
    const g = into.get(file) ?? { total: 0, passed: 0, failed: 0 };
    const tagged = (spec.tags ?? []).map((t) => (areas[t.replace(/^@/, '')] ??= { total: 0, passed: 0, failed: 0 }));
    for (const t of spec.tests ?? []) {
      const passed = t.status === 'expected' || t.status === 'flaky';
      const failed = t.status === 'unexpected';
      for (const tally of [g, ...tagged]) {
        tally.total++;
        if (passed) tally.passed++;
        if (failed) tally.failed++;
      }
    }
    into.set(file, g);
  }
  for (const s of suite.suites ?? []) collect(s, into, areas);
}

const { report, fromRun } = load();
const counts = new Map<string, Tally>();
const areas: Record<string, Tally> = {};
for (const s of report.suites) collect(s, counts, areas);
if (counts.size === 0) throw new Error('No tests found: the Quality page cannot be built without the suite.');

const groups: Group[] = [...counts.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([file, n]) => {
    const [title, detail] = COPY[file] ?? [file.replace(/\.spec\.ts$/, ''), ''];
    return { id: file.replace(/\.spec\.ts$/, ''), file, title, detail, ...n };
  });

export const suite: Suite = {
  groups,
  areas,
  files: groups.length,
  total: groups.reduce((n, g) => n + g.total, 0),
  passed: groups.reduce((n, g) => n + g.passed, 0),
  failed: groups.reduce((n, g) => n + g.failed, 0),
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

/** The versions the loop names, read from the files that set them. */
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'deploy.yml'), 'utf8');
export const versions = {
  node: workflow.match(/node-version:\s*['"]?(\d+)/)?.[1] ?? null,
  playwright: (JSON.parse(readFileSync(path.join(root, 'node_modules', '@playwright', 'test', 'package.json'), 'utf8')) as { version: string }).version,
};
