/**
 * The hero's exit, triggered by the scroll, never scrubbed by it. Two markers sit near the top of
 * Level 2, a little apart; one IntersectionObserver watches them cross the foot of the hero as
 * Level 2 slides up over it. When the lower one passes, the name breaks: its own font pixels fall
 * over the clouds and land on the tops of the letters of the next title ("Games I've tested") in
 * a fixed 0.6 s, shrinking to that title's pixel size into a small heap while the rest fade on the
 * way. When the upper one comes back below the foot, it plays in reverse and the name is whole
 * again. A second pair further down fades the hero out in 0.4 s once Level 2 covers most of it (the
 * photo shows through the clouds until then) and back in on the way up. The gap between the
 * markers of a pair keeps it from flickering at the threshold, and nothing here reads or follows
 * the scroll position frame by frame, so the page scrolls natively and nothing trails it (Firefox
 * scrolls on its own thread and warns about scroll-linked effects; there are none).
 *
 * The pixels are a visual copy on one canvas (click-through, decorative), so the real h1 stays in
 * the DOM for screen readers and selection and only fades while the copy is up. While they fall to
 * the title the canvas lies in the page, so it scrolls with the title by itself, and the landed
 * heap is just its last frame; while they fly home to the pinned name it is fixed on the screen,
 * like the hero. Nothing is ever drawn below the tops of the title's letters. Transform and
 * opacity only: the canvas is drawn in requestAnimationFrame for the length of the animation and
 * then left alone; the hero's fade is a Web Animation.
 *
 * A tracker ticket pops when the name breaks ("Open", with "Scroll back up to fix"). The first
 * time in a visit it docks (bottom left on a desktop, the lower third on a phone) and stays until
 * the name is whole again, then shows "Fixed" for three seconds and leaves; later breaks show it
 * for three seconds beside the name. A Dismiss button closes it (that counts as done). While it is
 * on show it moves out of the way of a heading, a button, a form field or the scoreboard passing
 * underneath, and hides while there is no clear place. Its content is decorative and hidden from
 * assistive tech; the button is a real button. Off without script, under reduced motion and with
 * the games off.
 */
