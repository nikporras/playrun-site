// Renders public/favicon.svg at 16 and 32 px (real size and an 8x pixel-exact enlargement)
// so the gaps in the icon can be judged. Usage: node scripts/favicon-check.mjs <outDir> [svgPath]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2];
const svgPath = process.argv[3] || 'public/favicon.svg';
const svg = readFileSync(svgPath, 'utf8');
const data = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

const html = `<!doctype html><html><body style="margin:0;background:#fff;font:12px Arial">
<div style="display:flex;gap:24px;padding:16px;align-items:flex-end">
  <div>16px<br><img id="a" src="${data}" width="16" height="16"></div>
  <div>32px<br><img id="b" src="${data}" width="32" height="32"></div>
  <div>16px on dark<br><span style="display:inline-block;background:#0C152A;padding:4px"><img src="${data}" width="16" height="16"></span></div>
</div>
<canvas id="c16" width="128" height="128" style="image-rendering:pixelated;margin:16px"></canvas>
<canvas id="c32" width="256" height="256" style="image-rendering:pixelated;margin:16px"></canvas>
<script>
  const img = document.getElementById('a');
  img.decode().then(() => {
    for (const [id, s] of [['c16', 16], ['c32', 32]]) {
      const c = document.getElementById(id); const ctx = c.getContext('2d');
      const off = document.createElement('canvas'); off.width = s; off.height = s;
      const o = off.getContext('2d'); o.drawImage(img, 0, 0, s, s);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(off, 0, 0, c.width, c.height);
    }
    document.body.dataset.ready = '1';
  });
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 400 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.waitForSelector('body[data-ready]');
await page.screenshot({ path: join(outDir, 'favicon-check.png') });
await browser.close();
console.log('wrote', join(outDir, 'favicon-check.png'));
