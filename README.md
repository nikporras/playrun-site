# PlayRun

The website of **PlayRun**, the personal game QA portfolio of Nicolás Porras in London: the games I have tested since 2021, how I test, and how to reach me.

**Live:** [playrunqa.com](https://playrunqa.com)

## What is on it

- **Home**: who I am, a slow row of the official logos of the games I have tested (in one colour, with a pause button), my career in numbers on a turning drum, a board of the site's own checks that visitors can run in their browser, and what I play after hours. The name glitches as the hero scrolls away, and a small card asks whether to track it.
- **About**: the key facts about me and short answers to common questions, and Bug Sweep, a small arcade game I made while building the site (it loads only when you press Play).
- **Skills**: what I test and how, as experience from shipped games: functional testing, platforms and stores, performance, playtesting and bug reports, plus the tools and the way I work.
- **Games**: every title I can name in public, grouped by post with the role and dates, each card with what I did, the kinds of testing and one button to its store page.
- **Quality**: "Let's test this page together", a five-step test run that happens live in your browser, with how to check each step yourself in Chrome or Edge, Firefox, Safari, on an iPhone or on Android (and Pocket DevTools on a phone), a report, and a bug report template.
- **Contact**: a form for networking, opportunities and saying hello.

It is a portfolio, like a CV. Everything on it is written as experience.

The games layer on every page (a ship on a level track, bugs to catch, achievements on a scoreboard) is optional and can be switched off. The site follows the device's reduced-motion setting until you choose with the Motion switch in the header.

## Tested like a game

Every push runs a Playwright suite before anything deploys. Among other things it checks that:

- every page answers with one h1, no console errors and no failed requests, and every internal link resolves
- nothing scrolls sideways from 300px wide, with motion on and off, and the layouts hold at phone, tablet and desktop widths
- axe (WCAG 2.1 A and AA) finds nothing on any page, on a desktop and on a phone, and in the parts that open on demand
- the contact form validates and handles every answer its script can give, including a timeout
- the games layer, Bug Sweep, the glitch and the Motion switch work by mouse, touch and keyboard, and stay still when motion is off
- the pixel joins between levels show no hairline on screens scaled by a fraction
- the job titles and dates match LinkedIn, and the built HTML has no sales language and links to no code repository

Most checks run in Chromium; a few also run in WebKit and Firefox. If a check fails, the site does not ship.

Every Monday at 07:00 UTC a separate check runs against the live site itself (`.github/workflows/live-check.yml`, `tests-live/`): every page in the sitemap loads with no console errors and with its security policy, every internal and external link answers (a rate limit is only a warning), the contact form's script answers its health check (nothing is ever sent), and robots.txt, the sitemap and llms.txt are served. It never counts as a visit in the statistics. The Quality page and the Home scoreboard read their numbers from the suite itself: the list of checks from Playwright at build time, and the results from the run that deployed the page.

## Stack

- [Astro](https://astro.build), static output
- Plain CSS with design tokens, small vanilla TypeScript, a canvas for Bug Sweep
- [Playwright](https://playwright.dev) and axe-core for testing
- GitHub Actions and GitHub Pages for deploys
- A Google Apps Script web app behind the contact form
- [Umami](https://umami.is) Cloud for cookieless visit statistics (the tracker served from this site, only counting on playrunqa.com, never with Do Not Track on)

## Run it locally

```bash
npm install
npm run dev        # local preview at http://localhost:4321
npm run build      # production build into dist/
npm run check      # type check
npm test           # full Playwright suite against a fresh test build
```

To run the suite against a server that is already up, such as the dev server, point it there:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 npx playwright test tests/bugs.spec.ts
```

## Credits

Pixel Operator typeface by Jayvee Enaguas (CC0). Montserrat by Julieta Ulanovsky and contributors (SIL Open Font License). The game logos are the trademarks of their owners, taken from each game's official press kit or page (the `logoSource` in each project file) and shown in one colour to identify the games I have worked on; no endorsement is implied. The site says the same under [Credits and trademarks](https://playrunqa.com/terms/#credits) on the Terms page. `scripts/logos.mjs` makes the one-colour files from the originals, which are not part of this repository.

## Rights

© 2026 Nicolás Porras. The code is public so anyone can see how the site is tested. The PlayRun name, logo and brand assets are not licensed for reuse.
