// The beach ball's swoop: how big it is, how long a throw lasts, and where it
// is along its path. The Swoop tool chooses the path (apps/web/src/tools/hands.ts);
// a shared table puts every throw at the same place at the same moment on
// every device from this (packages/net).

import type { Vec3 } from "./shapes.ts";

/** The beach ball's radius, mm. */
export const BALL_RADIUS = 34;
/** Seconds a swoop lasts. */
export const SWOOP_SECONDS = 1.6;
/** The shares of a swoop spent diving in and hanging there at the end of the dive; the rest is veering away. */
export const SWOOP_DIVE = 0.2;
export const SWOOP_HOLD = 0.15;

/**
 * Where the ball is `k` of the way along its swoop (0 to 1): straight in at a
 * steady speed (it grows faster and faster in the fly's eyes), a moment held
 * at the end of the dive, then away, quicker and quicker.
 */
export function swoopAt(from: Vec3, via: Vec3, to: Vec3, k: number, out: Vec3): Vec3 {
  if (k < SWOOP_DIVE) return lerp(out, from, via, Math.max(0, k) / SWOOP_DIVE);
  if (k < SWOOP_DIVE + SWOOP_HOLD) return lerp(out, via, via, 0);
  const s = (k - SWOOP_DIVE - SWOOP_HOLD) / (1 - SWOOP_DIVE - SWOOP_HOLD);
  return lerp(out, via, to, s * s);
}

function lerp(out: Vec3, a: Vec3, b: Vec3, k: number) {
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.z = a.z + (b.z - a.z) * k;
  return out;
}
