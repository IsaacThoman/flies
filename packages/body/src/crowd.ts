// Other flies, as this fly's body meets them: at a table with others (packages/net)
// each device lives one fly and sees the others as bodies posed from what
// their devices send. Two bodies can't stand in the same spot, so this fly is
// pushed out of any it walks or flies into (the body's doing, as sliding
// along a wall is); its antennae press on another's body as on a wall, and
// being pushed is felt as a touch. What it does about any of it is its
// brain's.
//
// Each fly is a capsule: a segment along its heading with a radius round it.
// A device moves only its own fly, out of where it sees the others, so each
// of two flies that meet steps aside from the other as its own device sees it.

import type { World } from "@fly/world";
import { createSurface } from "@fly/world";
import type { FlyBody } from "./motion.ts";
import { FLY_HEIGHT, FLY_LENGTH, MAX_SLOPE_COS, STEP_UP } from "./motion.ts";

/** Half the length of a fly's capsule's segment and its radius, mm: a fly about 2.5 mm long and, with its legs gathered, 1.5 mm wide. */
export const BODY_HALF = 0.42 * FLY_LENGTH;
export const BODY_RADIUS = 0.3 * FLY_LENGTH;
/** The capsule's middle is this high above the feet, mm. */
export const BODY_UP = 0.3 * FLY_LENGTH;
/** Being pushed by another fly is felt this hard (a bubble bursting on it is 0.3). */
export const CONTACT_TOUCH = 0.3;
/** How much of its speed into another fly it bounces back with in the air, as off a wall (motion.ts). The hit is felt as touch, as hitting anything is. */
const BOUNCE = 1.3;
/** At most this many others: the nearest, when more are at the table. */
export const MAX_NEIGHBOURS = 32;

/** Another fly, as this one meets it. */
export type Neighbour = { x: number; y: number; z: number; yaw: number; vx: number; vy: number; vz: number };

/** Whatever bodies a point can press into besides the world (for the antennae). */
export interface Bodies {
  /** Whether a point is inside another fly's body, grown by `margin` mm. */
  inside(x: number, y: number, z: number, margin: number): boolean;
}

export class Crowd implements Bodies {
  readonly neighbours: Neighbour[] = Array.from({ length: MAX_NEIGHBOURS }, () => ({ x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0 }));
  /** How many of `neighbours` are there now. */
  count = 0;
  /** Another fly touching it this frame (0 to 1), for its senses, and where on its body (mm, in the world): the side of it the other is on. */
  touch = 0;
  readonly contact = { x: 0, y: 0, z: 0 };
  /** How deep it was into another fly before it was pushed out, mm, this frame (for measuring). */
  overlap = 0;
  readonly #world: World;
  readonly #surface = createSurface();
  /** How far each neighbour is, squared, and which is the farthest: a full crowd gives that one's place to a nearer fly. */
  readonly #distance = new Float64Array(MAX_NEIGHBOURS);
  #farthest = 0;

  constructor(world: World) {
    this.#world = world;
  }

