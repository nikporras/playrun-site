# PlayRun

The website of **PlayRun**, the personal game QA portfolio of Nicolás Porras in London: the games I have tested since 2021, how I test, and how to reach me.

**Live:** [playrunqa.com](https://playrunqa.com)

## What is on it

- **Home**: who I am (and a headline that breaks into pixels as you scroll, with a bug ticket to match), a wall of the games I have tested (their official logos, in one colour), the numbers, a scoreboard of the site's own checks that visitors can run in their browser, and what I play after hours.
- **Skills**: what I test and how, as experience from shipped games: functional testing, platforms and stores, performance, playtesting and bug reporting, plus the tools and the way I work.
- **Portfolio**: every title I can name in public, grouped by post with the role and dates, each card with what I did, the kinds of testing and one button to its store page.
- **Quality**: "Let's test this page together", a five-step test run that happens live in your browser, with how to check each step yourself (on a phone, a Pocket DevTools panel stands in for F12), a report, and a bug report template.
- **Contact**: a form for networking, opportunities and saying hello.

It is a portfolio, like a CV. Everything on it is written as experience.

## Tested like a game

This site is held to the same standard as the games I test. Every push runs a Playwright suite before anything deploys:

- every page answers 200 with one h1, no console errors and no failed requests
- every internal link resolves
- no sideways overflow at phone, tablet and desktop widths
- accessibility scans with axe (WCAG 2.1 A and AA) on every page
- the contact form validates and handles every answer the script can give
- the mini games (runner, bug hunt, achievements) work by mouse, touch and keyboard, and switch off under reduced motion
- the bugs to catch never sit over text, a tile, a logo or the photo, at any width, anywhere along their walk
- every level header is one stacked block with a label that reads on its field, and the content sits in a centred column at 390, 1280, 1440 and 1920
- the job titles and dates match LinkedIn, and the built HTML links to no code repository
- the headline break plays with the scroll and never under reduced motion; the track stands on the left on desktop and lies along the bottom on a phone; every Portfolio card lands once from the ship's laser; the five Quality steps run and report, and Pocket DevTools fills on a phone
- links that leave the site open a new tab and say so; internal links stay in the same tab
- text can be selected with the mouse everywhere, and the highlight reads on every field
- the built HTML carries no stale facts and no sales language

If a check fails, the site does not ship. The Quality page and the Home scoreboard read their numbers from the suite itself: the list of checks from Playwright at build time, and the results from the run that deployed the page.

## Stack

- [Astro](https://astro.build), static output
- Plain CSS with design tokens, small vanilla JavaScript
- [Playwright](https://playwright.dev) and axe-core for testing
- GitHub Actions and GitHub Pages for deploys
- A Google Apps Script web app behind the contact form

## Run it locally

```bash
npm install
npm run dev        # local preview at http://localhost:4321
npm run build      # production build into dist/
npm test           # full Playwright suite against a fresh production build
```

To run the suite against a server that is already up, such as the dev server, point it there:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 npx playwright test tests/bugs.spec.ts
```

## Credits

Pixel Operator typeface by Jayvee Enaguas (CC0). Montserrat by Julieta Ulanovsky (SIL Open Font License). The game logos are the trademarks of their owners, taken from each game's official press kit or page and shown in one colour to name the games I have tested; every source is listed on the site's [credits page](https://playrunqa.com/credits), with the tools and the pixel art. `scripts/logos.mjs` makes the one-colour files from the originals, which are not part of this repository.

## Rights

© 2026 Nicolás Porras. The code is public so anyone can see how the site is tested. The PlayRun name, logo and brand assets are not licensed for reuse.