type Cell = { x: number; y: number; d: number; vx: number; spin: number; slot: number; fade: number };
type Box = { left: number; top: number; right: number; bottom: number };

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (k: number) => k * k; // each pixel's fall gathers speed
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const FALL_MS = 600;
const FADE_MS = 400;
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
  const ticket = document.querySelector<HTMLElement>('.hero__ticket');
  const status = ticket?.querySelector<HTMLElement>('[data-ticket-status]');
  const dismiss = ticket?.querySelector<HTMLButtonElement>('[data-ticket-close]');
  if (!hero || !wall || !name || !h1 || !title || !canvas || !ticket || !status || !dismiss) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const html = document.documentElement;
  const phone = matchMedia('(max-width: 47.99rem)');
  const off = () => html.classList.contains('games-off');
  const dpr = Math.min(2, devicePixelRatio || 1);

  // ---- The pixels
  let cells: Cell[] = [];
  // where the heap lands, as offsets from the title's top left corner, in the title's pixels
  let slots: { x: number; y: number }[] = [];
  let cell = 10;
  let small = 4;
  let lift = 0; // the letters' tops, below the title's top edge
  let fill = '#e5e7ea';

  // Sample the heading: draw the same lines with the same font on an offscreen canvas and keep
  // every filled cell of the font's own grid (Pixel Operator is drawn on 16 units per em). Then lay
  // out the heap on the title's first line, clear of the label above it. Once, and on resize.
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
  };

  // ---- The canvas: where the name and the title are, relative to the canvas, set when an
  // animation starts. It lies in the page while the pixels fall to the title (so it scrolls with
  // it) and is fixed on the screen while they fly home to the pinned name.
  let from = { x: 0, y: 0 }; // the h1's top left, on the canvas
  let to = { x: 0, y: 0 }; // the title's top left, on the canvas
  const place = (mode: 'page' | 'screen') => {
    const r = h1.getBoundingClientRect();
    const t = title.getBoundingClientRect();
    const top = Math.min(r.top, t.top) - 160;
    const bottom = Math.max(r.bottom, t.top + lift) + 8;
    const width = html.clientWidth;
    const height = Math.max(1, Math.ceil(bottom - top));
    canvas.style.position = mode === 'page' ? 'absolute' : 'fixed';
    canvas.style.top = `${mode === 'page' ? top + scrollY : top}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    from = { x: r.left, y: r.top - top };
    to = { x: t.left, y: t.top - top };
  };

  const render = (p: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fill;
    const floor = to.y + lift; // nothing goes below the tops of its letters
    for (const c of cells) {
      const s = ease(clamp((p - c.d) / (1 - c.d)));
      const sx = from.x + c.x;
      const sy = from.y + c.y;
      let x: number;
      let y: number;
      let rot: number;
      let alpha = 1;
      const size = cell + (small - cell) * s;
      if (c.slot >= 0) {
        // a lander: from its place in the name to its place on the heap, shrinking, turning as it
        // falls and settling square
        const slot = slots[c.slot];
        x = sx + (to.x + slot.x - sx) * s + c.vx * 120 * Math.sin(Math.PI * s);
        y = sy + (to.y + slot.y - sy) * s;
        rot = c.spin * Math.sin(Math.PI * s);
      } else {
        // the rest drop towards the title and are gone before they reach it
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

  // ---- The animation: u runs from 0 (the name whole) to 1 (all landed) at a fixed pace, towards
  // the goal the threshold last set, whatever the scroll does meanwhile.
  let u = 0;
  let goal: 0 | 1 = 0;
  let raf = 0;
  let last = 0;
  let fade: Animation | null = null;
  const fadeHero = (target: number, instant: boolean) => {
    const now = Number(getComputedStyle(hero).opacity);
    fade?.cancel();
    fade = hero.animate([{ opacity: now }, { opacity: target }], { duration: instant ? 0 : FADE_MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
  };
  const settle = () => {
    if (goal === 0) {
      canvas.hidden = true;
      h1.classList.remove('is-broken');
      if (armed && !dismissed) show('fixed');
    }
  };
  const step = (t: number) => {
    const dt = last ? t - last : 16;
    last = t;
    u = goal === 1 ? Math.min(1, u + dt / FALL_MS) : Math.max(0, u - dt / FALL_MS);
    render(easeInOut(u));
    if (u === goal) {
      raf = 0;
      settle();
    } else raf = requestAnimationFrame(step);
  };
  const run = (instant: boolean) => {
    cancelAnimationFrame(raf);
    last = 0;
    if (instant) {
      u = goal;
      render(u);
      settle();
    } else raf = requestAnimationFrame(step);
  };
  let broken = false;
  let sampled = false;
  const breakTo = (b: boolean, instant = false) => {
    if (b === broken) return;
    broken = b;
    if (!sampled) {
      sample();
      sampled = true;
    }
    goal = b ? 1 : 0;
    place(b ? 'page' : 'screen');
    if (b) {
      canvas.hidden = false;
      h1.classList.add('is-broken');
      dismissed = false;
      if (armed && !instant) show('open');
    }
    run(instant);
  };
  let faded = false;
  const fadeTo = (f: boolean, instant = false) => {
    if (f === faded) return;
    faded = f;
    fadeHero(f ? 0 : 1, instant);
  };

  // ---- The thresholds: markers near the top of Level 2, in pairs a little apart, crossing the foot
  // of the hero (the foot of the screen, above a bottom bar). The name breaks as soon as Level 2
  // starts over the hero and mends just above that; the hero fades out once Level 2 covers 60% of
  // it (the photo showing through the clouds until then) and back in below 55%. Each marker runs
  // from its line down to the end of the page, so it is on screen exactly while its line is above
  // the foot: a jump past a threshold either way still changes that, and the observer always hears
  // of it. They lie in the page itself (Level 2 clips what overflows it).
  const marks = { break: 0.03, mend: 0, fadeOut: 0.6, fadeIn: 0.55 };
  type Mark = keyof typeof marks;
  const markers = new Map<Element, Mark>();
  for (const k of Object.keys(marks) as Mark[]) {
    const m = document.createElement('div');
    m.className = 'wall__trip';
    m.dataset.trip = k;
    m.setAttribute('aria-hidden', 'true');
    canvas.after(m);
    markers.set(m, k);
  }
  let io: IntersectionObserver | null = null;
  const past: Record<Mark, boolean> = { break: false, mend: false, fadeOut: false, fadeIn: false }; // each line above the foot
  const decide = (instant: boolean) => {
    if (off()) return;
    if (past.break && !broken) breakTo(true, instant);
    else if (!past.mend && broken) breakTo(false, instant);
    if (past.fadeOut && !faded) fadeTo(true, instant);
    else if (!past.fadeIn && faded) fadeTo(false, instant);
  };
  const watch = () => {
    io?.disconnect();
    const pin = parseFloat(getComputedStyle(hero).top) || 0;
    const foot = Math.min(innerHeight, pin + hero.offsetHeight);
    const band = (wall.querySelector('.join--top') as HTMLElement | null)?.offsetHeight ?? 0;
    const top = wall.getBoundingClientRect().top + scrollY + band / 2;
    const end = document.documentElement.scrollHeight - 1;
    for (const [m, k] of markers) {
      // the break where it started before (the clouds a little way over the foot), the mend just
      // above it; the fade by how much of the hero on screen is covered
      const depth = k === 'break' ? Math.max(24, marks.break * foot) : k === 'mend' ? 4 : marks[k] * foot;
      const line = top + depth;
      (m as HTMLElement).style.top = `${Math.round(line)}px`;
      (m as HTMLElement).style.height = `${Math.max(1, Math.round(end - line))}px`;
    }
    let first = true;
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) past[markers.get(e.target)!] = e.isIntersecting || e.boundingClientRect.bottom <= 0;
        // (the first report is the page as it opened: no animation, no ticket for a break nobody saw)
        decide(first);
        first = false;
      },
      { rootMargin: `0px 0px ${-Math.max(0, Math.round(innerHeight - foot))}px 0px` },
    );
    for (const m of markers.keys()) io.observe(m);
  };

  // ---- The ticket
  let wanted = false; // it should be on show (it hides while there is no clear place)
  let docked = false; // the first appearance of the visit, waiting for the fix
  let dismissed = false; // closed by hand: quiet until the next break
  let armed = false;
  let timer = 0;
  let size = { w: 288, h: 160 };
  let at = { left: -1, top: -1 };
  let vw = innerWidth;
  let vh = innerHeight;
  let barTop = innerHeight;
  let nameBox: Box = { left: 0, top: 0, right: 0, bottom: 0 }; // on the screen while the hero is pinned
  let obstacles: Box[] = []; // in the page: headings, buttons, fields after the hero
  let fixedObstacles: Box[] = []; // on the screen: the scoreboard, the bar
  // measured as the ticket appears and when the page changes size, not while it scrolls
  const measure = () => {
    vw = innerWidth;
    vh = innerHeight;
    barTop = document.querySelector('.tabbar')?.getBoundingClientRect().top ?? vh;
    if (barTop <= 0) barTop = vh;
    const n = name.getBoundingClientRect();
    nameBox = { left: n.left, top: n.top, right: n.right, bottom: n.bottom };
    obstacles = Array.from(document.querySelectorAll<HTMLElement>('main :is(h1, h2, h3, .button, button, input, textarea, select)'))
      .filter((el) => !el.closest('.hero, .bug, .hero__ticket') && el.getClientRects().length)
      .map((el) => {
        // by the layout, not the box on screen: an entrance may still be moving it
        let left = 0;
        let top = 0;
        for (let p: HTMLElement | null = el; p; p = p.offsetParent as HTMLElement | null) {
          left += p.offsetLeft;
          top += p.offsetTop;
        }
        return { left, top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
      });
    fixedObstacles = Array.from(document.querySelectorAll<HTMLElement>('.score__pill, .tabbar, .toast.is-in'))
      .filter((el) => el.getClientRects().length)
      .map((el) => {
        const b = el.getBoundingClientRect();
        return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      });
  };
  const overlaps = (a: Box, b: Box, pad = 8) => a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
  // the places it may stand, best first
  const candidates = (): { left: number; top: number }[] => {
    const { w, h } = size;
    if (phone.matches) {
      const left = Math.max(8, (vw - w) / 2);
      return [
        { left, top: barTop - 40 - h },
        { left, top: 16 },
      ];
    }
    const margin = Math.max(48, Math.min(96, vw * 0.05));
    const docks = [
      { left: margin, top: vh - 24 - h },
      { left: margin, top: 88 },
      { left: vw - margin - w - 220, top: vh - 24 - h },
    ];
    if (docked) return docks;
    return [{ left: Math.max(16, Math.min(nameBox.right + 32, vw - w - 16)), top: Math.max(16, Math.min(nameBox.top + 8, vh - 200)) }, ...docks];
  };
  const clearAt = (c: { left: number; top: number }, y: number) => {
    const b = { left: c.left, top: c.top, right: c.left + size.w, bottom: c.top + size.h };
    if (b.top < 0 || b.bottom > vh) return false;
    if (!broken && overlaps(b, nameBox)) return false;
    for (const o of obstacles) if (overlaps(b, { left: o.left, top: o.top - y, right: o.right, bottom: o.bottom - y })) return false;
    for (const o of fixedObstacles) if (overlaps(b, o)) return false;
    return true;
  };
  // Find a clear place for it; hide it while there is none. It is fixed on the screen and moves
  // only when what is under it changes, so it never chases the scroll.
  const spot = () => {
    if (!wanted) return;
    const y = scrollY;
    const c = candidates().find((k) => clearAt(k, y));
    if (!c) {
      ticket.classList.remove('is-in');
      return;
    }
    if (c.left !== at.left || c.top !== at.top) {
      at = c;
      ticket.style.left = `${Math.round(c.left)}px`;
      ticket.style.top = `${Math.round(c.top)}px`;
    }
    ticket.classList.add('is-in');
  };
  // (a light check on scroll, only while the ticket is up: the cached boxes against the place it stands)
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      spot();
    });
  };
  const hide = () => {
    wanted = false;
    window.clearTimeout(timer);
    ticket.classList.remove('is-in');
    removeEventListener('scroll', onScroll);
  };
  function show(state: 'open' | 'fixed') {
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
    spot();
    addEventListener('scroll', onScroll, { passive: true });
    if (state === 'fixed') {
      if (docked) markSeen();
      docked = false;
      timer = window.setTimeout(hide, SHOW_MS);
    } else if (!docked) {
      timer = window.setTimeout(hide, SHOW_MS);
    }
  }
  dismiss.addEventListener('click', () => {
    markSeen();
    docked = false;
    dismissed = true;
    hide();
  });

  // ---- Games off: the hero simply goes behind and the name stays whole; back on, the threshold
  // decides again, at once.
  let wasOff = off();
  new MutationObserver(() => {
    const now = off();
    if (now === wasOff) return;
    wasOff = now;
    if (now) {
      cancelAnimationFrame(raf);
      raf = 0;
      fade?.cancel();
      fade = null;
      faded = false;
      canvas.hidden = true;
      h1.classList.remove('is-broken');
      broken = false;
      u = 0;
      docked = false;
      hide();
    } else decide(true);
  }).observe(html, { attributes: true, attributeFilter: ['class'] });

  // ---- The page changes size: lay it all out again, at once.
  const relayout = () => {
    if (sampled) sample();
    watch();
    if (wanted) measure();
    if (broken && !raf) {
      place('page');
      render(1);
    }
  };
  addEventListener('resize', relayout);
  if ('ResizeObserver' in window) {
    let pending = false;
    let width = document.body.offsetWidth;
    let height = document.body.offsetHeight;
    new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      const h = e.contentRect.height;
      if (pending || (w === width && h === height)) return;
      width = w;
      height = h;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        relayout();
      });
    }).observe(document.body);
  }
  document.fonts.ready.then(() => {
    watch();
    // (the observer's first report sets the page as it opened; from then on, the ticket)
    requestAnimationFrame(() => (armed = true));
  });
}
