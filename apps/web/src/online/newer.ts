// A room server speaking a newer protocol than this page: the page reloads
// into the newer build, which speaks it. Once at once for each protocol a page
// speaks, so a tab left open (a wallpaper) reloads again at the next deploy;
// and if the reload still brought this protocol's page (the network too slow,
// and the service worker answered with the kept one), again later, longer
// each time, so the page neither stays behind for good nor reloads every frame.

/** Where the session keeps the last reload for a newer protocol. */
export const NEWER_KEY = "flies.reloaded";
/** How long after a reload that brought the same protocol back it is tried again, ms, doubling each time up to the last. */
export const NEWER_WAIT = 30_000;
export const NEWER_WAIT_MAX = 30 * 60_000;

type Reloaded = { v: number; at: number; n: number };

/**
 * Whether a page speaking `protocol` reloads now, at `now` (ms), given what
 * the session `kept` of the last reload: what to keep instead if it does, or
 * null if it waits.
 */
export function reloadForNewer(kept: string | null, protocol: number, now: number): string | null {
  let last: Reloaded | null = null;
  try {
    const r = JSON.parse(kept ?? "null") as Reloaded | null;
    if (r && Number.isFinite(r.v) && Number.isFinite(r.at) && Number.isInteger(r.n) && r.n >= 0) last = r;
  } catch {
    last = null;
  }
  if (!last || last.v !== protocol) return JSON.stringify({ v: protocol, at: now, n: 0 } satisfies Reloaded);
  const wait = Math.min(NEWER_WAIT_MAX, NEWER_WAIT * 2 ** last.n);
  // One kept from a clock set back since is waited out no longer.
  if (last.at <= now && now - last.at < wait) return null;
  return JSON.stringify({ v: protocol, at: now, n: last.n + 1 } satisfies Reloaded);
}
