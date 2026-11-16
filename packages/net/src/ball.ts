// A thrown ball's path as a function of the room's clock, so every device
// (and the room) puts it in the same place at the same moment. The timing is
// the Swoop tool's (apps/web/src/tools/hands.ts; a test holds them equal).

import type { Vec3 } from "@fly/world";
import type { BallWire } from "./protocol.ts";

/** Seconds a swoop lasts, and the shares of it spent diving in and hanging at the end of the dive. */
export const SWOOP = { seconds: 1.6, dive: 0.2, hold: 0.15 } as const;

/** How far along its path a ball is at room time `now` (ms): below 0 not yet thrown, 1 or more gone. */
export const ballProgress = (ball: BallWire, now: number) => (now - ball.at) / (SWOOP.seconds * 1000);

/** Where a ball is `k` of the way along its path (0 to 1); before it starts, it hangs where it will dive from. */
export function ballAt(ball: BallWire, k: number, out: Vec3): Vec3 {
  const { from, via, to } = ball;
  if (k <= 0) return set(out, from[0], from[1], from[2]);
  if (k < SWOOP.dive) {
    const s = k / SWOOP.dive;
    return set(out, from[0] + (via[0] - from[0]) * s, from[1] + (via[1] - from[1]) * s, from[2] + (via[2] - from[2]) * s);
  }
  if (k < SWOOP.dive + SWOOP.hold) return set(out, via[0], via[1], via[2]);
  const s = (k - SWOOP.dive - SWOOP.hold) / (1 - SWOOP.dive - SWOOP.hold);
  const e = s * s;
  return set(out, via[0] + (to[0] - via[0]) * e, via[1] + (to[1] - via[1]) * e, via[2] + (to[2] - via[2]) * e);
}

function set(out: Vec3, x: number, y: number, z: number) {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}
