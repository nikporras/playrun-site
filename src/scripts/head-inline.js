// The one inline script, at the top of every page's head, before the first paint: it marks the
// page as scripted, applies the motion setting and collects errors for the checks. It is written
// into the page as it is, and its sha256 hash goes into the Content Security Policy (astro.config.mjs).
document.documentElement.classList.add('js');
// Motion: the device's setting, unless the visitor chose with the switch (before the first paint)
(function () {
  var off = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    var v = localStorage.getItem('playrun.motion');
    if (v === 'off') off = true;
    if (v === 'on') off = false;
  } catch (e) {}
  if (off) document.documentElement.classList.add('motion-off');
})();
// The visit statistics, switched off or on for this browser (for the site owner's own devices,
// linked from nowhere): ?notrack sets Umami's own opt-out, umami.disabled, and ?track clears it.
// Here, before the tracker loads, so not even this page view counts; the address loses the word,
// and the page says what happened (__statsNote, shown once the page is up).
(function () {
  try {
    var q = new URLSearchParams(location.search);
    var off = q.has('notrack');
    var on = q.has('track');
    if (!off && !on) return;
    if (off) localStorage.setItem('umami.disabled', '1');
    else localStorage.removeItem('umami.disabled');
    window.__statsNote = off ? 'off' : 'on';
    q.delete('notrack');
    q.delete('track');
    var rest = q.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  } catch (e) {}
})();
window.__playrunErrors = [];
addEventListener('error', (e) => window.__playrunErrors.push(String(e.message || e)));
addEventListener('unhandledrejection', (e) => window.__playrunErrors.push(String(e.reason || e)));
// anything the Content Security Policy blocks counts as an error too
addEventListener('securitypolicyviolation', (e) => window.__playrunErrors.push('Content Security Policy blocked ' + (e.blockedURI || 'inline') + ' (' + e.violatedDirective + ')'));
