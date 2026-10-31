import { test, expect } from '@playwright/test';
import { HtmlValidate } from 'html-validate';

/**
 * Valid HTML: every page as the server sends it, checked with html-validate (offline, W3C
 * compatible: the elements, their content and attributes, ids, the document's structure). The
 * subresource integrity rule is left out: every script and style is served from the site itself.
 */
const PAGES = ['/', '/skills/', '/portfolio/', '/quality/', '/contact/', '/about/', '/privacy/', '/terms/', '/accessibility/', '/this-page-is-not-in-the-build/'];
const validator = new HtmlValidate({ extends: ['html-validate:standard', 'html-validate:document'], rules: { 'require-sri': 'off' } });

for (const path of PAGES) {
  test(`${path} is valid HTML`, { tag: ['@html'] }, async ({ request }) => {
    const res = await request.get(path);
    const html = await res.text();
    const report = await validator.validateString(html, path);
    const errors = report.results.flatMap((r) => r.messages.filter((m) => m.severity === 2).map((m) => `${m.line}:${m.column} ${m.ruleId}: ${m.message}`));
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
