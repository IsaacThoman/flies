// The soap bubbles high over a shared table, the same on every device. Alone,
// a device moves its bubbles on frame by frame from its own random stream
// (apps/web/src/scene/bubbles.ts); shared, that drifts apart within seconds.
// So here each bubble's path is worked out from the room's clock: each slot
// blows a bubble after another, each drawn from the table's seed, the slot
// and its count, drifting on the breeze in closed form. Where it ends (it
// touches something, drifts off, the rain bursts it, a ball hits it) is
// found by bisecting the path between the times a device looks, so devices
// that look at different moments find the same end and blow the same next
// bubble. A fly bursting one is told by its own device, since only that
// device knows where its fly really is.
//
// They drift on the picnic's breeze (@fly/world, BREEZE); gusts don't move
// these bubbles, since a gust is felt on each device a little differently.

import type { World } from "@fly/world";
import { BREEZE, createSurface } from "@fly/world";
import { ballAt } from "./ball.ts";
import type { BallWire } from "./protocol.ts";
import { mix, stream } from "./random.ts";

/** The high bubbles over the picnic table: the scene has 12, of which 4 bob low past each fly and are each device's own. */
export const TABLE_BUBBLES = 8;
/** A burst bubble is gone after this long, s, and the next comes then (or later, in the rain). */
export const POP_SECONDS = 0.12;
/** Devices look at least this often along a path for its end, s. */
const STEP = 0.1;

export type TableBubble = {
  /** Which bubble this slot is on. */
  cycle: number;
  /** Room time it was blown, s. */
  t0: number;
  x0: number;
  y0: number;
  z0: number;
  r: number;
  phase: number;
  speed: number;
  /** Rain bursts it once its share of rain adds up to this. */
  rainClock: number;
  /** The rain holds back the next one this long after it goes, s. */
  wait: number;
  /** Room time it burst, s, or -1; and room time it drifted off, or -1. */
  poppedAt: number;
  goneAt: number;
  /** How far along its path it has been looked at, room s. */
  checked: number;
};

export type BubbleSnapshot = { slot: number; cycle: number; t0: number; poppedAt: number; goneAt: number }[];

export class TableBubbles {
  readonly slots: TableBubble[] = [];
  readonly #seed: number;
  readonly #world: World;
  readonly #surface = createSurface();
  /** How hard it is raining (0 to 1): the table's weather. */
  rain = 0;

