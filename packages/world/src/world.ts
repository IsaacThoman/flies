// The world as the fly's body meets it: a floor (a table top, a sill, a
// bench, a bar, a room's own floor) with things standing on it, and slabs
// with air beneath them (a table top on its legs, a shelf, a lamp). It
// answers where the fly can stand, how much room there is over it, what it
// bumps into, and where a ray from the camera lands. How the world looks is
// built from the same description elsewhere (apps/web/src/places), but
// nothing here depends on it.
//
// Over one point there can be several surfaces, one above another: the
// floor, a chair seat, the table top over it. Questions about a point say
// which by a height: the surface at or below it, the underside above it.

import type { FoodPatch } from "./pantry.ts";
import { inside, prismSpan, sideNormal, solidBottom, topHeight, topNormal } from "./shapes.ts";
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
  /** Where the fly first stands, and its yaw (radians; 0 faces +z): on the surface at or below `y` (the highest, if left out). */
  start: { x: number; z: number; yaw: number; y?: number };
  /** In the air it is drawn back below this height, mm. */
  ceiling: number;
};

/** A surface over a point: its height, which way it faces, and how much air there is over it. */
export type Surface = {
  /** Height of the surface, mm. */
  y: number;
  /** Upward unit normal. */
  normal: Vec3;
  /** Index into `solids`, or -1 for the floor. */
  solid: number;
  /** False beyond the floor's edge, where there is nothing to stand on. */
  onTable: boolean;
  /**
   * Where the air over it ends, mm: the lowest underside above it, or
   * Infinity with nothing over it. A surface something rests on (a table top
   * under a plate) has no air over it: this is its own height.
   */
  underside: number;
};

export type RayHit = {
  point: Vec3;
  /** The surface's normal there: up on tops and the floor, down on an underside, outward on a side. */
  normal: Vec3;
  /** -1 for the floor. */
  solid: number;
  /** Distance along the (unit) ray. */
  t: number;
};

export const createSurface = (): Surface => ({ y: 0, normal: { x: 0, y: 1, z: 0 }, solid: -1, onTable: true, underside: Infinity });

/**
 * Heights this close (mm) are the same: a fly standing exactly on a top finds
 * it, and faces that meet (a plate's underside on a table top) touch without
 * either being inside the other.
 */
export const TOUCH = 1e-6;

/** The grid's smallest cells (mm), and the most cells it has: a bigger place has bigger cells. */
const MIN_CELL = 32;
const MAX_CELLS = 16384;
/** A solid over more cells than this (a ceiling over the whole room) is checked by every query rather than filed in all of them. */
const BIG_CELLS = 1024;
/** Per solid in `#bounds`: its box seen from above (min x, max x, min z, max z), its peak and its bottom. */
const B = 6;

/**
 * One world object for the whole game, whose place can change (`load`): the
 * fly, the camera and everything else that asks it questions keep asking the
 * same object when the fly is carried somewhere else.
 *
 * The world is static between carries, so queries only look at the solids
 * filed in a grid cell (flat arrays: cell k's solids are
 * `#items[#starts[k]]` up to `#starts[k + 1]`), plus a short list of big
 * ones. A ray walks the cells it crosses, nearest first, and stops at the
 * first cell beyond what it has met. Nothing is allocated per query.
 */
export class World {
  place!: Place;
  solids: readonly Solid[] = [];
  floor!: Floor;
  #span: [number, number] = [0, 0];
  #bounds = new Float64Array(0);
  #cell = MIN_CELL;
  #inv = 1 / MIN_CELL;
  #x0 = 0;
  #z0 = 0;
  #nx = 0;
  #nz = 0;
  #starts = new Int32Array(1);
  #items = new Int32Array(0);
  #big = new Int32Array(0);
  /** Each candidate's top in a point query, for a second look at them. */
  #heights = new Float64Array(0);
  #visited = new Uint32Array(0);
  #epoch = 0;
  /** What `#layer` found: the surface's height and solid, and the underside over it. */
  #y = 0;
  #solid = -1;
  #under = Infinity;
  /** The ray being cast: the nearest hit so far and its solid (-1 the floor, -2 none yet), and its normal. */
  #bestT = Infinity;
  #found = -2;
  #normal: Vec3 = { x: 0, y: 1, z: 0 };

