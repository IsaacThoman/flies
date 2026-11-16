// What a player may do at a table. Each device is the authority on its own
// fly, and nothing can stop a device faking it; what the room can do is keep
// the fake within what a fly could do, so that it can't spoil the others'
// screens or their food. Where a fly is said to be, it can be only where a
// fly could stand or fly, and it gets there no faster than a fly: a move
// further than that is cut short (the fly is shown as far along as it could
// have come), never taken on trust. Everything else a player does with its
// hands is counted against a rate.

import type { World } from "@fly/world";
import { AIRBORNE } from "./protocol.ts";
import type { FlyState, Spot } from "./protocol.ts";

/** A fly on its feet moves no faster than this, mm/s (it walks at 5 to 16), and in the air no faster than MAX_FLIGHT (a take-off is about 700). */
export const MAX_WALK = 60;
export const MAX_FLIGHT = 1500;
/** Seconds of travel a fly may save up, for states that arrive unevenly. */
const LEASH_STORE = 1;
/** Each state may be this much further than its allowance, mm: rounding on the wire, and a push from another fly. */
const LEASH_SLACK = 0.5;
/** A state's time may be at most this far ahead of the room's, ms. */
export const AHEAD = 500;
/** Coming back after a moment away (a reconnection, a restarted room), a fly may be as far from where the room last had it as it could have walked meanwhile, at this pace (mm/s), up to this long (s). */
const RETURN_PACE = 20;
const RETURN_SECONDS = 10;
/** A fly may be this far past the floor's edge in the air, and this far above the place's ceiling, mm. */
const AIR_BEYOND = 400;
const AIR_ABOVE = 100;

/** Whether a fly could be here at all: over the floor (or in the air not far past it), never inside what stands on it, on its feet only on something. */
export function couldBe(world: World, x: number, y: number, z: number, airborne: boolean): boolean {
  if (!Number.isFinite(x + y + z)) return false;
  if (y > world.place.ceiling + AIR_ABOVE) return false;
  const over = world.onTable(x, z);
  if (!over) return airborne && world.beyond(x, z, inward) < AIR_BEYOND;
  const floor = world.heightAt(x, z);
  if (y < floor - 1.5) return false;
  return airborne || Math.abs(y - floor) <= 3;
}

const inward = { x: 0, y: 0, z: 0 };

/** What the leash did with a state. */
export type Admitted = "taken" | "shortened" | "held" | "refused";

/**
 * A fly on its leash, as the room has it: where it last was, and how much
 * travel it has saved up. Each state from its device is taken as it is, cut
 * short to what the fly could have travelled, held where it was (when the
 * way there isn't somewhere a fly could be), or refused (from the future,
 * or older than the last).
 */
export class Leash {
  /** Travel saved up, mm. */
  #budget = 0;
  #airborne = false;

  /** The fly is set down here (joining, carried somewhere else, coming back): its allowance starts afresh. */
  reset(airborne = false) {
    this.#budget = 0;
    this.#airborne = airborne;
  }

  /**
   * Admits `next` after `last` (the fly as the room has it; changed in place
   * when the state is taken), at room time `now` (ms). `world` is where it is.
   */
  admit(world: World, last: FlyState, next: FlyState, now: number): Admitted {
    if (next.t > now + AHEAD || next.t <= last.t) return "refused";
    const airborne = !!((next.flags | last.flags) & AIRBORNE);
    const speed = airborne || this.#airborne ? MAX_FLIGHT : MAX_WALK;
    this.#airborne = !!(next.flags & AIRBORNE);
    const dt = (next.t - last.t) / 1000;
    this.#budget = Math.min(speed * LEASH_STORE, this.#budget + speed * dt);
    const dx = next.x - last.x;
    const dy = next.y - last.y;
    const dz = next.z - last.z;
    const moved = Math.hypot(dx, dy, dz);
    const allowed = this.#budget + LEASH_SLACK;
    const flying = !!(next.flags & AIRBORNE);
    let x = next.x;
    let y = next.y;
    let z = next.z;
    let result: Admitted = couldBe(world, x, y, z, flying) ? "taken" : "held";
    if (result === "taken" && moved > allowed) {
      const k = allowed / moved;
      x = last.x + dx * k;
      z = last.z + dz * k;
      // On its feet it stands on whatever is there.
      y = flying ? last.y + dy * k : world.heightAt(x, z);
      result = "shortened";
    }
    if (result === "held" || !couldBe(world, x, y, z, flying)) {
      x = last.x;
      y = last.y;
      z = last.z;
      result = "held";
    }
    this.#budget = Math.max(0, this.#budget - Math.hypot(x - last.x, y - last.y, z - last.z));
    const id = last.id;
    copyInto(next, last);
    last.id = id;
    last.x = x;
    last.y = y;
    last.z = z;
    return result;
  }
}

