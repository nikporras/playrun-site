/**
 * The hero's exit, triggered by the scroll, never scrubbed by it. Markers sit near the top of
 * Level 2; one IntersectionObserver watches them cross the foot of the hero as Level 2 slides up
 * over it. When the first one passes, the name glitches once: four slices of a copy of it (CSS,
 * decorative, hidden from assistive tech) jump a few pixels sideways with a thin cyan and pink
 * split and snap back, in about 0.36 s. The real heading never moves or changes. Once a visit:
 * scrolling back up does not replay it (Reset on the scoreboard lets it happen again). A second
 * pair of markers fades the hero out in 0.4 s once Level 2 covers most of it and back in on the
 * way up; the gap between them keeps it from flickering at the threshold. Nothing here reads or
 * follows the scroll position frame by frame, so the page scrolls natively.
 *
 * Right after the glitch a small card asks "Glitch on the name. Track it?", in the scoreboard's
 * corner with the toasts. Track it (✓): "Bug tracked", then the achievement "Glitch spotted".
 * Ignore (✗), or nothing for eight seconds: it closes quietly. Real buttons in the tab order; it
 * never takes the focus. While it is up, the toast and the scoreboard's card open above it.
 *
 * Off without script, under reduced motion, with the motion switch off and with the games off: the
 * hero simply goes behind, with no glitch and no card.
 */
const TIMING = { glitch: 360, fade: 400, tracked: 1200, prompt: 8000 };
const KEY = 'playrun.glitch';
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
    /* storage off: it may glitch again on the next visit to Home */
  }
};

