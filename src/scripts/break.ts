/**
 * The hero's exit. As Level 2 slides up over the pinned hero, the hero fades in step with it (gone
 * just before it is covered), and the name breaks into its own font pixels, tied to the scroll:
 * they fall, pass over the clouds and land on the tops of the letters of the next title ("Games
 * I've tested"), shrinking to that title's own pixel size, a small heap of them settling there like
 * on a platform while the rest fade out on the way down. Once they have all landed the heap is
 * drawn once on a small canvas inside Level 2, so it scrolls with the title and nothing is redrawn.
 * Scrolling back up flies them home and the name is whole again. The falling pixels are a visual
 * copy drawn on one canvas fixed over the screen (click-through), so the real h1 stays in the DOM
 * for screen readers and selection and only fades while the copy is up; nothing is ever drawn
 * below the tops of the title's letters.
 *
 * It costs little on scroll: every position is measured when the page is laid out (and again when
 * it changes size), a frame works the rest out from the scroll position, never reads the layout,
 * draws only inside requestAnimationFrame and clears only what it drew; the hero fades on its own
 * layer.
 *
 * A tracker ticket pops when the break starts ("Open", with "Scroll back up to fix"). The first
 * time in a visit it docks (bottom left on a desktop, the lower third on a phone) and stays until
 * the name is whole again, then shows "Fixed" for three seconds and leaves; later breaks show it
 * for three seconds beside the name. A Dismiss button closes it (that counts as done). Wherever it
 * is, it moves out of the way of a heading, a button, a form field or the scoreboard passing
 * underneath, and hides while there is no clear place. Its content is decorative and hidden from
 * assistive tech; the button is a real button. Off without script, under reduced motion and with
 * the games off.
 */
type Cell = { x: number; y: number; d: number; vx: number; spin: number; slot: number; fade: number };
type Box = { left: number; top: number; right: number; bottom: number };

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (k: number) => k * k; // the fall gathers speed
const SHOW_MS = 3000;
const KEY = 'playrun.ticket';
const seen = () => {
  try {
    return sessionStorage.getItem(KEY) === 'done';
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    sessionStorage.setItem(KEY, 'done');
  } catch {
    /* storage off: the docked ticket comes back on the next visit to Home */
  }
};

