// Shapes the rest of the room is built of: profiles turned on a lathe, swept
// along a straight edge or mitred round a rectangle, flat faces with panels
// sunk into them. Each face's normals come from its profile (smooth across
// gentle bends, sharp at corners) and each triangle is wound to face the way
// its normals do, so a profile can be written in whichever order reads best.

import * as THREE from "three";
import { topHeight } from "@fly/world";
import type { Solid } from "@fly/world";

/** The kinds only this part shades (kinds.ts, PART_KINDS.rest: 88 to 95). */
export const REST_KIND = {
  /** The heat lamps' elements, glowing a dull red. */
  heat: 88,
  /** Gilt over red bole, rubbed through on the high points. */
  gilt: 89,
  /** Bound covers: the menus' leather, the book's cloth with leather corners. */
  cover: 90,
  /** The edges of a block of pages. */
  pages: 91,
  /** An order slip: its own corner in the vertex colour's red and green, a seed in its blue. */
  slip: 92,
  /** A peppermint: where it is on the sweet in the vertex colour's red and green. */
  mint: 93,
  /** The cutlery tray's oak, its grain along each side rather than up it. */
  tray: 94,
  /** Polished cutlery: the room it reflects, bright above and dark below, as plain steel can't show it under the room's even light. */
  polish: 95,
} as const;

/** A point of a profile: out (or across) and up. */
export type P = readonly [number, number];
type V3 = readonly [number, number, number];

/** Triangles with their normals, gathered for one kind and colour. */
export class Faces {
  #p = new Float32Array(9 * 64);
  #n = new Float32Array(9 * 64);
  #used = 0;

