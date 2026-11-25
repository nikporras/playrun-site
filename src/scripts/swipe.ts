/**
 * The swipe (src/components/Swipe.astro), on phones and tablets: the row scrolls and snaps by
 * itself; this keeps "n of N", the dots and the buttons in step with it, moves one card on
 * Previous, Next and the arrow keys (at once with motion off), and makes the row reachable by Tab
 * while it scrolls. Nothing on a desktop, where the list has the page's own layout.
 */
import { reducedMotion } from './motion';

export function startSwipes() {
  document.querySelectorAll<HTMLElement>('[data-swipe]').forEach(setup);
}

function setup(root: HTMLElement) {
  const track = root.querySelector<HTMLElement>('.swipe__track');
  const prev = root.querySelector<HTMLButtonElement>('[data-swipe-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-swipe-next]');
  const pos = root.querySelector<HTMLElement>('[data-swipe-pos]');
  if (!track || !prev || !next || !pos) return;
  const slides = Array.from(track.children) as HTMLElement[];
  const dots = Array.from(root.querySelectorAll<HTMLElement>('.swipe__dot'));
  const n = slides.length;
  const narrow = matchMedia('(max-width: 63.99rem)');
  let i = 0;

  const left = (k: number) => slides[k].offsetLeft - slides[0].offsetLeft;
  const current = () => {
    const max = track.scrollWidth - track.clientWidth;
    if (max > 0 && track.scrollLeft >= max - 2) return n - 1;
    const step = n > 1 ? left(1) : 1;
    return Math.max(0, Math.min(n - 1, Math.round(track.scrollLeft / step)));
  };
  const paint = () => {
    const k = current();
    if (k !== i || pos.textContent !== `${k + 1} of ${n}`) {
      i = k;
      pos.textContent = `${i + 1} of ${n}`;
    }
    dots.forEach((d, j) => d.classList.toggle('is-on', j === i));
    // (aria-disabled, not disabled: a button that disables itself under the finger or the
    // keyboard would drop the focus)
    prev.setAttribute('aria-disabled', String(i === 0));
    next.setAttribute('aria-disabled', String(i === n - 1));
  };
  const go = (k: number) => {
    const to = Math.max(0, Math.min(n - 1, k));
    track.scrollTo({ left: left(to), behavior: reducedMotion() ? 'instant' : 'smooth' });
  };
  prev.addEventListener('click', () => go(i - 1));
  next.addEventListener('click', () => go(i + 1));
  root.addEventListener('keydown', (e) => {
    if (!narrow.matches || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'ArrowRight') go(i + 1);
    else return;
    e.preventDefault();
  });
  let queued = false;
  track.addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        paint();
      });
    },
    { passive: true },
  );
  // A swipe is a carousel only where it swipes; there the row takes the keyboard's focus (it
  // scrolls, and its cards hold nothing focusable).
  const mode = () => {
    if (narrow.matches) {
      root.setAttribute('aria-roledescription', 'carousel');
      track.tabIndex = 0;
    } else {
      root.removeAttribute('aria-roledescription');
      track.removeAttribute('tabindex');
    }
    paint();
  };
  narrow.addEventListener('change', mode);
  addEventListener('resize', paint);
  mode();
}
