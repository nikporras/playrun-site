/**
 * The headline break: as the visitor scrolls down through the hero (while Level 2 covers it) the
 * name breaks into its own font pixels, tied to the scroll position; scrolling back up puts them
 * back. The pixels are a visual copy drawn on one canvas, so the real h1 stays in the DOM for
 * screen readers and selection and only fades while the copy is up. A tracker ticket pops when
 * the break starts (Open) and again when the name is whole again (Fixed); the ticket runs on
 * time, three seconds, so it can be read, and never shows both states at once. Off without
 * script and under reduced motion.
 */
type Cell = { x: number; y: number; d: number; vx: number; spin: number };

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (k: number) => k * k; // the fall gathers speed

export function startBreak() {
  const hero = document.querySelector<HTMLElement>('.hero');
  const name = hero?.querySelector<HTMLElement>('.hero__name');
  const h1 = hero?.querySelector<HTMLElement>('.hero__title');
  const canvas = hero?.querySelector<HTMLCanvasElement>('.hero__break');
  const ticket = hero?.querySelector<HTMLElement>('.hero__ticket');
  const status = ticket?.querySelector<HTMLElement>('[data-ticket-status]');
  if (!hero || !name || !h1 || !canvas || !ticket || !status) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let cells: Cell[] = [];
  let W = 0;
  let H = 0;
  let cell = 10;
  let fill = '#e5e7ea';
  const dpr = Math.min(2, devicePixelRatio || 1);

  // Sample the heading: draw the same lines with the same font on an offscreen canvas and keep
  // every filled cell of the font's own grid (Pixel Operator is drawn on 16 units per em).
  const sample = () => {
    const r = h1.getBoundingClientRect();
    const box = name.getBoundingClientRect();
    const cs = getComputedStyle(h1);
    const size = parseFloat(cs.fontSize);
    fill = cs.color;
    cell = size / 16;
    const extra = Math.round(size * 1.8);
    W = Math.ceil(r.width);
    H = Math.ceil(r.height) + extra;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d')!;
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
    cells = [];
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y + cell <= H - extra + 1; y += cell) {
      for (let x = 0; x + cell <= W + 1; x += cell) {
        const px = Math.min(W - 1, Math.round(x + cell / 2));
        const py = Math.min(H - 1, Math.round(y + cell / 2));
        if (data[(py * W + px) * 4 + 3] > 128) cells.push({ x, y, d: rand() * 0.35, vx: (rand() - 0.5) * 0.5, spin: (rand() - 0.5) * 5 });
      }
    }
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    canvas.style.left = `${r.left - box.left}px`;
    canvas.style.top = `${r.top - box.top}px`;
  };

  // The whole break happens over a little more than half the hero's height of scroll.
  const progress = () => clamp(scrollY / (hero.offsetHeight * 0.55));

  const render = (p: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = fill;
    const drop = H * 1.1;
    for (const c of cells) {
      const s = ease(clamp((p - c.d) / (1 - c.d)));
      if (s === 0) {
        ctx.fillRect(c.x, c.y, cell, cell);
        continue;
      }
      const x = c.x + c.vx * drop * s;
      const y = c.y + drop * s;
      const rot = c.spin * s;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * (x + cell / 2), dpr * (y + cell / 2));
      ctx.fillRect(-cell / 2, -cell / 2, cell, cell);
    }
  };

  // The ticket: one element, one state at a time, three seconds on the clock from each change.
  let timer = 0;
  const show = (state: 'open' | 'fixed') => {
    ticket.hidden = false;
    ticket.dataset.status = state;
    status.textContent = state === 'open' ? 'Open' : 'Fixed';
    ticket.classList.add('is-in');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => ticket.classList.remove('is-in'), 3000);
  };

  let broken = false;
  let armed = false;
  let last = -1;
  const update = () => {
    const p = progress();
    if (p !== last) {
      last = p;
      if (p > 0) {
        if (canvas.hidden) {
          sample();
          canvas.hidden = false;
          h1.classList.add('is-broken');
        }
        render(p);
      } else if (!canvas.hidden) {
        canvas.hidden = true;
        h1.classList.remove('is-broken');
      }
    }
    if (!broken && p > 0.04) {
      broken = true;
      if (armed) show('open');
    } else if (broken && p < 0.004) {
      broken = false;
      if (armed) show('fixed');
    }
  };

  let queued = false;
  addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        update();
      });
    },
    { passive: true },
  );
  addEventListener('resize', () => {
    if (canvas.hidden) return;
    sample();
    render(progress());
  });
  document.fonts.ready.then(() => {
    // A page that opens part way down starts broken, with no ticket for a break nobody saw.
    broken = progress() > 0.04;
    armed = true;
    update();
  });
}
