// Builds the nervous system as one indexed BufferGeometry, the way the body is
// built (builder.ts): every vertex belongs to one rigid joint of the rig and
// is stored in that joint's own space, so the body's joint uniforms pose it.
// Shapes are given in the model's rest space (standing at rest) and carried
// into each joint's space by the rest frames. A tube may run through several
// joints, a ring to a joint, so a nerve bends at the knee with the leg and at
// the neck with the head.
//
// Each vertex also carries its part (which glow lights it), its part's role
// (which colour) and how its tissue is drawn, and, for tubes and small
// organs, the point on its axis and its radius, which the vertex shader uses
// to keep thin things at least a pixel wide.

import * as THREE from "three";
import type { NerveKind, NerveRole } from "./parts.ts";
import { NERVE_PARTS, partIndex } from "./parts.ts";

export type V3 = readonly [number, number, number];

const ROLE: Record<NerveRole, number> = { sensory: 0, central: 1, motor: 2 };

/**
 * How much a part's tissue hides what is behind it (its opacity), and how
 * much of that is at its edge rather than across its face (0 even, 1 the
 * edge only): solid neuropils are seen as volumes, the rind only as an edge.
 */
export const LOOK: Record<NerveKind, readonly [number, number]> = {
  neuropil: [0.7, 0.5],
  rind: [0.45, 1],
  tract: [0.75, 0.25],
  nerve: [0.85, 0.2],
  organ: [0.75, 0.35],
  // A negative edge fraction tags measured soma glyphs for their pixel floor.
  soma: [0.75, -0.35],
};

export type Ring = { p: V3; r: number; joint: number };

export class NerveBuilder {
  readonly #rest: Float32Array;
  readonly #position: number[] = [];
  readonly #normal: number[] = [];
  readonly #joint: number[] = [];
  readonly #info: number[] = [];
  readonly #tube: number[] = [];
  readonly #index: number[] = [];
  readonly #local = [0, 0, 0];
  readonly #localN = [0, 0, 0];
  readonly #axis = [0, 0, 0];

  /** `rest` holds the rest pose's joint frames, as the rig writes them (12 floats each). */
  constructor(rest: Float32Array) {
    this.#rest = rest;
  }

  get vertexCount() {
    return this.#position.length / 3;
  }

  /** Carries a rest-space point into joint `j`'s own space (the frames are rigid at rest). */
  toLocal(j: number, p: readonly number[], out: number[]) {
    const m = this.#rest, o = j * 12;
    const x = p[0] - m[o + 3], y = p[1] - m[o + 7], z = p[2] - m[o + 11];
    out[0] = m[o] * x + m[o + 4] * y + m[o + 8] * z;
    out[1] = m[o + 1] * x + m[o + 5] * y + m[o + 9] * z;
    out[2] = m[o + 2] * x + m[o + 6] * y + m[o + 10] * z;
  }

  /** Where a point of joint `j`'s own space is at rest. */
  toRest(j: number, x: number, y: number, z: number): [number, number, number] {
    const m = this.#rest, o = j * 12;
    return [m[o] * x + m[o + 1] * y + m[o + 2] * z + m[o + 3], m[o + 4] * x + m[o + 5] * y + m[o + 6] * z + m[o + 7], m[o + 8] * x + m[o + 9] * y + m[o + 10] * z + m[o + 11]];
  }

  /** Joint `j`'s axes at rest: its x, y and z directions in the rest space. */
  axes(j: number): [V3, V3, V3] {
    const m = this.#rest, o = j * 12;
    return [[m[o], m[o + 4], m[o + 8]], [m[o + 1], m[o + 5], m[o + 9]], [m[o + 2], m[o + 6], m[o + 10]]];
  }

