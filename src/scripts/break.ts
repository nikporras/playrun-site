/**
 * The hero's exit. As Level 2 slides up over the pinned hero, the hero fades in step with it (gone
 * just before it is covered), and the name breaks into its own font pixels, tied to the scroll:
 * they fall, pass over the clouds and land on the top edge of the next title ("Games I've
 * tested"), shrinking to that title's own pixel size, a small heap of them settling there like on
 * a platform while the rest fade out on the way down; they stay on the title while it is on
 * screen. Scrolling back up flies them home and the name is whole again. The pixels are a visual
 * copy drawn on one canvas fixed over the screen (click-through), so the real h1 stays in the DOM
 * for screen readers and selection and only fades while the copy is up, and nothing is ever drawn
 * below the tops of the title's letters.
 *
 * A tracker ticket pops when the break starts ("Open", with "Scroll back up to fix") and stays on
 * the screen over Level 2 for two seconds, then tucks away; when the name is whole again it shows
 * "Fixed" for three. On a phone it sits in the lower third, above the bottom bar. Decorative and
 * hidden from assistive tech. Off without script, under reduced motion and with the games off.
 */
type Cell = { x: number; y: number; d: number; vx: number; spin: number; slot: number; fade: number };

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (k: number) => k * k; // the fall gathers speed
const OPEN_MS = 2000;
const FIXED_MS = 3000;