  /**
   * Sets the next neighbour, `distance2` (mm², squared) from this fly;
   * returns it to fill in. A full crowd keeps the nearest: this one takes
   * the farthest's place, or is left out (null) if it is farther still.
   */
  add(distance2 = 0): Neighbour | null {
    const d = this.#distance;
    if (this.count < MAX_NEIGHBOURS) {
      d[this.count] = distance2;
      if (distance2 > d[this.#farthest]) this.#farthest = this.count;
      return this.neighbours[this.count++];
    }
    const at = this.#farthest;
    if (distance2 >= d[at]) return null;
    d[at] = distance2;
    for (let i = 0; i < MAX_NEIGHBOURS; i++) if (d[i] > d[this.#farthest]) this.#farthest = i;
    return this.neighbours[at];
  }

  clear() {
    this.count = 0;
    this.#farthest = 0;
  }

  inside(x: number, y: number, z: number, margin: number) {
    for (let i = 0; i < this.count; i++) {
      const n = this.neighbours[i];
      if (Math.abs(y - (n.y + BODY_UP)) > BODY_RADIUS + margin) continue;
      const s = Math.sin(n.yaw) * BODY_HALF;
      const c = Math.cos(n.yaw) * BODY_HALF;
      const d = pointToSegment(x, z, n.x - s, n.z - c, n.x + s, n.z + c, scratch);
      if (d < BODY_RADIUS + margin) return true;
    }
    return false;
  }

  /** Which side of the fly the nearest other fly is on: 1 its left, -1 its right, 0 with none here. */
  sideOf(body: FlyBody): 1 | -1 | 0 {
    let best = Infinity;
    let left = 0;
    for (let i = 0; i < this.count; i++) {
      const n = this.neighbours[i];
      const dx = n.x - body.position.x;
      const dz = n.z - body.position.z;
      const d = dx * dx + dz * dz;
      if (d >= best) continue;
      best = d;
      // In the fly's frame its left is (cos yaw, 0, -sin yaw).
      left = dx * Math.cos(body.yaw) - dz * Math.sin(body.yaw);
    }
    return left > 0 ? 1 : left < 0 ? -1 : 0;
  }

  /**
   * After the body has moved this frame: pushes it out of any fly it is in,
   * where the world lets it go, and bounces it off one it meets in the air.
   */
  resolve(body: FlyBody, dt: number) {
    this.touch = 0;
    this.overlap = 0;
    if (this.count === 0 || !(dt > 0)) return;
    const p = body.position;
    const s = Math.sin(body.yaw) * BODY_HALF;
    const c = Math.cos(body.yaw) * BODY_HALF;
    for (let i = 0; i < this.count; i++) {
      const n = this.neighbours[i];
      if (Math.abs(p.y - n.y) > BODY_RADIUS * 2) continue;
      const ns = Math.sin(n.yaw) * BODY_HALF;
      const nc = Math.cos(n.yaw) * BODY_HALF;
      const d = segmentToSegment(p.x - s, p.z - c, p.x + s, p.z + c, n.x - ns, n.z - nc, n.x + ns, n.z + nc, scratch);
      const depth = BODY_RADIUS * 2 - d;
      if (depth <= 0) continue;
      // The way out: from the nearest point on the other to the nearest on this one (straight away from it if they cross).
      let nx = scratch.ax - scratch.bx;
      let nz = scratch.az - scratch.bz;
      let l = Math.hypot(nx, nz);
      if (l < 1e-6) {
        nx = p.x - n.x;
        nz = p.z - n.z;
        l = Math.hypot(nx, nz);
        if (l < 1e-6) {
          nx = Math.sin(body.yaw + Math.PI / 2);
          nz = Math.cos(body.yaw + Math.PI / 2);
          l = 1;
        }
      }
      nx /= l;
      nz /= l;
      this.overlap = Math.max(this.overlap, depth);
      if (depth >= this.overlap) {
        this.contact.x = scratch.ax - nx * BODY_RADIUS;
        this.contact.y = p.y + BODY_UP;
        this.contact.z = scratch.az - nz * BODY_RADIUS;
      }
      if (body.mode === "airborne") {
        // Bounced off it, as off anything it flies into; the hit is felt.
        const v = body.velocity;
        const into = (v.x - n.vx) * nx + (v.z - n.vz) * nz;
        if (into < 0) {
          v.x -= into * nx * BOUNCE;
          v.z -= into * nz * BOUNCE;
          body.hitAgainst(-into, nx, 0, nz);
        }
        p.x += nx * depth;
        p.z += nz * depth;
      } else this.#shove(body, nx * depth, nz * depth);
      this.touch = CONTACT_TOUCH;
    }
  }

  /** Moves a standing fly aside over the surface it is on (not onto a table over it), if it can stand there; otherwise it stays (and stays pressed). */
  #shove(body: FlyBody, dx: number, dz: number) {
    const p = body.position;
    const next = this.#world.surface(p.x + dx, p.z + dz, this.#surface, p.y + STEP_UP);
    if (!next.onTable || Math.abs(next.y - p.y) > STEP_UP || next.normal.y < MAX_SLOPE_COS || next.underside < next.y + FLY_HEIGHT) return;
    p.x += dx;
    p.z += dz;
    p.y = next.y;
    const s = body.surface;
    s.y = next.y;
    s.solid = next.solid;
    s.onTable = next.onTable;
    s.normal.x = next.normal.x;
    s.normal.y = next.normal.y;
    s.normal.z = next.normal.z;
  }
}

type Closest = { ax: number; az: number; bx: number; bz: number };
const scratch: Closest = { ax: 0, az: 0, bx: 0, bz: 0 };

/** Distance from a point to a segment in the ground plane; the nearest point is left in `out.b`. */
export function pointToSegment(px: number, pz: number, x0: number, z0: number, x1: number, z1: number, out: Closest) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const l2 = dx * dx + dz * dz;
  const k = l2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / l2)) : 0;
  out.ax = px;
  out.az = pz;
  out.bx = x0 + dx * k;
  out.bz = z0 + dz * k;
  return Math.hypot(px - out.bx, pz - out.bz);
}

/** Distance between two segments in the ground plane, a and b; their nearest points are left in `out`. */
export function segmentToSegment(ax0: number, az0: number, ax1: number, az1: number, bx0: number, bz0: number, bx1: number, bz1: number, out: Closest) {
  if (crosses(ax0, az0, ax1, az1, bx0, bz0, bx1, bz1)) {
    out.ax = out.bx = (ax0 + ax1) / 2;
    out.az = out.bz = (az0 + az1) / 2;
    return 0;
  }
  // Otherwise the nearest pair has an end of one of them: try each end against the other segment.
  const best = nearest;
  best.d = pointToSegment(ax0, az0, bx0, bz0, bx1, bz1, out);
  keep(best, out, false);
  if (pointToSegment(ax1, az1, bx0, bz0, bx1, bz1, out) < best.d) keep(best, out, false);
  if (pointToSegment(bx0, bz0, ax0, az0, ax1, az1, out) < best.d) keep(best, out, true);
  if (pointToSegment(bx1, bz1, ax0, az0, ax1, az1, out) < best.d) keep(best, out, true);
  out.ax = best.ax;
  out.az = best.az;
  out.bx = best.bx;
  out.bz = best.bz;
  return best.d;
}

const nearest = { d: 0, ax: 0, az: 0, bx: 0, bz: 0 };

/** Keeps a point-to-segment result as a pair: `swapped` when the point was on b and the nearest point on a. */
function keep(best: typeof nearest, r: Closest, swapped: boolean) {
  best.d = Math.hypot(r.ax - r.bx, r.az - r.bz);
  best.ax = swapped ? r.bx : r.ax;
  best.az = swapped ? r.bz : r.az;
  best.bx = swapped ? r.ax : r.bx;
  best.bz = swapped ? r.az : r.bz;
}

const side = (x0: number, z0: number, x1: number, z1: number, px: number, pz: number) => (x1 - x0) * (pz - z0) - (z1 - z0) * (px - x0);

function crosses(ax0: number, az0: number, ax1: number, az1: number, bx0: number, bz0: number, bx1: number, bz1: number) {
  const d1 = side(bx0, bz0, bx1, bz1, ax0, az0);
  const d2 = side(bx0, bz0, bx1, bz1, ax1, az1);
  const d3 = side(ax0, az0, ax1, az1, bx0, bz0);
  const d4 = side(ax0, az0, ax1, az1, bx1, bz1);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
