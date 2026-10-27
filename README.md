# PlayRun

The website of **PlayRun**, a game QA studio for indie developers, founded by Nicolás Porras in London.

**Live:** [playrunqa.com](https://playrunqa.com)

PlayRun offers functional testing, platform and store compliance, release testing, performance checks and playtesting across Nintendo Switch, Switch 2, Xbox, PS5, Steam, Epic Games Store and GOG.

## Tested like a game

This site is held to the same standard as the games I test. Every push runs a Playwright suite before anything deploys:

- every page loads with no console errors or failed requests
- every internal link resolves
- no sideways overflow at phone, tablet and desktop widths
- accessibility scans with axe (WCAG 2.1 A and AA)
- the contact form validates and handles every server response
- the mini games (runner, bug hunt, achievements) work by mouse, touch and keyboard, and switch off under reduced motion

If a check fails, the site does not ship.

## Stack

- [Astro](https://astro.build), static output
- Plain CSS with design tokens, small vanilla JavaScript
- [Playwright](https://playwright.dev) and axe-core for testing
- GitHub Actions and GitHub Pages for deploys
- A Google Apps Script web app for the contact form

## Run it locally

```bash
npm install
npm run dev        # local preview at http://localhost:4321
npm run build      # production build into dist/
npm test           # full Playwright suite against the production build
```

## Credits

Pixel Operator typeface by Jayvee Enaguas (CC0). Montserrat by Julieta Ulanovsky (SIL Open Font License). Photograph credits are listed on the site's [credits page](https://playrunqa.com/credits).

## Rights

© 2026 PlayRun. The code is shared so studios can see how the site is tested. The PlayRun name, logo and brand assets are not licensed for reuse.
