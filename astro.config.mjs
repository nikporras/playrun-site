// @ts-check
import { readdirSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The portfolio no longer has a page per game: every card links to the game's store page. The old
// /portfolio/<game> addresses send visitors to the portfolio, one redirect per project file, plus
// the one slug that was renamed.
const projectSlugs = readdirSync('./src/content/projects')
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.replace(/\.md$/, ''));
const projectRedirects = Object.fromEntries([...projectSlugs, 'the-climb'].map((slug) => [`/portfolio/${slug}`, '/portfolio']));

export default defineConfig({
  site: 'https://playrunqa.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  redirects: { '/services': '/skills', ...projectRedirects },
  integrations: [
    sitemap({
      // Redirect pages are not pages.
      filter: (page) => !page.includes('/portfolio/') && !page.endsWith('/services'),
    }),
  ],
  devToolbar: { enabled: false },
});
