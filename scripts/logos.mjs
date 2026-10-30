/**
 * The game logos, one colour. Reads the official logo files (downloaded from each game's press
 * kit or official page into .playwright-mcp/logos-raw/<slug>/, which is not committed) and writes
 * src/assets/logos/<slug>.png: the logo's own shape, unaltered, filled with the brand light colour
 * on a transparent background, trimmed and sized for the wall. Where no clean official logo
 * exists the game keeps its pixel icon or a wordmark, so it has no entry here.
 *
 *   node scripts/logos.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const RAW = '.playwright-mcp/logos-raw';
const OUT = 'src/assets/logos';
const LIGHT = [229, 231, 234]; // --pr-light
const GHOST = [122, 134, 166]; // a navy-tinted grey, 4.6:1 on navy

// A logo whose shape is its alpha channel needs nothing more. One drawn on a filled badge keeps
// its lettering through luminance: the light parts (over `lo`, fully by `hi`) become the shape.
// `tight` cuts a neon glow back to the letters. `keepBands` keeps only the first n bands of rows
// with content (a subtitle on its own line below is dropped). `tone` paints the bright pixels
// inside a region (fractions of the kept image) in a second colour, so a white shape inside a
// mark still reads once everything is one colour.
const LOGOS = {
  'a-township-tale': 'logo_01.png',
  'beat-saber': ['BSLogo.png', { tight: true }],
  clawpunk: ['ClawPunkLogo_4K.png', { luma: [0.35, 0.8] }],
  'cyberpunk-2077': 'logo-cp77-yellow-en@2x.png',
  'gang-of-frogs': 'GoF_04-3.png',
  'ghostbusters-rise-of-the-ghost-lord': ['gb_meta_store_assets_frozen_empire_logo_fe-1.png', { keepBands: 2, tone: { x: [0.165, 0.29], y: [0, 0.7], over: 0.6, color: GHOST } }],
  'guildford-castle-vr': 'HVR_secondary_white-gold.png',
  'hello-sunshine': 'HelloSunshine_logo.png',
  'jurassic-world-aftermath': ['JurassicWorldAftermath_Collection.png', { keepBands: 1, luma: [0.25, 0.7] }],
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

/** The rows of the image that hold anything, grouped into bands separated by empty rows. */
async function bands(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  const rgba = await sharp(buffer).ensureAlpha().raw().toBuffer();
  const out = [];
  let start = -1;
  for (let y = 0; y <= height; y++) {
    let filled = false;
    if (y < height) for (let x = 0; x < width && !filled; x++) filled = rgba[(y * width + x) * 4 + 3] > 40;
    if (filled && start < 0) start = y;
    if (!filled && start >= 0) {
      out.push([start, y]);
      start = -1;
    }
  }
  return { width, height, bands: out };
}

mkdirSync(OUT, { recursive: true });
for (const [slug, entry] of Object.entries(LOGOS)) {
  const [file, opts] = Array.isArray(entry) ? entry : [entry, {}];
  let src = await sharp(join(RAW, slug, file), { limitInputPixels: false, density: 300 }).ensureAlpha().png().toBuffer();
  if (opts.keepBands) {
    const b = await bands(src);
    const bottom = b.bands[opts.keepBands - 1][1];
    src = await sharp(src).extract({ left: 0, top: 0, width: b.width, height: bottom }).png().toBuffer();
  }
  const trimmed = await sharp(src).trim({ threshold: 8 }).resize(900, 360, { fit: 'inside', withoutEnlargement: false }).png().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  const rgba = await sharp(trimmed).raw().toBuffer();
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let a = rgba[i * 4 + 3] / 255;
    const l = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
    if (opts.luma) {
      const [lo, hi] = opts.luma;
      a *= Math.min(1, Math.max(0, (l - lo) / (hi - lo)));
    }
    if (opts.tight) a = a < 0.75 ? 0 : 1;
    let color = LIGHT;
    if (opts.tone) {
      const x = (i % width) / width;
      const y = Math.floor(i / width) / height;
      const t = opts.tone;
      if (x >= t.x[0] && x <= t.x[1] && y >= t.y[0] && y <= t.y[1] && l > t.over) color = t.color;
    }
    out[i * 4] = color[0];
    out[i * 4 + 1] = color[1];
    out[i * 4 + 2] = color[2];
    out[i * 4 + 3] = Math.round(a * 255);
  }
  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(join(OUT, `${slug}.png`));
  console.log(`${slug}: ${width}x${height}`);
}
