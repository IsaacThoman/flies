// Shapes for the tables and chairs, built once as templates in plain arrays
// and stamped where each table and chair stands: building a chair once and
// copying it by its place and turn costs a fraction of building each one,
// and no three.js objects are made until each area's lot is finished.
//
// Each vertex carries a colour that is not a colour: the way the grain runs
// in a wooden piece, and how worn its finish is (tables-look.ts reads it).

import * as THREE from "three";
import { tag } from "./geometry.ts";

/** A vertex: where it is, which way it faces, and its own grain's colour (`grainColour`) if it has one. */
export type Vertex = readonly number[];

/** A point of a turned profile: radius, height, and the outward normal's radial and upward parts. */
export type Turn = [number, number, number, number];

const FLOATS = 9;

/**
 * A grain as a colour: along (x, z), or up the piece when both are 0, and
 * how worn its finish is, 0 to 1 (green under 0.75 says it is given; white
 * leaves it to the shader).
 */
export function grainColour(x: number, z: number, wear = 0): [number, number, number] {
  const l = Math.hypot(x, z);
  return l < 1e-9 ? [0.5, wear * 0.7, 0.5] : [0.5 + (0.5 * x) / l, wear * 0.7, 0.5 + (0.5 * z) / l];
}

/** Floats written one after another into a typed array that grows as it fills. */
class Floats {
  data = new Float32Array(FLOATS * 3 * 256);
  length = 0;

  room(n: number) {
    if (this.length + n <= this.data.length) return;
    const grown = new Float32Array(Math.max(this.data.length * 2, this.length + n));
    grown.set(this.data);
    this.data = grown;
  }
}

/** Triangles by kind, unindexed: position, normal and the grain's colour per vertex. */
export class Mesh {
  readonly kinds = new Map<number, Floats>();
  #list = new Floats();
  #grain: [number, number, number] = [1, 1, 1];

  /** What the next triangles are made of. */
  kind(kind: number) {
    let list = this.kinds.get(kind);
    if (!list) this.kinds.set(kind, (list = new Floats()));
    this.#list = list;
    return this;
  }

  /**
   * The grain of the next triangles: along (x, z), or up the piece when
   * both are 0; and how worn its finish is, 0 to 1. Left alone, the shader
   * decides for itself.
   */
  grain(x: number, z: number, wear = 0) {
    this.#grain = grainColour(x, z, wear);
    return this;
  }

  /** Leaves the next triangles' colour white: for the shared kinds, which take it as their colour. */
  plain() {
    this.#grain = [1, 1, 1];
    return this;
  }

