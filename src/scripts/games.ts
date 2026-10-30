/**
 * The games on the PlayRun site: the runner on the track, the bug hunt and the achievements.
 * All of it is optional play. It is off under prefers-reduced-motion, off with the Games button,
 * absent without script, and the page underneath never depends on it.
 */
type State = { on: boolean; bugs: string[]; achievements: string[] };

const KEY = 'playrun.games';
const ACHIEVEMENTS: Record<string, string> = {
  'first-bug': 'Caught your first bug',
  'all-bugs': 'Caught every bug',
  services: 'Read every skill',
  selftest: 'Tested the page',
};
const defaults = (): State => ({ on: true, bugs: [], achievements: [] });

const read = (): State => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    /* private mode or storage off: the game lives for this visit only */
  }
  return defaults();
};
const write = (s: State) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* same */
  }
};

export function startGames() {
  const hud = document.getElementById('hud');
  const dock = document.getElementById('dock');
  const toast = document.querySelector<HTMLElement>('[data-toast]');
  if (!hud || !dock) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    hud.remove();
    dock.remove();
    document.querySelector('[data-shot]')?.remove();
    return;
  }

  const html = document.documentElement;
  const state = read();
  const pick = <T extends HTMLElement>(root: HTMLElement, sel: string) => root.querySelector<T>(sel)!;
  const live = pick(hud, '[data-hud-live]');
  const runner = pick(hud, '.hud__runner');
  const levelsList = pick(hud, '.hud__levels');
  // The scoreboard: the pill (always on show) and the card it opens.
  const score = pick(dock, '[data-score]');
  const pill = pick<HTMLButtonElement>(dock, '[data-hud-more]');
  const toggle = pick<HTMLButtonElement>(dock, '[data-hud-toggle]');
  const reset = pick<HTMLButtonElement>(dock, '[data-hud-reset]');
  const bugsOut = pick(dock, '[data-hud-bugs]');
  const achOut = pick(dock, '[data-hud-ach]');
  const levelOut = pick(dock, '[data-hud-level]');
  const levelsOut = pick(dock, '[data-hud-levels]');
  const levelStat = pick(dock, '[data-hud-level-stat]');
  const panelLevel = pick(dock, '[data-panel-level]');
  const panelLevels = pick(dock, '[data-panel-levels]');
  const panelLevelStat = pick(dock, '[data-panel-level-stat]');
  const panelBugs = pick(dock, '[data-panel-bugs]');
  const panelAch = pick(dock, '[data-panel-ach]');
  const panelTotal = pick(dock, '[data-panel-total]');
  const yearSr = pick(dock, '[data-hud-year-sr]');
  const offSr = pick(dock, '[data-hud-off-sr]');
  const achList = pick(dock, '[data-ach-list]');
  const yearStat = pick(dock, '[data-hud-year-stat]');
  const yearOut = pick(dock, '[data-hud-year]');
  // On phones some bugs are left out, so they do not count towards catching every bug.
  if (matchMedia('(max-width: 47.99rem)').matches) document.querySelectorAll('[data-bug][data-phone="none"]').forEach((b) => b.remove());
  const bugs = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-bug]'));
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-level]'));
  // On the Portfolio the markers are years, one where each new year begins, newest first.
  const yearEls = Array.from(document.querySelectorAll<HTMLElement>('[data-year]'));
  const yearMarks = yearEls.filter((el, i) => i === 0 || el.dataset.year !== yearEls[i - 1].dataset.year);
  const marks: { el: HTMLElement; label: string }[] = yearMarks.length
    ? yearMarks.map((el) => ({ el, label: el.dataset.year! }))
    : sections.slice(1).map((el, i) => ({ el, label: String(i + 2) }));
  const total = Object.keys(ACHIEVEMENTS).length;

  // The achievements list on the card: one row each, ticked when unlocked.
  achList.replaceChildren(
    ...Object.entries(ACHIEVEMENTS).map(([id, title]) => {
      const li = document.createElement('li');
      li.dataset.ach = id;
      li.innerHTML =
        '<svg class="score__box" viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h7v1H0zM0 6h7v1H0zM0 1h1v5H0zM6 1h1v5H6z" fill="currentColor"/><path class="score__boxtick" d="M6 1h1v1H6zM5 2h1v1H5zM4 3h1v1H4zM3 4h1v1H3zM2 5h1v1H2zM1 4h1v1H1zM0 3h1v1H0z" fill="currentColor"/></svg>';
      li.append(title);
      return li;
    }),
  );

  // Scoreboard readouts
  const pad = (n: number) => String(n).padStart(2, '0');
  let level = 1;
  const render = () => {
    const nb = state.bugs.length;
    const na = state.achievements.length;
    bugsOut.textContent = pad(nb);
    panelBugs.textContent = String(nb);
    achOut.textContent = `${na}/${total}`;
    panelAch.textContent = String(na);
    panelTotal.textContent = String(total);
    levelOut.textContent = String(level);
    panelLevel.textContent = String(level);
    achList.querySelectorAll<HTMLElement>('li').forEach((li) => li.classList.toggle('is-done', state.achievements.includes(li.dataset.ach!)));
    yearSr.textContent = yearEls.length ? `year ${yearOut.textContent}` : '';
    offSr.textContent = state.on ? '' : 'games off';
    toggle.setAttribute('aria-pressed', String(state.on));
    toggle.querySelector('b')!.textContent = state.on ? 'on' : 'off';
    toggle.setAttribute('aria-label', state.on ? 'Games on' : 'Games off');
    hud.classList.toggle('hud--off', !state.on);
    dock.classList.toggle('dock--off', !state.on);
    html.classList.toggle('games', state.on);
    html.classList.toggle('games-off', !state.on);
    bugs().forEach((b) => (b.hidden = !state.on || state.bugs.includes(b.dataset.bug!)));
  };

  // Achievements: a toast for each, once, one at a time, three seconds, never blocking.
  const queue: string[] = [];
  let showing = false;
  let timer = 0;
  const hide = () => {
    toast?.classList.remove('is-in');
    showing = false;
    window.clearTimeout(timer);
    window.setTimeout(next, 360);
  };
  const next = () => {
    if (showing || !toast) return;
    const id = queue.shift();
    if (!id) return;
    toast.querySelector('[data-toast-title]')!.textContent = ACHIEVEMENTS[id];
    toast.classList.add('is-in');
    showing = true;
    timer = window.setTimeout(hide, 3000);
  };
  toast?.querySelector('[data-toast-close]')?.addEventListener('click', hide);
  const achieve = (id: string) => {
    if (!state.on || !ACHIEVEMENTS[id] || state.achievements.includes(id)) return;
    state.achievements.push(id);
    write(state);
    render();
    queue.push(id);
    next();
  };

  // Bug hunt: every bug is a real button, so a click, a tap and Enter all catch it. The catch is
  // CSS: the net swoops over the bug, the bug wiggles, both go, a +1 rises, then the counter moves.
  const CATCH_MS = 1100;
  document.addEventListener('click', (e) => {
    const bug = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-bug]');
    if (!bug || !state.on || bug.classList.contains('is-caught')) return;
    bug.classList.add('is-caught');
    bug.setAttribute('aria-disabled', 'true');
    const id = bug.dataset.bug!;
    if (!state.bugs.includes(id)) state.bugs.push(id);
    write(state);
    window.setTimeout(() => {
      bug.hidden = true;
      render();
      live.textContent = `Bug caught. ${state.bugs.length} found.`;
      achieve('first-bug');
      if (bugs().every((b) => state.bugs.includes(b.dataset.bug!))) achieve('all-bugs');
    }, CATCH_MS);
  });

  // Discoveries: an achievement unlocks when every element carrying its id has been on screen.
  const pending = new Map<string, Set<Element>>();
  document.querySelectorAll('[data-achieve]').forEach((el) => {
    const id = el.getAttribute('data-achieve')!;
    if (!pending.has(id)) pending.set(id, new Set());
    pending.get(id)!.add(el);
  });
  if (pending.size && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = e.target.getAttribute('data-achieve')!;
          const set = pending.get(id);
          set?.delete(e.target);
          io.unobserve(e.target);
          if (set && set.size === 0) achieve(id);
        }
      },
      { threshold: 0.6 },
    );
    pending.forEach((set) => set.forEach((el) => io.observe(el)));
  }
  document.addEventListener('playrun:achieve', (e) => achieve((e as CustomEvent<string>).detail));

  // The scan: a bonus on a game card that is already on screen. Once the scroll settles, the row
  // wholly on screen nearest the middle plays its cards left to right, one reaction at a time,
  // each card once per page view; a card that misses its moment (scrolling fast) keeps its turn for
  // the next time it settles on screen, so every card can end up stamped. Every card gets the
  // reaction (the flash, the band, the Pass stamp); on a desktop a card with a clear line of fire
  // (a path from the ship's nose to its logo that crosses no other card and no company block, in
  // practice the left column) also gets the pixel bolt, a muzzle flash as it leaves and a burst
  // where it lands. On a phone the reaction plays alone. A shot takes 1.2 s, a plain scan 0.8 s.
  // Nothing is ever hidden.
  const SHOT_MS = 1300;
  const SCAN_MS = 800;
  const FLIGHT_MS = 350;
  const shot = document.querySelector<HTMLElement>('[data-shot]');
  const boltPx = Array.from(shot?.querySelectorAll<HTMLElement>('.bolt__px') ?? []);
  const muzzlePx = Array.from(shot?.querySelectorAll<HTMLElement>('.muzzle__px') ?? []);
  const burstPx = Array.from(shot?.querySelectorAll<HTMLElement>('.burst__px') ?? []);
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-scan]'));
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('.group__head'));
  const scanned = new Set<HTMLElement>();
  let shooting = false;
  let speed = 0;
  let settleTimer = 0;
  const at = (x: number, y: number) => `translate(${x}px, ${y}px)`;
  const nose = () => {
    const s = runner.getBoundingClientRect();
    return { x: s.right, y: s.top + s.height / 2 };
  };
  const logoOf = (card: HTMLElement) => {
    const r = (card.querySelector('.card__logo') ?? card).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  // Does the segment from a to b cross the box r? (Liang-Barsky clipping, with a little margin.)
  const crosses = (a: { x: number; y: number }, b: { x: number; y: number }, r: DOMRect, pad = 4) => {
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const edges = [
      [-dx, a.x - (r.left - pad)],
      [dx, r.right + pad - a.x],
      [-dy, a.y - (r.top - pad)],
      [dy, r.bottom + pad - a.y],
    ];
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
    return t0 <= t1;
  };
  const clear = (card: HTMLElement) => {
    const a = nose();
    const b = logoOf(card);
    const others = [...targets.filter((c) => c !== card), ...blocks];
    return others.every((el) => !crosses(a, b, el.getBoundingClientRect()));
  };
  const fly = (el: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, ms: number, delay: number, endOpacity: number, easing = 'linear') =>
    el.animate([{ transform: at(from.x, from.y), opacity: 1 }, { transform: at(to.x, to.y), opacity: endOpacity }], { duration: ms, delay, easing, fill: 'forwards' });
  const fire = (card: HTMLElement) => {
    const a = nose();
    const b = logoOf(card);
    shot?.setAttribute('data-from', `${Math.round(a.x)},${Math.round(a.y)}`);
    shot?.setAttribute('data-to', `${Math.round(b.x)},${Math.round(b.y)}`);
    // the bolt: the four head squares first, the trail a beat behind each, thinning as it goes
    boltPx.forEach((px, i) => {
      const head = i < 4;
      const anim = fly(px, a, b, FLIGHT_MS, i * 14, head ? 1 : Math.max(0.1, 0.9 - (i - 4) * 0.1));
      anim.onfinish = () => px.animate([{ opacity: head ? 1 : 0.5 }, { opacity: 0 }], { duration: 70, fill: 'forwards' });
    });
    // the muzzle: a cross of five at the nose, gone in a blink
    const cross = [
      [0, 0],
      [-11, 0],
      [11, 0],
      [0, -11],
      [0, 11],
    ];
    muzzlePx.forEach((px, i) => {
      const [ox, oy] = cross[i];
      px.animate([{ transform: at(a.x + ox, a.y + oy), opacity: 1 }, { transform: at(a.x + ox * 1.8, a.y + oy * 1.8), opacity: 0 }], { duration: 160, easing: 'steps(3, end)', fill: 'forwards' });
    });
    // the recoil: the ship kicks back 3px and returns, on top of its own pose
    const sprite = runner.querySelector<HTMLElement>('.sprite');
    sprite?.animate([{ transform: 'translateX(0px)' }, { transform: 'translateX(-3px)', offset: 0.35 }, { transform: 'translateX(0px)' }], { duration: 220, easing: 'steps(4, end)', composite: 'add' });
    // the burst: twelve squares scatter from the hit and fade
    burstPx.forEach((px, i) => {
      const angle = (i / burstPx.length) * Math.PI * 2 + (i % 2 ? 0.25 : 0);
      const radius = 26 + (i % 3) * 8;
      px.animate(
        [
          { transform: at(b.x, b.y), opacity: 1 },
          { transform: at(b.x + Math.cos(angle) * radius, b.y + Math.sin(angle) * radius), opacity: 0 },
        ],
        { duration: 320, delay: FLIGHT_MS, easing: 'steps(6, end)', fill: 'forwards' },
      );
    });
  };
  const shoot = (card: HTMLElement) => {
    scanned.add(card);
    shooting = true;
    card.style.setProperty('--card-h', `${card.offsetHeight}px`);
    const bolt = vertical.matches && boltPx.length > 0 && clear(card);
    if (bolt) fire(card);
    // the card reacts as the bolt lands (at once where there is no bolt)
    window.setTimeout(() => card.classList.add('is-scanned'), bolt ? FLIGHT_MS : 0);
    window.setTimeout(() => {
      shooting = false;
      consider();
    }, bolt ? SHOT_MS : SCAN_MS);
  };
  const consider = () => {
    if (shooting || !state.on || hud.classList.contains('hud--off') || speed > 0.6) return;
    const mid = innerHeight / 2;
    // the cards wholly on screen whose centre sits in the middle band, grouped by row
    const rows = new Map<number, { card: HTMLElement; left: number; d: number }[]>();
    for (const card of targets) {
      if (scanned.has(card) || !card.classList.contains('is-in')) continue;
      const r = card.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) continue;
      if (r.right < 1 || r.left > innerWidth - 1 || r.left < -1 || r.right > innerWidth + 1) continue;
      // (a card folded to its row on a phone waits until it is opened)
      const body = card.querySelector('.card__body');
      if (body && getComputedStyle(body).visibility === 'hidden') continue;
      const centre = (r.top + r.bottom) / 2;
      if (centre < innerHeight * 0.2 || centre > innerHeight * 0.8) continue;
      const key = Math.round(r.top / 8);
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key)!.push({ card, left: r.left, d: Math.abs(centre - mid) });
    }
    // the row nearest the middle, then its leftmost card: the row plays left to right
    let best: { card: HTMLElement; left: number; d: number }[] | null = null;
    for (const row of rows.values()) if (!best || row[0].d < best[0].d) best = row;
    if (!best) return;
    best.sort((a, b) => a.left - b.left);
    shoot(best[0].card);
  };
  if (targets.length) {
    let speedY = scrollY;
    let speedT = performance.now();
    addEventListener(
      'scroll',
      () => {
        const now = performance.now();
        speed = Math.abs(scrollY - speedY) / Math.max(1, now - speedT);
        speedY = scrollY;
        speedT = now;
        window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => {
          speed = 0;
          consider();
        }, 160);
      },
      { passive: true },
    );
    window.setTimeout(consider, 400);
    addEventListener('load', () => window.setTimeout(consider, 300));
    // a card opened in a phone's folded list
    document.addEventListener('playrun:cardopen', () => {
      speed = 0;
      consider();
    });
  }

  // The runner: scroll progress, set on scroll inside a frame, drives its place on the track
  // through one custom property. Level marks sit where each section starts along the same track.
  const docRange = () => Math.max(1, html.scrollHeight - innerHeight);
  // On desktop the bar stands on the left edge and the ship runs down it; otherwise it lies
  // along the bottom and the ship runs across, with the scoreboard pill at the right end.
  const vertical = matchMedia('(min-width: 64rem)');
  const layout = () => {
    const free = vertical.matches ? hud.clientHeight : hud.clientWidth - pill.offsetWidth;
    const ship = vertical.matches ? runner.offsetHeight : runner.offsetWidth;
    hud.style.setProperty('--track', `${Math.max(0, free - ship)}px`);
    levelsList.replaceChildren(
      ...marks.map((m) => {
        const li = document.createElement('li');
        li.style.setProperty('--at', String(Math.min(1, m.el.offsetTop / docRange())));
        const text = document.createElement('span');
        // The upright rail has room for two digits: a year shows its last two there.
        text.textContent = vertical.matches && m.label.length > 2 ? m.label.slice(-2) : m.label;
        li.append(text);
        return li;
      }),
    );
    yearStat.hidden = yearEls.length === 0;
    levelsOut.textContent = String(sections.length);
    panelLevels.textContent = String(sections.length);
    // Pages without levels (Credits) show no level count.
    levelStat.hidden = sections.length === 0;
    panelLevelStat.hidden = sections.length === 0;
  };
  let lastY = scrollY;
  let moveTimer = 0;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scrollY;
      if (y !== lastY) {
        runner.dataset.dir = y < lastY ? '-1' : '1';
        runner.classList.add('is-moving');
        window.clearTimeout(moveTimer);
        moveTimer = window.setTimeout(() => runner.classList.remove('is-moving'), 200);
      }
      lastY = y;
      hud.style.setProperty('--p', String(Math.min(1, y / docRange())));
      const line = y + innerHeight * 0.45;
      let now = 1;
      sections.forEach((s, i) => s.offsetTop <= line && (now = i + 1));
      Array.from(levelsList.children).forEach((li, i) => li.classList.toggle('is-past', marks[i].el.offsetTop <= line));
      let year = yearEls[0]?.dataset.year ?? '';
      yearEls.forEach((el) => el.offsetTop <= line && (year = el.dataset.year!));
      if (now !== level || (yearEls.length && year !== yearOut.textContent)) {
        level = now;
        if (yearEls.length) yearOut.textContent = year;
        render();
      }
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', layout);
  vertical.addEventListener('change', layout);

  // Controls. The pill opens the card and closes it (a tap on a phone, a click or Enter anywhere);
  // a click outside closes it too. Hover and focus open it without pinning it.
  const open = (on: boolean) => {
    score.classList.toggle('is-open', on);
    pill.setAttribute('aria-expanded', String(on));
  };
  pill.addEventListener('click', () => open(!score.classList.contains('is-open')));
  document.addEventListener('click', (e) => {
    if (score.classList.contains('is-open') && !dock.contains(e.target as Node)) open(false);
  });
  dock.addEventListener('focusout', (e) => {
    if (!dock.contains(e.relatedTarget as Node | null)) open(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && score.classList.contains('is-open')) {
      open(false);
      pill.focus();
    }
  });
  toggle.addEventListener('click', () => {
    state.on = !state.on;
    write(state);
    render();
    layout();
    live.textContent = state.on ? 'Games on.' : 'Games off. The page is just the page.';
  });
  reset.addEventListener('click', () => {
    state.bugs = [];
    state.achievements = [];
    write(state);
    bugs().forEach((b) => {
      b.classList.remove('is-caught');
      b.removeAttribute('aria-disabled');
    });
    render();
    live.textContent = 'Progress reset. Bugs found 0, achievements 0.';
  });

  hud.hidden = false;
  dock.hidden = false;
  render();
  layout();
  onScroll();
  // Fonts and lazy images change the page height after load; place the marks again when they do.
  addEventListener('load', layout);
  document.fonts?.ready.then(layout);
}