export function startBreak() {
  const hero = document.querySelector<HTMLElement>('.hero');
  const wall = document.querySelector<HTMLElement>('.wall');
  const name = hero?.querySelector<HTMLElement>('.hero__name');
  const h1 = hero?.querySelector<HTMLElement>('.hero__title');
  const title = wall?.querySelector<HTMLElement>('.wall__title');
  const flag = wall?.querySelector<HTMLElement>('.flag');
  const canvas = document.querySelector<HTMLCanvasElement>('.hero__break');
  const ticket = document.querySelector<HTMLElement>('.hero__ticket');
  const status = ticket?.querySelector<HTMLElement>('[data-ticket-status]');
  if (!hero || !wall || !name || !h1 || !title || !canvas || !ticket || !status) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const html = document.documentElement;
  const phone = matchMedia('(max-width: 47.99rem)');
  const off = () => html.classList.contains('games-off');

  let cells: Cell[] = [];
  // where the heap lands, as offsets from the title's top left corner, in the title's pixels
  let slots: { x: number; y: number }[] = [];
  let cell = 10;
  let small = 4;
  let lift = 0; // the letters' tops, below the title's top edge
  let fill = '#e5e7ea';
  const dpr = Math.min(2, devicePixelRatio || 1);

  // Sample the heading: draw the same lines with the same font on an offscreen canvas and keep
  // every filled cell of the font's own grid (Pixel Operator is drawn on 16 units per em). Then lay
  // out the heap on the title's first line, clear of the label above it.
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
    const gw = Math.ceil(first.width);
    const gh = Math.ceil(first.height);
    const glyphs = document.createElement('canvas');
    glyphs.width = Math.max(1, gw);
    glyphs.height = Math.max(1, gh);
    const g = glyphs.getContext('2d')!;
    g.font = `${ts.fontWeight} ${tsize}px ${ts.fontFamily}`;
    g.textBaseline = 'alphabetic';
    g.fillText((title.textContent ?? '').trim(), 0, (gh - tsize) / 2 + tsize * 0.8125);
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

    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  };

  // How far Level 2 has covered the hero, 0 to 1, on screen: its edge is the middle of its band of
  // clouds (the band above that line is see-through).
  const band = () => (wall.querySelector('.join--top') as HTMLElement | null)?.offsetHeight ?? 0;
  const covered = () => {
    const hr = hero.getBoundingClientRect();
    const top = Math.max(hr.top, 0);
    const bottom = Math.min(hr.bottom, innerHeight);
    if (bottom - top < 1) return 1;
    const edge = wall.getBoundingClientRect().top + band() / 2;
    return clamp((bottom - edge) / (bottom - top));
  };
  // The fade ends just before the hero is covered; the pixels land a little earlier still.
  const fadeOf = (q: number) => clamp(q / 0.9);
  const progressOf = (q: number) => clamp(q / 0.75);

  const render = (p: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fill;
    const r = h1.getBoundingClientRect();
    const t = title.getBoundingClientRect();
    const floor = t.top + lift; // nothing goes below the tops of its letters
    for (const c of cells) {
      const s = ease(clamp((p - c.d) / (1 - c.d)));
      const sx = r.left + c.x;
      const sy = r.top + c.y;
      let x: number;
      let y: number;
      let size = cell;
      let rot = 0;
      let alpha = 1;
      if (c.slot >= 0) {
        // a lander: from its place in the name to its place on the heap, shrinking, turning as it
        // falls and settling square
        const slot = slots[c.slot];
        const tx = t.left + slot.x;
        const ty = t.top + slot.y;
        size = cell + (small - cell) * s;
        x = sx + (tx - sx) * s + c.vx * 120 * Math.sin(Math.PI * s);
        y = sy + (ty - sy) * s;
        rot = c.spin * Math.sin(Math.PI * s);
      } else {
        // the rest drop towards the title and are gone before they reach it
        size = cell + (small - cell) * s;
        x = sx + c.vx * 240 * s;
        y = sy + (floor - 40 - sy) * s;
        rot = c.spin * s;
        alpha = 1 - clamp(s / c.fade);
        if (alpha <= 0) continue;
      }
      y = Math.min(y, floor - size);
      ctx.globalAlpha = alpha;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * (x + size / 2), dpr * (y + size / 2));
      ctx.fillRect(-size / 2, -size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  };

  // The ticket: one element, one state at a time, on the clock from each change. Beside the name
  // on a tablet or a desktop, where it stays put as Level 2 comes up under it; a phone's CSS sets
  // it in the lower third, above the bottom bar.
  let timer = 0;
  // A phone: the lower third, unless the next title (or the name) is passing there; then the top of
  // the screen; if both are taken it tucks away early. It never covers a heading or the bar.
  const headings = [title, h1];
  const clearOf = (top: number, bottom: number) =>
    headings.every((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom <= top || r.top >= bottom;
    });
  const placePhone = () => {
    const h = ticket.offsetHeight;
    const bar = document.querySelector('.tabbar')?.getBoundingClientRect().top ?? innerHeight;
    const low = bar - 40;
    if (clearOf(low - h, low)) ticket.classList.remove('is-top');
    else if (clearOf(16, 16 + h)) ticket.classList.add('is-top');
    else quiet();
  };
  const place = () => {
    if (phone.matches) {
      ticket.style.left = '';
      ticket.style.top = '';
      placePhone();
      return;
    }
    const n = name.getBoundingClientRect();
    const w = ticket.offsetWidth || 288;
    const left = Math.min(n.right + 32, innerWidth - w - 16);
    ticket.style.left = `${Math.max(16, left)}px`;
    ticket.style.top = `${Math.max(16, Math.min(n.top + 8, innerHeight - 200))}px`;
  };
  const show = (state: 'open' | 'fixed') => {
    ticket.hidden = false;
    ticket.dataset.status = state;
    status.textContent = state === 'open' ? 'Open' : 'Fixed';
    place();
    ticket.classList.add('is-in');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ticket.classList.remove('is-in'), state === 'open' ? OPEN_MS : FIXED_MS);
  };
  function quiet() {
    window.clearTimeout(timer);
    ticket.classList.remove('is-in');
  }

  let broken = false;
  let armed = false;
  let last = -1;
  const update = () => {
    if (off()) {
      // games off: the hero simply goes behind, the name stays whole
      hero.style.opacity = '';
      canvas.hidden = true;
      h1.classList.remove('is-broken');
      broken = false;
      last = -1;
      quiet();
      return;
    }
    const q = covered();
    hero.style.opacity = String(1 - fadeOf(q));
    if (phone.matches && ticket.classList.contains('is-in')) placePhone();
    const p = progressOf(q);
    if (p > 0) {
      if (canvas.hidden) {
        sample();
        canvas.hidden = false;
        h1.classList.add('is-broken');
      }
      if (p !== last || p === 1) render(p);
    } else if (!canvas.hidden) {
      canvas.hidden = true;
      h1.classList.remove('is-broken');
    }
    last = p;
    if (!broken && p > 0.04) {
      broken = true;
      if (armed) show('open');
    } else if (broken && p < 0.004) {
      broken = false;
      if (armed) show('fixed');
    }
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
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', () => {
    if (!canvas.hidden) sample();
    last = -1;
    queue();
  });
  // the games switch on the scoreboard
  new MutationObserver(queue).observe(html, { attributes: true, attributeFilter: ['class'] });
  document.fonts.ready.then(() => {
    // A page that opens part way down starts broken, with no ticket for a break nobody saw.
    broken = !off() && progressOf(covered()) > 0.04;
    armed = true;
    update();
  });
}
