// The world as the fly's body meets it: a table top (round, or a rectangle:
// a sill, a bench, a bar) with things standing on it. It answers where the
// fly can stand, what it bumps into, and where a ray from the camera lands.
// How the world looks is built from the same description elsewhere
// (apps/web/src/scenes), but nothing here depends on it.

import type { FoodPatch } from "./pantry.ts";
import { footprintRadius, inside, prismSpan, sideNormal, topHeight, topNormal } from "./shapes.ts";
import type { Solid, Vec3 } from "./shapes.ts";

/** The top the fly lives on, centred on the origin at y = 0: a disc, or a rectangle with half-sizes hx and hz. */
export type Floor = { kind: "circle"; r: number } | { kind: "rect"; hx: number; hz: number };

/** A place the fly can live: everything its body meets there. */
export type Place = {
  floor: Floor;
  /** What stands on it, as the fly feels it (and as it is drawn). Solids may stand beyond the floor's edge: walls, a window. */
  solids: readonly Solid[];
  /** The place's own food, eaten down and slowly coming back. */
  patches: readonly FoodPatch[];
  /** Where the fly first stands, and its yaw (radians; 0 faces +z). */
  start: { x: number; z: number; yaw: number };
  /** In the air it is drawn back below this height, mm. */
  ceiling: number;
};

/** What is under a point: the height of the surface and which way it faces. */
export type Surface = {
  /** Height of the surface, mm. */
  y: number;
  /** Upward unit normal. */
  normal: Vec3;
  /** Index into `solids`, or -1 for the table top. */
  solid: number;
  /** False beyond the table's edge, where there is nothing to stand on. */
  onTable: boolean;
};

export type RayHit = {
  point: Vec3;
  /** The surface's normal there: up on tops and the table, outward on a column's side. */
  normal: Vec3;
  /** -1 for the table. */
  solid: number;
  /** Distance along the (unit) ray. */
  t: number;
};

export const createSurface = (): Surface => ({ y: 0, normal: { x: 0, y: 1, z: 0 }, solid: -1, onTable: true });

/**
 * One world object for the whole game, whose place can change (`load`): the
 * fly, the camera and everything else that asks it questions keep asking the
 * same object when the fly is carried somewhere else.
 */
export class World {
  place!: Place;
  solids: readonly Solid[] = [];
  floor!: Floor;
  #radii = new Float64Array(0);
  #span: [number, number] = [0, 0];
  #bounds = new Float64Array(0);
  #all: number[] = [];
  #cells = new Map<number, Map<number, number[]>>();
  #visited = new Uint32Array(0);
  #epoch = 0;
  #candidates = new Uint32Array(0);
  #candidateCount = 0;

  constructor(place: Place) {
    this.load(place);
  }

  load(place: Place) {
    this.place = place;
    this.solids = place.solids;
    this.floor = place.floor;
    this.#radii = Float64Array.from(place.solids, (s) => footprintRadius(s.footprint));
    this.#bounds = new Float64Array(place.solids.length * 5);
    this.#all = Array.from(place.solids, (_, i) => i);
    this.#visited = new Uint32Array(place.solids.length);
    this.#epoch = 0;
    this.#cells.clear();
    this.#candidates = new Uint32Array(place.solids.length);
    this.#candidateCount = 0;
    // The world is static between carries: short moves need only nearby solids.
    for (let i = 0; i < place.solids.length; i++) {
      const { footprint: f, top } = place.solids[i];
      let rx: number;
      let rz: number;
      if (f.kind === "circle") rx = rz = f.r;
      else {
        const c = Math.cos(f.angle);
        const s = Math.sin(f.angle);
        rx = f.kind === "box" ? Math.abs(c) * f.hx + Math.abs(s) * f.hz : Math.hypot(c * f.rx, s * f.rz);
        rz = f.kind === "box" ? Math.abs(s) * f.hx + Math.abs(c) * f.hz : Math.hypot(s * f.rx, c * f.rz);
      }
      rx += 1e-8;
      rz += 1e-8;
      const b = i * 5;
      this.#bounds[b] = f.x - rx;
      this.#bounds[b + 1] = f.x + rx;
      this.#bounds[b + 2] = f.z - rz;
      this.#bounds[b + 3] = f.z + rz;
      this.#bounds[b + 4] = top.kind === "flat" ? top.y : top.kind === "dome" ? top.base + top.height : Math.max(top.well, top.rim);
      this.#bounds[b + 4] += 1e-8;
      for (let z = Math.floor((f.z - rz) / CELL); z <= Math.floor((f.z + rz) / CELL); z++) {
        let row = this.#cells.get(z);
        if (!row) this.#cells.set(z, row = new Map());
        for (let x = Math.floor((f.x - rx) / CELL); x <= Math.floor((f.x + rx) / CELL); x++) {
          let cell = row.get(x);
          if (!cell) row.set(x, cell = []);
          cell.push(i);
        }
      }
    }
  }

  /** Over the table top (inside the floor's edge). */
  onTable(x: number, z: number) {
    const f = this.floor;
    return f.kind === "circle" ? x * x + z * z < f.r * f.r : Math.abs(x) < f.hx && Math.abs(z) < f.hz;
  }

