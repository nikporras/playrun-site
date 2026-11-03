// The bugs to catch across the site: twenty, one id each, by page. games.ts counts against this
// list (a kept catch whose bug is gone no longer counts), and a test checks the built pages carry
// exactly these.
export const BUGS = [
  // Home, one a level
  'hero-1',
  'wall-1',
  'stats-1',
  'proof-1',
  'final-1',
  // About, on the Facts
  'about-1',
  // Skills, one a level
  'skills-1',
  'skills-2',
  'skills-3',
  'skills-4',
  'skills-5',
  // Games
  'portfolio-1',
  'portfolio-2',
  'portfolio-3',
  'portfolio-4',
  // Quality
  'quality-1',
  'quality-2',
  'quality-3',
  // Contact
  'contact-1',
  'contact-2',
] as const;
