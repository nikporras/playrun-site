import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    // The developer, and the publisher when it is a different company; the card shows "studio · publisher".
    studio: z.string(),
    publisher: z.string().optional(),
    platforms: z.array(z.string()),
    // Release year, only when officially announced. Titles without one carry status: in-development.
    year: z.number().int().optional(),
    status: z.enum(['released', 'in-development']).default('released'),
    // One line on what the game is.
    summary: z.string(),
    // One line on what I did on it, when there is something to say beyond the tags.
    did: z.string().optional(),
    // The kinds of testing, shown as labels. Never repeated in `did`.
    tags: z.array(z.string()).default([]),
    url: z.string().url().optional(),
    // The store the url points at, for the button: "View on Steam". Steam when left out.
    store: z.string().optional(),
    // The company group on the portfolio, one of the ids in `employers` (src/config.ts).
    employer: z.string(),
    // The generic pixel icon, one of the names GameIcon.astro draws: the fallback where no official
    // logo exists, and the icon on the credits page.
    icon: z.enum(['city', 'basketball', 'seaplane', 'frog', 'mask', 'cat', 'sabres', 'golf', 'dino', 'ghost', 'brain', 'mountain', 'sun', 'wolf', 'castle', 'helmet', 'hut', 'drone', 'hand', 'vault']),
    // Where the official logo in src/assets/logos/<id>.png came from: the press kit or official page.
    logoSource: z.string().url().optional(),
    // The name set in Pixel Operator where no clean official logo exists but the icon is not wanted.
    wordmark: z.boolean().default(false),
    // On the Home ticker. Off where the logo would repeat another title's (Londinium shares the
    // Historic VR logo with Guildford Castle VR), so every logo on the ticker appears once.
    wall: z.boolean().default(true),
    // Only projects cleared for public use are shown. Default is hidden.
    public: z.boolean().default(false),
  }),
});

export const collections = { projects };
