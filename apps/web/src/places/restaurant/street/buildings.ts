// The buildings across the road: a row of four- to six-storey city houses,
// shops along their ground floors, broken by a side street that runs away
// opposite the window tables, its own houses down both sides and one
// closing its far end. Only their shapes are geometry (the faces, cornices,
// string courses, mansard roofs); windows, shutters, shopfronts and the
// lit interiors are worked out per pixel from each face's building.

import * as THREE from "three";
import { random } from "../../../scene/build.ts";
import { SHOP_FLOOR, STOREY } from "./glsl.ts";
import { STREET } from "./layout.ts";
import { KIND, Pieces } from "./pieces.ts";

/** One building's face: along it from x0 to x1 (or z, down the side street), its top, and a number of its own that picks its looks. */
export type Building = { x0: number; x1: number; top: number; seed: number };

const WALLS = ["#d8ccb2", "#d6b88c", "#aaa69c", "#9c5c46", "#d2a698", "#7a5444", "#a4a890", "#e2dccb", "#c4a27a"];
/** How deep the houses are behind their faces: deep enough that nothing behind shows. */
const DEPTH = 14_000;
/** The far end of the side street, where a house closes it. */
export const SIDE_END = 74_000;

/** The row across the road, along x, from one end of the street to the other, with the side street's mouth as a gap (top 0). */
export function rowOfBuildings(): Building[] {
  const rnd = random(907);
  const row: Building[] = [];
  const height = () => STREET.pavement + SHOP_FLOOR + STOREY * Math.floor(rnd.range(2, 5)) + 700;
  // Leftward from the corner of the side street; the ice-cream parlour's house first.
  let x = STREET.side.x0;
  const left: Building[] = [{ x0: -6400, x1: x, top: STREET.pavement + SHOP_FLOOR + STOREY * 4 + 700, seed: 0.37 }];
  x = -6400;
  while (x > -STREET.reach) {
    const w = rnd.range(6000, 11_500);
    left.push({ x0: x - w, x1: x, top: height(), seed: rnd.next() });
    x -= w;
  }
  row.push(...left.reverse());
  row.push({ x0: STREET.side.x0, x1: STREET.side.x1, top: 0, seed: 0 });
  x = STREET.side.x1;
  while (x < STREET.reach) {
    const w = rnd.range(6000, 11_500);
    row.push({ x0: x, x1: x + w, top: height(), seed: rnd.next() });
    x += w;
  }
  return row;
}

/** The faces, as geometry, into `pieces`. */
export function buildBuildings(pieces: Pieces, row: readonly Building[]) {
  const rnd = random(311);
  const z = STREET.facades;
  const base = STREET.pavement;
  const wallOf = (seed: number) => WALLS[Math.floor(seed * 997) % WALLS.length];
  for (const b of row) {
    if (b.top === 0) continue;
    const tag = new THREE.Vector4(b.x0, b.x1, b.top, b.seed);
    const wall = wallOf(b.seed);
    // The face, and the sides where the side street shows them.
    pieces.box(b.x0, b.x1, base, b.top, z, z + DEPTH, wall, KIND.facade, tag);
    trim(pieces, b, wall, rnd);
  }
  // Down the side street: houses along both sides, their faces toward it, and one across its end.
  for (const side of [-1, 1]) {
    const x = side < 0 ? STREET.side.x0 : STREET.side.x1;
    for (let z0 = z + DEPTH; z0 < SIDE_END; ) {
      const w = rnd.range(7000, 12_000);
      const top = base + SHOP_FLOOR + STOREY * Math.floor(rnd.range(2, 4)) + 700;
      const seed = rnd.next();
      const tag = new THREE.Vector4(z0, z0 + w, top, seed);
      const x0 = side < 0 ? x - DEPTH : x;
      const x1 = side < 0 ? x : x + DEPTH;
      pieces.box(x0, x1, base, top, z0, z0 + w, wallOf(seed), KIND.facade, tag);
      // A cornice along the top.
      pieces.box(side < 0 ? x - 10 : x - 350, side < 0 ? x + 350 : x + 10, top - 600, top - 250, z0, z0 + w, "#cfc6b4", KIND.matte);
      z0 += w;
    }
  }
  {
    const top = base + SHOP_FLOOR + STOREY * 3 + 700;
    pieces.box(STREET.side.x0 - 6000, STREET.side.x1 + 6000, base, top, SIDE_END, SIDE_END + DEPTH, "#c9b391", KIND.facade, new THREE.Vector4(STREET.side.x0 - 6000, STREET.side.x1 + 6000, top, 0.71));
  }
}

/** A house's mouldings: the string course over its shop, the cornice, and a mansard roof on some, which the face's shader leaves bare. */
function trim(pieces: Pieces, b: Building, wall: string, rnd: ReturnType<typeof random>) {
  const z = STREET.facades;
  const stone = new THREE.Color(wall).lerp(new THREE.Color("#efe8da"), 0.45);
  const course = STREET.pavement + SHOP_FLOOR;
  pieces.box(b.x0, b.x1, course - 60, course + 200, z - 160, z + 10, stone, KIND.matte);
  pieces.box(b.x0 - 60, b.x1 + 60, b.top - 650, b.top - 250, z - 380, z + 10, stone, KIND.matte);
  // A blind's box over some shopfronts, an awning rolled up for the night.
  if (rnd.next() < 0.45) pieces.box(b.x0 + 450, b.x1 - 450, course - 520, course - 260, z - 260, z, "#3c3a38", KIND.matte);
  if (rnd.next() < 0.55) {
    // A slate mansard behind the cornice, its windows in dormers.
    // Its profile across the street (shape x is back from the face, after the turn), run along the house.
    const h = 2900;
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-1300, h), new THREE.Vector2(-4000, h), new THREE.Vector2(-4000, 0)]);
    const roof = new THREE.ExtrudeGeometry(shape, { depth: b.x1 - b.x0 - 200, bevelEnabled: false, curveSegments: 1 }).rotateY(Math.PI / 2).translate(b.x0 + 100, b.top - 250, z + 100);
    pieces.add(roof, "#4e5560", KIND.matte);
    const dormers = Math.max(1, Math.floor((b.x1 - b.x0) / 3200));
    for (let i = 0; i < dormers; i++) {
      const x = b.x0 + ((i + 0.5) * (b.x1 - b.x0)) / dormers;
      pieces.box(x - 480, x + 480, b.top - 250, b.top + 1500, z + 400, z + 1500, "#e6dfd0", KIND.matte);
      pieces.box(x - 330, x + 330, b.top - 80, b.top + 1250, z + 380, z + 400, "#1c2228", KIND.glass);
    }
  }
}
