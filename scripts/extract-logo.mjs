// Extracts the PlayRun logo, icon and wordmark as clean SVGs from the brand manual.
// Source: brand/manual-pages/page-8.svg (secondary applications), navy variant only.
// Geometry comes from the SVG export; every colour is the official value from the brand manual.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'brand/manual-pages/page-8.svg');
const OUT = join(ROOT, 'src/assets/logo');
const PUB = join(ROOT, 'public');

const COLORS = {
  navy: '#0C152A',
  blue: '#516CB3',
  cyan: '#56BDDA',
  green: '#67C18C',
  light: '#E5E7EA',
};

const svg = readFileSync(SRC, 'utf8');
// Navy variant paths, in document order: 7 wordmark letters, 2 icon halves, 11 tagline glyphs.
const re = /<path transform="matrix\(([^)]+)\)" d="([^"]+)" fill="#0c172a"\/>/g;
const raw = [];
for (const m of svg.matchAll(re)) raw.push({ matrix: m[1].split(',').map(Number), d: m[2] });
if (raw.length !== 20) throw new Error(`expected 20 navy paths, found ${raw.length}`);

// Bake transform="matrix(1,0,0,-1,e,f)" into absolute coordinates. Only this form occurs.
function bake(d, [a, b, c, dd, e, f]) {
  if (a !== 1 || b !== 0 || c !== 0 || dd !== -1) throw new Error(`unexpected matrix ${[a, b, c, dd, e, f]}`);
  const tx = (x) => x + e;
  const ty = (y) => -y + f;
  const tokens = d.match(/[MLHVCZmlhvcz]|-?\d*\.?\d+(?:e-?\d+)?/g);
  let out = '';
  let cmd = '';
  let i = 0;
  const pts = [];
  const num = () => Number(tokens[i++]);
  const r = (n) => Math.round(n * 1000) / 1000;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z') {
        out += 'Z';
        continue;
      }
    }
    if (!/^[MLHVC]$/.test(cmd)) throw new Error(`unsupported command ${cmd}`);
    if (cmd === 'M' || cmd === 'L') {
      const x = tx(num()), y = ty(num());
      pts.push([x, y]);
      out += `${cmd}${r(x)} ${r(y)}`;
      if (cmd === 'M') cmd = 'L';
    } else if (cmd === 'H') {
      const x = tx(num());
      pts.push([x, pts.at(-1)[1]]);
      out += `H${r(x)}`;
    } else if (cmd === 'V') {
      const y = ty(num());
      pts.push([pts.at(-1)[0], y]);
      out += `V${r(y)}`;
    } else if (cmd === 'C') {
      const p0 = pts.at(-1);
      const x1 = tx(num()), y1 = ty(num()), x2 = tx(num()), y2 = ty(num()), x = tx(num()), y = ty(num());
      for (let s = 1; s <= 8; s++) {
        const u = s / 8, v = 1 - u;
        pts.push([
          v * v * v * p0[0] + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x,
          v * v * v * p0[1] + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y,
        ]);
      }
      out += `C${r(x1)} ${r(y1)} ${r(x2)} ${r(y2)} ${r(x)} ${r(y)}`;
    }
  }
  return { d: out, pts };
}

const paths = raw.map((p) => bake(p.d, p.matrix));
const groups = {
  wordmark: paths.slice(0, 7),
  icon: paths.slice(7, 9),
  tagline: paths.slice(9, 20),
};

function bbox(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of list)
    for (const [x, y] of p.pts) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const r = (n) => Math.round(n * 1000) / 1000;
const box = (b, pad = 0) => `${r(b.x - pad)} ${r(b.y - pad)} ${r(b.w + pad * 2)} ${r(b.h + pad * 2)}`;
const pathsOf = (list) => list.map((p) => `  <path d="${p.d}"/>`).join('\n');
const gradient = (id, b) =>
  `  <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${r(b.y)}" x2="0" y2="${r(b.y + b.h)}">\n` +
  `    <stop offset="0" stop-color="${COLORS.blue}"/>\n` +
  `    <stop offset="0.5" stop-color="${COLORS.cyan}"/>\n` +
  `    <stop offset="1" stop-color="${COLORS.green}"/>\n` +
  `  </linearGradient>`;

const B = { wordmark: bbox(groups.wordmark), icon: bbox(groups.icon), tagline: bbox(groups.tagline) };
const all = [...groups.icon, ...groups.wordmark, ...groups.tagline];
const Ball = bbox(all);

const files = {};
const head = (vb, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}">\n`;

// Mono parts in currentColor
files['icon.svg'] = head(box(B.icon), 'PlayRun icon') + `<g fill="currentColor">\n${pathsOf(groups.icon)}\n</g>\n</svg>\n`;
files['wordmark.svg'] = head(box(B.wordmark), 'playrun') + `<g fill="currentColor">\n${pathsOf(groups.wordmark)}\n</g>\n</svg>\n`;
files['tagline.svg'] = head(box(B.tagline), 'test experts') + `<g fill="currentColor">\n${pathsOf(groups.tagline)}\n</g>\n</svg>\n`;

