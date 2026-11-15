// The world as the fly's body meets it: a round table with things standing on
// it. It answers where the fly can stand, what it bumps into, and where a ray
// from the camera lands. How the world looks is built from the same
// description elsewhere (apps/web/src/scene), but nothing here depends on it.

import { footprintRadius, inside, prismSpan, sideNormal, topHeight, topNormal } from "./shapes.ts";
import type { Solid, Vec3 } from "./shapes.ts";

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

export class World {
  readonly solids: readonly Solid[];
  /** The table top is a disc of this radius (mm) around the origin, at y = 0. */
  readonly tableRadius: number;
  #radii: Float64Array;

  constructor(solids: readonly Solid[], tableRadius: number) {
    this.solids = solids;
    this.tableRadius = tableRadius;
    this.#radii = Float64Array.from(solids, (s) => footprintRadius(s.footprint));
  }

  onTable(x: number, z: number) {
    return x * x + z * z < this.tableRadius * this.tableRadius;
  }

  /** The highest surface over a point (the table top if nothing stands there). Writes `out`. */
  surface(x: number, z: number, out: Surface): Surface {
    let best = -1;
    let y = 0;
    for (let i = 0; i < this.solids.length; i++) {
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
   * normal of the tallest column there, or toward the table's middle beyond
   * its edge. Writes `out`; returns false when nothing there is above `y`.
   */
  wallNormal(x: number, z: number, y: number, out: Vec3): boolean {
    if (!this.onTable(x, z)) {
      const d = Math.hypot(x, z) || 1;
      out.x = -x / d;
      out.y = 0;
      out.z = -z / d;
      return true;
    }
    let best = -1;
    let height = y;
    for (let i = 0; i < this.solids.length; i++) {
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
   * `dir` must be a unit vector. Null when it misses everything (into the sky,
   * or past the table's edge).
   */
  raycast(origin: Vec3, dir: Vec3, out: RayHit): RayHit | null {
    let bestT = Infinity;
    let found = false;
    // The table top.
    if (dir.y < -1e-9) {
      const t = -origin.y / dir.y;
      const x = origin.x + dir.x * t;
      const z = origin.z + dir.z * t;
      if (t > 0 && this.onTable(x, z)) {
        bestT = t;
        found = true;
        setHit(out, x, 0, z, 0, 1, 0, -1, t);
      }
    }
    for (let i = 0; i < this.solids.length; i++) {
      const solid = this.solids[i];
      const span = prismSpan(solid.footprint, origin.x, origin.z, dir.x, dir.z);
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
}

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
  const above = (t: number) => o.y + d.y * t - topHeight(solid, o.x + d.x * t, o.z + d.z * t);
  const steps = 16;
  let a = t0;
  if (above(a) <= 0) return a;
  for (let k = 1; k <= steps; k++) {
    const end = t0 + ((t1 - t0) * k) / steps;
    if (above(end) <= 0) {
      let b = end;
      for (let j = 0; j < 20; j++) {
        const m = (a + b) / 2;
        if (above(m) > 0) a = m;
        else b = m;
      }
      return b;
    }
    a = end;
  }
  return null;
}
