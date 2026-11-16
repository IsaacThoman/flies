// Shapes the bar is built of: turned things (stools, shades, glasses, the
// fruit bowl) from a profile, profiles run along an edge (the zinc's rolled
// nose), and flat faces given by their corners. Each face is turned to look
// the way its normals say, so a shape is described by where it is and which
// way it faces, never by its winding.

import * as THREE from "three";

export type V3 = readonly [number, number, number];

/** Vertices with their normals, and triangles turned to face the way their vertices' normals point. */
export class Mesh {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly idx: number[] = [];

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    return this.pos.length / 3 - 1;
  }

  /** A triangle, its winding chosen from its vertices' normals. */
  tri(a: number, b: number, c: number) {
    const p = this.pos;
    const n = this.nor;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const dot = cx * (n[a * 3] + n[b * 3] + n[c * 3]) + cy * (n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1]) + cz * (n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2]);
    if (dot >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  /** A flat four-sided face (corners in order round it), facing `n`. */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3) {
    const i = [a, b, c, d].map((p) => this.vertex(p[0], p[1], p[2], n[0], n[1], n[2]));
    this.tri(i[0], i[1], i[2]);
    this.tri(i[0], i[2], i[3]);
  }

  /** A flat four-sided face whose normal is worked out from its corners, turned toward `toward`. */
  plane(a: V3, b: V3, c: V3, d: V3, toward: V3) {
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
    const vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    const s = nx * toward[0] + ny * toward[1] + nz * toward[2] < 0 ? -l : l;
    nx /= s;
    ny /= s;
    nz /= s;
    this.quad(a, b, c, d, [nx, ny, nz]);
  }

  /** A flat polygon (convex or not, corners in order), facing `n`, triangulated in the plane of its two axes. */
  polygon(points: readonly V3[], n: V3, axes: [number, number]) {
    const flat = points.map((p) => new THREE.Vector2(p[axes[0]], p[axes[1]]));
    const first = this.pos.length / 3;
    for (const p of points) this.vertex(p[0], p[1], p[2], n[0], n[1], n[2]);
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(flat, [])) this.tri(first + a, first + b, first + c);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setIndex(this.idx);
    return g;
  }
}

/** Each profile point's normal, from its neighbours; a point given twice is a sharp corner, each copy taking its own side's. */
function profileNormals(profile: readonly (readonly [number, number])[], normal: (dx: number, dy: number) => [number, number]) {
  const seg: ([number, number] | null)[] = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const dx = profile[i + 1][0] - profile[i][0];
    const dy = profile[i + 1][1] - profile[i][1];
    const l = Math.hypot(dx, dy);
    seg.push(l < 1e-6 ? null : normal(dx / l, dy / l));
  }
  return profile.map((_, i) => {
    const a = i > 0 ? seg[i - 1] : null;
    const b = i < seg.length ? seg[i] : null;
    const nx = (a?.[0] ?? 0) + (b?.[0] ?? 0);
    const ny = (a?.[1] ?? 0) + (b?.[1] ?? 0);
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l] as const;
  });
}

/**
 * A turned shape: a profile of (radius, height) points, from the axis along
 * the bottom, up the outside and over the top back to the axis (or any part
 * of that), turned round a vertical axis at (x, z), whole or between two
 * angles. Its faces look out of the solid the profile bounds.
 */
