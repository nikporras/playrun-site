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
      // Only projects cleared for public use are shown. Default is hidden.
      public: z.boolean().default(false),
    }),
});

export const collections = { projects };
