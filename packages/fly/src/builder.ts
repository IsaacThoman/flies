// Builds the body as one indexed BufferGeometry. Every vertex belongs to one
// rigid joint (the exoskeleton does not bend inside a segment, so there is no
// weight blending) and is stored in that joint's own space. Each vertex also
// carries its colour, a few material numbers, and for tube-like parts (legs,
// bristles, the arista) the point on the tube's axis and the tube's radius,
// which the vertex shader uses to keep thin parts at least a pixel wide.

import * as THREE from "three";
import type { Vec3 } from "./anatomy.ts";

export type Rgb = [number, number, number];
/** roughness, clearcoat, sheen, region (1 = compound eye, 2 = cuticle with fine hairs) */
export type Mat = readonly [number, number, number, number];

const linear = new THREE.Color();
/** An sRGB hex colour in the renderer's linear working space. */
export function rgb(hex: string): Rgb {
  linear.set(hex);
  return [linear.r, linear.g, linear.b];
}
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export type SurfacePart = {
  joint: number;
  /** Joint's rest pivot in model space; vertices are stored relative to it. */
  pivot: Vec3;
  nu: number;
  nv: number;
  /** Model-space rest position at (u, v): u wraps around, v runs pole to pole. */
  point: (u: number, v: number, out: number[]) => void;
  color: (p: number[], u: number, v: number) => Rgb;
  mat: Mat | ((p: number[], u: number, v: number) => Mat);
  /** Builds the mirror image (x negated) instead: the right-hand copy of a left part. */
  mirror?: boolean;
  /** Pattern coordinates: the facet grid of a compound eye, or the fine hairs on the thorax. */
  eye?: (u: number, v: number) => [number, number];
  /** Hands the vertices where `where` holds to a second joint. */
  split?: { joint: number; pivot: Vec3; where: (p: number[], u: number, v: number) => boolean };
};

export type Ring = { p: Vec3; r: number };
export type TubePart = {
  joint: number;
  /** Points along the axis, in the joint's own space. */
  rings: Ring[];
  sides: number;
  color: Rgb | ((t: number) => Rgb);
  mat: Mat;
  /** Fine hairs shrink away as they get too thin to draw instead of fattening up. */
  hair?: boolean;
  mirror?: boolean;
  /** Rounded caps at either end. */
  caps?: boolean;
};

export class MeshBuilder {
  private readonly position: number[] = [];
  private readonly normal: number[] = [];
  private readonly color: number[] = [];
  private readonly mat: number[] = [];
  private readonly joint: number[] = [];
  private readonly axis: number[] = [];
  private readonly hair: number[] = [];
  private readonly eye: number[] = [];
  private readonly index: number[] = [];

  get vertexCount() {
    return this.position.length / 3;
  }

  private vertex(p: number[], n: number[], c: Rgb, m: Mat, joint: number, tube: readonly number[], hair: readonly number[], eye: readonly number[]) {
    this.position.push(p[0], p[1], p[2]);
    this.normal.push(n[0], n[1], n[2]);
    this.color.push(c[0], c[1], c[2]);
    this.mat.push(m[0], m[1], m[2], m[3]);
    this.joint.push(joint);
    this.axis.push(tube[0], tube[1], tube[2], tube[3]);
    this.hair.push(hair[0], hair[1], hair[2], hair[3]);
    this.eye.push(eye[0], eye[1]);
  }

