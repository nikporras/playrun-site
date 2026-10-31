// @ts-check
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The portfolio no longer has a page per game: every card links to the game's store page. The old
// /portfolio/<game> addresses send visitors to the portfolio, one redirect per project file, plus
// the one slug that was renamed.
const projectSlugs = readdirSync('./src/content/projects')
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''));
const projectRedirects = Object.fromEntries([...projectSlugs, 'the-climb'].map((slug) => [`/portfolio/${slug}`, '/portfolio/']));
// The sources of a page, for its date in the sitemap.
const DATA = ['src/content/projects', 'src/config.ts'];
const SOURCES = {
  '/': ['src/pages/index.astro', ...DATA],
  '/portfolio/': ['src/pages/portfolio.astro', 'src/components/GameCard.astro', ...DATA],
  '/about/': ['src/pages/about.astro', 'src/data/about.ts', ...DATA],
};
const sourcesOf = (path) => SOURCES[path] ?? [`src/pages${path.replace(/\/$/, '')}.astro`];
const lastCommit = (paths) => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cI', '--', ...paths], { encoding: 'utf8' }).trim() || undefined;
  } catch {
    return undefined;
  }
};

const redirects = { '/services': '/skills/', '/credits': '/terms/#credits', ...projectRedirects };

// Every redirect page is written twice: as the folder Astro builds (/services/index.html) and as a
// file beside it (/services.html). GitHub Pages serves the file for the old slash-free address, so
// an old link reaches the redirect at once instead of a 301 to the folder first. Real pages get no
// twin: their slash-free form must stay a redirect to the one official address, never a copy.
const redirectTwins = {
  name: 'redirect-twins',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const out = fileURLToPath(dir);
      for (const from of Object.keys(redirects)) copyFileSync(`${out}${from.slice(1)}/index.html`, `${out}${from.slice(1)}.html`);
    },
  },
};

// The Content Security Policy. Astro writes it into every page as a meta tag, with 'self' and the
// hash of each script it bundles; the one inline script (src/scripts/head-inline.js, written into
// the head as it is) is hashed here. Styles may be inline: the pages set custom properties in style
// attributes. The contact form posts to the Google Apps Script, which answers from googleusercontent.
const sha256 = (text) => `sha256-${createHash('sha256').update(text).digest('base64')}`;
const headScript = sha256(readFileSync('./src/scripts/head-inline.js', 'utf8'));
const cspDirectives = [
  "default-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
  "form-action 'self' mailto:",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
];

// After the build, on every page: the policy moves to the top of the head (a policy in a meta tag
// only covers what comes after it, and Astro writes it after the head's own tags), the build stops
// if an inline script is missing from the policy's hashes, and the redirect pages, which Astro
// writes without one, get the same policy (they have no script at all).
const cspFirst = {
  name: 'csp-first',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const out = fileURLToPath(dir);
      const pages = readdirSync(out, { recursive: true }).filter((f) => String(f).endsWith('.html'));
      const tag = /<meta http-equiv="content-security-policy" content="([^"]*)">/;
      for (const page of pages) {
        const file = `${out}${page}`;
        let html = readFileSync(file, 'utf8');
        const found = html.match(tag);
        let meta;
        if (found) {
          meta = found[0];
          html = html.replace(meta, '');
          for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
            if (/\bsrc=/.test(attrs) || /application\/ld\+json/.test(attrs)) continue;
            if (!found[1].includes(`'${sha256(body)}'`)) throw new Error(`csp-first: an inline script in ${page} is not in the policy`);
          }
        } else {
          if (/<script/.test(html)) throw new Error(`csp-first: ${page} has scripts but no policy`);
          meta = `<meta http-equiv="content-security-policy" content="${cspDirectives.join(';')}; script-src 'self'; style-src 'self' 'unsafe-inline';">`;
        }
        const charset = /<meta charset="utf-8">/i;
        html = charset.test(html) ? html.replace(charset, (m) => m + meta) : html.replace(/<!doctype html>/i, (m) => `${m}<meta charset="utf-8">${meta}`);
        writeFileSync(file, html);
      }
    },
  },
};

export default defineConfig({
  site: 'https://playrunqa.com',
  output: 'static',
  // Every page builds as a folder with an index.html. The address with the trailing slash is the
  // one official form everywhere (links, canonicals, the sitemap, redirect targets): GitHub Pages
  // sends /portfolio to /portfolio/ itself, so the slash-free form is only ever a redirect.
  trailingSlash: 'always',
  build: { format: 'directory' },
  // The About page was folded into Home, the Portfolio and Skills; its address goes home.
  // The Credits page was folded into the Terms page.
  redirects,
  integrations: [
    redirectTwins,
    cspFirst,
    sitemap({
      // Each page's date: the last commit that touched its source (Home, the Portfolio and About
      // are built from the projects and the config too). Needs the whole history (fetch-depth: 0).
      serialize(item) {
        const date = lastCommit(sourcesOf(new URL(item.url).pathname));
        if (date) item.lastmod = date;
        return item;
      },
      // Redirect pages are not pages, and llms.txt is for machines; the addresses in the map carry
      // the trailing slash.
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/$/, '');
        return !/^\/portfolio\/./.test(path) && !['/services', '/credits', '/llms.txt'].includes(path);
      },
    }),
  ],
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: cspDirectives,
      scriptDirective: { resources: ["'self'"], hashes: [headScript] },
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  devToolbar: { enabled: false },
});
