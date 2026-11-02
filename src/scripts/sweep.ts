/**
 * Bug Sweep, the small arcade game on the About page. Loaded only when Play is pressed.
 *
 * The site's own pixel ship (the logo icon, one and a half bugs wide here) moves along the bottom and fires upward at ten of the site's bugs,
 * two rows of five swaying at the top; every few seconds one dives at the ship in a curve and, if
 * it misses, comes back round to its place. Sweep all ten to clear the level ("Bug Sweep cleared",
 * an achievement on the scoreboard); a bug that touches the ship costs a life, and three is game
 * over. One level, about half a minute to a minute. No sound.
 *
 * Plain canvas, no library. The field is 160 by 128 game pixels, drawn at a whole number of device
 * pixels each, so it stays crisp at any size and any screen scale; the words, the lives and the
 * buttons are HTML around it. Keys (when the game has focus): arrows or A and D, Space, Esc. On
 * touch screens and on tablets and phones: the Left, Fire and Right buttons under the field, held
 * down to move and to keep firing; on a touch screen the dives are slower, for thumbs. It pauses
 * with Esc or the Pause button, when the tab is hidden and when the field leaves the screen. It
 * plays whatever the motion setting: the player starts it on purpose.
 */
import { SHIP_SMALL as SHIP, BUG, smallBand } from '../data/sprites';
import { track } from './track';

const W = 160;
const H = 128;
const COLS = 5;
const ROWS = 2;
const SHIP_W = SHIP[0].length;
const SHIP_H = SHIP.length;
const BUG_W = BUG[0].length;
const BUG_H = BUG.length;
const SHIP_Y = H - SHIP_H - 3;

type Mode = 'play' | 'paused' | 'won' | 'over';
type Dive = { phase: 'down' | 'back'; t: number; x0: number; y0: number; target: number; dir: number };
type Bug = { col: number; row: number; x: number; y: number; alive: boolean; dive: Dive | null };
type Shot = { x: number; y: number };
type Burst = { x: number; y: number; t: number };

// A bitmap drawn once into a small canvas of its own, one game pixel to one canvas pixel.
const bitmap = (rows: string[], colour: (ch: string, y: number) => string | null) => {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const fill = colour(ch, y);
      if (!fill) return;
      g.fillStyle = fill;
      g.fillRect(x, y, 1, 1);
    }),
  );
  return c;
};

