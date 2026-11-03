import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * Every bug can be seen: on every page that has them, at a phone's width, a tablet's and two
 * desktops', with motion on and off, and at three points along its walk. Brought to the middle of
 * the screen, each bug is wholly on screen and inside its own level (which clips what overflows it),
 * the top element at its centre is the bug itself, it is clear of the header, the rail and its
 * markers, the scoreboard and the bottom bar, and what lies behind its body (read from a screenshot
 * with the bug hidden) stands at least 3:1 against the body's colour for most of its area.
 */
const PAGES = ['/', '/about/', '/skills/', '/portfolio/', '/quality/', '/contact/'];

const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const rgb = (c: string) => (c.startsWith('color(') ? (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => Math.round(Number(v) * 255)) : (c.match(/\d+/g) ?? []).slice(0, 3).map(Number));

async function audit(page: Page, path: string) {
  const out: string[] = [];
  const ids = await page.locator('[data-bug]').evaluateAll((els) => els.filter((e) => !(e as HTMLElement).hidden && e.getClientRects().length).map((e) => (e as HTMLElement).dataset.bug!));
  expect(ids.length, `${path}: bugs to find`).toBeGreaterThan(0);
  for (const id of ids) {
    const bug = page.locator(`[data-bug="${id}"]`);
    const walk = await bug.evaluate((b) => {
      const w = b.getAnimations().find((a) => (a as CSSAnimation).animationName === 'bug-walk');
      b.getAnimations().forEach((a) => a.pause());
      return w ? Number(w.effect?.getComputedTiming().duration ?? 0) : 0;
    });
    for (const share of walk ? [0, 0.5, 1] : [0]) {
      const at = `${path} ${id}${walk ? ` at ${share * 100}% of its walk` : ''}`;
      const geo = await bug.evaluate((b, [share, walk]) => {
        const w = b.getAnimations().find((a) => (a as CSSAnimation).animationName === 'bug-walk');
        if (w) w.currentTime = share * walk;
        b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect();
        const body = b.querySelector('.bug__body .sprite')!.getBoundingClientRect();
        const level = b.closest('.level')!.getBoundingClientRect();
        const cx = body.left + body.width / 2;
        const cy = body.top + body.height / 2;
        const top = document.elementFromPoint(cx, cy);
        // the fixed parts of the page a bug must never be under
        const ui = [...document.querySelectorAll<HTMLElement>('header, #dock .score__pill, .tabbar, #hud .hud__runner, #hud .hud__levels li span')]
          .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
          .map((e) => ({ name: `${e.tagName}.${String(e.className).split(' ')[0]}`, r: e.getBoundingClientRect() }));
        // and the bar mode's line, or the desktop rail's column
        const hud = document.querySelector<HTMLElement>('#hud');
        if (hud && hud.getClientRects().length) ui.push({ name: 'the level track', r: hud.getBoundingClientRect() });
        const over = ui.filter(({ r: u }) => body.left < u.right && body.right > u.left && body.top < u.bottom && body.bottom > u.top).map((u) => u.name);
        return {
          onScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          inLevel: body.left >= level.left && body.right <= level.right && body.top >= level.top && body.bottom <= level.bottom,
          hit: !!top?.closest(`[data-bug="${b.dataset.bug}"]`),
          what: top ? `${top.tagName}.${String(top.getAttribute('class') ?? '').split(' ')[0]}` : 'nothing',
          over,
          box: { x: body.left, y: body.top, width: body.width, height: body.height },
          fill: getComputedStyle(b.querySelector('.px-body')!).fill,
        };
      }, [share, walk] as const);
      if (!geo.onScreen) out.push(`${at}: off screen`);
      if (!geo.inLevel) out.push(`${at}: clipped by its level`);
      if (!geo.hit) out.push(`${at}: covered by ${geo.what}`);
      if (geo.over.length) out.push(`${at}: under ${geo.over.join(', ')}`);
      // what is behind the body, with the bug (and any label beside it) hidden
      await bug.evaluate((b) => (b.style.visibility = 'hidden'));
      const png = await page.screenshot({ clip: geo.box });
      await bug.evaluate((b) => (b.style.visibility = ''));
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      const body = rgb(geo.fill);
      let ok = 0;
      let all = 0;
      for (let i = 0; i < data.length; i += info.channels, all++) if (contrast(body, [data[i], data[i + 1], data[i + 2]]) >= 3) ok++;
      let m = [0, 0, 0];
      for (let i = 0; i < data.length; i += info.channels) m = [m[0] + data[i], m[1] + data[i + 1], m[2] + data[i + 2]];
      m = m.map((v) => Math.round(v / all));
      if (ok / all < 0.85) out.push(`${at}: only ${Math.round((ok / all) * 100)}% of what is behind it stands 3:1 against its body (body ${body}, behind ${m}, box ${Math.round(geo.box.x)},${Math.round(geo.box.y)})`);
    }
  }
  return out;
}

for (const width of [375, 768, 1280, 1920]) {
  for (const motion of ['on', 'off']) {
    test(`every bug is in plain view at ${width}px with motion ${motion}: on screen, inside its level, on top, clear of the HUD, standing out from what is behind it`, async ({ browser }) => {
      test.setTimeout(180_000);
      const phone = width < 768;
      const context = await browser.newContext({ viewport: { width, height: phone ? 812 : 900 }, isMobile: phone, hasTouch: phone });
      const page = await context.newPage();
      await page.addInitScript((m) => {
        localStorage.setItem('playrun.motion', m);
        sessionStorage.setItem('playrun.taphint', 'shown');
      }, motion);
      const problems: string[] = [];
      for (const path of PAGES) {
        await page.goto(path);
        await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; } .bug__anchor, [data-toast] { display: none !important; }' });
        await page.evaluate(() => document.fonts.ready);
        // (the entrances done, so nothing is still rising into place)
        await page.evaluate(() => {
          document.querySelectorAll('[data-enter]').forEach((e) => e.classList.add('is-in'));
          return Promise.all(document.getAnimations().filter((a) => a.timeline instanceof DocumentTimeline && a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null)));
        });
        problems.push(...(await audit(page, path)));
      }
      expect(problems).toEqual([]);
      await context.close();
    });
  }
}
