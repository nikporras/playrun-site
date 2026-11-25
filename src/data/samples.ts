/**
 * Parked for the future work samples page, shown nowhere for now (nothing imports it, so it ships
 * nowhere): the bug report template that was on the Testing page's report. `build` names the build
 * it is written against, such as the site and the date it was deployed.
 */
export const bugReportTemplate = (build: string) => `Title: [what broke, in one line]
Build: ${build}
Device: [browser, OS, screen size]
Steps to reproduce:
  1.
  2.
  3.
Expected:
Actual:
Severity: [Blocker / Major / Minor / Cosmetic]
Attachments: [screenshot or video]`;
