import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      studio: z.string(),
      platforms: z.array(z.string()),
      role: z.string(),
      // Release year, only when officially announced. Titles without one carry status: in-development.
      year: z.number().int().optional(),
      status: z.enum(['released', 'in-development']).default('released'),
      summary: z.string(),
      cover: image().optional(),
      url: z.string().url().optional(),
      // The store the url points at, shown on the link. Steam when left out.
      store: z.string().optional(),
      // Set when the title was tested in a studio job rather than as PlayRun; the portfolio groups by it.
      employer: z.string().optional(),
      // The generic pixel icon on the card, one of the names GameIcon.astro draws.
      icon: z.enum(['city', 'basketball', 'seaplane', 'frog', 'mask', 'cat', 'sabres', 'golf', 'dino', 'ghost', 'brain', 'mountain', 'sun', 'wolf', 'castle', 'helmet', 'hut', 'drone', 'hand', 'vault']),
      // Only projects cleared for public use are shown. Default is hidden.
      public: z.boolean().default(false),
    }),
});

export const collections = { projects };
