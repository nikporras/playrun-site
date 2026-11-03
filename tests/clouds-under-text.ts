import type { Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * On a desktop's Home, how far below "More about me" the clouds of Level 2 begin, read from a
 * screenshot of the strip under the hero's paragraph (the first row with cloud pixels, not the navy
 * sky or its faint grid), and whether anything covers the hero's text: the element at the foot of
 * each line of the paragraph and of the link must be the text itself.
 */
export async function cloudsUnderText(page: Page) {
  const m = await page.evaluate(() => {
    const link = document.querySelector('.hero__value a')!.getBoundingClientRect();
    const para = document.querySelector('.hero__value')!.getBoundingClientRect();
    const covered: string[] = [];
    for (const el of [document.querySelector('.hero__value a')!, document.querySelector('.hero__value')!, document.querySelector('.hero__post')!, document.querySelector('.hero__title')!]) {
      const r = el.getBoundingClientRect();
      for (const x of [r.left + 4, r.left + r.width / 2, r.right - 4]) {
        const top = document.elementFromPoint(x, r.bottom - 3);
        if (top && !el.contains(top) && !top.contains(el)) covered.push(`${el.className} at ${Math.round(x)}: ${top.tagName}.${String(top.getAttribute('class') ?? '').split(' ')[0]}`);
      }
    }
    return { link: link.bottom, left: para.left, right: para.right, covered };
  });
  const y0 = Math.round(m.link);
  const png = await page.screenshot({ clip: { x: Math.round(m.left), y: y0, width: Math.round(m.right - m.left), height: 160 } });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let first = -1;
  // (from 3px down: the link's own underline ends the box)
  for (let y = 3; y < info.height && first < 0; y++) {
    let n = 0;
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (Math.abs(data[i] - 12) + Math.abs(data[i + 1] - 21) + Math.abs(data[i + 2] - 42) > 90) n++;
    }
    if (n > 8) first = y;
  }
  return { first, covered: m.covered };
}
