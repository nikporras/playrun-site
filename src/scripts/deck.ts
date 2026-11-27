/**
 * The dealt deck: a list of cards that are dealt in with the scroll. On a desktop with motion the
 * deck pins for a few screens and each card after the first rises from below, tilts its own few
 * degrees and stacks on the last, scrubbed by the scroll through --e (0 to 1) on each card, and
 * transform only. Off on phones, under reduced motion and without script: the cards stay in flow.
 * Markup: [data-deck] > .deck__pin > (the level head, the QA Lab's picker, then the swipe with
 * .deck__stage > .deck__card*), each card
 * with --i (its index) and --tilt (its angle). A jump to a card's id lands where it is dealt.
 */
import { reducedMotion, onMotionChange } from './motion';

export function startDeck() {
  const deck = document.querySelector<HTMLElement>('[data-deck]');
  if (!deck) return;
  const cards = Array.from(deck.querySelectorAll<HTMLElement>('.deck__card'));
  const stage = deck.querySelector<HTMLElement>('.deck__stage');
  const pin = deck.querySelector<HTMLElement>('.deck__pin');
  if (!stage || !pin || cards.length < 2) return;
  const wide = matchMedia('(min-width: 64rem)');
  const ease = (k: number) => 1 - Math.pow(1 - k, 3);
  const steps = cards.length - 1;
  let on = false;
  deck.style.setProperty('--n', String(cards.length));
  // (the pinned unit, the level head and the stage of cards, sits centred in the screen: its
  // sticky top, from measure(); a unit taller than the screen pins with its foot on the screen's
  // foot, so the cards stay whole and only the top of the head goes off the top)
  let pinTop = 0;
  // (the scroll at which the pin catches: the deck's top reaching the pin's centred top)
  const top = () => deck.getBoundingClientRect().top + scrollY - pinTop;
  // (the scroll the deck stays pinned for: its height less the pinned stage's own)
  const range = () => Math.max(1, deck.offsetHeight - pin.offsetHeight);
  const measure = () => {
    if (!on) {
      deck.style.removeProperty('--pin-h');
      deck.style.removeProperty('--pin-top');
      pinTop = 0;
      return;
    }
    stage.style.setProperty('--stage-h', `${Math.max(...cards.map((c) => c.offsetHeight)) + cards.length * 12}px`);
    deck.style.setProperty('--pin-h', `${pin.offsetHeight}px`);
    const room = innerHeight - pin.offsetHeight;
    pinTop = Math.round(room >= 0 ? room / 2 : room);
    deck.style.setProperty('--pin-top', `${pinTop}px`);
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
    on = wide.matches && !reducedMotion();
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
  onMotionChange(apply);
  document.fonts?.ready.then(() => {
    measure();
    scrub();
  });
  // A card's content can grow after it is dealt (a live result arriving): keep the stage tall enough.
  if ('ResizeObserver' in window) {
    // (on the next frame: measuring inside the callback changes the deck's height in the same
    // frame and the browser reports a ResizeObserver loop)
    let pending = false;
    const ro = new ResizeObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        measure();
        scrub();
      });
    });
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
  // Keyboard: focus moving to something in a card brings that card to the top of the pinned
  // stack, dealt and on screen, with the cards after it still waiting below.
  deck.addEventListener('focusin', (e) => {
    if (!on) return;
    const i = cards.findIndex((c) => c.contains(e.target as Node));
    if (i < 0) return;
    // (on the next frame: after the browser's own scroll to the focused element)
    requestAnimationFrame(() => {
      const y = top() + (i === 0 ? 0 : (range() * i) / steps);
      if (Math.abs(scrollY - y) > 2) scrollTo({ top: y, behavior: 'auto' });
    });
  });
  apply();
  jump();
}