  /**
   * How far a point is past the floor's edge, mm (0 or less over the table),
   * and the horizontal way back over it, written to `inward`.
   */
  beyond(x: number, z: number, inward: Vec3): number {
    const f = this.floor;
    inward.y = 0;
    if (f.kind === "circle") {
      const d = Math.hypot(x, z);
      inward.x = d > 0 ? -x / d : 0;
      inward.z = d > 0 ? -z / d : 0;
      return d - f.r;
    }
    const ox = Math.abs(x) - f.hx;
    const oz = Math.abs(z) - f.hz;
    if (ox <= 0 && oz <= 0) {
      // Inside: toward the middle, across the nearer edge.
      inward.x = ox > oz ? -Math.sign(x) : 0;
      inward.z = ox > oz ? 0 : -Math.sign(z);
      return Math.max(ox, oz);
    }
    const px = Math.max(0, ox);
    const pz = Math.max(0, oz);
    const d = Math.hypot(px, pz);
    inward.x = (-Math.sign(x) * px) / d;
    inward.z = (-Math.sign(z) * pz) / d;
    return d;
  }

  /** The highest surface over a point (the table top if nothing stands there). Writes `out`. */
  surface(x: number, z: number, out: Surface): Surface {
    let best = -1;
    let y = 0;
    const candidates = this.#cellAt(x, z);
    for (let k = 0; k < candidates.length; k++) {
      const i = candidates[k];
      const solid = this.solids[i];
      const f = solid.footprint;
      const r = this.#radii[i];
      if (Math.abs(x - f.x) > r || Math.abs(z - f.z) > r || !inside(f, x, z)) continue;
      const h = topHeight(solid, x, z);
      if (h > y) {
        y = h;
        best = i;
      }
    }
    out.y = y;
    out.solid = best;
    out.onTable = this.onTable(x, z);
    if (best >= 0) topNormal(this.solids[best], x, z, out.normal);
    else {
      out.normal.x = 0;
      out.normal.y = 1;
      out.normal.z = 0;
    }
    return out;
  }

  /** Just the height of the surface over a point. */
  heightAt(x: number, z: number): number {
    return this.surface(x, z, scratchSurface).y;
  }

  /**
   * The way out of whatever rises above `y` at a point: the horizontal outward
   * normal of the tallest column there, or back over the table beyond its
   * edge. Writes `out`; returns false when nothing there is above `y`.
   */
  wallNormal(x: number, z: number, y: number, out: Vec3): boolean {
    if (!this.onTable(x, z)) {
      this.beyond(x, z, out);
      return true;
    }
    let best = -1;
    let height = y;
    const candidates = this.#cellAt(x, z);
    for (let k = 0; k < candidates.length; k++) {
      const i = candidates[k];
      const solid = this.solids[i];
      const f = solid.footprint;
      const r = this.#radii[i];
      if (Math.abs(x - f.x) > r || Math.abs(z - f.z) > r || !inside(f, x, z)) continue;
      const h = topHeight(solid, x, z);
      if (h > height) {
        height = h;
        best = i;
      }
    }
    if (best < 0) return false;
    sideNormal(this.solids[best].footprint, x, z, out);
    return true;
  }