// Stacked lock-ups (icon, wordmark, tagline), as on manual pages 7 to 10
const stacked = (fillIcon, fillWord, fillTag, defs = '') =>
  head(box(Ball), 'PlayRun, test experts') +
  (defs ? `<defs>\n${defs}\n</defs>\n` : '') +
  `<g fill="${fillIcon}">\n${pathsOf(groups.icon)}\n</g>\n` +
  `<g fill="${fillWord}">\n${pathsOf(groups.wordmark)}\n</g>\n` +
  `<g fill="${fillTag}">\n${pathsOf(groups.tagline)}\n</g>\n</svg>\n`;
files['logo-positive.svg'] = stacked(COLORS.navy, COLORS.navy, COLORS.navy);
files['logo-negative.svg'] = stacked(COLORS.light, COLORS.light, COLORS.light);
files['logo-mono.svg'] = stacked('currentColor', 'currentColor', 'currentColor');
files['logo-primary.svg'] = stacked('url(#gi)', 'url(#gw)', COLORS.cyan, gradient('gi', B.icon) + '\n' + gradient('gw', B.wordmark));
files['icon-primary.svg'] =
  head(box(B.icon), 'PlayRun icon') + `<defs>\n${gradient('gi', B.icon)}\n</defs>\n<g fill="url(#gi)">\n${pathsOf(groups.icon)}\n</g>\n</svg>\n`;

// Horizontal lock-up for the header: icon left, wordmark right, icon 1.25x the wordmark height, centred on it.
{
  const w = B.wordmark, ic = B.icon;
  const scale = (w.h * 1.25) / ic.h;
  const gap = w.h * 0.4;
  const iconW = ic.w * scale, iconH = ic.h * scale;
  const ix = w.x - gap - iconW;
  const iy = w.y + w.h / 2 - iconH / 2;
  const t = `translate(${r(ix - ic.x * scale)} ${r(iy - ic.y * scale)}) scale(${r(scale)})`;
  const vb = { x: ix, y: Math.min(iy, w.y), w: w.x + w.w - ix, h: Math.max(iconH, w.h) };
  const horizontal = (fillIcon, fillWord, defs = '') =>
    head(box(vb), 'PlayRun') +
    (defs ? `<defs>\n${defs}\n</defs>\n` : '') +
    `<g fill="${fillIcon}" transform="${t}">\n${pathsOf(groups.icon)}\n</g>\n` +
    `<g fill="${fillWord}">\n${pathsOf(groups.wordmark)}\n</g>\n</svg>\n`;
  files['logo-horizontal.svg'] = horizontal('currentColor', 'currentColor');
  files['logo-horizontal-primary.svg'] = horizontal('url(#ghi)', 'url(#ghw)', gradient('ghi', ic) + '\n' + gradient('ghw', w));
}

mkdirSync(OUT, { recursive: true });
for (const [name, content] of Object.entries(files)) writeFileSync(join(OUT, name), content);

// Icon tile: light icon on a navy rounded tile (negative version, as the manual uses on dark grounds).
// Two versions: the detailed tile for 180px and larger (apple-touch-icon), and a simplified favicon
// for 16 to 48px where the icon is drawn larger and its two gaps (the vertical slit and the centre
// diamond) are widened so they stay visible at 16px.
{
  const ic = B.icon;
  const cx = ic.x + ic.w / 2, cy = ic.y + ic.h / 2;
  const tile = (scale, extra = '') => {
    const size = Math.max(ic.w, ic.h) * scale;
    const ox = cx - size / 2, oy = cy - size / 2;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(ox)} ${r(oy)} ${r(size)} ${r(size)}">\n` +
      `  <rect x="${r(ox)}" y="${r(oy)}" width="${r(size)}" height="${r(size)}" rx="${r(size * 0.18)}" fill="${COLORS.navy}"/>\n` +
      `<g fill="${COLORS.light}">\n${pathsOf(groups.icon)}\n</g>\n${extra}</svg>\n`
    );
  };
  writeFileSync(join(OUT, 'icon-tile.svg'), tile(1.5));
  // Simplified: the slit between the halves sits at x = 320.5 to 328.9, the centre diamond spans
  // x 291 to 359 and y 603 to 640. Both are redrawn in navy, wider.
  const slitX = (320.536 + 328.875) / 2;
  const slitW = ic.w * 0.11;
  const dcx = slitX, dcy = (602.762 + 639.735) / 2;
  const dw = 44, dh = 27;
  const extra =
    `  <rect x="${r(slitX - slitW / 2)}" y="${r(ic.y - 2)}" width="${r(slitW)}" height="${r(ic.h + 4)}" fill="${COLORS.navy}"/>\n` +
    `  <polygon points="${r(dcx - dw)},${r(dcy)} ${r(dcx)},${r(dcy - dh)} ${r(dcx + dw)},${r(dcy)} ${r(dcx)},${r(dcy + dh)}" fill="${COLORS.navy}"/>\n`;
  writeFileSync(join(PUB, 'favicon.svg'), tile(1.22, extra));
}

console.log('bboxes', JSON.stringify(B), 'all', JSON.stringify(Ball));
console.log('wrote', Object.keys(files).join(', '), 'and public/favicon.svg');
