// Builds the raster icons from the extracted SVGs with sharp:
// public/favicon.ico (16, 32, 48 from the simplified favicon), public/apple-touch-icon.png (180, detailed tile),
// public/og.png (1200x630, primary lock-up on navy).
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const NAVY = '#0C152A';

async function png(svgPath, size) {
  return sharp(readFileSync(svgPath), { density: 384 }).resize(size, size).png().toBuffer();
}

// ICO container with PNG-encoded entries.
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = [];
  let offset = 6 + entries.length * 16;
  for (const { size, buf } of entries) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.buf)]);
}

const sizes = [16, 32, 48];
const entries = [];
for (const size of sizes) entries.push({ size, buf: await png('public/favicon.svg', size) });
writeFileSync('public/favicon.ico', ico(entries));

writeFileSync('public/apple-touch-icon.png', await png('src/assets/logo/icon-tile.svg', 180));

const logo = await sharp(readFileSync('src/assets/logo/logo-primary.svg'), { density: 384 })
  .resize({ width: 520 })
  .png()
  .toBuffer();
const meta = await sharp(logo).metadata();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: NAVY } })
  .composite([{ input: logo, left: Math.round((1200 - meta.width) / 2), top: Math.round((630 - meta.height) / 2) }])
  .png()
  .toFile('public/og.png');

console.log('wrote public/favicon.ico, public/apple-touch-icon.png, public/og.png');