export function startHeroExit() {
  const hero = document.querySelector<HTMLElement>('.hero');
  const wall = document.querySelector<HTMLElement>('.wall');
  const copy = document.querySelector<HTMLElement>('[data-glitch]');
  const card = document.querySelector<HTMLElement>('[data-glitch-card]');
  const text = card?.querySelector<HTMLElement>('[data-glitch-text]');
  const actions = card?.querySelector<HTMLElement>('[data-glitch-actions]');
  const yes = card?.querySelector<HTMLButtonElement>('[data-glitch-yes]');
  const no = card?.querySelector<HTMLButtonElement>('[data-glitch-no]');
  const dock = document.getElementById('dock');
  if (!hero || !wall || !copy || !card || !text || !actions || !yes || !no || !dock) return;
  if (!('IntersectionObserver' in window)) return;
  const html = document.documentElement;
  // (the games off, or motion off from the switch: the hero simply goes behind)
  const off = () => html.classList.contains('games-off') || html.classList.contains('motion-off');

  // ---- The hero's fade, a Web Animation
  let fade: Animation | null = null;
  let faded = false;
  const fadeTo = (f: boolean, instant = false) => {
    if (f === faded) return;
    faded = f;
    const now = Number(getComputedStyle(hero).opacity);
    fade?.cancel();
    fade = hero.animate([{ opacity: now }, { opacity: f ? 0 : 1 }], { duration: instant ? 0 : TIMING.fade, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
  };

  // ---- The card: in the scoreboard's corner, the toast and the scoreboard's card above it
  dock.prepend(card);
  let timer = 0;
  const lift = () => html.style.setProperty('--prompt-lift', card.classList.contains('is-in') ? `${card.offsetHeight + 8}px` : '0px');
  const close = () => {
    window.clearTimeout(timer);
    // (focus inside it goes to the scoreboard, never to nowhere)
    if (card.contains(document.activeElement)) dock.querySelector<HTMLElement>('[data-hud-more]')?.focus();
    card.classList.remove('is-in');
    lift();
    timer = window.setTimeout(() => (card.hidden = true), 300);
  };
  const wait = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(close, TIMING.prompt);
  };
  const prompt = () => {
    window.clearTimeout(timer);
    actions.hidden = false;
    card.hidden = false;
    text.textContent = 'Glitch on the name. Track it?';
    void card.offsetHeight;
    card.classList.add('is-in');
    lift();
    wait();
  };
  yes.addEventListener('click', () => {
    window.clearTimeout(timer);
    // (the focus stays in the card, on its message, until it closes)
    text.focus();
    actions.hidden = true;
    text.textContent = 'Bug tracked';
    lift();
    timer = window.setTimeout(() => {
      close();
      document.dispatchEvent(new CustomEvent('playrun:achieve', { detail: 'glitch' }));
    }, TIMING.tracked);
  });
  no.addEventListener('click', close);
  // (ignored means untouched: not while the visitor is in it)
  card.addEventListener('focusin', () => card.classList.contains('is-in') && !actions.hidden && window.clearTimeout(timer));
  card.addEventListener('focusout', (e) => {
    if (!card.contains(e.relatedTarget as Node) && card.classList.contains('is-in') && !actions.hidden) wait();
  });

  // ---- The glitch, once a visit
  const glitch = () => {
    if (seen()) return;
    markSeen();
    copy.classList.add('is-on');
    window.setTimeout(() => {
      copy.classList.remove('is-on');
      if (!off()) prompt();
    }, TIMING.glitch);
  };

  // ---- The thresholds: markers near the top of Level 2 crossing the foot of the hero (the foot of
  // the screen, above a bottom bar). The glitch as soon as Level 2 starts over the hero; the hero
  // fades out once Level 2 covers 60% of it (the photo showing through the clouds until then) and
  // back in below 55%. Each marker runs from its line down to the end of the page, so it is on
  // screen exactly while its line is above the foot: a jump past a threshold either way still
  // changes that, and the observer always hears of it. They lie in the page itself.
  const marks = { glitch: 0.03, fadeOut: 0.6, fadeIn: 0.55 };
  type Mark = keyof typeof marks;
  const markers = new Map<Element, Mark>();
  for (const k of Object.keys(marks) as Mark[]) {
    const m = document.createElement('div');
    m.className = 'wall__trip';
    m.dataset.trip = k;
    m.setAttribute('aria-hidden', 'true');
    wall.before(m);
    markers.set(m, k);
  }
  let io: IntersectionObserver | null = null;
  let armed = false;
  let wasPast = false;
  const past: Record<Mark, boolean> = { glitch: false, fadeOut: false, fadeIn: false }; // each line above the foot
  const decide = (instant: boolean) => {
    if (off()) return;
    // (only on the way down, past the line, and never for a page that opened past it)
    if (past.glitch && !wasPast && !instant && armed) glitch();
    wasPast = past.glitch;
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
      // the glitch where the clouds are a little way over the foot; the fade by how much of the
      // hero on screen is covered
      const depth = k === 'glitch' ? Math.max(24, marks.glitch * foot) : marks[k] * foot;
      const line = top + depth;
      (m as HTMLElement).style.top = `${Math.round(line)}px`;
      (m as HTMLElement).style.height = `${Math.max(1, Math.round(end - line))}px`;
    }
    let first = true;
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) past[markers.get(e.target)!] = e.isIntersecting || e.boundingClientRect.bottom <= 0;
        // (the first report is the page as it opened: no animation, no glitch nobody saw)
        decide(first);
        first = false;
      },
      { rootMargin: `0px 0px ${-Math.max(0, Math.round(innerHeight - foot))}px 0px` },
    );
    for (const m of markers.keys()) io.observe(m);
  };

  // ---- Games or motion off: the hero simply goes behind, and the card goes; back on, the
  // threshold decides again, at once.
  let wasOff = off();
  new MutationObserver(() => {
    const now = off();
    if (now === wasOff) return;
    wasOff = now;
    if (now) {
      fade?.cancel();
      fade = null;
      faded = false;
      copy.classList.remove('is-on');
      if (card.classList.contains('is-in')) close();
    } else decide(true);
  }).observe(html, { attributes: true, attributeFilter: ['class'] });

  // ---- The page changes size: place the markers again.
  let pending = false;
  const relayout = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      watch();
    });
  };
  addEventListener('resize', relayout);
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.body);
  document.fonts.ready.then(() => {
    watch();
    // (the observer's first report sets the page as it opened; from then on, the glitch)
    requestAnimationFrame(() => (armed = true));
  });
}