  /**
   * Each slot's first bubble is blown at room time `start` (s). The room
   * starts them when it does (a table started, carried here, or woken), and
   * tells every device the bubbles as they stand: from 0, they would have
   * all the time the room has been up to catch up on first.
   */
  constructor(seed: number, world: World, count: number, start = 0) {
    this.#seed = seed;
    this.#world = world;
    for (let i = 0; i < count; i++) {
      const b = {} as TableBubble;
      this.#blow(b, i, 0, start);
      // Spread along their way at the start, as the scene's are.
      b.x0 += stream(mix(this.#seed, i, -1))() * 900;
      this.slots.push(b);
    }
  }

  /** Blows bubble `cycle` from slot `slot` at room time `t0` (s). */
  #blow(b: TableBubble, slot: number, cycle: number, t0: number) {
    const next = stream(mix(this.#seed, slot, cycle));
    const range = (lo: number, hi: number) => lo + (hi - lo) * next();
    b.cycle = cycle;
    b.t0 = t0;
    b.x0 = -520 + range(-80, 0);
    b.z0 = range(-260, 260);
    b.y0 = range(25, 260);
    b.r = range(6, 26);
    b.phase = range(0, Math.PI * 2);
    b.speed = range(0.7, 1.3);
    b.rainClock = -Math.log(1 - next() * 0.999);
    b.wait = next() < this.rain ? range(6, 20) : 0;
    b.poppedAt = -1;
    b.goneAt = -1;
    b.checked = t0;
  }

  /** Where a slot's bubble is at room time t (s), on its own path. */
  position(b: TableBubble, t: number, out: { x: number; y: number; z: number }) {
    const s = t - b.t0;
    out.x = b.x0 + BREEZE.x * b.speed * s;
    out.z = b.z0 + BREEZE.z * b.speed * s - (10 / 0.3) * (Math.cos(0.3 * t + b.phase) - Math.cos(0.3 * b.t0 + b.phase));
    out.y = b.y0 - 2 * s - (6 / 0.5) * (Math.cos(0.5 * t + b.phase) - Math.cos(0.5 * b.t0 + b.phase));
    return out;
  }

  /** Whether it is alive at room time t: not yet burst or gone. */
  alive(b: TableBubble, t: number) {
    return t >= b.t0 && (b.poppedAt < 0 || t < b.poppedAt) && (b.goneAt < 0 || t < b.goneAt);
  }

  /** It ends here: touching something, or under the rain. */
  #ends(b: TableBubble, t: number) {
    const p = this.position(b, t, scratch);
    const s = this.#world.surface(p.x, p.z, this.#surface);
    if (p.y - b.r < s.y + 0.5 || p.y < b.r) return true;
    return (t - b.t0) * 0.5 * this.rain >= b.rainClock;
  }

  #off(b: TableBubble, t: number) {
    const p = this.position(b, t, scratch);
    return p.x > 640 || Math.abs(p.z) > 700;
  }

  /** Moves every slot on to room time t (s): finds where bubbles ended, and blows the next ones. */
  update(t: number) {
    for (let i = 0; i < this.slots.length; i++) this.#advance(i, t);
  }

  #advance(slot: number, t: number) {
    const b = this.slots[slot];
    for (let guard = 0; guard < 64; guard++) {
      const end = b.poppedAt >= 0 ? b.poppedAt + POP_SECONDS + b.wait : b.goneAt;
      if (end >= 0) {
        if (t < end) return;
        this.#blow(b, slot, b.cycle + 1, end);
        continue;
      }
      // Look along the path from where it was last looked at, a step at a time, for its end.
      while (b.checked < t) {
        const from = b.checked;
        const to = Math.min(t, from + STEP);
        if (this.#ends(b, to)) {
          b.poppedAt = bisect(from, to, (x) => this.#ends(b, x));
          break;
        }
        if (this.#off(b, to)) {
          b.goneAt = bisect(from, to, (x) => this.#off(b, x));
          break;
        }
        b.checked = to;
      }
      if (b.poppedAt < 0 && b.goneAt < 0) return;
    }
  }

  /**
   * Bursts a slot's bubble at room time `at` (s), if it is still on that
   * bubble and it was alive then: a fly flew into it, or a ball hit it.
   * Returns whether it burst.
   */
  pop(slot: number, cycle: number, at: number): boolean {
    const b = this.slots[slot];
    if (!b || b.cycle !== cycle || !this.alive(b, at)) return false;
    b.poppedAt = at;
    return true;
  }

  /**
   * Bursts any bubble a thrown ball (radius `reach`) runs into between room
   * times `a` and `b` (s), at the moment it first touches.
   */
  hitBy(a: number, b: number, reach: number, ball: BallWire) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      for (let t = a; t < b; t += STEP) {
        const to = Math.min(b, t + STEP);
        if (!this.#touching(s, to, reach, ball)) continue;
        let lo = t;
        let hi = to;
        while (hi - lo > 1e-4) {
          const m = (lo + hi) / 2;
          if (this.#touching(s, m, reach, ball)) hi = m;
          else lo = m;
        }
        this.pop(i, s.cycle, hi);
        break;
      }
    }
  }

  #touching(s: TableBubble, t: number, reach: number, ball: BallWire) {
    if (!this.alive(s, t)) return false;
    this.position(s, t, scratch);
    ballAt(ball, t * 1000, scratchBall);
    return Math.hypot(scratch.x - scratchBall.x, scratch.y - scratchBall.y, scratch.z - scratchBall.z) < s.r + reach;
  }

  /** Each slot's bubble as it stands, for a device joining. */
  snapshot(): BubbleSnapshot {
    return this.slots.map((b, slot) => ({ slot, cycle: b.cycle, t0: b.t0, poppedAt: b.poppedAt, goneAt: b.goneAt }));
  }

  /** Takes up the room's bubbles as they stand. */
  restore(snapshot: BubbleSnapshot) {
    for (const s of snapshot) {
      const b = this.slots[s.slot];
      if (!b) continue;
      this.#blow(b, s.slot, s.cycle, s.t0);
      if (s.cycle === 0) b.x0 += stream(mix(this.#seed, s.slot, -1))() * 900;
      b.poppedAt = s.poppedAt;
      b.goneAt = s.goneAt;
    }
  }
}

/** The first moment in (a, b] that `ended` holds, to a tenth of a millisecond, given that it holds at b. */
function bisect(a: number, b: number, ended: (t: number) => boolean) {
  let lo = a;
  let hi = b;
  while (hi - lo > 1e-4) {
    const m = (lo + hi) / 2;
    if (ended(m)) hi = m;
    else lo = m;
  }
  return hi;
}

const scratch = { x: 0, y: 0, z: 0 };
const scratchBall = { x: 0, y: 0, z: 0 };
