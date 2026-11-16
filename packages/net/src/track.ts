// Another player's fly, as it has been heard of: the last second or so of its
// states, and where it was at any moment among them. It is drawn a little in
// the past (`delay`), between two states that have both arrived, so it moves
// smoothly however unevenly they come; how far in the past adapts to how
// late and how unevenly they have been arriving, and how far apart they are
// (a device whose frames are slow sends less often). Past the newest it
// carries on along its velocity for a moment, then holds.

import type { FlyState } from "./protocol.ts";
import { AIRBORNE, AWAY, EATING, SEND_EVERY, copyFlyState, createFlyState } from "./protocol.ts";

/** States kept: well over a second at 20 a second. */
const KEPT = 32;
/** The least it is drawn in the past, ms: two sends, so one late or lost one doesn't stop it. */
export const MIN_DELAY = SEND_EVERY * 2;
/** And the most, however bad the network: beyond this it is better to see it stutter than to see it so late. */
export const MAX_DELAY = 600;
/** It carries on past the newest state this long, ms, then holds still. */
export const EXTRAPOLATE = 120;
/** How fast the delay follows what arrivals have been like. */
const LAG_EASE = 0.05;

export type Sample = "between" | "ahead" | "held" | "empty";

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class FlyTrack {
  readonly #states: FlyState[] = Array.from({ length: KEPT }, createFlyState);
  #count = 0;
  #head = 0;
  /** How late states arrive (room time on arrival less their own), smoothed, and how much that varies, ms. */
  lag = 0;
  jitter = 0;
  /** How far apart states are (their own times), smoothed, and how much that varies, ms. */
  gap = SEND_EVERY;
  gapJitter = 0;
  #lagged = false;
  /** Room time the newest state arrived. */
  heardAt = -Infinity;
  /** States that came after a newer one, and were dropped. */
  late = 0;
  /** Frames drawn past the newest state (the track ran dry), and all frames drawn. */
  starved = 0;
  drawn = 0;

  get count() {
    return this.#count;
  }

  get newest(): FlyState | null {
    return this.#count ? this.#states[(this.#head + KEPT - 1) % KEPT] : null;
  }

  /** How far in the past it is drawn now, ms. */
  get delay() {
    return Math.min(MAX_DELAY, Math.max(MIN_DELAY, this.lag + this.jitter * 2.5 + this.gap + this.gapJitter * 2));
  }

  /** A state heard at room time `now`. Ones older than the newest are dropped. */
  push(state: FlyState, now: number) {
    const newest = this.newest;
    if (newest && state.t <= newest.t) {
      this.late++;
      return;
    }
    if (newest) {
      // A long silence (a tab in the background, a pause) is not how far apart states come.
      const d = Math.min(state.t - newest.t, SEND_EVERY * 4) - this.gap;
      this.gap += d * LAG_EASE;
      this.gapJitter += (Math.abs(d) - this.gapJitter) * LAG_EASE;
    }
    copyFlyState(state, this.#states[this.#head]);
    this.#head = (this.#head + 1) % KEPT;
    this.#count = Math.min(KEPT, this.#count + 1);
    this.heardAt = now;
    const lag = now - state.t;
    if (!this.#lagged) {
      this.lag = lag;
      this.#lagged = true;
    } else {
      const d = lag - this.lag;
      this.lag += d * LAG_EASE;
      this.jitter += (Math.abs(d) - this.jitter) * LAG_EASE;
    }
  }

  #at(i: number) {
    return this.#states[(this.#head + KEPT - this.#count + i) % KEPT];
  }

  /** Where it was at room time `t`, into `out` (everything but `hand`, which is the newest's). */
  sample(t: number, out: FlyState): Sample {
    this.drawn++;
    const n = this.#count;
    if (n === 0) return "empty";
    const newest = this.#at(n - 1);
    if (t >= newest.t) {
      this.starved++;
      copyFlyState(newest, out);
      // Carry on along its velocity a moment, unless it is standing or away.
      const ahead = Math.min(t - newest.t, EXTRAPOLATE) / 1000;
      if (!(newest.flags & AWAY)) {
        out.x += newest.vx * ahead;
        out.y += newest.vy * ahead;
        out.z += newest.vz * ahead;
        out.yaw = wrap(newest.yaw + newest.pose.turn * ahead);
      }
      out.t = t;
      return t - newest.t <= EXTRAPOLATE ? "ahead" : "held";
    }
    // The two states either side of t (the oldest kept if t is before them all).
    let i = n - 1;
    while (i > 0 && this.#at(i - 1).t > t) i--;
    if (i === 0) {
      copyFlyState(this.#at(0), out);
      return "between";
    }
    const a = this.#at(i - 1);
    const b = this.#at(i);
    const k = (t - a.t) / Math.max(1, b.t - a.t);
    lerpState(a, b, k, out);
    out.t = t;
    return "between";
  }
}

/** Between two states; the flags are the nearer one's, except that eating and the air last as long as either has them. */
export function lerpState(a: FlyState, b: FlyState, k: number, out: FlyState) {
  const near = k < 0.5 ? a : b;
  copyFlyState(near, out);
  const mix = (x: number, y: number) => x + (y - x) * k;
  out.x = mix(a.x, b.x);
  out.y = mix(a.y, b.y);
  out.z = mix(a.z, b.z);
  out.yaw = wrap(a.yaw + wrap(b.yaw - a.yaw) * k);
  out.upX = mix(a.upX, b.upX);
  out.upZ = mix(a.upZ, b.upZ);
  out.vx = mix(a.vx, b.vx);
  out.vy = mix(a.vy, b.vy);
  out.vz = mix(a.vz, b.vz);
  const p = out.pose;
  const pa = a.pose;
  const pb = b.pose;
  p.speed = mix(pa.speed, pb.speed);
  p.turn = mix(pa.turn, pb.turn);
  p.wings = mix(pa.wings, pb.wings);
  p.groom = mix(pa.groom, pb.groom);
  p.feed = mix(pa.feed, pb.feed);
  p.crouch = mix(pa.crouch, pb.crouch);
  p.pitch = mix(pa.pitch, pb.pitch);
  p.roll = mix(pa.roll, pb.roll);
  out.flags = (near.flags & ~(EATING | AIRBORNE)) | ((a.flags | b.flags) & EATING) | (near.flags & AIRBORNE);
}
