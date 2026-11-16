// The banquette along the right wall, in deep-buttoned oxblood leather: the
// seat's top at the world's heights, piped along its front edge over a
// rolled front and a mahogany plinth; the back buttoned into diamonds, each
// button pulling the leather in and the pleats running from button to
// button, rising into a piped roll along its top. Everything stays within
// the world's two solids: the pillows of the back are at its face, and the
// buttons and the pleats are sunk into it. The buttons fall where the shared
// leather's own pattern puts them (surfaces.ts: every 150 mm along, 130 mm up,
// each row set over by half), so the shading and the shape agree.

import * as THREE from "three";
import { BANQUETTE, topHeight } from "@fly/world";
import type { Solid } from "@fly/world";
import type { Builder } from "./builder.ts";
import { KIND } from "./kinds.ts";
import { Faces, cap, prism } from "./rest-shapes.ts";
import type { P } from "./rest-shapes.ts";
import { pieces } from "./standins.ts";

const LEATHER = "#7a2018";
const q = BANQUETTE;
/** The piping along the seat's front edge, and along the back's roll. */
const PIPE = { r: 3, seat: { x: q.x0 + 3.2 }, roll: { x: q.back.x0 + 3, y: q.back.top - 30 - 3 } };
/** The seat's front, from under its piping down to the plinth: a roll at the top, the face set back below it. */
const FRONT: P[] = [
  [q.x0 + 5, q.seat - 12 - 6.5],
  [q.x0 + 2, q.seat - 12 - 11],
  [q.x0 + 0.4, q.seat - 12 - 23],
  [q.x0, q.seat - 12 - 43],
  [q.x0 + 1, q.seat - 12 - 78],
  [q.x0 + 2, q.seat - 12 - 138],
  [q.x0 + 2, 95],
];
/** The plinth, from the shadow line over it down to the floor. */
const PLINTH: P[] = [
  [q.x0 + 2, 95],
  [q.x0 + 4, 95],
  [q.x0 + 4, 88],
  [q.x0 + 1.5, 88],
  [q.x0, 86],
  [q.x0, 0],
];
/** The deep buttoning: the pleats this deep below the pillows, the buttons this much deeper again, and how wide each button's pull is. */
const TUFT = { pleat: 6, button: 8, pull: 16 };
/**
 * The back's face is a grid along z and up, a quarter of the buttons'
 * spacing each way: every button falls on a vertex, every pleat on the
 * diagonals of the grid's cells, and the grid repeats every 8 cells each way,
 * so its depths are worked out once.
 */
const DZ = 150 / 8;
const DY = 130 / 8;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How deep the leather lies behind the pillows' face at (z, y), before it smooths out toward the edges. */
function pull(z: number, y: number) {
  const c1 = z / 150 + y / 130;
  const c2 = z / 150 - y / 130;
  const f1 = c1 - Math.floor(c1) - 0.5;
  const f2 = c2 - Math.floor(c2) - 0.5;
  const pillow = Math.sin(Math.PI * Math.abs(f1)) * Math.sin(Math.PI * Math.abs(f2));
  const dz = 75 * (f1 + f2);
  const dy = 65 * (f1 - f2);
  return TUFT.pleat * (1 - pillow ** 0.7) + TUFT.button * Math.exp(-(dz * dz + dy * dy) / (TUFT.pull * TUFT.pull));
}

/** The pull and its slopes (up, along) at each of the 8 by 8 grid points of one repeat. */
const REPEAT = (() => {
  const h = 0.3;
  const out: [number, number, number][] = [];
  for (let m = 0; m < 8; m++) for (let n = 0; n < 8; n++) {
    const z = m * DZ;
    const y = n * DY;
    out.push([pull(z, y), (pull(z, y + h) - pull(z, y - h)) / (2 * h), (pull(z + h, y) - pull(z - h, y)) / (2 * h)]);
  }
  return out;
})();
const wrap = (k: number) => ((k % 8) + 8) % 8;

