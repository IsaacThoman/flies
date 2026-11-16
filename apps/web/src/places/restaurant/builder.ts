// Where the parts of the restaurant put what they build: an area's detail
// (drawn while the camera is near it), its stand-in in the room-wide far
// mesh, or the room's shell (always drawn, and what the fly's eyes see with
// the stand-ins). Everything is merged by material in the end (set.ts), so
// how many pieces a part adds costs build time, never draws.

import * as THREE from "three";
import { Batch } from "../../scene/build.ts";
import type { ColorFn } from "../../scene/build.ts";
import { CLEAR } from "./kinds.ts";
import { part } from "./geometry.ts";

type Color = THREE.ColorRepresentation | ColorFn;

export class Builder {
  readonly solid: THREE.Material;
  readonly clear: THREE.Material;
  /** Each area's detail, by area id. */
  readonly near = new Map<number, Batch>();
  /** The stand-ins and the shell. */
  readonly far = new Batch();

  constructor(solid: THREE.Material, clear: THREE.Material) {
    this.solid = solid;
    this.clear = clear;
  }

  #material(kind: number) {
    return kind >= CLEAR ? this.clear : this.solid;
  }

  #nearBatch(area: number) {
    let batch = this.near.get(area);
    if (!batch) this.near.set(area, (batch = new Batch()));
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
