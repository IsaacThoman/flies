// Where the back bar's detail gathers before it goes to the builder: painted,
// tagged triangles for each area, solid and clear apart, written straight
// into growing arrays. Its cabinet face is hundreds of small rectangles and
// its bottles thousands of triangles; built this way each area's are one
// geometry handed over once, not a geometry each.

import * as THREE from "three";
import type { Builder } from "./builder.ts";
import { CLEAR } from "./kinds.ts";

export type V3 = readonly [number, number, number];
/** What a surface is: its kind and its vertex colour (linear). */
export type Look = { kind: number; color: THREE.Color };

export const look = (kind: number, color: THREE.ColorRepresentation): Look => ({ kind, color: new THREE.Color(color) });

/** Triangles with their normals, colours and kinds. */
export class Sheet {
  count = 0;
  #pos = new Float32Array(3 * 1024);
  #nor = new Float32Array(3 * 1024);
  #col = new Float32Array(3 * 1024);
  #kind = new Float32Array(1024);

  /** Room for `n` more vertices. */
  reserve(n: number) {
    if (this.count + n <= this.#kind.length) return;
    let size = this.#kind.length;
    while (size < this.count + n) size *= 2;
    const grow = (a: Float32Array, k: number) => {
      const b = new Float32Array(size * k);
      b.set(a);
      return b;
    };
    this.#pos = grow(this.#pos, 3);
    this.#nor = grow(this.#nor, 3);
    this.#col = grow(this.#col, 3);
    this.#kind = grow(this.#kind, 1);
  }

  /** A vertex, with room already reserved. */
  put(x: number, y: number, z: number, nx: number, ny: number, nz: number, l: Look) {
    const i = this.count++;
    const p = this.#pos;
    const n = this.#nor;
    const c = this.#col;
    p[i * 3] = x;
    p[i * 3 + 1] = y;
    p[i * 3 + 2] = z;
    n[i * 3] = nx;
    n[i * 3 + 1] = ny;
    n[i * 3 + 2] = nz;
    c[i * 3] = l.color.r;
    c[i * 3 + 1] = l.color.g;
    c[i * 3 + 2] = l.color.b;
    this.#kind[i] = l.kind;
  }

  /** A template's triangles (`role` of each corner picks its look) copied to (x, y, z), turned `yaw` round y: thousands of corners, so written straight in. */
  copy(t: { pos: Float32Array; nor: Float32Array; role: Uint8Array; count: number }, x: number, y: number, z: number, yaw: number, looks: readonly Look[]) {
    this.reserve(t.count);
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const p = this.#pos;
    const n = this.#nor;
    const col = this.#col;
    const kind = this.#kind;
    let o = this.count * 3;
    for (let i = 0; i < t.count; i++) {
      const i3 = i * 3;
      const px = t.pos[i3];
      const pz = t.pos[i3 + 2];
      const nx = t.nor[i3];
      const nz = t.nor[i3 + 2];
      const l = looks[t.role[i]];
      p[o] = x + px * c + pz * sn;
      p[o + 1] = y + t.pos[i3 + 1];
      p[o + 2] = z - px * sn + pz * c;
      n[o] = nx * c + nz * sn;
      n[o + 1] = t.nor[i3 + 1];
      n[o + 2] = -nx * sn + nz * c;
      col[o] = l.color.r;
      col[o + 1] = l.color.g;
      col[o + 2] = l.color.b;
      kind[this.count + i] = l.kind;
      o += 3;
    }
    this.count += t.count;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.#pos.slice(0, this.count * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(this.#nor.slice(0, this.count * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.#col.slice(0, this.count * 3), 3));
    g.setAttribute("kind", new THREE.BufferAttribute(this.#kind.slice(0, this.count), 1));
    return g;
  }
}

const e1 = [0, 0, 0];
const e2 = [0, 0, 0];

/** Each area's sheets, solid and clear. */
export class Sheets {
  #sheets = new Map<number, Sheet>();

  sheet(area: number, kind: number) {
    const key = area * 2 + (kind >= CLEAR ? 1 : 0);
    let s = this.#sheets.get(key);
    if (!s) this.#sheets.set(key, (s = new Sheet()));
    return s;
  }

  /** A flat four-cornered piece, facing the side `toward` points to: its normal its own. */
  quad(area: number, a: V3, b: V3, c: V3, d: V3, l: Look, toward: V3) {
    for (let k = 0; k < 3; k++) {
      e1[k] = b[k] - a[k];
      e2[k] = c[k] - a[k];
    }
    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return;
    nx /= len;
    ny /= len;
    nz /= len;
    const flip = nx * toward[0] + ny * toward[1] + nz * toward[2] < 0;
    if (flip) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const s = this.sheet(area, l.kind);
    s.reserve(6);
    const order = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    for (const p of order) s.put(p[0], p[1], p[2], nx, ny, nz, l);
  }

  /** A box's faces, those `faces` names (+x -x +y -y +z -z). */
  box(area: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, l: Look, faces = "+x-x+y-y+z-z") {
    if (faces.includes("+x")) this.quad(area, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], l, [1, 0, 0]);
    if (faces.includes("-x")) this.quad(area, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], l, [-1, 0, 0]);
    if (faces.includes("+y")) this.quad(area, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], l, [0, 1, 0]);
    if (faces.includes("-y")) this.quad(area, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], l, [0, -1, 0]);
    if (faces.includes("+z")) this.quad(area, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], l, [0, 0, 1]);
    if (faces.includes("-z")) this.quad(area, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], l, [0, 0, -1]);
  }

  /** Everything gathered, to each area's detail. */
  flush(b: Builder) {
    for (const [key, s] of this.#sheets) {
      if (s.count) b.detailPainted(key >> 1, s.geometry(), key & 1 ? CLEAR : 0);
    }
    this.#sheets.clear();
  }
}