export function buildBanquette(b: Builder, solids: readonly Solid[]) {
  const seat = solids.find((s) => s.name === "banquette")!;
  const back = solids.find((s) => s.name === "banquette back")!;
  const face = q.back.x0;
  const rollBase = q.back.top - 30;
  const seatAt = (x: number, z: number) => topHeight(seat, x, z);

  const ends = (z: number) => smooth(0, 60, z - q.z0) * smooth(0, 60, q.z1 - z);

  for (const { piece, area } of pieces(seat)) {
    const f = piece.footprint;
    if (f.kind !== "box") continue;
    const za = f.z - f.hz;
    const zb = f.z + f.hz;
    const leather = new Faces();
    const wood = new Faces();
    const zSteps = Math.max(1, Math.round((zb - za) / 40));
    const zAt = (k: number) => za + ((zb - za) * k) / zSteps;

    // The seat's top, from its piping back under the back's face.
    const x0 = PIPE.seat.x;
    const x1 = face + 20;
    const xSteps = 20;
    const e = 0.2;
    const seatVertex = (x: number, z: number, edge: boolean) => {
      // Its front edge tucked just under the piping's crest.
      const y = seatAt(x, z) - (edge ? 0.3 : 0);
      const nx = -(seatAt(x + e, z) - seatAt(x - e, z)) / (2 * e);
      const nz = -(seatAt(x, z + e) - seatAt(x, z - e)) / (2 * e);
      const l = Math.hypot(nx, 1, nz);
      return [x, y, z, nx / l, 1 / l, nz / l];
    };
    grid(leather, xSteps, zSteps, (i, k) => seatVertex(x0 + ((x1 - x0) * i) / xSteps, zAt(k), i === 0));

    // Its front and its plinth, piped along the top edge.
    prism(leather, FRONT, "z", za, zb, false);
    prism(wood, PLINTH, "z", za, zb, false);
    const pipe = (x: number, y: number) => new THREE.CylinderGeometry(PIPE.r, PIPE.r, zb - za, 10).rotateX(Math.PI / 2).translate(x, y, (za + zb) / 2);
    // The seat's piping, its crest at the seat's height there.
    b.detail(area, pipe(PIPE.seat.x, seatAt(PIPE.seat.x, za) - 0.1 - PIPE.r), LEATHER, KIND.leather);
    b.detail(area, pipe(PIPE.roll.x, PIPE.roll.y), LEATHER, KIND.leather);

    // The back's face, buttoned: smoothed out into the seat, under the roll (in a crease for its piping) and at either end.
    const cols: { z: number; m: number; exact: boolean; bottom: number }[] = [];
    const addCol = (z: number, exact: boolean) => cols.push({ z, m: Math.floor(z / DZ + 1e-6), exact, bottom: seatAt(face, z) });
    addCol(za, true);
    for (let m = Math.floor(za / DZ) + 1; m * DZ < zb - 0.5; m++) if (m * DZ > za + 0.5) addCol(m * DZ, false);
    addCol(zb, true);
    const n0 = Math.ceil((q.seat + 2) / DY);
    const n1 = Math.floor((rollBase - 1) / DY);
    const rows: { n: number; exact: boolean }[] = [{ n: n0 - 1, exact: true }];
    for (let n = n0; n <= n1; n++) rows.push({ n, exact: false });
    rows.push({ n: n1, exact: true });
    const h = 0.3;
    const vertex = (col: (typeof cols)[number], r: number) => {
      const y = r === 0 ? col.bottom - 0.5 : r === rows.length - 1 ? rollBase : rows[r].n * DY;
      const fade = smooth(0, 50, y - col.bottom) * smooth(0, 40, rollBase - y) * ends(col.z);
      let d: number;
      let gy: number;
      let gz: number;
      if (col.exact || rows[r].exact) {
        d = pull(col.z, y);
        gy = (pull(col.z, y + h) - pull(col.z, y - h)) / (2 * h);
        gz = (pull(col.z + h, y) - pull(col.z - h, y)) / (2 * h);
      } else [d, gy, gz] = REPEAT[wrap(col.m) * 8 + wrap(rows[r].n)];
      const crease = 3.2 * smooth(rollBase - 16, rollBase - 4, y) * ends(col.z);
      const l = Math.hypot(1, gy * fade, gz * fade);
      return [face + d * fade + crease, y, col.z, -1 / l, (gy * fade) / l, (gz * fade) / l];
    };
    let prev = rows.map((_, r) => vertex(cols[0], r));
    for (let i = 1; i < cols.length; i++) {
      const next = rows.map((_, r) => vertex(cols[i], r));
      const m = cols[i - 1].m;
      for (let r = 0; r < rows.length - 1; r++) {
        const a = prev[r];
        const c = next[r + 1];
        // Each cell split along whichever diagonal a pleat runs.
        if (wrap(m + rows[r].n + 1) === 4) {
          leather.tri(next[r], prev[r + 1], a);
          leather.tri(next[r], c, prev[r + 1]);
        } else {
          leather.tri(a, next[r], c);
          leather.tri(a, c, prev[r + 1]);
        }
      }
      prev = next;
    }

    // The roll along the back's top, at the world's heights: rounded across from the face over to the wall, level along.
    const backAt = (x: number, z: number) => topHeight(back, x, z);
    const rollSteps = 12;
    const rollX = (i: number) => face + ((q.x1 - face) * i) / rollSteps;
    const rollSection = Array.from({ length: rollSteps + 1 }, (_, i): P => [rollX(i), backAt(rollX(i), za)]);
    grid(leather, rollSteps, zSteps, (i, k) => {
      const x = rollX(i);
      const z = zAt(k);
      const xa = Math.max(face, x - e);
      const xb = Math.min(q.x1, x + e);
      const nx = -(backAt(xb, z) - backAt(xa, z)) / (xb - xa);
      const l = Math.hypot(nx, 1);
      return [x, backAt(x, z), z, nx / l, 1 / l, 0];
    });

    // Its ends, where it stops: leather over the plinth, the roll's end rounded with it.
    for (const [end, facing] of [
      [q.z0, -1],
      [q.z1, 1],
    ] as const) {
      if (Math.abs(end - za) > 1 && Math.abs(end - zb) > 1) continue;
      const outline: P[] = [...FRONT.slice().reverse(), [PIPE.seat.x, q.seat - 12], [face, q.seat - 12], ...rollSection, [q.x1, 95]];
      cap(leather, outline, "z", end, facing);
      cap(wood, [[q.x0, 0], [q.x1, 0], [q.x1, 95], [q.x0 + 2, 95], [q.x0, 86]], "z", end, facing);
    }
    b.detail(area, leather.geometry(), LEATHER, KIND.leather);
    b.detail(area, wood.geometry(), "#d8c0b0", KIND.mahogany);

    // From afar: one section along it, the seat and the back.
    const far: P[] = [...[12, 9, 6, 3, 0].map((i) => rollSection[i]), [face, q.seat - 3], [(q.x0 + q.x1) / 2, q.seat], [q.x0, q.seat - 12], [q.x0, 0]];
    const stand = prism(new Faces(), far, "z", za, zb, false);
    for (const [end, facing] of [
      [q.z0, -1],
      [q.z1, 1],
    ] as const) if (Math.abs(end - za) < 1 || Math.abs(end - zb) < 1) cap(stand, [...far, [q.x1, 0]], "z", end, facing);
    b.standIn(area, stand.geometry(), LEATHER, KIND.leather);
  }
}

/** A grid of quads between vertices made by `at` (x, y, z and the normal), `ni` by `nj` cells. */
function grid(faces: Faces, ni: number, nj: number, at: (i: number, j: number) => number[]) {
  let prev: number[][] = [];
  for (let j = 0; j <= nj; j++) {
    const row: number[][] = [];
    for (let i = 0; i <= ni; i++) row.push(at(i, j));
    if (j > 0) for (let i = 0; i < ni; i++) faces.quad(prev[i], prev[i + 1], row[i + 1], row[i]);
    prev = row;
  }
}