  #put(v: readonly number[]) {
    const i = this.#used;
    this.#p[i] = v[0];
    this.#p[i + 1] = v[1];
    this.#p[i + 2] = v[2];
    this.#n[i] = v[3];
    this.#n[i + 1] = v[4];
    this.#n[i + 2] = v[5];
    this.#used = i + 3;
  }

  /** A triangle (x, y, z, nx, ny, nz at each corner), wound to face the way its corners' normals do. */
  tri(a: readonly number[], b: readonly number[], c: readonly number[]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-8) return;
    if (this.#used + 9 > this.#p.length) {
      const p = new Float32Array(this.#p.length * 2);
      const n = new Float32Array(this.#n.length * 2);
      p.set(this.#p);
      n.set(this.#n);
      this.#p = p;
      this.#n = n;
    }
    this.#put(a);
    if (cx * (a[3] + b[3] + c[3]) + cy * (a[4] + b[4] + c[4]) + cz * (a[5] + b[5] + c[5]) < 0) {
      this.#put(c);
      this.#put(b);
    } else {
      this.#put(b);
      this.#put(c);
    }
  }

  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.#p.slice(0, this.#used), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(this.#n.slice(0, this.#used), 3));
    return g;
  }
}

type Strip = { a: P; b: P; na: P; nb: P };

/**
 * A profile's segments, each end with its normal: the outside is to the
 * right going up the outside of a lathe's profile (or round a cross-section
 * anticlockwise). Bends gentler than `sharp` (a cosine) are smoothed.
 */
export function strips(profile: readonly P[], closed = false, sharp = 0.55): Strip[] {
  const count = closed ? profile.length : profile.length - 1;
  const own: P[] = [];
  for (let i = 0; i < count; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % profile.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    own.push([dy / l, -dx / l]);
  }
  const blend = (m: P, n: P): P => {
    if (m[0] * n[0] + m[1] * n[1] < sharp) return n;
    const x = m[0] + n[0];
    const y = m[1] + n[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const out: Strip[] = [];
  for (let i = 0; i < count; i++) {
    const prev = i > 0 ? own[i - 1] : closed ? own[count - 1] : null;
    const next = i < count - 1 ? own[i + 1] : closed ? own[0] : null;
    out.push({ a: profile[i], b: profile[(i + 1) % profile.length], na: prev ? blend(prev, own[i]) : own[i], nb: next ? blend(next, own[i]) : own[i] });
  }
  return out;
}

/** A profile (radius, height) turned round the upright through (x, z). */
export function revolve(faces: Faces, profile: readonly P[], segments: number, x = 0, z = 0) {
  const cos: number[] = [];
  const sin: number[] = [];
  for (let j = 0; j <= segments; j++) {
    const t = (j / segments) * Math.PI * 2;
    cos.push(Math.cos(t));
    sin.push(Math.sin(t));
  }
  const row = (p: P, n: P) => {
    const out: number[][] = [];
    for (let k = 0; k <= segments; k++) out.push([x + p[0] * cos[k], p[1], z + p[0] * sin[k], n[0] * cos[k], n[1], n[0] * sin[k]]);
    return out;
  };
  for (const s of strips(profile)) {
    const a = row(s.a, s.na);
    const b = row(s.b, s.nb);
    for (let j = 0; j < segments; j++) faces.quad(a[j], a[j + 1], b[j + 1], b[j]);
  }
  return faces;
}

/** A cross-section (across, up) swept straight along x or z from `from` to `to`; across is z (along x) or x (along z). */
export function prism(faces: Faces, profile: readonly P[], along: "x" | "z", from: number, to: number, closed = true) {
  const at = (p: P, n: P, w: number) => (along === "x" ? [w, p[1], p[0], 0, n[1], n[0]] : [p[0], p[1], w, n[0], n[1], 0]);
  for (const s of strips(profile, closed)) faces.quad(at(s.a, s.na, from), at(s.a, s.na, to), at(s.b, s.nb, to), at(s.b, s.nb, from));
  return faces;
}

/** A cross-section's end, flat at `at` along x or z, facing that way (`facing` ±1). */
export function cap(faces: Faces, outline: readonly P[], along: "x" | "z", at: number, facing: number) {
  const tris = THREE.ShapeUtils.triangulateShape(outline.map(([a, y]) => new THREE.Vector2(a, y)), []);
  const v = (p: P) => (along === "x" ? [at, p[1], p[0], facing, 0, 0] : [p[0], p[1], at, 0, 0, facing]);
  for (const [i, j, k] of tris) faces.tri(v(outline[i]), v(outline[j]), v(outline[k]));
  return faces;
}

/** A plane to build on: a point, two directions in it (u along, v up) and the way out of it. */
export type Plane = { o: V3; u: V3; v: V3; n: V3 };
export type Rect = { u0: number; u1: number; v0: number; v1: number };

export const inset = (r: Rect, d: number): Rect => ({ u0: r.u0 + d, u1: r.u1 - d, v0: r.v0 + d, v1: r.v1 - d });

/** A corner of a plane, `w` out of it, and a normal made of along, up and out. */
function point(pl: Plane, u: number, v: number, w: number, nu: number, nv: number, nw: number) {
  const { o, u: a, v: b, n } = pl;
  return [
    o[0] + a[0] * u + b[0] * v + n[0] * w,
    o[1] + a[1] * u + b[1] * v + n[1] * w,
    o[2] + a[2] * u + b[2] * v + n[2] * w,
    a[0] * nu + b[0] * nv + n[0] * nw,
    a[1] * nu + b[1] * nv + n[1] * nw,
    a[2] * nu + b[2] * nv + n[2] * nw,
  ];
}

/**
 * A moulding mitred round a rectangle in a plane: its profile is how far in
 * from the rectangle's edge (d) and how far out of the plane (w), from the
 * outside edge inward.
 */
export function ring(faces: Faces, pl: Plane, r: Rect, profile: readonly P[]) {
  // As a lathe's profile: out is toward the edge, so the outside is to the right going up it.
  for (const s of strips(profile.map(([d, w]) => [-d, w] as P))) {
    const da = -s.a[0], db = -s.b[0];
    const sides: [number, number, number, number, number, number][] = [
      // From corner to corner along each side, and the way in from it.
      [r.u0, r.v0, r.u1, r.v0, 0, 1],
      [r.u1, r.v0, r.u1, r.v1, -1, 0],
      [r.u1, r.v1, r.u0, r.v1, 0, -1],
      [r.u0, r.v1, r.u0, r.v0, 1, 0],
    ];
    for (const [u0, v0, u1, v1, iu, iv] of sides) {
      // Each end of a side moves inward along both of its corner's sides.
      const ca = (u: number, v: number, d: number) => [u + (u === r.u0 ? d : -d), v + (v === r.v0 ? d : -d)];
      const nA = [-s.na[0] * iu, -s.na[0] * iv, s.na[1]];
      const nB = [-s.nb[0] * iu, -s.nb[0] * iv, s.nb[1]];
      const [a0u, a0v] = ca(u0, v0, da);
      const [a1u, a1v] = ca(u1, v1, da);
      const [b0u, b0v] = ca(u0, v0, db);
      const [b1u, b1v] = ca(u1, v1, db);
      faces.quad(point(pl, a0u, a0v, s.a[1], nA[0], nA[1], nA[2]), point(pl, a1u, a1v, s.a[1], nA[0], nA[1], nA[2]), point(pl, b1u, b1v, s.b[1], nB[0], nB[1], nB[2]), point(pl, b0u, b0v, s.b[1], nB[0], nB[1], nB[2]));
    }
  }
  return faces;
}

/** A flat face in the plane, `w` out of it, with rectangular holes. */
export function flat(faces: Faces, pl: Plane, r: Rect, holes: readonly Rect[] = [], w = 0) {
  const loop = (q: Rect) => [new THREE.Vector2(q.u0, q.v0), new THREE.Vector2(q.u1, q.v0), new THREE.Vector2(q.u1, q.v1), new THREE.Vector2(q.u0, q.v1)];
  const outer = loop(r);
  const inner = holes.map((h) => loop(h).reverse());
  const all = [...outer, ...inner.flat()];
  for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(outer, inner)) {
    faces.tri(...([all[i], all[j], all[k]].map((p) => point(pl, p.x, p.y, w, 0, 0, 1)) as [number[], number[], number[]]));
  }
  return faces;
}

/** The four sides of a hole sunk `depth` into a face that is `w` out, narrowing by `slope`; its floor's rectangle. */
export function recess(faces: Faces, pl: Plane, r: Rect, depth: number, slope = 0, w = 0): Rect {
  const q = inset(r, slope);
  const l = Math.hypot(depth, slope) || 1;
  const sides: [number, number, number, number, number, number, number, number, number, number][] = [
    [r.u0, r.v0, r.u1, r.v0, q.u0, q.v0, q.u1, q.v0, 0, 1],
    [r.u1, r.v0, r.u1, r.v1, q.u1, q.v0, q.u1, q.v1, -1, 0],
    [r.u1, r.v1, r.u0, r.v1, q.u1, q.v1, q.u0, q.v1, 0, -1],
    [r.u0, r.v1, r.u0, r.v0, q.u0, q.v1, q.u0, q.v0, 1, 0],
  ];
  for (const [au, av, bu, bv, cu, cv, du, dv, iu, iv] of sides) {
    const nu = (iu * depth) / l, nv = (iv * depth) / l, nw = slope / l;
    faces.quad(point(pl, au, av, w, nu, nv, nw), point(pl, bu, bv, w, nu, nv, nw), point(pl, du, dv, w - depth, nu, nv, nw), point(pl, cu, cv, w - depth, nu, nv, nw));
  }
  return q;
}

/** The four edges of a slab standing out of a face, from `w0` (its face) back to `w1`, facing outward. */
export function edges(faces: Faces, pl: Plane, r: Rect, w0: number, w1: number) {
  const sides: [number, number, number, number, number, number][] = [
    [r.u0, r.v0, r.u1, r.v0, 0, -1],
    [r.u1, r.v0, r.u1, r.v1, 1, 0],
    [r.u1, r.v1, r.u0, r.v1, 0, 1],
    [r.u0, r.v1, r.u0, r.v0, -1, 0],
  ];
  for (const [au, av, bu, bv, nu, nv] of sides) faces.quad(point(pl, au, av, w0, nu, nv, 0), point(pl, bu, bv, w0, nu, nv, 0), point(pl, bu, bv, w1, nu, nv, 0), point(pl, au, av, w1, nu, nv, 0));
  return faces;
}

/** A round dish's top as a lathe's profile from its foot up and over its rim into its well, at exactly the world's heights. */
export function dishProfile(solid: Solid, sink = 0.1): P[] {
  const f = solid.footprint;
  const top = solid.top;
  if (f.kind !== "circle" || top.kind !== "dish") throw new Error(`${solid.name} is not a round dish`);
  const bottom = solid.bottom ?? 0;
  const at = (s: number) => Math.max(bottom, topHeight(solid, f.x + s * f.r, f.z));
  const s: number[] = [];
  for (let k = 0; k <= 4; k++) s.push((top.inner * k) / 4);
  for (let k = 1; k <= 8; k++) s.push(top.inner + ((top.lip - top.inner) * k) / 8);
  // Down its outside until it meets what it stands on.
  for (let t = 0.01; t <= 1.0001; t += 0.01) {
    const sv = top.lip + (1 - top.lip) * t;
    s.push(sv);
    if (at(sv) <= bottom + 1e-3) break;
  }
  const out = s.map((sv): P => [sv * f.r, at(sv)]);
  out[out.length - 1] = [out[out.length - 1][0], bottom - sink];
  return out.reverse();
}

/** A box-shaped dish's top (a tray) at exactly the world's heights: rings of its footprint's shape, `m` points to a side. */
export function boxDish(faces: Faces, solid: Solid, m = 8, sink = 0.1) {
  const f = solid.footprint;
  const top = solid.top;
  if (f.kind !== "box" || top.kind !== "dish") throw new Error(`${solid.name} is not a box dish`);
  const bottom = solid.bottom ?? 0;
  const h = (x: number, z: number) => Math.max(bottom, topHeight(solid, x, z));
  const s: number[] = [];
  for (let k = 1; k <= 3; k++) s.push((top.inner * k) / 3);
  for (let k = 1; k <= 6; k++) s.push(top.inner + ((top.lip - top.inner) * k) / 6);
  for (let t = 0.02; t <= 1.0001; t += 0.02) {
    const sv = top.lip + (1 - top.lip) * t;
    s.push(sv);
    if (h(f.x + f.hx * sv, f.z) <= bottom + 1e-3) break;
  }
  const vertex = (x: number, z: number, y?: number) => {
    const e = 0.05;
    const nx = -(h(x + e, z) - h(x - e, z)) / (2 * e);
    const nz = -(h(x, z + e) - h(x, z - e)) / (2 * e);
    const l = Math.hypot(nx, 1, nz);
    return [x, y ?? h(x, z), z, nx / l, 1 / l, nz / l];
  };
  const ringAt = (sv: number, last: boolean) => {
    const pts: number[][] = [];
    const hx = f.hx * sv, hz = f.hz * sv;
    const corners = [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ];
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c];
      const [bx, bz] = corners[(c + 1) % 4];
      for (let i = 0; i < m; i++) {
        const t = i / m;
        pts.push(vertex(f.x + ax + (bx - ax) * t, f.z + az + (bz - az) * t, last ? bottom - sink : undefined));
      }
    }
    return pts;
  };
  const centre = vertex(f.x, f.z);
  let prev = ringAt(s[0], false);
  for (let i = 0; i < prev.length; i++) faces.tri(centre, prev[i], prev[(i + 1) % prev.length]);
  for (let k = 1; k < s.length; k++) {
    const next = ringAt(s[k], k === s.length - 1);
    for (let i = 0; i < next.length; i++) {
      const j = (i + 1) % next.length;
      faces.quad(prev[i], prev[j], next[j], next[i]);
    }
    prev = next;
  }
  return faces;
}

