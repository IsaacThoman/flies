// What hangs on the walls: the mirror over the banquette in its gilt frame,
// the chalkboard on the back wall, the framed print beside it, and the exit
// sign over the door. They are in no area: drawn once with the room's shell,
// near and far alike, and seen by the fly's eyes, so they are few triangles,
// their detail in the shader. Each frame's moulding stays within its solid,
// the glass or the slate or the picture set just behind its face.

import * as THREE from "three";
import { DINING_ROOM, SHOPFRONT, WALL_THINGS } from "@fly/world";
import type { Builder } from "./builder.ts";
import { KIND } from "./kinds.ts";
import { EXIT } from "./plan.ts";
import { Faces, REST_KIND, flat, inset, recess, ring } from "./rest-shapes.ts";
import type { P, Plane, Rect } from "./rest-shapes.ts";

const { hx, hz } = DINING_ROOM;
const BACK: Plane = { o: [0, 0, -hz], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const RIGHT: Plane = { o: [hx, 0, 0], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0] };
const FRONT: Plane = { o: [0, 0, hz], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] };

/** A moulding's colour: darker the deeper it lies toward the wall, as its hollows gather shadow. */
const hollows = (pl: Plane, depth: number, color: string) => {
  const c = new THREE.Color(color);
  const out = new THREE.Color();
  return (p: THREE.Vector3) => {
    const w = (p.x - pl.o[0]) * pl.n[0] + (p.y - pl.o[1]) * pl.n[1] + (p.z - pl.o[2]) * pl.n[2];
    return out.copy(c).multiplyScalar(0.5 + 0.5 * Math.min(1, Math.max(0, (w - depth * 0.55) / (depth * 0.45))));
  };
};

export function buildWalls(b: Builder) {
  const w = WALL_THINGS;

  // The mirror: a gilt frame of beads and a cove, the old glass just behind its inner lip.
  {
    const m = w.mirror;
    const r: Rect = { u0: m.z - m.hz, u1: m.z + m.hz, v0: m.bottom, v1: m.top };
    const d = m.hx * 2;
    const profile: P[] = [[0, 0], [0, 16], [1.5, 23], [5, 28], [10, d], [16, d - 1], [22, d - 5], [30, d - 7.5], [38, d - 6], [46, d - 2.5], [52, d - 0.5], [58, d - 0.5], [63, d - 1.5], [66, d - 2]];
    b.shell(ring(new Faces(), RIGHT, r, profile).geometry(), hollows(RIGHT, d, "#ffffff"), REST_KIND.gilt);
    b.shell(flat(new Faces(), RIGHT, inset(r, 66), [], d - 2).geometry(), "#ffffff", KIND.mirror);
  }

  // The chalkboard: an oak frame round the slate, a stub of chalk left on its bottom rail.
  {
    const c = w.chalkboard;
    const r: Rect = { u0: c.x - c.hx, u1: c.x + c.hx, v0: c.bottom, v1: c.top };
    const d = c.hz * 2;
    const slate = d - 7;
    b.shell(ring(new Faces(), BACK, r, [[0, 0], [0, d - 4], [2, d - 0.5], [5, d], [44, d], [48, d - 1], [52, d - 3.5], [55, slate]]).geometry(), hollows(BACK, d, "#ffffff"), KIND.oak);
    b.shell(flat(new Faces(), BACK, inset(r, 55), [], slate).geometry(), "#ffffff", KIND.chalk);
    const stub = 3.5;
    b.shell(new THREE.CylinderGeometry(stub, stub, 58, 10).rotateZ(Math.PI / 2 + 0.03).translate(c.x - 230, c.bottom + 55 + stub, -hz + d - stub), "#f2f0e8", KIND.matte);
  }

  // The print: a black frame, a mat with its window cut on the bevel, the picture, glass over it all.
  {
    const p = w.print;
    const r: Rect = { u0: p.x - p.hx, u1: p.x + p.hx, v0: p.bottom, v1: p.top };
    const d = p.hz * 2;
    const lip = 34;
    const mat = d - 6;
    b.shell(ring(new Faces(), BACK, r, [[0, 0], [0, d - 4], [3, d], [28, d], [31, d - 2], [lip, mat + 1], [lip, mat]]).geometry(), hollows(BACK, d, "#3a3634"), KIND.mahogany);
    const window = inset(r, 75);
    const mats = new Faces();
    flat(mats, BACK, inset(r, lip), [window], mat);
    const picture = recess(mats, BACK, window, 2, 2, mat);
    b.shell(mats.geometry(), "#e8e0cc", KIND.paper);
    b.shell(flat(new Faces(), BACK, picture, [], mat - 2).geometry(), "#ffffff", KIND.print);
    b.shell(flat(new Faces(), BACK, inset(r, 31), [], d - 1).geometry(), "#f4f8ff", KIND.glass);
  }

  // The exit sign: a slim enamelled housing hung from the head over the door, its lit face toward the room.
  {
    const e = w.exit;
    const r: Rect = { u0: e.x - e.hx, u1: e.x + e.hx, v0: e.bottom, v1: e.top };
    const d = e.hz * 2;
    const face: Rect = { u0: EXIT.x0, u1: EXIT.x1, v0: EXIT.y0, v1: EXIT.y1 };
    const housing = ring(new Faces(), FRONT, r, [[0, 0], [0, d - 6], [2, d - 2], [6, d], [10, d]]);
    flat(housing, FRONT, inset(r, 10), [face], d);
    b.shell(housing.geometry(), "#e6e4dc", KIND.enamel);
    b.shell(flat(new Faces(), FRONT, face, [], d).geometry(), "#ffffff", KIND.exit);
    for (const x of [r.u0 + 60, r.u1 - 60]) b.shell(new THREE.CylinderGeometry(4, 4, SHOPFRONT.head - e.top, 8, 1, true).translate(x, (SHOPFRONT.head + e.top) / 2, e.z), "#ffffff", KIND.steel);
  }
}