export function startBreak() {
  const hero = document.querySelector<HTMLElement>('.hero');
  const wall = document.querySelector<HTMLElement>('.wall');
  const name = hero?.querySelector<HTMLElement>('.hero__name');
  const h1 = hero?.querySelector<HTMLElement>('.hero__title');
  const title = wall?.querySelector<HTMLElement>('.wall__title');
  const flag = wall?.querySelector<HTMLElement>('.flag');
  const canvas = document.querySelector<HTMLCanvasElement>('.hero__break');
  const heap = document.querySelector<HTMLCanvasElement>('.wall__heap');
  const ticket = document.querySelector<HTMLElement>('.hero__ticket');
  const status = ticket?.querySelector<HTMLElement>('[data-ticket-status]');
  const dismiss = ticket?.querySelector<HTMLButtonElement>('[data-ticket-close]');
  if (!hero || !wall || !name || !h1 || !title || !canvas || !heap || !ticket || !status || !dismiss) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  const hctx = heap.getContext('2d');
  if (!ctx || !hctx) return;
  const html = document.documentElement;
  const phone = matchMedia('(max-width: 47.99rem)');
  const off = () => html.classList.contains('games-off');
  const dpr = Math.min(2, devicePixelRatio || 1);

  // ---- Geometry, measured when the page is laid out; a frame only adds the scroll position.
  let heroDoc = 0; // where the hero sits in the page before it pins
  let heroH = 0;
  let pinTop = 0; // its sticky top (negative when it pins by its foot)
  let wallDoc = 0;
  let band = 0;
  let h1Off = { x: 0, y: 0 }; // the h1 inside the hero
  let nameBox: Box = { left: 0, top: 0, right: 0, bottom: 0 }; // inside the hero
  let titleDoc = { x: 0, y: 0 };
  let vw = innerWidth;
  let vh = innerHeight;
  let barTop = innerHeight; // the phone's bottom bar
  let obstacles: Box[] = []; // in the page: headings, buttons, fields after the hero
  let fixedObstacles: Box[] = []; // on the screen: the scoreboard, the bar
  const measure = () => {
    vw = innerWidth;
    vh = innerHeight;
    const y = scrollY;
    const w = wall.getBoundingClientRect();
    const hr = hero.getBoundingClientRect();
    wallDoc = w.top + y;
    heroH = hero.offsetHeight;
    heroDoc = wallDoc - heroH;
    pinTop = parseFloat(getComputedStyle(hero).top) || 0;
    band = (wall.querySelector('.join--top') as HTMLElement | null)?.offsetHeight ?? 0;
    const r = h1.getBoundingClientRect();
    h1Off = { x: r.left, y: r.top - hr.top };
    const n = name.getBoundingClientRect();
    nameBox = { left: n.left, top: n.top - hr.top, right: n.right, bottom: n.bottom - hr.top };
    const t = title.getBoundingClientRect();
    titleDoc = { x: t.left, y: t.top + y };
    barTop = document.querySelector('.tabbar')?.getBoundingClientRect().top ?? vh;
    if (barTop <= 0) barTop = vh;
    obstacles = Array.from(document.querySelectorAll<HTMLElement>('main :is(h1, h2, h3, .button, button, input, textarea, select)'))
      .filter((el) => !el.closest('.hero, .bug, .hero__ticket') && el.getClientRects().length)
      .map((el) => {
        // by the layout, not the box on screen: an entrance may still be moving it
        let left = 0;
        let top = 0;
        for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
          left += n.offsetLeft;
          top += n.offsetTop;
        }
        return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
      });
    fixedObstacles = Array.from(document.querySelectorAll<HTMLElement>('.score__pill, .tabbar, .toast.is-in'))
      .filter((el) => el.getClientRects().length)
      .map((el) => {
        const b = el.getBoundingClientRect();
        return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      });
    if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) {
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      drawn = null;
    }
  };
  const heroTopAt = (y: number) => Math.max(heroDoc - y, pinTop);

  // ---- The pixels
  let cells: Cell[] = [];
  // where the heap lands, as offsets from the title's top left corner, in the title's pixels
  let slots: { x: number; y: number }[] = [];
  let cell = 10;
  let small = 4;
  let lift = 0; // the letters' tops, below the title's top edge
  let fill = '#e5e7ea';
  let sampled = false;

  // Sample the heading: draw the same lines with the same font on an offscreen canvas and keep
  // every filled cell of the font's own grid (Pixel Operator is drawn on 16 units per em). Then lay
  // out the heap on the title's first line, clear of the label above it. Once, and again on resize.
  const sample = () => {
    const r = h1.getBoundingClientRect();
    const cs = getComputedStyle(h1);
    const size = parseFloat(cs.fontSize);
    fill = cs.color;
    cell = size / 16;
    const W = Math.ceil(r.width);
    const H = Math.ceil(r.height);
    const sheet = document.createElement('canvas');
    sheet.width = W;
    sheet.height = H;
    const o = sheet.getContext('2d')!;
    o.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    o.textBaseline = 'alphabetic';
    o.fillStyle = '#fff';
    for (const line of h1.querySelectorAll<HTMLElement>('.hero__line')) {
      const lr = line.getBoundingClientRect();
      const top = lr.top - r.top + (lr.height - size) / 2;
      // the baseline of a Pixel Operator line sits 13/16 of the em below the top of the glyph box
      o.fillText(line.textContent ?? '', lr.left - r.left, top + size * 0.8125);
    }
    const data = o.getImageData(0, 0, W, H).data;
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    cells = [];
    for (let y = 0; y + cell <= H + 1; y += cell) {
      for (let x = 0; x + cell <= W + 1; x += cell) {
        const px = Math.min(W - 1, Math.round(x + cell / 2));
        const py = Math.min(H - 1, Math.round(y + cell / 2));
        if (data[(py * W + px) * 4 + 3] > 128) cells.push({ x, y, d: rand() * 0.35, vx: (rand() - 0.5) * 0.5, spin: (rand() - 0.5) * 5, slot: -1, fade: 0.25 + rand() * 0.3 });
      }
    }

    // The heap: the title's own pixel size, along its first line of text (past the label above it
    // if the label sits close); a low mound one to three pixels high, a gap here and there.
    const t = title.getBoundingClientRect();
    const ts = getComputedStyle(title);
    const tsize = parseFloat(ts.fontSize);
    small = Math.max(3, Math.round(tsize / 16));
    const range = document.createRange();
    range.selectNodeContents(title);
    const first = range.getClientRects()[0] ?? t;
    // the tops of the letters on that line, the platform itself: drawn offscreen as above, the
    // first row with ink in it
    const glyphs = document.createElement('canvas');
    glyphs.width = Math.max(1, Math.ceil(first.width));
    glyphs.height = Math.max(1, Math.ceil(first.height));
    const g = glyphs.getContext('2d')!;
    g.font = `${ts.fontWeight} ${tsize}px ${ts.fontFamily}`;
    g.textBaseline = 'alphabetic';
    g.fillText((title.textContent ?? '').trim(), 0, (glyphs.height - tsize) / 2 + tsize * 0.8125);
    const ink = g.getImageData(0, 0, glyphs.width, glyphs.height).data;
    let inkTop = 0;
    while (inkTop < glyphs.height - 1 && !Array.from({ length: glyphs.width }, (_, x) => ink[(inkTop * glyphs.width + x) * 4 + 3]).some((a) => a > 128)) inkTop++;
    lift = first.top + inkTop - t.top;
    // (under the label only where the gap between them is taller than the heap; the label is
    // measured by its place in the layout, as its entrance may still be moving it)
    const roomy = !flag || title.offsetTop + lift - (flag.offsetTop + flag.offsetHeight) > 5 * small;
    const past = flag ? flag.offsetLeft + flag.offsetWidth - title.offsetLeft + 2 * small : 0;
    const from = Math.max(first.left - t.left, roomy ? 0 : past);
    const to = first.right - t.left;
    const cols = Math.max(0, Math.floor((to - from) / small));
    slots = [];
    for (let c = 0; c < cols; c++) {
      const k = cols > 1 ? c / (cols - 1) : 0.5;
      const h = rand() < 0.12 ? 0 : Math.max(1, Math.min(3, Math.round(1 + 2 * Math.sin(Math.PI * k) + (rand() - 0.5))));
      for (let row = 0; row < h; row++) slots.push({ x: from + c * small, y: lift - (row + 1) * small });
    }
    // which cells land (and where), the rest fade out on the way down
    const order = cells.map((_, i) => i).sort(() => rand() - 0.5);
    order.forEach((ci, k) => (cells[ci].slot = k < slots.length ? k : -1));

    // the settled heap, drawn once on its own canvas over the title's top edge, inside Level 2
    const w = wall.getBoundingClientRect();
    const hh = 3 * small + 2;
    heap.width = Math.round(Math.max(1, to) * dpr);
    heap.height = Math.round(hh * dpr);
    heap.style.width = `${Math.max(1, to)}px`;
    heap.style.height = `${hh}px`;
    heap.style.left = `${t.left - w.left}px`;
    heap.style.top = `${t.top - w.top + lift - hh}px`;
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hctx.clearRect(0, 0, to, hh);
    hctx.fillStyle = fill;
    for (const s of slots) hctx.fillRect(s.x, s.y - lift + hh, small, small);
    sampled = true;
  };

  // How far Level 2 has covered the hero, 0 to 1, on screen: its edge is the middle of its band of
  // clouds (the band above that line is see-through).
  const coveredAt = (y: number) => {
    const ht = heroTopAt(y);
    const top = Math.max(ht, 0);
    const bottom = Math.min(ht + heroH, vh);
    if (bottom - top < 1) return 1;
    const edge = wallDoc - y + band / 2;
    return clamp((bottom - edge) / (bottom - top));
  };
  // The fade ends just before the hero is covered; the pixels land a little earlier still.
  const fadeOf = (q: number) => clamp(q / 0.9);
  const progressOf = (q: number) => clamp(q / 0.75);

  // What the last frame drew, so the next clears only that.
  let drawn: Box | null = null;
  const render = (p: number, y: number) => {
    if (drawn) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(Math.floor(drawn.left * dpr) - 2, Math.floor(drawn.top * dpr) - 2, Math.ceil((drawn.right - drawn.left) * dpr) + 4, Math.ceil((drawn.bottom - drawn.top) * dpr) + 4);
    }
    ctx.fillStyle = fill;
    const rx = h1Off.x;
    const ry = heroTopAt(y) + h1Off.y;
    const tx0 = titleDoc.x;
    const ty0 = titleDoc.y - y;
    const floor = ty0 + lift; // nothing goes below the tops of its letters
    let box: Box | null = null;
    for (const c of cells) {
      const s = ease(clamp((p - c.d) / (1 - c.d)));
      const sx = rx + c.x;
      const sy = ry + c.y;
      let x: number;
      let y2: number;
      let rot: number;
      let alpha = 1;
      const size = cell + (small - cell) * s;
      if (c.slot >= 0) {
        // a lander: from its place in the name to its place on the heap, shrinking, turning as it
        // falls and settling square
        const slot = slots[c.slot];
        x = sx + (tx0 + slot.x - sx) * s + c.vx * 120 * Math.sin(Math.PI * s);
        y2 = sy + (ty0 + slot.y - sy) * s;
        rot = c.spin * Math.sin(Math.PI * s);
      } else {
        // the rest drop towards the title and are gone before they reach it
        x = sx + c.vx * 240 * s;
        y2 = sy + (floor - 40 - sy) * s;
        rot = c.spin * s;
        alpha = 1 - clamp(s / c.fade);
        if (alpha <= 0) continue;
      }
      y2 = Math.min(y2, floor - size);
      if (y2 > vh || y2 + size < 0) continue;
      ctx.globalAlpha = alpha;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * (x + size / 2), dpr * (y2 + size / 2));
      ctx.fillRect(-size / 2, -size / 2, size, size);
      const reach = size; // a turned square stays inside a box twice its half-diagonal
      if (!box) box = { left: x - reach, top: y2 - reach, right: x + size + reach, bottom: y2 + size + reach };
      else {
        box.left = Math.min(box.left, x - reach);
        box.top = Math.min(box.top, y2 - reach);
        box.right = Math.max(box.right, x + size + reach);
        box.bottom = Math.max(box.bottom, y2 + size + reach);
      }
    }
    ctx.globalAlpha = 1;
    drawn = box;
  };
  const clearAll = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawn = null;
  };

  // ---- The ticket
  let wanted = false; // it should be on show (it hides while there is no clear place)
  let docked = false; // the first appearance of the visit, waiting for the fix
  let timer = 0;
  let size = { w: 288, h: 160 };
  let at = { left: -1, top: -1 };
  const overlaps = (a: Box, b: Box, pad = 8) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
  // the places it may stand, best first
  const candidates = (y: number): { left: number; top: number }[] => {
    const { w, h } = size;
    if (phone.matches) {
      const left = Math.max(8, (vw - w) / 2);
      return [
        { left, top: barTop - 40 - h },
        { left, top: 16 },
      ];
    }
    const margin = Math.max(48, Math.min(96, vw * 0.05));
    const low = { left: margin, top: vh - 24 - h };
    const docks = [low, { left: margin, top: 88 }, { left: vw - margin - w - 220, top: vh - 24 - h }];
    if (docked) return docks;
    const ht = heroTopAt(y);
    return [{ left: Math.max(16, Math.min(nameBox.right + 32, vw - w - 16)), top: Math.max(16, Math.min(ht + nameBox.top + 8, vh - 200)) }, ...docks];
  };
  const clearAt = (c: { left: number; top: number }, y: number) => {
    const b = { left: c.left, top: c.top, right: c.left + size.w, bottom: c.top + size.h };
    if (b.top < 0 || b.bottom > vh) return false;
    const ht = heroTopAt(y);
    const h1Box = { left: h1Off.x, top: ht + h1Off.y, right: nameBox.right, bottom: ht + nameBox.bottom };
    if (heroTopAt(y) + heroH > 0 && overlaps(b, h1Box)) return false;
    for (const o of obstacles) if (overlaps(b, { left: o.left, top: o.top - y, right: o.right, bottom: o.bottom - y })) return false;
    for (const o of fixedObstacles) if (overlaps(b, o)) return false;
    return true;
  };
  // Find a clear place for it this frame; hide it while there is none.
  const place = (y: number) => {
    if (!wanted) return;
    const spot = candidates(y).find((c) => clearAt(c, y));
    if (!spot) {
      ticket.classList.remove('is-in');
      return;
    }
    if (spot.left !== at.left || spot.top !== at.top) {
      at = spot;
      ticket.style.left = `${Math.round(spot.left)}px`;
      ticket.style.top = `${Math.round(spot.top)}px`;
    }
    ticket.classList.add('is-in');
  };
  const hide = () => {
    wanted = false;
    window.clearTimeout(timer);
    ticket.classList.remove('is-in');
  };
  const show = (state: 'open' | 'fixed') => {
    window.clearTimeout(timer);
    if (state === 'open' && !seen()) docked = true;
    ticket.hidden = false;
    ticket.dataset.status = state;
    ticket.classList.toggle('is-docked', docked);
    status.textContent = state === 'open' ? 'Open' : 'Fixed';
    // its size for the places it may take (read once, as it appears)
    size = { w: ticket.offsetWidth || 288, h: ticket.offsetHeight || 160 };
    at = { left: -1, top: -1 };
    wanted = true;
    measure();
    place(scrollY);
    if (state === 'fixed') {
      if (docked) markSeen();
      docked = false;
      timer = window.setTimeout(hide, SHOW_MS);
    } else if (!docked) {
      timer = window.setTimeout(hide, SHOW_MS);
    }
  };
  let dismissed = false; // closed by hand: quiet until the next break
  dismiss.addEventListener('click', () => {
    markSeen();
    docked = false;
    dismissed = true;
    hide();
  });

  // ---- The frame
  let broken = false;
  let armed = false;
  let last = -1;
  let lastFade = -1;
  let settled = false;
  const update = () => {
    if (off()) {
      // games off: the hero simply goes behind, the name stays whole
      hero.style.opacity = '';
      lastFade = -1;
      canvas.hidden = true;
      heap.hidden = true;
      h1.classList.remove('is-broken');
      broken = false;
      last = -1;
      settled = false;
      docked = false;
      hide();
      return;
    }
    const y = scrollY;
    const q = coveredAt(y);
    const fade = Math.round(fadeOf(q) * 1000) / 1000;
    if (fade !== lastFade) {
      lastFade = fade;
      hero.style.opacity = String(1 - fade);
    }
    const p = progressOf(q);
    if (p > 0) {
      if (!sampled) sample();
      if (p === 1) {
        // all landed: the heap rides on the title by itself
        if (!settled) {
          settled = true;
          clearAll();
          canvas.hidden = true;
          heap.hidden = false;
        }
      } else {
        if (settled || canvas.hidden) {
          settled = false;
          heap.hidden = true;
          canvas.hidden = false;
        }
        if (p !== last) render(p, y);
      }
      h1.classList.add('is-broken');
    } else if (!canvas.hidden || settled || h1.classList.contains('is-broken')) {
      clearAll();
      canvas.hidden = true;
      heap.hidden = true;
      settled = false;
      h1.classList.remove('is-broken');
    }
    last = p;
    if (!broken && p > 0.04) {
      broken = true;
      dismissed = false;
      if (armed) show('open');
    } else if (broken && p < 0.004) {
      broken = false;
      if (armed && !dismissed) show('fixed');
    }
    if (wanted) place(y);
  };

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };
  const relayout = () => {
    measure();
    if (sampled) sample();
    last = -1;
    drawn = null;
    clearAll();
    queue();
  };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', relayout);
  if ('ResizeObserver' in window) {
    let pending = false;
    new ResizeObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        relayout();
      });
    }).observe(document.body);
  }
  // the games switch on the scoreboard
  new MutationObserver(queue).observe(html, { attributes: true, attributeFilter: ['class'] });
  document.fonts.ready.then(() => {
    measure();
    // A page that opens part way down starts broken, with no ticket for a break nobody saw.
    broken = !off() && progressOf(coveredAt(scrollY)) > 0.04;
    armed = true;
    update();
  });
}
