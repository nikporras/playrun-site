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
  const laser = document.querySelector<HTMLElement>('[data-laser]');
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

  // The scan: a bonus on a game card that is already on screen. Once the scroll settles, the card
  // that is wholly on screen and nearest the middle gets one shot: on a desktop the ship fires a
  // beam at its logo, with a flash at the nose, and the card is scanned (a line sweeps it, a tick
  // flashes); on a phone the sweep alone. One shot at a time, never while scrolling fast, each card
  // once per page view; a card that misses its moment is simply shown. Nothing is ever hidden.
  const SHOT_MS = 900;
  const flash = document.querySelector<HTMLElement>('[data-flash]');
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-scan]'));
  const scanned = new Set<HTMLElement>();
  let shooting = false;
  let speed = 0;
  let settleTimer = 0;
  const shoot = (card: HTMLElement) => {
    scanned.add(card);
    shooting = true;
    if (vertical.matches && laser) {
      const r = (card.querySelector('.card__logo') ?? card).getBoundingClientRect();
      const s = runner.getBoundingClientRect();
      // from the nose of the ship to the middle of the card's logo
      const sx = s.right;
      const sy = s.top + s.height / 2;
      const tx = r.left + r.width / 2;
      const ty = r.top + r.height / 2;
      const dx = tx - sx;
      const dy = ty - sy;
      laser.style.setProperty('--x', `${sx}px`);
      laser.style.setProperty('--y', `${sy}px`);
      laser.style.setProperty('--len', `${Math.hypot(dx, dy)}px`);
      laser.style.setProperty('--a', `${Math.atan2(dy, dx)}rad`);
      laser.classList.remove('is-on');
      void laser.offsetWidth;
      laser.classList.add('is-on');
      if (flash) {
        flash.style.setProperty('--x', `${sx}px`);
        flash.style.setProperty('--y', `${sy}px`);
        flash.classList.remove('is-on');
        void flash.offsetWidth;
        flash.classList.add('is-on');
      }
    }
    card.classList.add('is-scanned');
    window.setTimeout(() => {
      shooting = false;
      consider();
    }, SHOT_MS);
  };
  const consider = () => {
    if (shooting || !state.on || hud.classList.contains('hud--off') || speed > 0.6) return;
    const mid = innerHeight / 2;
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    for (const card of targets) {
      if (scanned.has(card) || !card.classList.contains('is-in')) continue;
      const r = card.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) continue;
      const centre = (r.top + r.bottom) / 2;
      if (centre < innerHeight * 0.2 || centre > innerHeight * 0.8) continue;
      const d = Math.abs(centre - mid);
      if (d < bestD) {
        bestD = d;
        best = card;
      }
    }
    if (best) shoot(best);
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