  constructor(place: Place) {
    this.load(place);
  }

  load(place: Place) {
    this.place = place;
    this.solids = place.solids;
    this.floor = place.floor;
    const n = place.solids.length;
    const bounds = (this.#bounds = new Float64Array(n * B));
    const f = place.floor;
    let minX = f.kind === "circle" ? -f.r : -f.hx;
    let maxX = -minX;
    let minZ = f.kind === "circle" ? -f.r : -f.hz;
    let maxZ = -minZ;
    for (let i = 0; i < n; i++) {
      const solid = place.solids[i];
      const p = solid.footprint;
      let rx: number;
      let rz: number;
      if (p.kind === "circle") rx = rz = p.r;
      else {
        const c = Math.cos(p.angle);
        const s = Math.sin(p.angle);
        rx = p.kind === "box" ? Math.abs(c) * p.hx + Math.abs(s) * p.hz : Math.hypot(c * p.rx, s * p.rz);
        rz = p.kind === "box" ? Math.abs(s) * p.hx + Math.abs(c) * p.hz : Math.hypot(s * p.rx, c * p.rz);
      }
      rx += 1e-8;
      rz += 1e-8;
      const b = i * B;
      bounds[b] = p.x - rx;
      bounds[b + 1] = p.x + rx;
      bounds[b + 2] = p.z - rz;
      bounds[b + 3] = p.z + rz;
      const top = solid.top;
      bounds[b + 4] = (top.kind === "flat" ? top.y : top.kind === "dome" ? top.base + top.height : Math.max(top.well, top.rim)) + 1e-8;
      bounds[b + 5] = solidBottom(solid);
      minX = Math.min(minX, bounds[b]);
      maxX = Math.max(maxX, bounds[b + 1]);
      minZ = Math.min(minZ, bounds[b + 2]);
      maxZ = Math.max(maxZ, bounds[b + 3]);
    }
    let cell = MIN_CELL;
    while (Math.ceil((maxX - minX) / cell) * Math.ceil((maxZ - minZ) / cell) > MAX_CELLS) cell *= 2;
    const inv = 1 / cell;
    const span = (lo: number, hi: number) => Math.floor(hi * inv) - Math.floor(lo * inv) + 1;
    const big: number[] = [];
    // The grid covers the floor and everything but the big solids.
    const f0 = f.kind === "circle" ? f.r : f.hx;
    const f1 = f.kind === "circle" ? f.r : f.hz;
    minX = -f0;
    maxX = f0;
    minZ = -f1;
    maxZ = f1;
    for (let i = 0; i < n; i++) {
      const b = i * B;
      if (span(bounds[b], bounds[b + 1]) * span(bounds[b + 2], bounds[b + 3]) > BIG_CELLS) {
        big.push(i);
        continue;
      }
      minX = Math.min(minX, bounds[b]);
      maxX = Math.max(maxX, bounds[b + 1]);
      minZ = Math.min(minZ, bounds[b + 2]);
      maxZ = Math.max(maxZ, bounds[b + 3]);
    }
    this.#cell = cell;
    this.#inv = inv;
    this.#x0 = Math.floor(minX * inv) * cell;
    this.#z0 = Math.floor(minZ * inv) * cell;
    const nx = (this.#nx = Math.floor(maxX * inv) - Math.floor(minX * inv) + 1);
    const nz = (this.#nz = Math.floor(maxZ * inv) - Math.floor(minZ * inv) + 1);
    this.#big = Int32Array.from(big);
    // Counted, then filed: each cell's solids in description order.
    const starts = (this.#starts = new Int32Array(nx * nz + 1));
    const isBig = new Uint8Array(n);
    for (const i of big) isBig[i] = 1;
    for (let pass = 0; pass < 2; pass++) {
      const items = pass === 1 ? (this.#items = new Int32Array(starts[nx * nz])) : null;
      const next = pass === 1 ? starts.slice(0, nx * nz) : null;
      for (let i = 0; i < n; i++) {
        if (isBig[i]) continue;
        const b = i * B;
        const x0 = this.#column(bounds[b]);
        const x1 = this.#column(bounds[b + 1]);
        const z0 = this.#row(bounds[b + 2]);
        const z1 = this.#row(bounds[b + 3]);
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            const k = z * nx + x;
            if (items && next) items[next[k]++] = i;
            else starts[k + 1]++;
          }
        }
      }
      if (pass === 0) for (let k = 0; k < nx * nz; k++) starts[k + 1] += starts[k];
    }
    let most = 0;
    for (let k = 0; k < nx * nz; k++) most = Math.max(most, starts[k + 1] - starts[k]);
    this.#heights = new Float64Array(most + big.length);
    this.#visited = new Uint32Array(n);
    this.#epoch = 0;
  }

  /** Over the floor (inside its edge). */
  onTable(x: number, z: number) {
    const f = this.floor;
    return f.kind === "circle" ? x * x + z * z < f.r * f.r : Math.abs(x) < f.hx && Math.abs(z) < f.hz;
  }

  /**
   * How far a point is past the floor's edge, mm (0 or less over the floor),
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

  /**
   * The highest surface over a point at or below `below` (within TOUCH): a
   * solid's top, or the floor (y = 0) under everything. Infinity, the
   * default, is the highest surface there is. Writes `out`, the air over it
   * included.
   */
  surface(x: number, z: number, out: Surface, below = Infinity): Surface {
    this.#layer(x, z, below, true);
    const best = this.#solid;
    out.y = this.#y;
    out.solid = best;
    out.onTable = this.onTable(x, z);
    out.underside = this.#under;
    if (best >= 0) topNormal(this.solids[best], x, z, out.normal);
    else {
      out.normal.x = 0;
      out.normal.y = 1;
      out.normal.z = 0;
    }
    return out;
  }

  /** Just the height of the surface over a point at or below `below` (see `surface`). */
  heightAt(x: number, z: number, below = Infinity): number {
    this.#layer(x, z, below, false);
    return this.#y;
  }

  /**
   * Where the air over a height at a point ends, mm: the lowest underside at
   * or above `above`, or `above` itself when that is inside a solid (or
   * touching an underside), or Infinity with nothing over it. Standing on a
   * top is not being inside it.
   */
  underside(x: number, z: number, above: number): number {
    const bounds = this.#bounds;
    const c = this.#cellAt(x, z);
    const from = c < 0 ? 0 : this.#starts[c];
    const cells = c < 0 ? 0 : this.#starts[c + 1] - from;
    const count = cells + this.#big.length;
    let under = Infinity;
    for (let k = 0; k < count; k++) {
      const i = k < cells ? this.#items[from + k] : this.#big[k - cells];
      const b = i * B;
      if (bounds[b + 4] <= above + TOUCH || bounds[b + 5] >= under || x < bounds[b] || x > bounds[b + 1] || z < bounds[b + 2] || z > bounds[b + 3]) continue;
      const solid = this.solids[i];
      if (!inside(solid.footprint, x, z) || topHeight(solid, x, z) <= above + TOUCH) continue;
      under = Math.max(bounds[b + 5], above);
    }
    return under;
  }

  /** The solid a point is inside (by more than TOUCH), or -1: where it is inside several, the one whose top there is highest. */
  solidAt(x: number, y: number, z: number): number {
    const bounds = this.#bounds;
    const c = this.#cellAt(x, z);
    const from = c < 0 ? 0 : this.#starts[c];
    const cells = c < 0 ? 0 : this.#starts[c + 1] - from;
    const count = cells + this.#big.length;
    let best = -1;
    let height = y + TOUCH;
    for (let k = 0; k < count; k++) {
      const i = k < cells ? this.#items[from + k] : this.#big[k - cells];
      const b = i * B;
      if (height >= bounds[b + 4] || y <= bounds[b + 5] + TOUCH || x < bounds[b] || x > bounds[b + 1] || z < bounds[b + 2] || z > bounds[b + 3]) continue;
      const solid = this.solids[i];
      if (!inside(solid.footprint, x, z)) continue;
      const h = topHeight(solid, x, z);
      if (h > height) {
        height = h;
        best = i;
      }
    }
    return best;
  }

  /**
   * Where a point comes out of what it is in, going straight up: the top of
   * the solid it is inside, or of what rests on that (a plate on a table
   * top, a cup on its saucer); `y` itself when it is in nothing.
   */
  topAbove(x: number, y: number, z: number): number {
    for (let k = 0, i = this.solidAt(x, y, z); k < 8 && i >= 0; k++, i = this.solidAt(x, y + 2 * TOUCH, z)) y = topHeight(this.solids[i], x, z);
    return y;
  }

  /**
   * The way out of whatever is in the way between two heights at a point:
   * the horizontal outward normal of the side of the solid there that
   * occupies any height above `low` and below `high` (the one standing
   * highest, where there are several), or back over the floor beyond its
   * edge. With `high` left out, whatever rises above `low`. Writes `out`;
   * returns false when nothing there is in the way.
   */
  wallNormal(x: number, z: number, low: number, out: Vec3, high = Infinity): boolean {
    if (!this.onTable(x, z)) {
      this.beyond(x, z, out);
      return true;
    }
    const bounds = this.#bounds;
    const c = this.#cellAt(x, z);
    const from = c < 0 ? 0 : this.#starts[c];
    const cells = c < 0 ? 0 : this.#starts[c + 1] - from;
    const count = cells + this.#big.length;
    let best = -1;
    let height = low;
    for (let k = 0; k < count; k++) {
      const i = k < cells ? this.#items[from + k] : this.#big[k - cells];
      const b = i * B;
      if (bounds[b + 4] < height || bounds[b + 5] >= high || x < bounds[b] || x > bounds[b + 1] || z < bounds[b + 2] || z > bounds[b + 3]) continue;
      const solid = this.solids[i];
      if (!inside(solid.footprint, x, z)) continue;
      const h = topHeight(solid, x, z);
      if (h > height || (h === height && best >= 0 && i < best)) {
        height = h;
        best = i;
      }
    }
    if (best < 0) return false;
    sideNormal(this.solids[best].footprint, x, z, out);
    return true;
  }

  /**
   * Where a ray first meets the world: a solid's top from above, its
   * underside from below, its side between the two; or the floor from above.
   * `dir` must be a unit vector; `maxDistance` bounds a swept movement.
   * `height` sweeps a body that tall standing on the ray (a fly over its
   * feet): undersides, and the sides under them, meet it that much lower.
   * A ray that starts inside a solid leaves it unmet. Null when it meets
   * nothing (into the sky, or past the floor's edge).
   */
  raycast(origin: Vec3, dir: Vec3, out: RayHit, maxDistance = Infinity, height = 0): RayHit | null {
    this.#bestT = maxDistance;
    this.#found = -2;
    // The floor.
    if (dir.y < -1e-9) {
      const t = -origin.y / dir.y;
      const x = origin.x + dir.x * t;
      const z = origin.z + dir.z * t;
      if (t > 0 && t <= maxDistance && this.onTable(x, z)) {
        this.#bestT = t;
        this.#found = -1;
        setHit(out, x, 0, z, 0, 1, 0, -1, t);
      }
    }
    const big = this.#big;
    for (let k = 0; k < big.length; k++) this.#meet(big[k], origin, dir, height, out);

    // The grid's cells along the ray, nearest first.
    const cell = this.#cell;
    const nx = this.#nx;
    const nz = this.#nz;
    const gx0 = this.#x0;
    const gz0 = this.#z0;
    let tIn = 0;
    let tOut = this.#bestT;
    if (Math.abs(dir.x) < 1e-12) {
      if (origin.x < gx0 || origin.x > gx0 + nx * cell) tOut = -1;
    } else {
      const a = (gx0 - origin.x) / dir.x;
      const b = (gx0 + nx * cell - origin.x) / dir.x;
      tIn = Math.max(tIn, Math.min(a, b));
      tOut = Math.min(tOut, Math.max(a, b));
    }
    if (Math.abs(dir.z) < 1e-12) {
      if (origin.z < gz0 || origin.z > gz0 + nz * cell) tOut = -1;
    } else {
      const a = (gz0 - origin.z) / dir.z;
      const b = (gz0 + nz * cell - origin.z) / dir.z;
      tIn = Math.max(tIn, Math.min(a, b));
      tOut = Math.min(tOut, Math.max(a, b));
    }
    if (tIn <= tOut) {
      const inv = this.#inv;
      let ix = Math.min(nx - 1, Math.max(0, Math.floor((origin.x + dir.x * tIn - gx0) * inv)));
      let iz = Math.min(nz - 1, Math.max(0, Math.floor((origin.z + dir.z * tIn - gz0) * inv)));
      const sx = dir.x > 0 ? 1 : -1;
      const sz = dir.z > 0 ? 1 : -1;
      const dx = Math.abs(dir.x) < 1e-12 ? Infinity : cell / Math.abs(dir.x);
      const dz = Math.abs(dir.z) < 1e-12 ? Infinity : cell / Math.abs(dir.z);
      let nextX = dx === Infinity ? Infinity : (gx0 + (ix + (sx > 0 ? 1 : 0)) * cell - origin.x) / dir.x;
      let nextZ = dz === Infinity ? Infinity : (gz0 + (iz + (sz > 0 ? 1 : 0)) * cell - origin.z) / dir.z;
      this.#epoch = (this.#epoch + 1) >>> 0;
      if (this.#epoch === 0) {
        this.#visited.fill(0);
        this.#epoch = 1;
      }
      const epoch = this.#epoch;
      const visited = this.#visited;
      const starts = this.#starts;
      const items = this.#items;
      for (;;) {
        const k = iz * nx + ix;
        for (let j = starts[k]; j < starts[k + 1]; j++) {
          const i = items[j];
          if (visited[i] === epoch) continue;
          visited[i] = epoch;
          this.#meet(i, origin, dir, height, out);
        }
        // A tie at a cell's edge still looks across it.
        const next = Math.min(nextX, nextZ);
        if (next === Infinity || next > this.#bestT || next > tOut) break;
        if (nextX < nextZ) {
          ix += sx;
          if (ix < 0 || ix >= nx) break;
          nextX += dx;
        } else {
          iz += sz;
          if (iz < 0 || iz >= nz) break;
          nextZ += dz;
        }
      }
    }
    return this.#found >= -1 ? out : null;
  }

  /** The grid cell a point is in, or -1 outside the grid. */
  #cellAt(x: number, z: number): number {
    const i = Math.floor((x - this.#x0) * this.#inv);
    const k = Math.floor((z - this.#z0) * this.#inv);
    return i < 0 || i >= this.#nx || k < 0 || k >= this.#nz ? -1 : k * this.#nx + i;
  }

  #column(x: number) {
    return Math.min(this.#nx - 1, Math.max(0, Math.floor((x - this.#x0) * this.#inv)));
  }

  #row(z: number) {
    return Math.min(this.#nz - 1, Math.max(0, Math.floor((z - this.#z0) * this.#inv)));
  }

  /** The highest top over a point at or below `below`, or the floor; with `under`, also the lowest underside over that. */
  #layer(x: number, z: number, below: number, under: boolean) {
    const bounds = this.#bounds;
    const heights = this.#heights;
    const c = this.#cellAt(x, z);
    const from = c < 0 ? 0 : this.#starts[c];
    const cells = c < 0 ? 0 : this.#starts[c + 1] - from;
    const count = cells + this.#big.length;
    let y = 0;
    let best = -1;
    for (let k = 0; k < count; k++) {
      const i = k < cells ? this.#items[from + k] : this.#big[k - cells];
      const b = i * B;
      heights[k] = NaN;
      if (x < bounds[b] || x > bounds[b + 1] || z < bounds[b + 2] || z > bounds[b + 3]) continue;
      const solid = this.solids[i];
      if (!inside(solid.footprint, x, z)) continue;
      const h = topHeight(solid, x, z);
      heights[k] = h;
      // Exactly level tops: the first described wins, wherever it is filed.
      if (h <= below + TOUCH && (h > y || (h === y && best >= 0 && i < best))) {
        y = h;
        best = i;
      }
    }
    this.#y = y;
    this.#solid = best;
    if (!under) return;
    let lowest = Infinity;
    for (let k = 0; k < count; k++) {
      if (!(heights[k] > y + TOUCH)) continue;
      const i = k < cells ? this.#items[from + k] : this.#big[k - cells];
      const u = Math.max(bounds[i * B + 5], y);
      if (u < lowest) lowest = u;
    }
    this.#under = lowest;
  }

  /** Where a ray enters solid `i`, if nearer than anything it has met yet: recorded in `out`. */
  #meet(i: number, o: Vec3, d: Vec3, lift: number, out: RayHit) {
    const bounds = this.#bounds;
    const b = i * B;
    const limit = this.#bestT;
    const end = limit === Infinity ? (d.y > 0 ? Infinity : d.y < 0 ? -Infinity : o.y) : o.y + d.y * limit;
    const raw = bounds[b + 5];
    const bottom = raw > 0 ? raw - lift : raw;
    // Wholly above its peak or below its underside: it passes over or under.
    if (bounds[b + 4] < Math.min(o.y, end) || bottom > Math.max(o.y, end)) return;
    const solid = this.solids[i];
    const span = prismSpan(solid.footprint, o.x, o.z, d.x, d.z, this.#span);
    if (!span) return;
    const t0 = Math.max(span[0], 0);
    if (t0 >= span[1] || t0 > limit) return;
    const t1 = Math.min(span[1], limit);
    const y0 = o.y + d.y * t0;
    let t = -1;
    let kind = TOP;
    if (span[0] > 0) {
      // Entering the prism through its side, between its bottom and its top: the side is met.
      const ex = o.x + d.x * t0;
      const ez = o.z + d.z * t0;
      if (y0 >= bottom && y0 <= topHeight(solid, clampInside(solid, ex, ez, 0), clampInside(solid, ex, ez, 1))) {
        t = t0;
        kind = SIDE;
      }
    } else if (y0 > bottom && y0 < topHeight(solid, o.x, o.z)) return;
    if (t < 0) {
      if (y0 < bottom) {
        // Below it: up into its underside, unless it is no thicker than nothing there (a dish's edge).
        if (d.y <= 0) return;
        const tb = (bottom - o.y) / d.y;
        if (tb > t1) return;
        if (topHeight(solid, o.x + d.x * tb, o.z + d.z * tb) > bottom) {
          t = tb;
          kind = UNDER;
        } else t = topCrossing(solid, o, d, tb, t1) ?? -1;
      } else t = topCrossing(solid, o, d, t0, t1) ?? -1;
    }
    if (t < 0 || !(t < this.#bestT || (t === this.#bestT && this.#found >= 0 && i < this.#found))) return;
    const x = o.x + d.x * t;
    const z = o.z + d.z * t;
    const n = this.#normal;
    if (kind === SIDE) sideNormal(solid.footprint, x, z, n);
    else if (kind === UNDER) {
      n.x = 0;
      n.y = -1;
      n.z = 0;
    } else topNormal(solid, x, z, n);
    this.#bestT = t;
    this.#found = i;
    setHit(out, x, o.y + d.y * t, z, n.x, kind === SIDE ? 0 : n.y, n.z, i, t);
  }
}

const TOP = 0;
const SIDE = 1;
const UNDER = 2;

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
