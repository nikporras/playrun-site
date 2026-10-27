// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://playrunqa.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  redirects: { '/services': '/skills' },
  integrations: [sitemap()],
  devToolbar: { enabled: false },
});