/**
 * A stack of plates `height` tall in `count`, as a lathe's profile: each
 * rim's rounded edge out to the stack's radius, tucked in under the next;
 * the top plate's face flat at the stack's top.
 */
export function plateStack(r: number, y0: number, height: number, count: number): P[] {
  const h = height / count;
  const out: P[] = [[r - 3, y0 - 0.1]];
  for (let i = 0; i < count; i++) {
    const y = y0 + i * h;
    out.push([r - 0.5, y + h * 0.42], [r, y + h * 0.66]);
    if (i < count - 1) out.push([r - 2.6, y + h]);
  }
  out.push([r - 1.5, y0 + height], [0, y0 + height]);
  return out;
}

/**
 * A thin film of something spilt, lying `thick` deep on a level surface at
 * the origin: a wavering edge rounded down into what it lies on.
 */
export function film(faces: Faces, r: number, wobble: number, thick: number, segments = 28) {
  const rim = (k: number) => {
    const a = (k / segments) * Math.PI * 2;
    return r * (1 + Math.sin(a * 3 + wobble) * 0.12 + Math.sin(a * 5 + wobble * 2) * 0.06);
  };
  const rings: [number, number, number][] = [
    [0.82, thick, 1],
    [0.95, thick * 0.7, 0.75],
    [1, thick * 0.2, 0.35],
    [1.04, -0.08, 0.2],
  ];
  const centre = [0, thick, 0, 0, 1, 0];
  let prev: number[][] | null = null;
  for (const [f, y, up] of rings) {
    const row: number[][] = [];
    for (let k = 0; k <= segments; k++) {
      const a = (k / segments) * Math.PI * 2;
      const rr = rim(k) * f;
      const side = Math.sqrt(1 - up * up);
      row.push([Math.cos(a) * rr, y, Math.sin(a) * rr, Math.cos(a) * side, up, Math.sin(a) * side]);
    }
    if (prev) for (let k = 0; k < segments; k++) faces.quad(prev[k], prev[k + 1], row[k + 1], row[k]);
    else for (let k = 0; k < segments; k++) faces.tri(centre, row[k], row[k + 1]);
    prev = row;
  }
  return faces;
}
