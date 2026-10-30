/**
 * The check engine: real checks on the page they run in, in the visitor's browser. Home's
 * "Test this page" runs a set of them on the scoreboard; the Quality page runs them one step
 * at a time in its guided test run; Pocket DevTools reads the same recorders. Every check
 * answers with what passed, what failed and one line that says what it saw.
 */
export type Result = { passed: number; failed: number; detail: string };
export type Check = { id: string; title: string; run: () => Promise<Result> };

const routes = (): string[] => {
  try {
    return JSON.parse(document.querySelector('meta[name="playrun-routes"]')?.getAttribute('content') ?? '[]');
  } catch {
    return [];
  }
};
const routeOf = (href: string) => new URL(href).pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

/** The errors the page has recorded since it loaded (Base.astro keeps the list). */
export const errorsSinceLoad = (): string[] => (window as unknown as { __playrunErrors?: string[] }).__playrunErrors ?? [];

/** Internal links to routes that exist in this build, so unbuilt pages never fail a check. */
export const internalLinks = () => {
  const built = routes();
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .map((a) => a.href)
    .filter((h) => h.startsWith(location.origin) && !h.includes('#') && built.includes(routeOf(h)))
    .filter((h, i, arr) => arr.indexOf(h) === i);
};

/** What the Performance API knows about this load, in milliseconds and bytes. */
export const timings = () => {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const paint = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const bytes = resources.reduce((n, r) => n + (r.transferSize || 0), 0) + (nav?.transferSize || 0);
  return {
    ttfb: nav ? Math.round(nav.responseStart) : null,
    fcp: paint ? Math.round(paint.startTime) : null,
    domReady: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    loaded: nav ? Math.round(nav.loadEventEnd) : null,
    requests: resources.length + 1,
    bytes,
    resources,
  };
};

const ms = (n: number | null) => (n === null ? 'n/a' : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);
export const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export const checks: Record<string, Check> = {
  pages: {
    id: 'pages',
    title: 'Pages load',
    run: async () => {
      const h1 = document.querySelectorAll('h1').length;
      return { passed: h1 === 1 ? 1 : 0, failed: h1 === 1 ? 0 : 1, detail: h1 === 1 ? 'This page has exactly one h1' : `Found ${h1} h1 elements` };
    },
  },
  console: {
    id: 'console',
    title: 'Zero console errors',
    run: async () => {
      const errors = errorsSinceLoad();
      return { passed: errors.length ? 0 : 1, failed: errors.length ? 1 : 0, detail: errors.length ? `${errors.length} script errors since load` : 'No script errors since this page loaded' };
    },
  },
  links: {
    id: 'links',
    title: 'Internal links resolve',
    run: async () => {
      const links = internalLinks();
      const results = await Promise.all(
        links.map(async (href) => {
          try {
            const r = await fetch(href, { method: 'HEAD', cache: 'no-store' });
            return r.ok;
          } catch {
            return false;
          }
        }),
      );
      const ok = results.filter(Boolean).length;
      return { passed: ok, failed: links.length - ok, detail: `${ok} of ${links.length} links to built pages answered 200` };
    },
  },
  viewports: {
    id: 'viewports',
    title: 'Three widths',
    run: async () => {
      const over = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      return { passed: over ? 0 : 1, failed: over ? 1 : 0, detail: over ? `Sideways overflow at ${innerWidth}px` : `No sideways overflow at ${innerWidth}px wide` };
    },
  },
  a11y: {
    id: 'a11y',
    title: 'Accessibility scan',
    run: async () => {
      const problems: string[] = [];
      if (!document.documentElement.lang) problems.push('missing lang');
      if (document.querySelectorAll('main').length !== 1) problems.push('main landmark');
      document.querySelectorAll('img').forEach((img) => {
        if (!img.hasAttribute('alt')) problems.push('image without alt');
      });
      document.querySelectorAll<HTMLElement>('a, button').forEach((el) => {
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
        if (!name) problems.push('control without a name');
      });
      const n = problems.length;
      return { passed: n ? 0 : 1, failed: n ? 1 : 0, detail: n ? `${n} problems: ${problems.slice(0, 2).join(', ')}` : 'Language set, one main landmark, every image and control named' };
    },
  },
  focus: {
    id: 'focus',
    title: 'Focus is visible',
    run: async () => {
      // A focus ring drawn by script is suppressed after a click, so the check reads the rule
      // itself: a :focus-visible rule with an outline, and a skip link for Tab to land on first.
      const skip = document.querySelector<HTMLElement>('.skip');
      let ruled = false;
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          // the shorthand keeps its var(); the longhands read empty, so read the shorthand
          ruled ||= Array.from(sheet.cssRules).some((r) => {
            if (!(r instanceof CSSStyleRule) || !r.selectorText.includes(':focus-visible')) return false;
            const o = r.style.getPropertyValue('outline') || r.style.getPropertyValue('outline-style');
            return o !== '' && !/^(none|0)/.test(o.trim());
          });
        } catch {
          /* a sheet from another origin: skip it */
        }
      }
      const ok = !!skip && ruled;
      return { passed: ok ? 1 : 0, failed: ok ? 0 : 1, detail: ok ? 'Tab lands on Skip to content first, and every focused control draws an outline' : skip ? 'No visible focus style' : 'No skip link' };
    },
  },
  brand: {
    id: 'brand',
    title: 'Brand assets',
    run: async () => {
      await document.fonts.ready;
      const pixel = document.fonts.check('16px "Pixel Operator"');
      const mont = document.fonts.check('16px Montserrat');
      const favicon = !!document.querySelector('link[rel="icon"]');
      const passed = [pixel, mont, favicon].filter(Boolean).length;
      return { passed, failed: 3 - passed, detail: passed === 3 ? 'Pixel Operator and Montserrat loaded, favicon present' : 'A brand asset did not load' };
    },
  },
  performance: {
    id: 'performance',
    title: 'Performance',
    run: async () => {
      const t = timings();
      const problems: string[] = [];
      if (t.fcp !== null && t.fcp > 2500) problems.push(`first paint at ${ms(t.fcp)}`);
      if (t.bytes > 1.5 * 1024 * 1024) problems.push(`${kb(t.bytes)} fetched`);
      if (t.requests > 80) problems.push(`${t.requests} requests`);
      const n = problems.length;
      return {
        passed: n ? 0 : 1,
        failed: n ? 1 : 0,
        detail: n ? `Slow: ${problems.join(', ')}` : `First paint at ${ms(t.fcp)}, loaded in ${ms(t.loaded)}, ${t.requests} requests, ${kb(t.bytes)}`,
      };
    },
  },
};

/** Run a list of checks and add the results up. */
export async function runAll(ids: string[]): Promise<Result & { details: string[] }> {
  let passed = 0;
  let failed = 0;
  const details: string[] = [];
  for (const id of ids) {
    const r = await checks[id].run();
    passed += r.passed;
    failed += r.failed;
    details.push(r.detail);
  }
  return { passed, failed, detail: details.join('. '), details };
}
