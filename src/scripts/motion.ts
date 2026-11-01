/**
 * Motion on or off for this site. By default it follows the device: off when the device asks for
 * reduced motion. The Motion switch in the header overrides that either way, and the choice is kept
 * in localStorage ('on' or 'off'). An inline script in the head (head-inline.js) sets `motion-off`
 * on <html> before the first paint; that class is the one answer every rule and script reads: CSS
 * stops every animation and transition under it, and the scripts ask here before they move
 * anything. The switch flips the class live. (Without script the CSS falls back on the device's
 * prefers-reduced-motion.)
 */
const KEY = 'playrun.motion';
const html = document.documentElement;
const device = matchMedia('(prefers-reduced-motion: reduce)');

/** The visitor's own choice from the switch, if they made one. */
export function motionChoice(): 'on' | 'off' | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' ? v : null;
  } catch {
    return null;
  }
}

/** True when nothing should move: the switch is off, or the device asks for it and the switch was not turned on. */
export const reducedMotion = () => html.classList.contains('motion-off');

/** Off only because of the device's setting: the visitor has not chosen. */
export const offByDevice = () => device.matches && motionChoice() === null;

/** Called whenever motion turns on or off (the switch, or the device setting changing). */
export function onMotionChange(cb: (reduced: boolean) => void) {
  let last = reducedMotion();
  new MutationObserver(() => {
    const now = reducedMotion();
    if (now !== last) {
      last = now;
      cb(now);
    }
  }).observe(html, { attributes: true, attributeFilter: ['class'] });
}

/** Runs `fn` now if motion is on, or once, the first time motion turns on. */
export function whenMotion(fn: () => void) {
  if (!reducedMotion()) {
    fn();
    return;
  }
  let done = false;
  onMotionChange((reduced) => {
    if (reduced || done) return;
    done = true;
    fn();
  });
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

// The device setting changing while the page is open counts only while the visitor has not chosen.
device.addEventListener('change', () => {
  if (motionChoice() === null) html.classList.toggle('motion-off', device.matches);
});