  /** A triangle, turned to face the way its vertices' normals do, and left out if it has no area. */
  tri(a: Vertex, b: Vertex, c: Vertex) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    const area = fx * fx + fy * fy + fz * fz;
    if (area < 1e-10) return;
    const facing = fx * (a[3] + b[3] + c[3]) + fy * (a[4] + b[4] + c[4]) + fz * (a[5] + b[5] + c[5]);
    this.#push(a);
    this.#push(facing < 0 ? c : b);
    this.#push(facing < 0 ? b : c);
  }

  #push(v: Vertex) {
    const g = v.length > 6 ? v : this.#grain;
    const o = v.length > 6 ? 6 : 0;
    const list = this.#list;
    list.room(FLOATS);
    const d = list.data;
    const i = list.length;
    d[i] = v[0];
    d[i + 1] = v[1];
    d[i + 2] = v[2];
    d[i + 3] = v[3];
    d[i + 4] = v[4];
    d[i + 5] = v[5];
    d[i + 6] = g[o];
    d[i + 7] = g[o + 1];
    d[i + 8] = g[o + 2];
    list.length = i + FLOATS;
  }

  /** Each kind's triangles, as typed arrays: what a lot stamps from. */
  packed() {
    return [...this.kinds].map(([kind, list]) => [kind, list.data.subarray(0, list.length)] as const);
  }

  /** A quad, as two triangles. */
  quad(a: Vertex, b: Vertex, c: Vertex, d: Vertex) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** A grid of vertices, (rows + 1) by (cols + 1), as quads. */
  grid(rows: number, cols: number, at: (i: number, j: number) => Vertex) {
    const v: Vertex[][] = [];
    for (let i = 0; i <= rows; i++) {
      const row: Vertex[] = [];
      for (let j = 0; j <= cols; j++) row.push(at(i, j));
      v.push(row);
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) this.quad(v[i][j], v[i + 1][j], v[i + 1][j + 1], v[i][j + 1]);
    return this;
  }

  /**
   * A profile turned round (x, z): repeat a point with another normal for a
   * sharp edge. `grain` (by the angle round and the height) gives each
   * vertex its own grain (`grainColour`'s x, z and wear); left out, the
   * piece keeps the grain set.
   */
  revolve(profile: readonly Turn[], segments: number, x = 0, z = 0, grain?: (a: number, y: number) => readonly [number, number, number]) {
    return this.grid(profile.length - 1, segments, (i, j) => {
      const [r, y, nr, ny] = profile[i];
      const a = (j / segments) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const v = [x + r * c, y, z + r * s, nr * c, ny, nr * s];
      if (!grain) return v;
      const [gx, gz, wear] = grain(a, y);
      return [...v, ...grainColour(gx, gz, wear)];
    });
  }

  /**
   * A surface over (u, v) in [0, 1]², its normals worked out from how it
   * bends, facing the way `out` says at each point.
   */
  surface(rows: number, cols: number, at: (u: number, v: number) => readonly [number, number, number], out: (p: readonly [number, number, number]) => readonly [number, number, number]) {
    const e = 1e-4;
    return this.grid(rows, cols, (i, j) => {
      const u = i / rows;
      const v = j / cols;
      const p = at(u, v);
      const u0 = at(Math.max(0, u - e), v);
      const u1 = at(Math.min(1, u + e), v);
      const v0 = at(u, Math.max(0, v - e));
      const v1 = at(u, Math.min(1, v + e));
      const a = [u1[0] - u0[0], u1[1] - u0[1], u1[2] - u0[2]];
      const b = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const o = out(p);
      let l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-12) {
        n = [o[0], o[1], o[2]];
        l = Math.hypot(n[0], n[1], n[2]) || 1;
      }
      const k = n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0 ? -1 / l : 1 / l;
      return [p[0], p[1], p[2], n[0] * k, n[1] * k, n[2] * k];
    });
  }

  /**
   * Flat faces between two rings of points (corresponding, round a convex
   * section), facing away from the line through the rings' middles; and the
   * end faces, where asked.
   */
  loft(a: readonly (readonly [number, number, number])[], b: readonly (readonly [number, number, number])[], capA = false, capB = false) {
    const mid = (r: readonly (readonly [number, number, number])[]): readonly number[] => r.reduce((m, p) => [m[0] + p[0] / r.length, m[1] + p[1] / r.length, m[2] + p[2] / r.length], [0, 0, 0]);
    const c0 = mid(a);
    const c1 = mid(b);
    const axis = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
    const al = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2 || 1;
    const n = a.length;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) % n;
      const p = [a[i], a[k], b[k], b[i]];
      const f = [0, 1, 2].map((d) => (p[0][d] + p[1][d] + p[2][d] + p[3][d]) / 4);
      const t = Math.max(0, Math.min(1, ((f[0] - c0[0]) * axis[0] + (f[1] - c0[1]) * axis[1] + (f[2] - c0[2]) * axis[2]) / al));
      const o = [f[0] - c0[0] - axis[0] * t, f[1] - c0[1] - axis[1] * t, f[2] - c0[2] - axis[2] * t];
      const u = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const w = [p[3][0] - p[1][0], p[3][1] - p[1][1], p[3][2] - p[1][2]];
      let nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
      nn = nn.map((x) => x / l);
      if (nn[0] * o[0] + nn[1] * o[1] + nn[2] * o[2] < 0) nn = nn.map((x) => -x);
      const vx = (q: readonly [number, number, number]): Vertex => [q[0], q[1], q[2], nn[0], nn[1], nn[2]];
      this.quad(vx(p[0]), vx(p[1]), vx(p[2]), vx(p[3]));
    }
    const cap = (r: readonly (readonly [number, number, number])[], c: readonly number[], sign: number) => {
      const l = Math.sqrt(al);
      const nn = [(axis[0] / l) * sign, (axis[1] / l) * sign, (axis[2] / l) * sign];
      const vx = (q: readonly number[]): Vertex => [q[0], q[1], q[2], nn[0], nn[1], nn[2]];
      for (let i = 0; i < n; i++) this.tri(vx(c), vx(r[i]), vx(r[(i + 1) % n]));
    };
    if (capA) cap(a, c0, -1);
    if (capB) cap(b, c1, 1);
    return this;
  }

  /**
   * A profile swept round a rectangle with rounded corners: `o` out from the
   * rectangle of the corners' middles (half-sizes `hx - r`, `hz - r`), up `y`,
   * and its normal's outward and upward parts.
   */
  sweep(hx: number, hz: number, r: number, profile: readonly Turn[], steps: number) {
    const ix = hx - r;
    const iz = hz - r;
    const path: [number, number, number, number][] = [];
    for (const [cx, cz, a0] of [[ix, iz, 0], [-ix, iz, Math.PI / 2], [-ix, -iz, Math.PI], [ix, -iz, (3 * Math.PI) / 2]] as const) {
      for (let k = 0; k <= steps; k++) {
        const a = a0 + ((k / steps) * Math.PI) / 2;
        path.push([cx, cz, Math.cos(a), Math.sin(a)]);
      }
    }
    path.push(path[0]);
    return this.grid(profile.length - 1, path.length - 1, (i, j) => {
      const [o, y, no, ny] = profile[i];
      const [cx, cz, dx, dz] = path[j];
      return [cx + dx * o, y, cz + dz * o, dx * no, ny, dz * no];
    });
  }

  /** A flat rectangle at height y between corners, facing up or down. */
  plate(x0: number, z0: number, x1: number, z1: number, y: number, up: boolean) {
    const n = up ? 1 : -1;
    this.quad([x0, y, z0, 0, n, 0], [x1, y, z0, 0, n, 0], [x1, y, z1, 0, n, 0], [x0, y, z1, 0, n, 0]);
    return this;
  }

  /** Everything here again, mirrored top to bottom about y = sum / 2: a thing turned upside down. */
  flipped(sum: number) {
    const out = new Mesh();
    for (const [kind, floats] of this.kinds) {
      const list = floats.data;
      const flip = new Floats();
      flip.room(floats.length);
      flip.length = floats.length;
      for (let t = 0; t < floats.length; t += FLOATS * 3) {
        // Mirroring turns a triangle's winding over: swap its last two vertices.
        for (const [to, from] of [[0, 0], [1, 2], [2, 1]]) {
          const s = t + from * FLOATS;
          const d = t + to * FLOATS;
          for (let k = 0; k < FLOATS; k++) flip.data[d + k] = list[s + k];
          flip.data[d + 1] = sum - list[s + 1];
          flip.data[d + 4] = -list[s + 4];
        }
      }
      out.kinds.set(kind, flip);
    }
    return out;
  }
}

