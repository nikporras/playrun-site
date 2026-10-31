// Builds the social card, public/og.png (1200x630), in the site's pixel style: the navy field with
// its faint grid and a few stars, the hero photo, the name in Pixel Operator and the work in one
// line. Rendered by Chromium (Playwright) so the card uses the site's own fonts. Run from the
// project root: node scripts/og-card.mjs
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();
const file = (p) => pathToFileURL(path.join(root, p)).href;
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Pixel Operator'; src: url('${file('public/fonts/PixelOperator.woff2')}') format('woff2'); }
  @font-face { font-family: 'Montserrat'; font-style: italic; src: url('${file('node_modules/@fontsource/montserrat/files/montserrat-latin-400-italic.woff2')}') format('woff2'); }
  html, body { margin: 0; }
  .card { position: relative; width: 1200px; height: 630px; overflow: hidden; background-color: #0C152A;
    background-image: linear-gradient(rgba(229,231,234,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(229,231,234,0.05) 1px, transparent 1px);
    background-size: 32px 32px; font-family: 'Pixel Operator', monospace; color: #E5E7EA; }
  .star { position: absolute; width: 4px; height: 4px; background: #E5E7EA; opacity: 0.5; }
  .glow { position: absolute; right: 30px; bottom: -40px; width: 620px; height: 620px; border-radius: 50%;
    background: radial-gradient(closest-side, rgba(86,189,218,0.28), rgba(86,189,218,0) 72%); }
  .photo { position: absolute; right: 40px; bottom: 0; height: 560px;
    -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 70%, transparent 100%); mask-image: linear-gradient(to bottom, #000 0%, #000 70%, transparent 100%); }
  .text { position: absolute; left: 80px; top: 50%; transform: translateY(-50%); width: 640px; }
  .flag { display: flex; align-items: center; gap: 16px; font-size: 24px; letter-spacing: 0.18em; text-transform: uppercase; color: #56BDDA; }
  .flag::before { content: ''; width: 40px; height: 4px; background: #67C18C; }
  h1 { margin: 28px 0 0; font-size: 112px; line-height: 0.95; font-weight: 400; letter-spacing: -0.01em; }
  .work { margin: 28px 0 0; font-size: 44px; line-height: 1; color: #56BDDA; }
  .url { margin-top: 44px; font-family: 'Montserrat', sans-serif; font-style: italic; font-size: 26px; color: #aab3c5; }
  .floor { position: absolute; left: 0; right: 0; bottom: 0; height: 12px;
    background: repeating-linear-gradient(90deg, #67C18C 0 12px, #4b9a6c 12px 24px); }
</style></head><body>
<div class="card">
  ${[[60, 40], [210, 92], [430, 30], [610, 120], [980, 44], [1130, 150], [820, 70], [330, 560], [90, 520]].map(([x, y]) => `<i class="star" style="left:${x}px;top:${y}px"></i>`).join('')}
  <div class="glow"></div>
  <img class="photo" src="${file('src/assets/photos/nicolas.png')}" alt="">
  <div class="text">
    <div class="flag">PlayRun</div>
    <h1>Nicolás<br>Porras</h1>
    <p class="work">Game QA Tester, London</p>
    <p class="url">playrunqa.com</p>
  </div>
  <div class="floor"></div>
</div>
</body></html>`;

mkdirSync('.playwright-mcp', { recursive: true });
const page = path.join(root, '.playwright-mcp', 'og-card.html');
writeFileSync(page, html);
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await tab.goto(pathToFileURL(page).href);
await tab.evaluate(() => document.fonts.ready);
await tab.waitForTimeout(200);
const shot = await tab.locator('.card').screenshot();
await browser.close();
// (a palette PNG: a fraction of the size, the same look)
await sharp(shot).png({ palette: true, quality: 92, compressionLevel: 9 }).toFile('public/og.png');
console.log('wrote public/og.png');
