// @ts-check
import { copyFileSync, readdirSync } from 'node:fs';
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
    sitemap({
      // Redirect pages are not pages, and llms.txt is for machines; the addresses in the map carry
      // the trailing slash.
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/$/, '');
        return !/^\/portfolio\/./.test(path) && !['/services', '/credits', '/llms.txt'].includes(path);
      },
    }),
  ],
  devToolbar: { enabled: false },
});
