// Refreshes the copy of Umami's tracker that the site serves itself (public/umami.js), so the
// Content Security Policy keeps script-src to 'self'. Run from the project root now and then:
//   node scripts/umami.mjs
// It reports wherever it is told by data-host-url in src/layouts/Base.astro (Umami Cloud's gateway),
// and only on playrunqa.com (data-domains). Check the diff before committing: the endpoint, the
// attributes it reads, and that it still sets no cookie.
import { writeFileSync } from 'node:fs';

const res = await fetch('https://cloud.umami.is/script.js');
if (!res.ok) throw new Error(`Umami answered ${res.status}`);
const code = await res.text();
for (const must of ['data-', 'api/send', 'do-not-track', 'domains', 'host-url']) {
  if (!code.includes(must)) throw new Error(`The tracker no longer mentions ${must}: read it before using it`);
}
writeFileSync('public/umami.js', code);
console.log(`public/umami.js: ${code.length} bytes, ${res.headers.get('last-modified') ?? 'no date'}`);
