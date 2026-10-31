/**
 * Motion on or off for this site: the device's prefers-reduced-motion, or the visitor's own choice
 * from the Motion switch in the header (kept in localStorage). An inline script in the head sets
 * `motion-off` on <html> before the first paint; CSS stops every animation and transition under
 * it, and the scripts ask here before they move anything. The switch flips the class live.
 */
const KEY = 'playrun.motion';
const html = document.documentElement;
const device = matchMedia('(prefers-reduced-motion: reduce)');

/** True when nothing should move: the device asks for reduced motion, or the switch is off. */
export const reducedMotion = () => device.matches || html.classList.contains('motion-off');

/** Called whenever motion turns on or off (the switch, or the device setting changing). */
export function onMotionChange(cb: (reduced: boolean) => void) {
  let last = reducedMotion();
  const check = () => {
    const now = reducedMotion();
    if (now !== last) {
      last = now;
      cb(now);
    }
  };
  new MutationObserver(check).observe(html, { attributes: true, attributeFilter: ['class'] });
  device.addEventListener('change', check);
}

/** The switch: remember the choice and apply it at once. */
export function setMotion(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage off: the choice holds for this page */
  }
  html.classList.toggle('motion-off', !on);
}
