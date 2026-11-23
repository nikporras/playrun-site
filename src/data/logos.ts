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
