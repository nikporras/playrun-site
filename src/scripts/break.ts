/**
 * The hero's exit, triggered by the scroll, never scrubbed by it. Two markers sit near the top of
 * Level 2, a little apart; one IntersectionObserver watches them cross the foot of the hero as
 * Level 2 slides up over it. When the lower one passes, the name breaks: its own font pixels fall
 * over the clouds and land on the tops of the letters of the next title ("Games I've tested") in
 * a fixed time (TIMING: 1.2 s, eased out so they visibly fall and settle), shrinking to that
 * title's pixel size into a small heap while the rest fade on the way. When the upper one comes
 * back below the foot, it plays in reverse (1 s) and the name is whole again. A second pair further
 * down fades the hero out in 0.4 s once Level 2 covers most of it (the photo shows through the
 * clouds until then) and back in on the way up. The gap between the
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
 * A tracker ticket pops when the name breaks ("Open", with "Scroll back up to fix"). It docks with
 * the scoreboard, in the game layer's corner (above the pill on a desktop, in the bar on a tablet,
 * a strip on the bar's top edge on a phone), and never moves, hides or fades while it is there. The
 * first time in a visit (and after Reset) it stays until the name is whole again or the visitor
 * dismisses it: the full card where it fits the gutter, elsewhere the card for four seconds and
 * then the chip, pulsing gently, which opens it again; when the name is fixed it shows "Fixed" for
 * three seconds and goes. Later breaks show the card for three seconds. Dismiss closes it (that counts
 * as done). Its content is decorative and hidden from assistive tech; the chip and Dismiss are real
 * buttons. Off without script, under reduced motion and with the games off.
 */
