/**
 * My bug report template, shown under the two tickets in the QA Lab (Level 4). `build` names the
 * build it is written against: the site and the date it was deployed. Severity on the same Low to
 * Critical scale as the tickets.
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
Severity: [Low / Medium / High / Critical]
Attachments: [screenshot or video]`;