export function turn(profile: readonly (readonly [number, number])[], segments: number, x = 0, z = 0, from = 0, to = Math.PI * 2) {
  const normals = profileNormals(profile, (dr, dy) => [dy, -dr]);
  const sin = new Float64Array(segments + 1);
  const cos = new Float64Array(segments + 1);
  for (let j = 0; j <= segments; j++) {
    const a = from + ((to - from) * j) / segments;
    sin[j] = Math.sin(a);
    cos[j] = Math.cos(a);
  }
  const live = (i: number) => Math.abs(profile[i + 1][0] - profile[i][0]) + Math.abs(profile[i + 1][1] - profile[i][1]) > 1e-6;
  let count = 0;
  for (let i = 0; i < profile.length - 1; i++) if (live(i)) count += ((profile[i][0] > 1e-6 ? 1 : 0) + (profile[i + 1][0] > 1e-6 ? 1 : 0)) * segments;
  const pos = new Float32Array(count * 9);
  const nor = new Float32Array(count * 9);
  let k = 0;
  const put = (i: number, j: number) => {
    const r = profile[i][0];
    const n = normals[i];
    pos[k] = x + r * sin[j];
    pos[k + 1] = profile[i][1];
    pos[k + 2] = z + r * cos[j];
    nor[k] = n[0] * sin[j];
    nor[k + 1] = n[1];
    nor[k + 2] = n[0] * cos[j];
    k += 3;
  };
  // Round the axis and up the profile this winding faces the way the profile's normals do; at the axis a quad is a triangle.
  for (let i = 0; i < profile.length - 1; i++) {
    if (!live(i)) continue;
    const r0 = profile[i][0] > 1e-6;
    const r1 = profile[i + 1][0] > 1e-6;
    for (let j = 0; j < segments; j++) {
      if (r0) {
        put(i, j);
        put(i, j + 1);
        put(i + 1, j);
      }
      if (r1) {
        put(i, j + 1);
        put(i + 1, j + 1);
        put(i + 1, j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return g;
}

/**
 * A profile run along a path on the level: (out, height) points, out being
 * how far past the path's line (0 at the line, less inside), ordered from the
 * top inward round the edge and down. Each leg of the path has its outward
 * normal; legs meet in mitres, and the path's ends are cut square.
 */
export function edge(path: readonly (readonly [number, number])[], legNormals: readonly (readonly [number, number])[], profile: readonly (readonly [number, number])[]) {
  const m = new Mesh();
  const normals = profileNormals(profile, (dout, dy) => [-dy, dout]);
  const mitre = (k: number): [number, number] => {
    const a = legNormals[Math.max(0, k - 1)];
    const b = legNormals[Math.min(legNormals.length - 1, k)];
    const d = 1 + a[0] * b[0] + a[1] * b[1];
    return [(a[0] + b[0]) / d, (a[1] + b[1]) / d];
  };
  for (let leg = 0; leg < legNormals.length; leg++) {
    const [nx, nz] = legNormals[leg];
    const ends = [leg, leg + 1].map((k) => {
      const [mx, mz] = mitre(k);
      const [px, pz] = path[k];
      return profile.map(([o, y], i) => m.vertex(px + mx * o, y, pz + mz * o, normals[i][0] * nx, normals[i][1], normals[i][0] * nz));
    });
    for (let i = 0; i < profile.length - 1; i++) {
      if (Math.abs(profile[i + 1][0] - profile[i][0]) + Math.abs(profile[i + 1][1] - profile[i][1]) < 1e-6) continue;
      m.tri(ends[0][i], ends[1][i], ends[0][i + 1]);
      m.tri(ends[1][i], ends[1][i + 1], ends[0][i + 1]);
    }
  }
  return m.geometry();
}

/**
 * An upright face of a box, to build in: `u` along it (from `origin`, along
 * `along`), `v` up, `d` out of it along `out` (less than 0 is inside the box).
 */
export class Face {
  readonly m: Mesh;
  readonly origin: V3;
  readonly along: V3;
  readonly out: V3;

  constructor(m: Mesh, origin: V3, along: V3, out: V3) {
    this.m = m;
    this.origin = origin;
    this.along = along;
    this.out = out;
  }

  at(u: number, v: number, d: number): V3 {
    const { origin: o, along: a, out: n } = this;
    return [o[0] + a[0] * u + n[0] * d, o[1] + v, o[2] + a[2] * u + n[2] * d];
  }

  /** A rectangle facing out, `d` deep. */
  front(u0: number, u1: number, v0: number, v1: number, d: number) {
    if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return;
    this.m.quad(this.at(u0, v0, d), this.at(u1, v0, d), this.at(u1, v1, d), this.at(u0, v1, d), this.out);
  }

  /** A level strip at height `v` from depth `d0` to `d1`, facing up (`up` 1) or down (-1). */
  level(u0: number, u1: number, v: number, d0: number, d1: number, up: number) {
    if (u1 - u0 < 1e-3 || Math.abs(d1 - d0) < 1e-3) return;
    this.m.quad(this.at(u0, v, d0), this.at(u1, v, d0), this.at(u1, v, d1), this.at(u0, v, d1), [0, up, 0]);
  }

  /** An upright strip across the face at `u`, from depth `d0` to `d1`, facing along (`dir` 1) or back (-1). */
  side(u: number, v0: number, v1: number, d0: number, d1: number, dir: number) {
    if (v1 - v0 < 1e-3 || Math.abs(d1 - d0) < 1e-3) return;
    const a = this.along;
    this.m.quad(this.at(u, v0, d0), this.at(u, v1, d0), this.at(u, v1, d1), this.at(u, v0, d1), [a[0] * dir, 0, a[2] * dir]);
  }

  /** A sunk opening `depth` deep with its four walls, its floor left to the caller. */
  walls(u0: number, u1: number, v0: number, v1: number, d0: number, d1: number) {
    this.side(u0, v0, v1, d0, d1, 1);
    this.side(u1, v0, v1, d0, d1, -1);
    this.level(u0, u1, v0, d0, d1, 1);
    this.level(u0, u1, v1, d0, d1, -1);
  }
}

/**
 * A thin spill on a surface, wobbling round its middle: flat on top, its edge
 * rounded down to just under the surface. `height` is its top above it.
 */
export function film(r: number, wobble: number, height: number, segments = 28) {
  const rings: readonly (readonly [number, number])[] = [
    [0.7, 1],
    [0.88, 0.9],
    [0.96, 0.55],
    [1, -0.15],
  ];
  const pos: number[] = [0, height, 0];
  const idx: number[] = [];
  for (const [k, h] of rings) {
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const rr = r * k * (1 + Math.sin(a * 3 + wobble) * 0.12 + Math.sin(a * 5 + wobble * 2) * 0.06);
      pos.push(Math.cos(a) * rr, height * h, Math.sin(a) * rr);
    }
  }
  const at = (i: number, j: number) => 1 + i * segments + (j % segments);
  for (let j = 0; j < segments; j++) {
    idx.push(0, at(0, j + 1), at(0, j));
    for (let i = 0; i < rings.length - 1; i++) idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
