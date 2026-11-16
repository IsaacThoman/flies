// A thrown ball's path as a function of the room's clock, so every device
// (and the room) puts it in the same place at the same moment: the Swoop
// tool's path (@fly/world, swoopAt), started at a room time.

import { SWOOP_SECONDS, swoopAt } from "@fly/world";
import type { Vec3 } from "@fly/world";
import type { BallWire, V3 } from "./protocol.ts";

/**
 * A throw starts this long after Select (ms), the same moment on every
 * device, so that a device far from the thrower still sees the whole dive:
 * the thrower's ball waits at the start of its run meanwhile. It has to
 * cover the thrower's way to the room and the room's way to the others,
 * about one round trip.
 */
export const LEAD = 200;

/** How far along its path a ball is at room time `now` (ms): below 0 not yet thrown, 1 or more gone. */
export const ballProgress = (ball: BallWire, now: number) => (now - ball.at) / (SWOOP_SECONDS * 1000);

const from: Vec3 = { x: 0, y: 0, z: 0 };
const via: Vec3 = { x: 0, y: 0, z: 0 };
const to: Vec3 = { x: 0, y: 0, z: 0 };

/** Where a ball is at room time `now` (ms); before it starts, it waits where it will dive from. */
export function ballAt(ball: BallWire, now: number, out: Vec3): Vec3 {
  return swoopAt(set(from, ball.from), set(via, ball.via), set(to, ball.to), ballProgress(ball, now), out);
}

function set(out: Vec3, v: V3) {
  out.x = v[0];
  out.y = v[1];
  out.z = v[2];
  return out;
}

/** Writes a point into a wire triple. */
export function toV3(out: V3, v: Vec3): V3 {
  out[0] = v.x;
  out[1] = v.y;
  out[2] = v.z;
  return out;
}
