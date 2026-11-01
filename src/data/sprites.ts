/**
 * The pixel sprites' bitmaps, shared by Sprite.astro (inline SVG on every page) and the Bug Sweep
 * game on the About page (drawn on a canvas), so the game's ship and bugs are the site's own.
 * The ship is the logo icon rasterised at 24 by 18 (banded blue, cyan, green from the top in both
 * places); the bug is a 10 by 8 original (B body, E eye, L leg). Nothing is copied from any game.
 */
export const SHIP = [
  '..........#..#..........',
  '........###..###........',
  '......#####..#####......',
  '.....######..######.....',
  '...#######....#######...',
  '.########......########.',
  '########........########',
  '..#######......#######..',
  '....#######..#######....',
  '.....######..######.....',
  '.......####..#####......',
  '........###..#####......',
  '........###..######.....',
  '.........##..######.....',
  '.........##..##..###....',
  '..........#..##...##....',
  '..........#..#.....#....',
  '..........#..#..........',
];

/** The ship's colour band for a row: blue at the nose, cyan in the middle, green at the tail. */
export const shipBand = (y: number) => (y < 6 ? 'blue' : y < 12 ? 'cyan' : 'green');

// The thruster, two frames behind the tail.
export const FLAME_A = ['..........####', '...........##.'];
export const FLAME_B = ['..........####', '..........####', '...........##.'];

/**
 * The same ship for Bug Sweep, rasterised again from the logo icon at 15 by 11, so in the game it is
 * one and a half bugs wide; banded the same way (blue, cyan, green from the top).
 */
export const SHIP_SMALL = [
  '......#.#......',
  '....###.###....',
  '..#####.#####..',
  '#####.....#####',
  '.####.....####.',
  '..#####.#####..',
  '....###.###....',
  '.....##.####...',
  '.....##.####...',
  '......#.#..#...',
  '......#.#...#..',
];
export const smallBand = (y: number) => (y < 4 ? 'blue' : y < 8 ? 'cyan' : 'green');

export const BUG = [
  '..L..BB..L',
  '...LBBBB..',
  '..BBEBBEB.',
  'L.BBBBBB.L',
  '.LBBBBBBBL',
  'L.BBBBBB.L',
  '..L.BB.L..',
  '.L......L.',
];
