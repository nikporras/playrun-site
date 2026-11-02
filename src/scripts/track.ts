/**
 * Counts an event in the visit statistics (Umami), for what a click attribute (data-umami-event)
 * cannot see: a message actually sent, a game cleared, an achievement, the Motion switch. Only
 * names and plain labels, never anything a visitor typed or anything that identifies them. If the
 * tracker is not there (an ad blocker, Do Not Track, another domain, a test), nothing happens, and
 * nothing it does can break the page.
 */
type Data = Record<string, string | number>;

export function track(name: string, data?: Data) {
  try {
    const umami = (window as unknown as { umami?: { track?: (name: string, data?: Data) => unknown } }).umami;
    if (typeof umami?.track === 'function') umami.track(name, data);
  } catch {
    /* statistics never break the page */
  }
}
