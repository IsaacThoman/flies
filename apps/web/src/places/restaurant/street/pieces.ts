// Geometry for the street, merged into one mesh per material: each piece
// carries its colour, what it is (`aKind`, how the shader treats it) and,
// for a building's face, which building it is (`aBuilding`: where it starts
// and ends along its face, its top, its seed), so that its windows and shops
// can be worked out per pixel.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paint } from "../../../scene/build.ts";

/** What a piece is, as the street's shader knows it. */
export const KIND = {
  /** Stone, render, rubber, painted metal: matte. */
  matte: 0,
  /** A building's face: its windows and shopfront are worked out per pixel. */
  facade: 1,
  /** A car's paint: glossy. */
  paint: 2,
  /** A car's windows: dark glass. */
  glass: 3,
  /** Lamp posts, rails, racks: dull metal. */
  metal: 4,
  /** A lantern's glass, lit at night. */
  lantern: 5,
  /** Lamps on a car: lit when its headlamps are. */
  lens: 6,
  /** Leaves, lit from below by the lamps at night. */
  leaves: 7,
};
/** Added to a piece's kind: it is there only by day (the delivery van). */
export const BY_DAY = 10;

const NONE = new THREE.Vector4();

export class Pieces {
  #list: THREE.BufferGeometry[] = [];

  add(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, kind: number, building: THREE.Vector4 = NONE) {
    const g = paint(geometry, color);
    const n = g.attributes.position.count;
    g.setAttribute("aKind", new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    const b = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) b.set([building.x, building.y, building.z, building.w], i * 4);
    g.setAttribute("aBuilding", new THREE.BufferAttribute(b, 4));
    this.#list.push(g);
    return g;
  }

  /** A box between two corners. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.ColorRepresentation, kind: number, building?: THREE.Vector4) {
    return this.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), color, kind, building);
  }

  /** Everything added, as one geometry; the pieces are freed. */
  merge(): THREE.BufferGeometry {
    const g = mergeGeometries(this.#list);
    for (const p of this.#list) p.dispose();
    this.#list = [];
    g.computeBoundingSphere();
    return g;
  }
}
