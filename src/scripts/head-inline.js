// The one inline script, at the top of every page's head, before the first paint: it marks the
// page as scripted, applies the motion setting and collects errors for the checks. It is written
// into the page as it is, and its sha256 hash goes into the Content Security Policy (astro.config.mjs).
document.documentElement.classList.add('js');
// Motion: the visitor's choice from the switch, or the device's setting (before the first paint)
(function () {
  var off = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    var v = localStorage.getItem('playrun.motion');
    if (v === 'off') off = true;
  } catch (e) {}
  if (off) document.documentElement.classList.add('motion-off');
})();
window.__playrunErrors = [];
addEventListener('error', (e) => window.__playrunErrors.push(String(e.message || e)));
addEventListener('unhandledrejection', (e) => window.__playrunErrors.push(String(e.reason || e)));
// anything the Content Security Policy blocks counts as an error too
addEventListener('securitypolicyviolation', (e) => window.__playrunErrors.push('Content Security Policy blocked ' + (e.blockedURI || 'inline') + ' (' + e.violatedDirective + ')'));
