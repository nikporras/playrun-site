/**
 * The games on the PlayRun site: the runner on the floor, the bug hunt and the achievements.
 * All of it is optional play. It is off under prefers-reduced-motion, off with the HUD button,
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
  const toast = document.querySelector<HTMLElement>('[data-toast]');
  if (!hud) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    hud.remove();
    toast?.remove();
    return;
  }

  const html = document.documentElement;
  const state = read();
  const pick = <T extends HTMLElement>(sel: string) => hud.querySelector<T>(sel)!;
  const toggle = pick<HTMLButtonElement>('[data-hud-toggle]');
  const reset = pick<HTMLButtonElement>('[data-hud-reset]');
  const live = pick('[data-hud-live]');
  const runner = pick('.hud__runner');
  const levelsList = pick('.hud__levels');
  const bugsOut = pick('[data-hud-bugs]');
  const achOut = pick('[data-hud-ach]');
  const levelOut = pick('[data-hud-level]');
  const levelsOut = pick('[data-hud-levels]');
  const yearStat = pick('[data-hud-year-stat]');
  const yearOut = pick('[data-hud-year]');
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

  // HUD readouts
  const pad = (n: number) => String(n).padStart(2, '0');
  const render = () => {
    bugsOut.textContent = pad(state.bugs.length);
    achOut.textContent = `${state.achievements.length}/${total}`;
    toggle.setAttribute('aria-pressed', String(state.on));
    toggle.querySelector('b')!.textContent = state.on ? 'on' : 'off';
    toggle.setAttribute('aria-label', state.on ? 'Games on' : 'Games off');
    hud.classList.toggle('hud--off', !state.on);
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
      bugsOut.textContent = pad(state.bugs.length);
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

  // Landings: the ship fires a short laser at each header or card as it comes into view, then
  // the thing lands. Shots queue a beat apart so a row of cards lands one after the other.
  const land = (el: HTMLElement) => el.classList.add('is-landed');
  const shots: HTMLElement[] = [];
  let firing = false;
  const fire = () => {
    const el = shots.shift();
    if (!el) {
      firing = false;
      return;
    }
    firing = true;
    if (!laser || !state.on || hud.classList.contains('hud--off')) {
      land(el);
      fire();
      return;
    }
    const r = el.getBoundingClientRect();
    const s = runner.getBoundingClientRect();
    const v = vertical.matches;
    // From the nose of the ship to the nearest edge of the target: its left edge on desktop (at
    // the ship's height where the target spans it), its bottom edge from the bar on a phone.
    const sx = v ? s.right : s.left + s.width / 2;
    const sy = v ? s.top + s.height / 2 : s.top;
    const tx = v ? r.left : Math.min(Math.max(sx, r.left), r.right);
    // on a phone the target is always above the bar, even one still coming up from below it
    const ty = v ? Math.min(Math.max(sy, r.top), r.bottom) : Math.min(r.bottom, sy - 8);
    const dx = tx - sx;
    const dy = ty - sy;
    laser.style.setProperty('--x', `${sx}px`);
    laser.style.setProperty('--y', `${sy}px`);
    laser.style.setProperty('--len', `${Math.hypot(dx, dy)}px`);
    laser.style.setProperty('--a', `${Math.atan2(dy, dx)}rad`);
    laser.classList.remove('is-on');
    void laser.offsetWidth;
    laser.classList.add('is-on');
    window.setTimeout(() => land(el), 170);
    window.setTimeout(fire, 140);
  };
  document.addEventListener('playrun:land', (e) => {
    shots.push((e as CustomEvent<HTMLElement>).detail);
    if (!firing) fire();
  });

  // The runner: scroll progress, set on scroll inside a frame, drives its place on the floor
  // through one custom property. Level flags mark where each section starts along the same track.
  const docRange = () => Math.max(1, html.scrollHeight - innerHeight);
  const panel = pick('.hud__panel');
  const more = pick('.hud__more');
  const stacked = matchMedia('(max-width: 47.99rem)');
  // On desktop the bar stands on the left edge and the ship runs down it; otherwise it lies
  // along the bottom and the ship runs across.
  const vertical = matchMedia('(min-width: 64rem)');
  const layout = () => {
    // The ship runs the length the panel leaves free; on a phone that is the Games button.
    const free = vertical.matches ? hud.clientHeight - panel.offsetHeight : hud.clientWidth - (stacked.matches ? more.offsetWidth : panel.offsetWidth);
    const ship = vertical.matches ? runner.offsetHeight : runner.offsetWidth;
    hud.style.setProperty('--track', `${Math.max(0, free - ship)}px`);
    levelsList.replaceChildren(
      ...marks.map((m) => {
        const li = document.createElement('li');
        li.style.setProperty('--at', String(Math.min(1, m.el.offsetTop / docRange())));
        // The upright bar has room for two digits: a year shows its last two there.
        li.textContent = vertical.matches && m.label.length > 2 ? m.label.slice(-2) : m.label;
        return li;
      }),
    );
    yearStat.hidden = yearEls.length === 0;
    levelsOut.textContent = String(sections.length);
    // Pages without levels (Credits) show no level count.
    levelOut.closest<HTMLElement>('.hud__stat')!.hidden = sections.length === 0;
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
      let level = 1;
      sections.forEach((s, i) => s.offsetTop <= line && (level = i + 1));
      levelOut.textContent = String(level);
      Array.from(levelsList.children).forEach((li, i) => li.classList.toggle('is-past', marks[i].el.offsetTop <= line));
      if (yearEls.length) {
        let year = yearEls[0].dataset.year!;
        yearEls.forEach((el) => el.offsetTop <= line && (year = el.dataset.year!));
        yearOut.textContent = year;
      }
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', layout);
  vertical.addEventListener('change', layout);

  // Controls. On phones the panel opens from the Games button and closes with it, or when
  // anything outside it is tapped.
  more.addEventListener('click', () => {
    const open = !hud.classList.contains('is-open');
    hud.classList.toggle('is-open', open);
    more.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (hud.classList.contains('is-open') && !hud.contains(e.target as Node)) {
      hud.classList.remove('is-open');
      more.setAttribute('aria-expanded', 'false');
    }
  });
  toggle.addEventListener('click', () => {
    state.on = !state.on;
    write(state);
    render();
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
  render();
  layout();
  onScroll();
  // Fonts and lazy images change the page height after load; place the flags again when they do.
  addEventListener('load', layout);
  document.fonts?.ready.then(layout);
}
