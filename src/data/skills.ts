/**
 * What I test: the five areas, shown on About (Level 2, id "skills") as a dealt deck on a desktop
 * and a swipe on phones and tablets, and named in the structured data (knowsAbout). Each area has
 * an 8x8 pixel icon in the style of the Testing steps ('#' a pixel, '.' empty).
 */
export type Area = { id: string; title: string; line: string; bullets: string[]; icon: string[] };

export const areas: Area[] = [
  {
    id: 'functional',
    title: 'Functional testing',
    line: 'Every path a player can take, with a test plan agreed before the build lands and a regression pass on every build after.',
    bullets: ['Clear test plans, agreed before testing', 'Regression passes on every build', 'Build acceptance before a milestone'],
    // a tick over a line of text
    icon: ['......#.', '.....##.', '#...##..', '##.##...', '.###....', '..#.....', '........', '########'],
  },
  {
    id: 'platforms',
    title: 'Platforms and certification',
    line: 'The same build on every console, PC store and handheld, checked against its requirements before submission, not after a rejection.',
    bullets: ['Platform requirement checks', 'Platform certification checks (TRC, XR, Lotcheck)', 'One report per platform build'],
    // a gamepad: the cross on the left, two buttons on the right
    icon: ['........', '.######.', '##.###.#', '#...#.##', '##.#####', '########', '###..###', '##....##'],
  },
  {
    id: 'performance',
    title: 'Performance and stress',
    line: 'Frame rate, memory and load times on low and recommended spec rigs, with Unreal Engine profiling and long sessions.',
    bullets: ['Unreal Engine profiling', 'Low and recommended spec rigs', 'Long session and soak tests'],
    // a gauge, its needle pointing up and right
    icon: ['..####..', '.#....#.', '#....#.#', '#...#..#', '#..##..#', '#......#', '.######.', '........'],
  },
  {
    id: 'playtesting',
    title: 'Playtesting and UX',
    line: 'Where players get lost, bored or stuck: the onboarding, the difficulty, the readability and the first ten minutes.',
    bullets: ['Onboarding notes', 'Difficulty and pacing notes', 'Readability on every screen'],
    // an eye
    icon: ['........', '..####..', '.#....#.', '#..##..#', '#..##..#', '.#....#.', '..####..', '........'],
  },
  {
    id: 'reporting',
    title: 'Bug reporting',
    line: "Steps, severity, media and a build number on every bug, in the team's own tracker, and a quality report at each milestone.",
    bullets: ['Jira, Confluence or TestRail', 'Steps, severity, media, build number', 'Milestone quality reports'],
    // a bug
    icon: ['.#....#.', '..#..#..', '.######.', '##.##.##', '.######.', '########', '.######.', '#.#..#.#'],
  },
];

/** An icon's pixels as one SVG path (viewBox 0 0 8 8). */
export const iconPath = (rows: string[]) => rows.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `M${x} ${y}h1v1H${x}z` : ''))).join('');

/**
 * Parked for later (Testing or a work samples page), shown nowhere for now: a test run, from the
 * build landing to the team submitting.
 */
export const run: [state: string, text: string][] = [
  ['Build received', 'The build lands. I set up the hardware and read the plan back to the team.'],
  ['Test plan', 'What gets tested, on what, in what order. Agreed with the team before the pass starts.'],
  ['Functional pass', 'Every path, every feature, every build.'],
  ['Platform pass', 'Each platform build against its certification and store requirements.'],
  ['Performance pass', 'Frame rate, memory, load times, long sessions.'],
  ['Report sent', 'Bugs in the tracker as they are found. A quality report at the milestone.'],
  ['Shipped', 'The team submits with the report in hand.'],
];
