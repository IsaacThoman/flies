// Where the parts of the restaurant put what they build: an area's detail
// (drawn while the camera is near it), its stand-in in the room-wide far
// mesh, or the room's shell (always drawn, and what the fly's eyes see with
// the stand-ins). Everything is merged by material in the end (set.ts), so
// how many pieces a part adds costs build time, never draws.

import * as THREE from "three";
import { freeze } from "../../scene/build.ts";
import type { ColorFn } from "../../scene/build.ts";
import { CLEAR } from "./kinds.ts";
import { part } from "./geometry.ts";

type Color = THREE.ColorRepresentation | ColorFn;

/** What every piece carries: painted, tagged, unindexed. */
const ATTRIBUTES = [
  ["position", 3],
  ["normal", 3],
  ["color", 3],
  ["kind", 1],
] as const;

/**
 * Pieces gathered by material, merged into one mesh each. The room is
 * hundreds of thousands of vertices: they are copied straight from array to
 * array, and the bounds found in one pass, which three.js's general merging
 * and bounding (an object and a call per vertex) take several times longer
 * to do.
 */
export class Lot {
  #pieces = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(material: THREE.Material, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    if (matrix) geometry.applyMatrix4(matrix);
    let list = this.#pieces.get(material);
    if (!list) this.#pieces.set(material, (list = []));
    list.push(geometry);
  }

  /** One frozen mesh per material, added to `parent`; clear ones drawn after the rest (`order`). */
  build(parent: THREE.Object3D, order: ReadonlyMap<THREE.Material, number>): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const [material, list] of this.#pieces) {
      let count = 0;
      for (const g of list) count += g.attributes.position.count;
      const geometry = new THREE.BufferGeometry();
      for (const [name, size] of ATTRIBUTES) {
        const out = new Float32Array(count * size);
        let at = 0;
        for (const g of list) {
          const a = g.attributes[name];
          if (!a || a.itemSize !== size || g.index) throw new Error(`A piece of the restaurant isn't painted and tagged (${name})`);
          out.set(a.array as Float32Array, at);
          at += a.array.length;
        }
        geometry.setAttribute(name, new THREE.BufferAttribute(out, size));
      }
      for (const g of list) g.dispose();
      const p = geometry.attributes.position.array as Float32Array;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      geometry.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = order.get(material) ?? 0;
      freeze(mesh);
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.#pieces.clear();
    return meshes;
  }
}

export class Builder {
  readonly solid: THREE.Material;
  readonly clear: THREE.Material;
  /** Each area's detail, by area id. */
  readonly near = new Map<number, Lot>();
  /** The stand-ins and the shell. */
  readonly far = new Lot();

  constructor(solid: THREE.Material, clear: THREE.Material) {
    this.solid = solid;
    this.clear = clear;
  }

  #material(kind: number) {
    return kind >= CLEAR ? this.clear : this.solid;
  }

  #nearBatch(area: number) {
    let batch = this.near.get(area);
    if (!batch) this.near.set(area, (batch = new Lot()));
    return batch;
  }

  /** Detail for an area. */
  detail(area: number, geometry: THREE.BufferGeometry, color: Color, kind: number, matrix?: THREE.Matrix4) {
    this.#nearBatch(area).add(this.#material(kind), part(geometry, color, kind), matrix);
  }

  /** Detail already painted and tagged (many small things scattered at once): clear or solid by its kind. */
  detailPainted(area: number, geometry: THREE.BufferGeometry, kind: number) {
    this.#nearBatch(area).add(this.#material(kind), geometry);
  }

  /** A stand-in for an area, folded away while the area is drawn in detail. */
  standIn(area: number, geometry: THREE.BufferGeometry, color: Color, kind: number, matrix?: THREE.Matrix4) {
    this.far.add(this.#material(kind), part(geometry, color, kind, area), matrix);
  }

  /** The room's own fabric: always drawn. */
  shell(geometry: THREE.BufferGeometry, color: Color, kind: number, matrix?: THREE.Matrix4) {
    this.far.add(this.#material(kind), part(geometry, color, kind), matrix);
  }
}