function copyInto(from: FlyState, to: FlyState) {
  to.flags = from.flags;
  to.epoch = from.epoch;
  to.seq = from.seq;
  to.t = from.t;
  to.yaw = from.yaw;
  to.upX = from.upX;
  to.upZ = from.upZ;
  to.vx = from.vx;
  to.vy = from.vy;
  to.vz = from.vz;
  Object.assign(to.pose, from.pose);
  Object.assign(to.hand, from.hand);
}

/** Whether a fly coming back after `seconds` away may be at `at`, having been last at (x, z): somewhere it could stand, within a walk of there. */
export function mayReturnTo(world: World, at: Spot, x: number, z: number, seconds: number): boolean {
  const [ax, az] = at;
  if (!Number.isFinite(ax + az + at[2]) || !world.onTable(ax, az)) return false;
  return Math.hypot(ax - x, az - z) <= RETURN_PACE * Math.min(RETURN_SECONDS, Math.max(0, seconds)) + 3;
}

/** How far apart flies are set down round the place's start, mm: a few body lengths, so they find each other. */
const SPREAD = 9;
/** The steepest a fly is set down on (the cosine of its slope). */
const LEVEL = 0.95;

/**
 * Where player `id`'s fly is set down in a place: the first on the place's
 * start, the others round it facing it, each on somewhere level. The same
 * on every device and in the room.
 */
export function spawnSpot(world: World, id: number): Spot {
  const start = world.place.start;
  if (id <= 1) return [start.x, start.z, start.yaw];
  const level = (x: number, z: number) => world.onTable(x, z) && world.surface(x, z, surface).normal.y >= LEVEL && Math.abs(surface.y - world.heightAt(start.x, start.z)) < 0.5;
  for (let ring = 1; ring <= 6; ring++) {
    for (let turn = 0; turn < 12; turn++) {
      // The golden angle spreads them round; each try further round, then further out.
      const a = id * 2.39996 + turn * 0.52;
      const x = start.x + Math.cos(a) * SPREAD * ring;
      const z = start.z + Math.sin(a) * SPREAD * ring;
      if (level(x, z)) return [x, z, Math.atan2(start.x - x, start.z - z)];
    }
  }
  return [start.x, start.z, start.yaw];
}

const surface = { y: 0, normal: { x: 0, y: 1, z: 0 }, solid: -1, onTable: true };

/** A rate a player may do something at: so many a minute, with a few at once. */
export class Rate {
  readonly #perMinute: number;
  readonly #burst: number;
  #tokens: number;
  #at = -Infinity;

  constructor(perMinute: number, burst: number) {
    this.#perMinute = perMinute;
    this.#burst = burst;
    this.#tokens = burst;
  }

  /** Whether it may be done now (ms): if so, it is counted. */
  take(now: number): boolean {
    if (this.#at > -Infinity) this.#tokens = Math.min(this.#burst, this.#tokens + ((now - this.#at) / 60_000) * this.#perMinute);
    this.#at = now;
    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }
}

/** Per player: balls thrown, food dropped, food the place put out reported, bubbles burst, and (the starter) changes to the table; and messages of any kind. */
export const LIMITS = {
  throws: [12, 3],
  drops: [30, 6],
  found: [10, 4],
  pops: [120, 10],
  changes: [30, 6],
  messages: [60 * 60, 120],
} as const satisfies Record<string, readonly [perMinute: number, burst: number]>;