export function startSweep(root: HTMLElement) {
  if (root.dataset.started) return;
  root.dataset.started = 'true';
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const stage = $<HTMLElement>('[data-sweep-stage]');
  const canvas = $<HTMLCanvasElement>('canvas');
  const ctx = canvas.getContext('2d')!;
  const overlay = $<HTMLElement>('[data-sweep-overlay]');
  const poster = $<HTMLElement>('[data-sweep-poster]');
  const title = $<HTMLElement>('[data-sweep-title]');
  const text = $<HTMLElement>('[data-sweep-text]');
  const action = $<HTMLButtonElement>('[data-sweep-action]');
  const pauseButton = $<HTMLButtonElement>('[data-sweep-pause]');
  const livesOut = $<HTMLElement>('[data-sweep-lives]');
  const bugsOut = $<HTMLElement>('[data-sweep-bugs]');
  const live = $<HTMLElement>('[data-sweep-live]');
  const pad = $<HTMLElement>('[data-sweep-pad]');
  const keysLeft = $<HTMLButtonElement>('[data-sweep-left]');
  const keysRight = $<HTMLButtonElement>('[data-sweep-right]');
  const keysFire = $<HTMLButtonElement>('[data-sweep-fire]');

  // The site's colours, read from the page.
  const css = getComputedStyle(document.documentElement);
  const colour = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const C = {
    navy: colour('--pr-navy', '#0C152A'),
    blue: colour('--pr-blue', '#516CB3'),
    cyan: colour('--pr-cyan', '#56BDDA'),
    green: colour('--pr-green', '#67C18C'),
    light: colour('--pr-light', '#E5E7EA'),
  };
  const shipArt = bitmap(SHIP, (ch, y) => (ch === '#' ? C[smallBand(y) as 'blue' | 'cyan' | 'green'] : null));
  const bugArt = bitmap(BUG, (ch) => ({ B: C.green, E: C.navy, L: C.cyan })[ch] ?? null);

  // Touch screens, and the tablets and phones that show the bottom bar: the buttons under the field.
  const touchQuery = matchMedia('(pointer: coarse)');
  const padQuery = matchMedia('(max-width: 63.99rem), (pointer: coarse)');
  const showPad = () => (pad.hidden = !padQuery.matches);
  showPad();
  padQuery.addEventListener('change', showPad);
  // For thumbs: one dive at a time, slower and with a narrower weave, a little more time between.
  const tune = () =>
    touchQuery.matches
      ? { dive: 28, weave: 11, most: 1, back: 50, every: [3.2, 4.8], speed: 78, sway: 0.8 }
      : { dive: 46, weave: 16, most: 2, back: 64, every: [2.2, 3.6], speed: 86, sway: 1 };

  // ---- Size: the field at a whole number of device pixels per game pixel, as big as fits.
  let s = 1;
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const room = stage.clientWidth * dpr;
    s = Math.max(1, Math.floor(room / W));
    canvas.width = W * s;
    canvas.height = H * s;
    canvas.style.width = `${(W * s) / dpr}px`;
    canvas.style.height = `${(H * s) / dpr}px`;
    ctx.imageSmoothingEnabled = false;
    draw();
  };

  // ---- The state
  let mode: Mode = 'play';
  let lives = 3;
  let shipX = (W - SHIP_W) / 2;
  let hurt = 0; // seconds of blinking after a hit, when nothing can hit the ship
  let cooldown = 0;
  let nextDive = 2;
  let clock = 0;
  let calm = false; // (test builds only: no dives, no sway)
  let random = Math.random; // (test builds can seed it, to replay a game)
  let bugs: Bug[] = [];
  let shots: Shot[] = [];
  let bursts: Burst[] = [];
  // the stars: scattered over the whole field, the same on every game (a fixed seed)
  let seed = 0x5eed;
  const scatter = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stars = Array.from({ length: 16 }, () => ({ x: Math.floor(scatter() * W), y: Math.floor(scatter() * (H - 6)) }));
  const slot = (b: Bug) => {
    const sway = calm ? 0 : Math.sin((clock / 5) * Math.PI * 2) * 18 * tune().sway;
    return { x: 35 + b.col * 20 + sway, y: 12 + b.row * 15 };
  };
  const reset = () => {
    lives = 3;
    shipX = (W - SHIP_W) / 2;
    hurt = 0;
    cooldown = 0;
    clock = 0;
    nextDive = 2;
    shots = [];
    bursts = [];
    bugs = [];
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) bugs.push({ col, row, x: 0, y: 0, alive: true, dive: null });
    bugs.forEach((b) => Object.assign(b, slot(b)));
    readout();
  };
  const left = () => bugs.filter((b) => b.alive).length;
  const readout = () => {
    livesOut.textContent = String(lives);
    bugsOut.textContent = String(left());
  };
  const say = (msg: string) => {
    live.textContent = '';
    window.setTimeout(() => (live.textContent = msg), 50);
  };

  // ---- Input
  const held = { left: false, right: false, fire: false };
  const keys = new Set<string>();
  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD'];
  root.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && (mode === 'play' || mode === 'paused')) {
      e.preventDefault();
      if (mode === 'play') pause(true);
      else resume();
      return;
    }
    if (!GAME_KEYS.includes(e.code)) return;
    // (a button in the messages keeps its keys: Space or Enter presses it)
    if (mode !== 'play' && (e.target as HTMLElement).closest('button')) return;
    // the page does not scroll while the game has the keys
    e.preventDefault();
    keys.add(e.code);
    // (a tap of Space fires at once, even if it is up again before the next frame)
    if (e.code === 'Space' && !e.repeat) fire();
  });
  root.addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    held.left = held.right = held.fire = false;
  });
  // The buttons under the field: held down to move or to keep firing (a press by keyboard nudges).
  const hold = (button: HTMLButtonElement, key: keyof typeof held, nudge: () => void) => {
    const up = () => {
      held[key] = false;
      button.classList.remove('is-down');
    };
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      held[key] = true;
      button.classList.add('is-down');
      if (key === 'fire') fire();
      // (the finger may slide off the button and still hold it)
      try {
        button.setPointerCapture(e.pointerId);
      } catch {
        /* no capture for this pointer: pointerup still lets go */
      }
    });
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
    button.addEventListener('contextmenu', (e) => e.preventDefault());
    button.addEventListener('click', (e) => {
      if (e.detail === 0 && mode === 'play') nudge();
    });
  };
  hold(keysLeft, 'left', () => (shipX = Math.max(0, shipX - 8)));
  hold(keysRight, 'right', () => (shipX = Math.min(W - SHIP_W, shipX + 8)));
  hold(keysFire, 'fire', () => fire());

  const fire = () => {
    if (mode !== 'play' || cooldown > 0 || shots.length >= 2) return;
    shots.push({ x: Math.round(shipX + SHIP_W / 2) - 1, y: SHIP_Y - 4 });
    cooldown = 0.28;
  };

  // ---- The loop
  let frame = 0;
  let last = 0;
  const loop = (now: number) => {
    const dt = Math.min(1 / 30, (now - last) / 1000 || 0);
    last = now;
    step(dt);
    draw();
    if (mode === 'play') frame = requestAnimationFrame(loop);
  };
  const run = () => {
    cancelAnimationFrame(frame);
    last = performance.now();
    frame = requestAnimationFrame(loop);
  };

  const hitShip = () => {
    if (hurt > 0 || mode !== 'play') return;
    lives -= 1;
    readout();
    if (lives <= 0) {
      end(false);
      return;
    }
    hurt = 1.6;
    say(`Hit. ${lives} ${lives === 1 ? 'life' : 'lives'} left.`);
  };
  const overlaps = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  const step = (dt: number) => {
    const t = tune();
    clock += dt;
    cooldown = Math.max(0, cooldown - dt);
    hurt = Math.max(0, hurt - dt);
    // the ship
    const dir = (keys.has('ArrowLeft') || keys.has('KeyA') || held.left ? -1 : 0) + (keys.has('ArrowRight') || keys.has('KeyD') || held.right ? 1 : 0);
    shipX = Math.max(0, Math.min(W - SHIP_W, shipX + dir * t.speed * dt));
    if (keys.has('Space') || held.fire) fire();
    // the shots
    for (const shot of shots) shot.y -= 170 * dt;
    shots = shots.filter((shot) => shot.y > -6);
    // the bugs: in formation, or diving, or coming back round
    for (const b of bugs) {
      if (!b.alive) continue;
      const home = slot(b);
      if (!b.dive) {
        b.x = home.x;
        b.y = home.y;
        continue;
      }
      const d = b.dive;
      d.t += dt;
      if (d.phase === 'down') {
        b.y = d.y0 + d.t * t.dive;
        const p = Math.min(1, (b.y - d.y0) / (SHIP_Y - d.y0));
        b.x = d.x0 + (d.target - d.x0) * p + Math.sin(d.t * 2.4) * t.weave * d.dir;
        b.x = Math.max(0, Math.min(W - BUG_W, b.x));
        if (b.y > H + 4) {
          d.phase = 'back';
          b.y = -BUG_H - 2;
        }
      } else {
        const dx = home.x - b.x;
        const dy = home.y - b.y;
        const dist = Math.hypot(dx, dy);
        const move = t.back * dt;
        if (dist <= move) {
          b.dive = null;
          b.x = home.x;
          b.y = home.y;
        } else {
          b.x += (dx / dist) * move;
          b.y += (dy / dist) * move;
        }
      }
      // touching the ship
      if (overlaps(b.x + 1, b.y + 1, BUG_W - 2, BUG_H - 2, shipX + 3, SHIP_Y + 2, SHIP_W - 6, SHIP_H - 3) && hurt === 0) {
        hitShip();
        if (b.dive) {
          b.dive.phase = 'back';
          b.y = -BUG_H - 2;
        }
        if (mode !== 'play') return;
      }
    }
    // a shot meets a bug
    for (const shot of shots) {
      const b = bugs.find((x) => x.alive && overlaps(shot.x, shot.y, 2, 5, x.x, x.y, BUG_W, BUG_H));
      if (!b) continue;
      b.alive = false;
      shot.y = -99;
      bursts.push({ x: b.x + BUG_W / 2, y: b.y + BUG_H / 2, t: 0 });
      readout();
      if (left() === 0) {
        end(true);
        return;
      }
    }
    shots = shots.filter((shot) => shot.y > -6);
    for (const burst of bursts) burst.t += dt;
    bursts = bursts.filter((burst) => burst.t < 0.3);
    // the next dive: a bug in formation, never more than two down at once (one on a touch screen)
    nextDive -= dt;
    if (nextDive <= 0 && !calm) {
      const diving = bugs.filter((b) => b.alive && b.dive).length;
      const ready = bugs.filter((b) => b.alive && !b.dive);
      if (diving < t.most && ready.length) {
        const b = ready[Math.floor(random() * ready.length)];
        b.dive = { phase: 'down', t: 0, x0: b.x, y0: b.y, target: shipX + SHIP_W / 2 - BUG_W / 2, dir: random() < 0.5 ? -1 : 1 };
      }
      const [lo, hi] = t.every;
      nextDive = lo + random() * (hi - lo);
    }
  };

  const draw = () => {
    const px = (x: number, y: number, w: number, h: number) => ctx.fillRect(Math.round(x) * s, Math.round(y) * s, w * s, h * s);
    ctx.fillStyle = C.navy;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = C.light;
    for (const star of stars) px(star.x, star.y, 1, 1);
    ctx.globalAlpha = 1;
    // the ground line
    ctx.fillStyle = C.blue;
    px(0, H - 2, W, 1);
    for (const b of bugs) {
      if (!b.alive) continue;
      // (the legs: a one-pixel step every so often, like the site's bugs)
      const bob = Math.floor(clock * 3 + b.col) % 2;
      ctx.drawImage(bugArt, Math.round(b.x) * s, (Math.round(b.y) + bob) * s, BUG_W * s, BUG_H * s);
    }
    ctx.fillStyle = C.light;
    for (const shot of shots) px(shot.x, shot.y, 2, 4);
    ctx.fillStyle = C.cyan;
    for (const shot of shots) px(shot.x, shot.y + 4, 2, 1);
    for (const burst of bursts) {
      const r = Math.round(2 + burst.t * 14);
      ctx.fillStyle = burst.t < 0.15 ? C.light : C.green;
      px(burst.x - r, burst.y, 2, 2);
      px(burst.x + r - 1, burst.y, 2, 2);
      px(burst.x, burst.y - r, 2, 2);
      px(burst.x, burst.y + r - 1, 2, 2);
    }
    // the ship, blinking about twice a second after a hit
    if (hurt === 0 || Math.floor(hurt * 5) % 2 === 0) ctx.drawImage(shipArt, Math.round(shipX) * s, SHIP_Y * s, SHIP_W * s, SHIP_H * s);
  };

  // ---- Messages over the field
  const show = (heading: string, line: string, button: string) => {
    poster.hidden = true;
    title.textContent = heading;
    text.textContent = line;
    action.textContent = button;
    overlay.hidden = false;
  };
  const pause = (byPlayer: boolean) => {
    if (mode !== 'play') return;
    mode = 'paused';
    cancelAnimationFrame(frame);
    keys.clear();
    held.left = held.right = held.fire = false;
    pauseButton.textContent = 'Resume';
    show('Paused', byPlayer ? 'Press Esc or Resume to carry on.' : 'Paused while you were away.', 'Resume');
    say('Paused.');
  };
  const resume = () => {
    if (mode !== 'paused') return;
    mode = 'play';
    overlay.hidden = true;
    pauseButton.textContent = 'Pause';
    stage.focus({ preventScroll: true });
    run();
  };
  const begin = () => {
    reset();
    mode = 'play';
    overlay.hidden = true;
    pauseButton.hidden = false;
    pauseButton.textContent = 'Pause';
    stage.tabIndex = 0;
    stage.focus({ preventScroll: true });
    say('Bug Sweep started. Ten bugs, three lives.');
    track('bug-sweep-play');
    run();
  };
  const end = (won: boolean) => {
    mode = won ? 'won' : 'over';
    cancelAnimationFrame(frame);
    draw();
    pauseButton.hidden = true;
    keys.clear();
    if (won) {
      show('Level cleared', 'All ten bugs swept.', 'Play again');
      say('Level cleared. All ten bugs swept.');
      document.dispatchEvent(new CustomEvent('playrun:achieve', { detail: 'bugsweep' }));
      track('bug-sweep-cleared');
    } else {
      show('Game over', 'A bug got through three times.', 'Try again');
      say('Game over.');
      track('bug-sweep-game-over');
    }
    action.focus({ preventScroll: true });
  };
  action.addEventListener('click', () => {
    if (mode === 'paused') resume();
    else if (mode === 'won' || mode === 'over') begin();
  });
  pauseButton.addEventListener('click', () => (mode === 'play' ? pause(true) : resume()));

  // ---- Away: the tab hidden or the field off screen pauses it
  document.addEventListener('visibilitychange', () => document.hidden && pause(false));
  if ('IntersectionObserver' in window) {
    // (only once the field is wholly off screen: a phone held sideways shows part of it while playing)
    new IntersectionObserver((entries) => entries.forEach((e) => !e.isIntersecting && pause(false)), { threshold: 0 }).observe(stage);
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => fit()).observe(stage);
  addEventListener('resize', fit);

  // ---- Test builds only (the suite and the dev server): a handle to drive the game quickly. The
  // production build leaves this out entirely, so nothing can be unlocked from the console.
  if (import.meta.env.DEV || import.meta.env.PUBLIC_TEST_HOOKS === '1') {
    (root as HTMLElement & { sweepTest?: unknown }).sweepTest = {
      state: () => ({ mode, lives, shipX, shipW: SHIP_W, bugW: BUG_W, stars, left: left(), shots: shots.length, touch: touchQuery.matches, bugs: bugs.map((b) => ({ x: b.x, y: b.y, alive: b.alive, diving: !!b.dive })), scale: s }),
      calm: (on: boolean) => (calm = on),
      seed: (n: number) => {
        let a = n >>> 0;
        random = () => {
          a = (a + 0x6d2b79f5) >>> 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      },
      // (the ship under a bug that is still flying)
      aim: () => {
        const b = bugs.find((x) => x.alive);
        if (b) shipX = Math.max(0, Math.min(W - SHIP_W, b.x + BUG_W / 2 - SHIP_W / 2));
      },
      clear: () => {
        bugs.forEach((b) => (b.alive = false));
        bugs[0].alive = true;
        bugs[0].dive = null;
      },
      hit: () => {
        hurt = 0;
        hitShip();
      },
    };
  }

  fit();
  begin();
  // the whole game on screen, above the bottom bar on a phone
  root.scrollIntoView({ block: 'nearest', behavior: 'instant' as ScrollBehavior });
}