type Cell = { x: number; y: number; d: number; vx: number; spin: number; slot: number; fade: number };

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (k: number) => k * k; // each pixel's fall gathers speed
// The timings, in milliseconds: the break and the fall to the title, the pixels flying home, the
// hero's fade. Tune them here.
const TIMING = { fall: 1200, mend: 1000, fade: 400 };
// a gentle ease-out (cubic): quick away, slow to settle, both ways
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const SHOW_MS = 3000;
const FOLD_MS = 4000; // the first ticket's card, before it folds into the chip where it does not fit the gutter
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
  const h1 = hero?.querySelector<HTMLElement>('.hero__title');
  const title = wall?.querySelector<HTMLElement>('.wall__title');
  const flag = wall?.querySelector<HTMLElement>('.flag');
  const canvas = document.querySelector<HTMLCanvasElement>('.hero__break');
  const ticket = document.querySelector<HTMLElement>('.hero__ticket');
  const status = ticket?.querySelector<HTMLElement>('[data-ticket-status]');
  const chip = ticket?.querySelector<HTMLButtonElement>('[data-ticket-chip]');
  const chipStatus = ticket?.querySelector<HTMLElement>('[data-ticket-chipstatus]');
  const dismissButtons = Array.from(ticket?.querySelectorAll<HTMLButtonElement>('[data-ticket-close]') ?? []);
  const dock = document.getElementById('dock');
  if (!hero || !wall || !h1 || !title || !canvas || !ticket || !status || !chip || !chipStatus || !dock) return;
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

  // ---- The animation: p runs from 0 (the name whole) to 1 (all landed), towards the goal the
  // threshold last set, on the clock (TIMING) whatever the scroll does meanwhile, eased out both
  // ways. t is the time run so far in the current direction, 0 to 1; a turn mid-way picks t up from
  // where p is, so nothing jumps.
  let p = 0;
  let t = 1;
  let goal: 0 | 1 = 0;
  let raf = 0;
  let last = 0;
  let fade: Animation | null = null;
  const fadeHero = (target: number, instant: boolean) => {
    const now = Number(getComputedStyle(hero).opacity);
    fade?.cancel();
    fade = hero.animate([{ opacity: now }, { opacity: target }], { duration: instant ? 0 : TIMING.fade, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
  };
  const settle = () => {
    if (goal === 0) {
      canvas.hidden = true;
      h1.classList.remove('is-broken');
      if (armed && !dismissed) show('fixed');
    }
  };
  const step = (now: number) => {
    const dt = last ? now - last : 16;
    last = now;
    t = Math.min(1, t + dt / (goal === 1 ? TIMING.fall : TIMING.mend));
    p = goal === 1 ? easeOut(t) : 1 - easeOut(t);
    render(p);
    if (t === 1) {
      raf = 0;
      settle();
    } else raf = requestAnimationFrame(step);
  };
  const run = (instant: boolean) => {
    cancelAnimationFrame(raf);
    last = 0;
    if (instant) {
      t = 1;
      p = goal;
      render(p);
      settle();
      return;
    }
    // (the inverse of the ease, from where the pixels are now)
    t = 1 - Math.cbrt(goal === 1 ? 1 - p : p);
    raf = requestAnimationFrame(step);
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

  // ---- The ticket. It lives with the scoreboard, in the game layer's corner, and never moves: the
  // chip keeps its one spot (above the pill on a desktop, in the bar on a tablet, a strip on the
  // bar's top edge on a phone) and the card opens above it. The first time in a visit it stays
  // until the name is fixed or the ticket is dismissed (the card, or the chip where the card does
  // not fit). Later breaks, and the fix, show the card for three seconds and go. The page keeps
  // room at its foot for the chip or the strip (--ticket-pad), and the toast and the scoreboard's
  // card open above it (--ticket-lift where the card opens above the bar).
  dock.prepend(ticket);
  const tablet = matchMedia('(min-width: 48rem) and (max-width: 63.99rem)');
  let wanted = false; // on show
  let kept = false; // the first appearance of the visit, staying until the fix
  let expanded = false;
  let dismissed = false; // closed by hand: quiet until the next break
  let armed = false;
  let timer = 0; // the card or the ticket leaving
  let padRoom = 0;
  // the room it takes: on the bar (a phone's strip, which the HUD line rides on), at the foot of
  // the page (the strip or chip and the open card, as the bar reserves its own), and above the bar
  // for the toast and the scoreboard's card where the ticket's card opens above it
  const room = () => {
    const on = wanted && !ticket.hidden;
    const dockRow = ticket.querySelector('.ticket__dock') as HTMLElement;
    // (the card's full height, whatever its fold is doing this instant, and its margins)
    const card = on && expanded ? (ticket.querySelector('.ticket__cardin') as HTMLElement).scrollHeight + 16 : 0;
    const strip = on && phone.matches ? dockRow.offsetHeight : 0;
    // (the card itself either fits the gutter or folds away after a few seconds: no room for it)
    const pad = !on ? 0 : phone.matches ? strip : tablet.matches ? 0 : dockRow.offsetHeight + 8;
    const lift = phone.matches || tablet.matches ? card : 0;
    // (a visitor at the very foot of the page stays there as the room grows)
    const atFoot = scrollY + innerHeight >= html.scrollHeight - 2;
    const grew = pad - padRoom;
    padRoom = pad;
    html.style.setProperty('--ticket-room', `${strip}px`);
    html.style.setProperty('--ticket-pad', `${pad}px`);
    html.style.setProperty('--ticket-lift', `${lift}px`);
    // (once, as it changes: the page takes its new length first)
    if (atFoot && grew > 0 && html.scrollHeight) scrollBy({ top: grew, behavior: 'instant' });
  };
  // Does the full card fit in the gutter beside the column (a wide desktop)? Then the kept ticket
  // stays open until the fix or Dismiss. Elsewhere it folds into the chip after a few seconds (and
  // again after it is opened), the chip pulsing gently while the ticket is still open. Any other
  // ticket leaves three seconds after it opens (or after it is folded).
  const fits = () => {
    if (phone.matches || tablet.matches) return false;
    const gutter = parseFloat(getComputedStyle(wall).paddingRight) || 0;
    const card = (ticket.querySelector('.ticket__cardin') as HTMLElement).offsetWidth + 4;
    const inset = innerWidth - dock.getBoundingClientRect().right;
    return card + inset <= gutter;
  };
  const expand = (on: boolean) => {
    expanded = on;
    ticket.classList.toggle('is-expanded', on);
    chip.setAttribute('aria-expanded', String(on));
    window.clearTimeout(timer);
    if (kept && on && !fits()) timer = window.setTimeout(() => expand(false), FOLD_MS);
    else if (!kept && wanted) timer = window.setTimeout(hide, SHOW_MS);
    room();
  };
  const hide = () => {
    wanted = false;
    kept = false;
    expanded = false;
    window.clearTimeout(timer);
    ticket.classList.remove('is-in', 'is-expanded');
    chip.setAttribute('aria-expanded', 'false');
    room();
  };
  function show(state: 'open' | 'fixed') {
    if (state === 'open' && !seen()) kept = true;
    if (state === 'fixed') {
      if (kept) markSeen();
      kept = false;
    }
    ticket.hidden = false;
    ticket.dataset.status = state;
    ticket.classList.toggle('is-kept', kept);
    status.textContent = state === 'open' ? 'Open' : 'Fixed';
    chipStatus.textContent = status.textContent;
    wanted = true;
    ticket.classList.add('is-in');
    expand(true);
  }
  chip.addEventListener('click', () => expand(!expanded));
  for (const d of dismissButtons)
    d.addEventListener('click', () => {
      markSeen();
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
      p = 0;
      t = 1;
      hide();
    } else decide(true);
  }).observe(html, { attributes: true, attributeFilter: ['class'] });

  // ---- The page changes size: lay it all out again, at once.
  const relayout = () => {
    if (sampled) sample();
    watch();
    room();
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
