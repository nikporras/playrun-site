/**
 * The official game logos in one colour, keyed by project id. Each file in src/assets/logos is
 * made by scripts/logos.mjs from the logo in the game's press kit or official page; a game with
 * no clean official logo has no file here and keeps its pixel icon.
 */
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<ImageMetadata>('../assets/logos/*.png', { eager: true, import: 'default' });

export const logos: Record<string, ImageMetadata> = Object.fromEntries(
  Object.entries(files).map(([path, img]) => [path.split('/').pop()!.replace(/\.png$/, ''), img]),
);

/** A logo shown larger than the rest on the cards: a tall, square badge reads small at the cards'
 *  logo height (by eye). */
export const logoScale: Record<string, number> = { 'jurassic-world-aftermath': 1.4 };

/** The logos that spell the game's name plainly: on those cards the title is visually hidden (kept
 *  for screen readers and search). Guildford Castle VR and Londinium carry the studio's logo, and
 *  CLAWPUNK and Gang of Frogs are lettered too freely to read as the name, so they keep a title. */
export const namedLogos = new Set([
  'a-township-tale',
  'beat-saber',
  'cyberpunk-2077',
  'ghostbusters-rise-of-the-ghost-lord',
  'hello-sunshine',
  'jurassic-world-aftermath',
  'lous-lagoon',
  'nba-2k21',
  'pathfinder-abomination-vaults',
  'space-pirate-trainer',
  'synapse',
  'the-climb-2',
  'thick-as-thieves',
  'vaewolf',
  'walkabout-mini-golf',
]);
