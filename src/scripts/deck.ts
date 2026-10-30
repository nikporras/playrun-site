/**
 * The dealt deck: a list of cards that are dealt in with the scroll. On a desktop with motion the
 * deck pins for a few screens and each card after the first rises from below, tilts its own few
 * degrees and stacks on the last, scrubbed by the scroll through --e (0 to 1) on each card, and
 * transform only. Off on phones, under reduced motion and without script: the cards stay in flow.
 * Markup: [data-deck] > .deck__pin > (the level head, then .deck__stage > .deck__card*), each card
 * with --i (its index) and --tilt (its angle). A jump to a card's id lands where it is dealt.
 */
export function startDeck() {
  const deck = document.querySelector<HTMLElement>('[data-deck]');
  if (!deck) return;
  const cards = Array.from(deck.querySelectorAll<HTMLElement>('.deck__card'));
  const stage = deck.querySelector<HTMLElement>('.deck__stage');
  if (!stage || cards.length < 2) return;
  const wide = matchMedia('(min-width: 64rem)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = (k: number) => 1 - Math.pow(1 - k, 3);
  const steps = cards.length - 1;
  let on = false;
  deck.style.setProperty('--n', String(cards.length));
  const top = () => deck.getBoundingClientRect().top + scrollY;
  const range = () => Math.max(1, deck.offsetHeight - innerHeight);
  const measure = () => {
    if (!on) return;
    stage.style.setProperty('--stage-h', `${Math.max(...cards.map((c) => c.offsetHeight)) + cards.length * 12}px`);
  };
  const scrub = () => {
    if (!on) return;
    const p = Math.min(1, Math.max(0, (scrollY - top()) / range()));
    cards.forEach((c, i) => {
      if (i === 0) return;
      const e = Math.min(1, Math.max(0, (p - (i - 1) / steps) * steps));
      c.style.setProperty('--e', String(ease(e)));
    });
  };
  const apply = () => {
    on = wide.matches && !reduce.matches;
    deck.classList.toggle('is-deck', on);
    if (!on) cards.forEach((c) => c.style.removeProperty('--e'));
    measure();
    scrub();
  };
  let queued = false;
  addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        scrub();
      });
    },
    { passive: true },
  );
  addEventListener('resize', () => {
    measure();
    scrub();
  });
  wide.addEventListener('change', apply);
  reduce.addEventListener('change', apply);
  document.fonts?.ready.then(() => {
    measure();
    scrub();
  });
  // A card's content can grow after it is dealt (a live result arriving): keep the stage tall enough.
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => measure());
    cards.forEach((c) => ro.observe(c));
  }
  const jump = () => {
    if (!on || !location.hash) return;
    const i = cards.findIndex((c) => `#${c.id}` === location.hash);
    if (i < 0) return;
    const y = top() + (i === 0 ? 0 : (range() * i) / steps);
    requestAnimationFrame(() => scrollTo({ top: y, behavior: 'auto' }));
  };
  addEventListener('hashchange', jump);
  apply();
  jump();
}