  surface(part: SurfacePart): void {
    const { nu, nv, point } = part;
    const sign = part.mirror ? -1 : 1;
    const base = this.vertexCount;
    const p = [0, 0, 0], a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
    const e = 1e-3;
    const points: number[][] = [];
    const normals: number[][] = [];
    let centre = [0, 0, 0];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i < nu; i++) {
        const u = i / nu, v = j / nv;
        point(u, v, p);
        // Derivatives a little off the poles, where they vanish.
        const vv = Math.min(1 - e, Math.max(e, v));
        point(u + e, vv, a); point(u - e, vv, b);
        point(u, vv + e, c); point(u, vv - e, d);
        const du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dv = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
        const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        points.push([p[0], p[1], p[2]]);
        normals.push([n[0] / l, n[1] / l, n[2] / l]);
        centre = [centre[0] + p[0], centre[1] + p[1], centre[2] + p[2]];
      }
    }
    const count = points.length;
    centre = centre.map((x) => x / count);
    // Orient the normals outward (the parametrisation may run either way).
    let outward = 0;
    for (let k = 0; k < count; k++) {
      const q = points[k], n = normals[k];
      outward += (q[0] - centre[0]) * n[0] + (q[1] - centre[1]) * n[1] + (q[2] - centre[2]) * n[2];
    }
    const flip = outward < 0 ? -1 : 1;
    for (let k = 0; k < count; k++) {
      const q = points[k], n = normals[k];
      const u = (k % nu) / nu, v = Math.floor(k / nu) / nv;
      const m = typeof part.mat === "function" ? part.mat(q, u, v) : part.mat;
      const other = part.split?.where(q, u, v) ?? false;
      const joint = other ? part.split!.joint : part.joint;
      const pivot = other ? part.split!.pivot : part.pivot;
      const local = [(q[0] - pivot[0]) * sign, q[1] - pivot[1], q[2] - pivot[2]];
      const nn = [n[0] * flip * sign, n[1] * flip, n[2] * flip];
      const eye = part.eye ? part.eye(u, v) : [0, 0];
      this.vertex(local, nn, part.color(q, u, v), m, joint, ZERO4, ZERO4, eye);
    }
    // Quads below wind against du × dv; flipping the normals or mirroring each reverses that.
    const reverse = (flip > 0) !== (sign < 0);
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const i1 = (i + 1) % nu;
        const q00 = base + j * nu + i, q10 = base + j * nu + i1, q01 = base + (j + 1) * nu + i, q11 = base + (j + 1) * nu + i1;
        this.triangle(q00, q01, q10, reverse);
        this.triangle(q10, q01, q11, reverse);
      }
    }
  }

  /** A tube along a polyline, with frames carried along it so it does not twist. */
  tube(part: TubePart): void {
    const { rings, sides } = part;
    const sign = part.mirror ? -1 : 1;
    const pts = rings.map((r) => [r.p[0] * sign, r.p[1], r.p[2]]);
    const rad = rings.map((r) => r.r);
    // Rounded ends: extra rings closing toward the axis.
    if (part.caps) {
      const capRings = 2;
      const start: number[][] = [], startR: number[] = [], end: number[][] = [], endR: number[] = [];
      const dir0 = unit(sub(pts[1], pts[0])), dirN = unit(sub(pts[pts.length - 1], pts[pts.length - 2]));
      for (let k = capRings; k >= 1; k--) {
        const a = (k / capRings) * (Math.PI / 2);
        start.push(add(pts[0], scale(dir0, -Math.sin(a) * rad[0] * 0.9)));
        startR.push(Math.cos(a) * rad[0]);
      }
      for (let k = 1; k <= capRings; k++) {
        const a = (k / capRings) * (Math.PI / 2), rN = rad[rad.length - 1];
        end.push(add(pts[pts.length - 1], scale(dirN, Math.sin(a) * rN * 0.9)));
        endR.push(Math.cos(a) * rN);
      }
      pts.unshift(...start); rad.unshift(...startR);
      pts.push(...end); rad.push(...endR);
    }
    const n = pts.length;
    const base = this.vertexCount;
    let normal: number[] | undefined;
    const root = pts[0];
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const tangent = unit(k === 0 ? sub(pts[1], pts[0]) : k === n - 1 ? sub(pts[n - 1], pts[n - 2]) : sub(pts[k + 1], pts[k - 1]));
      if (!normal) normal = unit(perpendicular(tangent));
      else normal = unit(sub(normal, scale(tangent, dot(normal, tangent))));
      const binormal = cross(tangent, normal);
      const col = typeof part.color === "function" ? part.color(t) : part.color;
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const dir = add(scale(normal, Math.cos(a)), scale(binormal, Math.sin(a)));
        const r = Math.max(rad[k], 1e-5);
        const p = add(pts[k], scale(dir, r));
        const tube = [pts[k][0], pts[k][1], pts[k][2], r];
        const hair = part.hair ? [root[0], root[1], root[2], rad[0]] : ZERO4;
        this.vertex(p, dir, col, part.mat, part.joint, tube, hair, ZERO2);
      }
    }
    for (let k = 0; k < n - 1; k++) {
      for (let i = 0; i < sides; i++) {
        const i1 = (i + 1) % sides;
        const a = base + k * sides + i, b = base + k * sides + i1, c = base + (k + 1) * sides + i, d = base + (k + 1) * sides + i1;
        this.triangle(a, b, c, false);
        this.triangle(b, d, c, false);
      }
    }
  }

  private triangle(a: number, b: number, c: number, reverse: boolean) {
    if (reverse) this.index.push(a, c, b);
    else this.index.push(a, b, c);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.color, 3));
    g.setAttribute("aMat", new THREE.Float32BufferAttribute(this.mat, 4));
    g.setAttribute("aJoint", new THREE.Float32BufferAttribute(this.joint, 1));
    g.setAttribute("aTube", new THREE.Float32BufferAttribute(this.axis, 4));
    g.setAttribute("aHair", new THREE.Float32BufferAttribute(this.hair, 4));
    g.setAttribute("aEye", new THREE.Float32BufferAttribute(this.eye, 2));
    g.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    return g;
  }
}

const ZERO4 = [0, 0, 0, 0] as const;
const ZERO2 = [0, 0] as const;

export const add = (a: readonly number[], b: readonly number[]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: readonly number[], s: number) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: readonly number[], b: readonly number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: readonly number[]) => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const perpendicular = (t: number[]) => (Math.abs(t[1]) < 0.9 ? cross(t, [0, 1, 0]) : cross(t, [1, 0, 0]));
