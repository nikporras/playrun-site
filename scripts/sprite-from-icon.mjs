// Prints the logo icon as pixel bitmaps at small sizes so the runner sprite can be drawn from it.
// Usage: node scripts/sprite-from-icon.mjs [widths...]
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('src/assets/logo/icon.svg', 'utf8').replace('currentColor', '#000');
const widths = process.argv.slice(2).map(Number);
for (const w of widths.length ? widths : [16, 20, 24]) {
  const h = Math.round((w * 153.163) / 191.04);
  const { data, info } = await sharp(Buffer.from(svg), { density: 600 })
    .resize(w, h, { fit: 'fill', kernel: 'lanczos3' })
    .flatten({ background: '#fff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  console.log(`\n${w}x${h}`);
  for (let y = 0; y < info.height; y++) {
    let row = '';
    for (let x = 0; x < info.width; x++) row += data[y * info.width + x] < 128 ? '#' : '.';
    console.log(row);
  }
}