  /**
   * Where a ray first meets the world: a column's top or side, or the table.
   * `dir` must be a unit vector; `maxDistance` bounds a swept movement. Null
   * when it misses everything (into the sky, or past the table's edge).
   */
  raycast(origin: Vec3, dir: Vec3, out: RayHit, maxDistance = Infinity): RayHit | null {
    let bestT = maxDistance;
    let found = false;
    // The table top.
    if (dir.y < -1e-9) {
      const t = -origin.y / dir.y;
      const x = origin.x + dir.x * t;
      const z = origin.z + dir.z * t;
      if (t > 0 && t <= bestT && this.onTable(x, z)) {
        bestT = t;
        found = true;
        setHit(out, x, 0, z, 0, 1, 0, -1, t);
      }
    }
    const bounded = Number.isFinite(bestT);
    const endX = bounded ? origin.x + dir.x * bestT : origin.x;
    const endZ = bounded ? origin.z + dir.z * bestT : origin.z;
    const minX = bounded ? Math.min(origin.x, endX) : -Infinity;
    const maxX = bounded ? Math.max(origin.x, endX) : Infinity;
    const minZ = bounded ? Math.min(origin.z, endZ) : -Infinity;
    const maxZ = bounded ? Math.max(origin.z, endZ) : Infinity;
    const minY = bounded ? Math.min(origin.y, origin.y + dir.y * bestT) : -Infinity;
    const candidates = bounded ? this.#near(minX, maxX, minZ, maxZ) : this.#all;
    const count = bounded ? this.#candidateCount : candidates.length;
    for (let k = 0; k < count; k++) {
      const i = candidates[k];
      const solid = this.solids[i];
      const f = solid.footprint;
      const b = i * 5;
      if (this.#bounds[b + 4] < minY || this.#bounds[b] > maxX || this.#bounds[b + 1] < minX ||
        this.#bounds[b + 2] > maxZ || this.#bounds[b + 3] < minZ) continue;
      const span = prismSpan(f, origin.x, origin.z, dir.x, dir.z, this.#span);
      if (!span) continue;
      const t0 = Math.max(span[0], 0);
      const t1 = Math.min(span[1], bestT);
      if (t0 >= t1) continue;
      // Entering through the side, below the top: the side is hit.
      const ex = origin.x + dir.x * t0;
      const ez = origin.z + dir.z * t0;
      const ey = origin.y + dir.y * t0;
      if (span[0] > 0 && ey <= topHeight(solid, clampInside(solid, ex, ez, 0), clampInside(solid, ex, ez, 1)) && ey >= 0) {
        sideNormal(solid.footprint, ex, ez, scratchNormal);
        bestT = t0;
        found = true;
        setHit(out, ex, ey, ez, scratchNormal.x, 0, scratchNormal.z, i, t0);
        continue;
      }
      const t = topCrossing(solid, origin, dir, t0, t1);
      if (t !== null && t < bestT) {
        const x = origin.x + dir.x * t;
        const z = origin.z + dir.z * t;
        topNormal(solid, x, z, scratchNormal);
        bestT = t;
        found = true;
        setHit(out, x, origin.y + dir.y * t, z, scratchNormal.x, scratchNormal.y, scratchNormal.z, i, t);
      }
    }
    return found ? out : null;
  }

  #cellAt(x: number, z: number): readonly number[] {
    return this.#cells.get(Math.floor(z / CELL))?.get(Math.floor(x / CELL)) ?? NO_SOLIDS;
  }

  #near(minX: number, maxX: number, minZ: number, maxZ: number): ArrayLike<number> {
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    if (x0 === x1 && z0 === z1) {
      const cell = this.#cellAt(minX, minZ);
      this.#candidateCount = cell.length;
      return cell;
    }
    // Long camera rays cost less to scan than to enumerate many cells.
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 16) {
      this.#candidateCount = this.#all.length;
      return this.#all;
    }
    this.#epoch = (this.#epoch + 1) >>> 0;
    if (this.#epoch === 0) {
      this.#visited.fill(0);
      this.#epoch = 1;
    }
    let count = 0;
    for (let z = z0; z <= z1; z++) {
      const row = this.#cells.get(z);
      if (!row) continue;
      for (let x = x0; x <= x1; x++) {
        const cell = row.get(x);
        if (!cell) continue;
        for (let k = 0; k < cell.length; k++) {
          const i = cell[k];
          if (this.#visited[i] !== this.#epoch) {
            this.#visited[i] = this.#epoch;
            count++;
          }
        }
      }
    }
    this.#candidateCount = count;
    if (count === 0) return NO_SOLIDS;
    const candidates = this.#candidates;
    let next = 0;
    // Preserve description order for overlapping solids at exactly equal heights.
    for (let i = 0; i < this.#visited.length; i++) if (this.#visited[i] === this.#epoch) candidates[next++] = i;
    return candidates;
  }
}

const CELL = 32;
const NO_SOLIDS: readonly number[] = [];
const scratchSurface = createSurface();
const scratchNormal: Vec3 = { x: 0, y: 1, z: 0 };

function setHit(out: RayHit, x: number, y: number, z: number, nx: number, ny: number, nz: number, solid: number, t: number) {
  out.point.x = x;
  out.point.y = y;
  out.point.z = z;
  out.normal.x = nx;
  out.normal.y = ny;
  out.normal.z = nz;
  out.solid = solid;
  out.t = t;
}

// A point on the prism's boundary, nudged a hair inside so its top height is defined.
function clampInside(solid: Solid, x: number, z: number, axis: 0 | 1) {
  const f = solid.footprint;
  const k = 0.999;
  return axis === 0 ? f.x + (x - f.x) * k : f.z + (z - f.z) * k;
}

/** The first distance in [t0, t1] where the ray passes down through the solid's top, or null. */
function topCrossing(solid: Solid, o: Vec3, d: Vec3, t0: number, t1: number): number | null {
  const { top } = solid;
  if (top.kind === "flat") {
    if (Math.abs(d.y) < 1e-12) return null;
    const t = (top.y - o.y) / d.y;
    return t >= t0 && t <= t1 ? t : null;
  }
  const steps = 16;
  let a = t0;
  if (aboveTop(solid, o, d, a) <= 0) return a;
  for (let k = 1; k <= steps; k++) {
    const end = t0 + ((t1 - t0) * k) / steps;
    if (aboveTop(solid, o, d, end) <= 0) {
      let b = end;
      for (let j = 0; j < 20; j++) {
        const m = (a + b) / 2;
        if (aboveTop(solid, o, d, m) > 0) a = m;
        else b = m;
      }
      return b;
    }
    a = end;
  }
  return null;
}

function aboveTop(solid: Solid, o: Vec3, d: Vec3, t: number) {
  return o.y + d.y * t - topHeight(solid, o.x + d.x * t, o.z + d.z * t);
}
