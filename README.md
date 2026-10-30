# PlayRun

The website of **PlayRun**, the personal game QA portfolio of Nicolás Porras in London: the games I have tested since 2021, how I test, and how to reach me.

**Live:** [playrunqa.com](https://playrunqa.com)

## What is on it

- **Home**: who I am, what I test, a selection of titles, and a scoreboard of the site's own checks that visitors can run in their browser.
- **Skills**: what I test and how, as experience from shipped games: functional testing, platforms and stores, performance, playtesting and bug reporting.
- **Portfolio**: every title I can name in public, grouped by company, each linking to its store page.
- **About**: the posts, the tools and how I work.
- **Quality**: how this site is tested, with the suite read from the test files at build time.
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
- the bugs to catch never sit over text, a tile or the photo, at any width, anywhere along their walk
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

Pixel Operator typeface by Jayvee Enaguas (CC0). Montserrat by Julieta Ulanovsky (SIL Open Font License). The tools and artwork are listed on the site's [credits page](https://playrunqa.com/credits).

## Rights

© 2026 Nicolás Porras. The code is public so anyone can see how the site is tested. The PlayRun name, logo and brand assets are not licensed for reuse.