  #rotateToLocal(j: number, d: readonly number[], out: number[]) {
    const m = this.#rest, o = j * 12;
    out[0] = m[o] * d[0] + m[o + 4] * d[1] + m[o + 8] * d[2];
    out[1] = m[o + 1] * d[0] + m[o + 5] * d[1] + m[o + 9] * d[2];
    out[2] = m[o + 2] * d[0] + m[o + 6] * d[1] + m[o + 10] * d[2];
  }

  #vertex(part: number, joint: number, p: readonly number[], n: readonly number[], axis: readonly number[] | null, radius: number, look: readonly [number, number]) {
    this.toLocal(joint, p, this.#local);
    this.#rotateToLocal(joint, n, this.#localN);
    this.#position.push(this.#local[0], this.#local[1], this.#local[2]);
    this.#normal.push(this.#localN[0], this.#localN[1], this.#localN[2]);
    this.#joint.push(joint);
    const role = part < 0 ? 0 : ROLE[NERVE_PARTS[part].role];
    this.#info.push(part, role, look[0], look[1]);
    if (axis) {
      this.toLocal(joint, axis, this.#axis);
      this.#tube.push(this.#axis[0], this.#axis[1], this.#axis[2], radius);
    } else this.#tube.push(0, 0, 0, 0);
  }

  #look(part: number, opacity?: number) {
    const look = LOOK[NERVE_PARTS[part].kind];
    return [opacity ?? look[0], look[1]] as const;
  }

  /**
   * The panel's backdrop, which must come first: two triangles that the
   * corner panel draws behind the model in the same draw (it places them
   * itself), and that the X-ray drops. Part -1 marks them.
   */
  backdrop() {
    if (this.vertexCount > 0) throw new Error("The backdrop must be the first thing built");
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      this.#position.push(x, y, 0);
      this.#normal.push(0, 0, 1);
      this.#joint.push(0);
      this.#info.push(-1, 0, 0, 0);
      this.#tube.push(0, 0, 0, 0);
    }
    // Wound for a screen whose y runs down, as the panel places it.
    this.#index.push(0, 2, 1, 2, 3, 1);
  }

  /**
   * A closed surface on one joint, from a rest-space point function over
   * (u around, v from pole to pole). `dot` makes it a small organ that the
   * shader keeps at least a pixel across (it grows about its centre).
   */
  surface(id: string, joint: number, nu: number, nv: number, point: (u: number, v: number, out: number[]) => void, options: { opacity?: number; dot?: { centre: V3; radius: number } } = {}) {
    const part = partIndex(id);
    const look = this.#look(part, options.opacity);
    const base = this.vertexCount;
    const p = [0, 0, 0], a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
    const e = 1e-3;
    const points: number[][] = [];
    const normals: number[][] = [];
    const centre = [0, 0, 0];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i < nu; i++) {
        const u = i / nu, v = j / nv;
        point(u, v, p);
        const vv = Math.min(1 - e, Math.max(e, v));
        point(u + e, vv, a); point(u - e, vv, b);
        point(u, vv + e, c); point(u, vv - e, d);
        const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
        const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        points.push([p[0], p[1], p[2]]);
        normals.push([n[0] / l, n[1] / l, n[2] / l]);
        centre[0] += p[0]; centre[1] += p[1]; centre[2] += p[2];
      }
    }
    const count = points.length;
    for (let k = 0; k < 3; k++) centre[k] /= count;
    let outward = 0;
    for (let k = 0; k < count; k++) {
      const q = points[k], n = normals[k];
      outward += (q[0] - centre[0]) * n[0] + (q[1] - centre[1]) * n[1] + (q[2] - centre[2]) * n[2];
    }
    const flip = outward < 0 ? -1 : 1;
    for (let k = 0; k < count; k++) {
      const n = normals[k];
      this.#vertex(part, joint, points[k], [n[0] * flip, n[1] * flip, n[2] * flip], options.dot?.centre ?? null, options.dot?.radius ?? 0, look);
    }
    const reverse = flip < 0;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const i1 = (i + 1) % nu;
        const q00 = base + j * nu + i, q10 = base + j * nu + i1, q01 = base + (j + 1) * nu + i, q11 = base + (j + 1) * nu + i1;
        this.#triangle(q00, q01, q10, reverse);
        this.#triangle(q10, q01, q11, reverse);
      }
    }
  }

  /** An ellipsoid on one joint: centre, radii along its axes (default the model's), as a small organ when `dot`. */
  ellipsoid(id: string, joint: number, centre: V3, radii: V3, options: { axes?: readonly [V3, V3, V3]; nu?: number; nv?: number; dot?: boolean; opacity?: number } = {}) {
    const [ax, ay, az] = options.axes ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const small = Math.min(radii[0], radii[1], radii[2]);
    this.surface(id, joint, options.nu ?? 10, options.nv ?? 6, (u, v, out) => {
      const th = v * Math.PI, ph = u * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph) * radii[0], y = Math.sin(th) * Math.sin(ph) * radii[1], z = Math.cos(th) * radii[2];
      for (let k = 0; k < 3; k++) out[k] = centre[k] + ax[k] * x + ay[k] * y + az[k] * z;
    }, { opacity: options.opacity, dot: options.dot ? { centre, radius: small } : undefined });
  }

  /**
   * A tube along rest-space rings, each ring on its own joint, with frames
   * carried along it so it doesn't twist, closed with rounded ends.
   */
  tube(id: string, rings: readonly Ring[], options: { sides?: number; opacity?: number; caps?: boolean } = {}) {
    if (rings.length < 2) throw new Error(`${id}: a tube needs two rings`);
    const part = partIndex(id);
    const look = this.#look(part, options.opacity);
    const sides = options.sides ?? 4;
    const all: Ring[] = [...rings];
    if (options.caps !== false) {
      // A ring shrunk nearly to the axis just past each end rounds it off.
      const end = (a: Ring, b: Ring): Ring => {
        const d = unit(sub(a.p, b.p));
        return { p: add(a.p, scale(d, a.r * 0.7)) as unknown as V3, r: a.r * 0.35, joint: a.joint };
      };
      all.unshift(end(rings[0], rings[1]));
      all.push(end(rings[rings.length - 1], rings[rings.length - 2]));
    }
    const n = all.length;
    const base = this.vertexCount;
    let normal: number[] | undefined;
    for (let k = 0; k < n; k++) {
      const tangent = unit(k === 0 ? sub(all[1].p, all[0].p) : k === n - 1 ? sub(all[n - 1].p, all[n - 2].p) : sub(all[k + 1].p, all[k - 1].p));
      if (!normal) normal = unit(perpendicular(tangent));
      else normal = unit(sub(normal, scale(tangent, dot(normal, tangent))));
      const binormal = cross(tangent, normal);
      const ring = all[k];
      const r = Math.max(ring.r, 1e-5);
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const dir = add(scale(normal, Math.cos(a)), scale(binormal, Math.sin(a)));
        this.#vertex(part, ring.joint, add(ring.p, scale(dir, r)), dir, ring.p, r, look);
      }
    }
    for (let k = 0; k < n - 1; k++) {
      for (let i = 0; i < sides; i++) {
        const i1 = (i + 1) % sides;
        const a = base + k * sides + i, b = base + k * sides + i1, c = base + (k + 1) * sides + i, d = base + (k + 1) * sides + i1;
        this.#triangle(a, b, c, false);
        this.#triangle(b, d, c, false);
      }
    }
  }

  /** A triangle, unless two of its corners are one point (a closed surface's poles), which would draw nothing. */
  #triangle(a: number, b: number, c: number, reverse: boolean) {
    if (this.#same(a, b) || this.#same(b, c) || this.#same(a, c)) return;
    if (reverse) this.#index.push(a, c, b);
    else this.#index.push(a, b, c);
  }

  #same(a: number, b: number) {
    const p = this.#position;
    return this.#joint[a] === this.#joint[b] && p[a * 3] === p[b * 3] && p[a * 3 + 1] === p[b * 3 + 1] && p[a * 3 + 2] === p[b * 3 + 2];
  }

  /** Parts that nothing has been built for yet, so a test can insist there are none. */
  missing(): string[] {
    const seen = new Set<number>();
    for (let i = 0; i < this.#info.length; i += 4) seen.add(this.#info[i]);
    return NERVE_PARTS.filter((_, i) => !seen.has(i)).map((p) => p.id);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.#position, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.#normal, 3));
    g.setAttribute("aJoint", new THREE.Float32BufferAttribute(this.#joint, 1));
    g.setAttribute("aInfo", new THREE.Float32BufferAttribute(this.#info, 4));
    g.setAttribute("aTube", new THREE.Float32BufferAttribute(this.#tube, 4));
    g.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.#index, 1) : new THREE.Uint16BufferAttribute(this.#index, 1));
    return g;
  }
}

export const add = (a: readonly number[], b: readonly number[]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: readonly number[], s: number) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: readonly number[], b: readonly number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: readonly number[]) => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
export const lerp3 = (a: readonly number[], b: readonly number[], t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const perpendicular = (t: number[]) => (Math.abs(t[1]) < 0.9 ? cross(t, [0, 1, 0]) : cross(t, [1, 0, 0]));
