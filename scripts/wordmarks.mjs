/**
 * Wordmarks for games whose official logo does not survive one colour and whose press kit has no
 * flat version: the name set in a free (OFL) Google font close to the logo's lettering, rendered
 * white on transparent into .playwright-mcp/logos-raw/<slug>/ for scripts/logos.mjs to process
 * like any logo file. Needs Playwright's Chromium and the network (Google Fonts).
 *
 *   node scripts/wordmarks.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const RAW = '.playwright-mcp/logos-raw';
const MARKS = {
  // Beat Saber's neon lettering is wide, rounded and slanted: Comfortaa, slanted the same way
  'beat-saber': { file: 'BeatSaber_wordmark_Comfortaa.png', text: 'BEAT SABER', family: 'Comfortaa', weight: 600, skew: -12, spacing: '0.02em' },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2400, height: 600 }, deviceScaleFactor: 1 });
for (const [slug, m] of Object.entries(MARKS)) {
  const css = `https://fonts.googleapis.com/css2?family=${m.family.replace(/ /g, '+')}:wght@${m.weight}&display=block`;
  await page.setContent(
    `<html><head><link rel="stylesheet" href="${css}"></head><body style="margin:0;background:transparent">
      <div id="m" style="display:inline-block;padding:40px 60px;font-family:'${m.family}';font-weight:${m.weight};font-size:240px;line-height:1;letter-spacing:${m.spacing};color:#fff;white-space:nowrap;transform:skewX(${m.skew}deg)">${m.text}</div>
    </body></html>`,
    { waitUntil: 'networkidle' },
  );
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(join(RAW, slug), { recursive: true });
  await page.locator('#m').screenshot({ path: join(RAW, slug, m.file), omitBackground: true });
  console.log(`${slug}: ${m.file}`);
}
await browser.close();