/** Where a template goes: moved to (x, z) and turned by yaw (as the world's chairs: 0 faces +z). */
export type Place = { x: number; z: number; yaw?: number };

/** Templates stamped in their places, by kind: what an area's lot is made of. */
export class Lot {
  #by = new Map<number, { list: Float32Array; at: Place }[]>();

  add(mesh: Mesh, at: Place) {
    for (const [kind, list] of mesh.packed()) {
      let entry = this.#by.get(kind);
      if (!entry) this.#by.set(kind, (entry = []));
      entry.push({ list, at });
    }
  }

  /** One geometry for each kind: position, normal and colour, the grain's colour turned with each piece. */
  geometries(): { kind: number; geometry: THREE.BufferGeometry }[] {
    const out: { kind: number; geometry: THREE.BufferGeometry }[] = [];
    for (const [kind, entries] of this.#by) {
      let count = 0;
      for (const e of entries) count += e.list.length / FLOATS;
      const position = new Float32Array(count * 3);
      const normal = new Float32Array(count * 3);
      const color = new Float32Array(count * 3);
      let o = 0;
      for (const { list, at } of entries) {
        const yaw = at.yaw ?? 0;
        const s = Math.sin(yaw);
        const c = Math.cos(yaw);
        const tx = at.x;
        const tz = at.z;
        // A point (aside, ahead) of the template goes where the world's chairPoint puts it.
        for (let i = 0; i < list.length; i += FLOATS, o += 3) {
          const x = list[i];
          const z = list[i + 2];
          position[o] = tx + c * x + s * z;
          position[o + 1] = list[i + 1];
          position[o + 2] = tz - s * x + c * z;
          const nx = list[i + 3];
          const nz = list[i + 5];
          normal[o] = c * nx + s * nz;
          normal[o + 1] = list[i + 4];
          normal[o + 2] = -s * nx + c * nz;
          const gx = list[i + 6] - 0.5;
          const gz = list[i + 8] - 0.5;
          const own = list[i + 7] < 0.75;
          color[o] = own ? 0.5 + c * gx + s * gz : list[i + 6];
          color[o + 1] = list[i + 7];
          color[o + 2] = own ? 0.5 - s * gx + c * gz : list[i + 8];
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
      out.push({ kind, geometry: tag(geometry, kind) });
    }
    return out;
  }
}
