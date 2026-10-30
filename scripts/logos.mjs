/**
 * The game logos, one colour. Reads the official logo files (downloaded from each game's press
 * kit or official page into .playwright-mcp/logos-raw/<slug>/, which is not committed) and writes
 * src/assets/logos/<slug>.png: the logo's own shape, unaltered, filled with the brand light colour
 * on a transparent background, trimmed and sized for the wall. Where no clean official logo
 * exists the game keeps its pixel icon, so it has no entry here.
 *
 *   node scripts/logos.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const RAW = '.playwright-mcp/logos-raw';
const OUT = 'src/assets/logos';
const LIGHT = { r: 229, g: 231, b: 234 }; // --pr-light

// A logo whose shape is its alpha channel needs nothing more. One drawn on a filled badge keeps
// its lettering through luminance: the light parts (over `lo`, fully by `hi`) become the shape.
// `tight` cuts a neon glow back to the letters.
const LOGOS = {
  'a-township-tale': 'logo_01.png',
  'beat-saber': ['BSLogo.png', { tight: true }],
  clawpunk: ['ClawPunkLogo_4K.png', { luma: [0.35, 0.8] }],
  'cyberpunk-2077': 'logo-cp77-yellow-en@2x.png',
  'gang-of-frogs': 'GoF_04-3.png',
  'ghostbusters-rise-of-the-ghost-lord': 'gb_meta_store_assets_frozen_empire_logo_fe-1.png',
  'hello-sunshine': 'HelloSunshine_logo.png',
  'jurassic-world-aftermath': ['JurassicWorldAftermath_Collection.png', { luma: [0.25, 0.7] }],
  'lous-lagoon': 'LOU-Logo-4K.png',
  'nba-2k21': 'NBA 2K21 Logo.png',
  'pathfinder-abomination-vaults': 'pav-logo.png',
  'space-pirate-trainer': ['Logo_80s-Dark_HIRES.png', { luma: [0.3, 0.8] }],
  synapse: 'synapse-logo-white.png',
  'the-climb-2': 'the-climb-2-logo-from-site.svg',
  'thick-as-thieves': 'TaT_Logo_Secondary_White.png',
  vaewolf: 'VaewolfLogo-orig.png',
  'walkabout-mini-golf': ['WalkaboutMiniGolf_Logo_2560.png', { luma: [0.45, 0.85] }],
};

mkdirSync(OUT, { recursive: true });
for (const [slug, entry] of Object.entries(LOGOS)) {
  const [file, opts] = Array.isArray(entry) ? entry : [entry, {}];
  const src = sharp(join(RAW, slug, file), { limitInputPixels: false, density: 300 }).ensureAlpha();
  const trimmed = await src.trim({ threshold: 8 }).resize(900, 360, { fit: 'inside', withoutEnlargement: false }).png().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  const rgba = await sharp(trimmed).raw().toBuffer();
  const alpha = Buffer.alloc(width * height);
  for (let i = 0; i < alpha.length; i++) {
    let a = rgba[i * 4 + 3] / 255;
    if (opts.luma) {
      const [lo, hi] = opts.luma;
      const l = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
      a *= Math.min(1, Math.max(0, (l - lo) / (hi - lo)));
    }
    if (opts.tight) a = a < 0.75 ? 0 : 1;
    alpha[i] = Math.round(a * 255);
  }
  const out = join(OUT, `${slug}.png`);
  await sharp({ create: { width, height, channels: 3, background: LIGHT } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(out);
  console.log(`${slug}: ${width}x${height}`);
}
