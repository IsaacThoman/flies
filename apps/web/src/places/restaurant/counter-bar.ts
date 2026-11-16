// The zinc bar's body: the hammered zinc top with its rolled nose, the
// panelled mahogany front under it, the bartender's steel counter behind, and
// the brass foot rail on its brackets. Each runs through the bar's three
// lengths (areas.ts) and is drawn a length at a time (`pieces`), so each
// length's detail and stand-in cover exactly that length. Everything stays
// inside the world's boxes: mouldings are sunk into the faces, never proud
// of them.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ZINC_BAR } from "@fly/world";
import type { Solid } from "@fly/world";
import type { Builder } from "./builder.ts";
import { Face, Mesh, edge, turn } from "./counter-shapes.ts";
import { KIND } from "./kinds.ts";
import { pieces } from "./standins.ts";

const { zinc, front, underbar, rail } = ZINC_BAR;

/** The zinc's box. */
const Z = { x0: zinc.x - zinc.hx, x1: zinc.x + zinc.hx, z0: zinc.z - zinc.hz, z1: zinc.z + zinc.hz, y0: zinc.bottom, y1: zinc.top };
/** The front's box under it. */
const F = { x0: front.x - front.hx, x1: front.x + front.hx, z0: zinc.z - front.hz, z1: zinc.z + front.hz, top: zinc.bottom };
/** The bartender's counter. */
const U = { x0: underbar.x - underbar.hx, x1: underbar.x + underbar.hx, z0: underbar.z0, z1: underbar.z1, top: underbar.top };
const RAIL_Y = rail.top - rail.half;

/**
 * The zinc's edge, out from the box's side (0) and down from its top: flat
 * to within 1.5 mm of the edge, a band, a quirk, then the roll the sheet is
 * beaten over, turned under. Below that the wooden core is coved back under.
 */
const NOSE: readonly (readonly [number, number])[] = [
  [-3, Z.y1],
  [-1.5, Z.y1],
  [-0.44, Z.y1 - 0.44],
  [0, Z.y1 - 1.5],
  [0, Z.y1 - 5],
  [-0.5, Z.y1 - 5.8],
  [-3.5, Z.y1 - 7.6],
  [-5.9, Z.y1 - 9.5],
  [-5.9, Z.y1 - 9.5],
  ...[45, 20, 0, -25, -50, -70, -90].map((a): [number, number] => [-9 + 9 * Math.cos((a * Math.PI) / 180), Z.y1 - 18 + 9 * Math.sin((a * Math.PI) / 180)]),
  [-11, Z.y1 - 27.4],
];
const COVE: readonly (readonly [number, number])[] = [
  [-11, Z.y1 - 27.4],
  [-12.5, Z.y1 - 28.5],
  [-15, Z.y1 - 31],
  [-18, Z.y1 - 33.4],
  [-21, Z.y0],
];
const NOSE_DEPTH = 21;

/** The bartender's counter's steel top: rounded over and turned down as an apron, then tucked under. */
const APRON: readonly (readonly [number, number])[] = [
  [-3, U.top],
  [-1.5, U.top],
  [-0.44, U.top - 0.44],
  [0, U.top - 1.5],
  [0, U.top - 38.5],
  [-0.44, U.top - 39.56],
  [-1.5, U.top - 40],
  [-3, U.top - 40],
];

const DARK = "#17110d";

type Span = { lo: number; hi: number; endLo: boolean; endHi: boolean };

function spanOf(piece: Solid, z0: number, z1: number): Span {
  const f = piece.footprint;
  const lo = f.z - (f.kind === "box" ? f.hz : 0);
  const hi = f.z + (f.kind === "box" ? f.hz : 0);
  return { lo, hi, endLo: Math.abs(lo - z0) < 1, endHi: Math.abs(hi - z1) < 1 };
}

/** The outline of a length of a box along z, as legs with their outward normals: the long sides, and round the box's own ends. */
function outline(x0: number, x1: number, s: Span) {
  const paths: { path: [number, number][]; normals: [number, number][] }[] = [];
  const mid = (s.lo + s.hi) / 2;
  if (s.endLo && s.endHi) paths.push({ path: [[x0, mid], [x0, s.hi], [x1, s.hi], [x1, s.lo], [x0, s.lo], [x0, mid]], normals: [[-1, 0], [0, 1], [1, 0], [0, -1], [-1, 0]] });
  else if (s.endHi) paths.push({ path: [[x0, s.lo], [x0, s.hi], [x1, s.hi], [x1, s.lo]], normals: [[-1, 0], [0, 1], [1, 0]] });
  else if (s.endLo) paths.push({ path: [[x1, s.hi], [x1, s.lo], [x0, s.lo], [x0, s.hi]], normals: [[1, 0], [0, -1], [-1, 0]] });
  else {
    paths.push({ path: [[x0, s.lo], [x0, s.hi]], normals: [[-1, 0]] });
    paths.push({ path: [[x1, s.lo], [x1, s.hi]], normals: [[1, 0]] });
  }
  return paths;
}

/** A box's faces as a lean stand-in: its top, its long sides, its own ends (not where a length is cut), its underside if it has air beneath. */
function block(x0: number, x1: number, y0: number, y1: number, s: Span, faces: { top?: boolean; out?: boolean; back?: boolean; under?: boolean }) {
  const m = new Mesh();
  const { lo, hi } = s;
  if (faces.top) m.quad([x0, y1, lo], [x1, y1, lo], [x1, y1, hi], [x0, y1, hi], [0, 1, 0]);
  if (faces.under) m.quad([x0, y0, lo], [x1, y0, lo], [x1, y0, hi], [x0, y0, hi], [0, -1, 0]);
  if (faces.out) m.quad([x1, y0, lo], [x1, y1, lo], [x1, y1, hi], [x1, y0, hi], [1, 0, 0]);
  if (faces.back) m.quad([x0, y0, lo], [x0, y1, lo], [x0, y1, hi], [x0, y0, hi], [-1, 0, 0]);
  if (s.endLo) m.quad([x0, y0, lo], [x1, y0, lo], [x1, y1, lo], [x0, y1, lo], [0, 0, -1]);
  if (s.endHi) m.quad([x0, y0, hi], [x1, y0, hi], [x1, y1, hi], [x0, y1, hi], [0, 0, 1]);
  return m.geometry();
}

function zincLength(b: Builder, area: number, s: Span) {
  const top = new Mesh();
  const zx0 = Z.x0 + 3;
  const zx1 = Z.x1 - 3;
  const zl = s.endLo ? s.lo + 3 : s.lo;
  const zh = s.endHi ? s.hi - 3 : s.hi;
  top.quad([zx0, Z.y1, zl], [zx1, Z.y1, zl], [zx1, Z.y1, zh], [zx0, Z.y1, zh], [0, 1, 0]);
  b.detail(area, top.geometry(), "#ffffff", KIND.zinc);
  for (const { path, normals } of outline(Z.x0, Z.x1, s)) {
    b.detail(area, edge(path, normals, NOSE), "#ffffff", KIND.zinc);
    b.detail(area, edge(path, normals, COVE), "#ffffff", KIND.mahogany);
  }
  // Under the overhang: the wooden core the zinc is laid on.
  const under = new Mesh();
  const ul = s.endLo ? s.lo + NOSE_DEPTH : s.lo;
  const uh = s.endHi ? s.hi - NOSE_DEPTH : s.hi;
  under.quad([Z.x0 + NOSE_DEPTH, Z.y0, ul], [Z.x1 - NOSE_DEPTH, Z.y0, ul], [Z.x1 - NOSE_DEPTH, Z.y0, uh], [Z.x0 + NOSE_DEPTH, Z.y0, uh], [0, -1, 0]);
  b.detail(area, under.geometry(), "#ffffff", KIND.mahogany);
  b.standIn(area, block(Z.x0, Z.x1, Z.y0, Z.y1, s, { top: true, out: true, back: true, under: true }), "#ffffff", KIND.zinc);
}

/** Heights up the bar's front: the kick, the bottom rail, the panels, the top rail, a sunk bead, the band under the zinc. */
const KICK = { top: 150, depth: 6 };
const PANEL = { v0: 270, v1: 880 };
const BEAD = { v0: 990, v1: 998, depth: 4 };
const STILE = 90;

/**
 * A panelled face of the front: the dark kick, the frame's rails and stiles
 * flush with the face, and raised-and-fielded panels sunk into it (a margin
 * 14 mm in, a bevel rising to the field 6 mm in) between the stiles. Where
 * `cornerLo`/`cornerHi` the face turns a corner, and what is sunk stops short
 * of it; `ownLo`/`ownHi` say whether its level strips fill that corner.
 */
function panelled(face: Face, kick: Mesh, u0: number, u1: number, bays: readonly [number, number][], corner: { lo: boolean; hi: boolean; ownLo: boolean; ownHi: boolean }) {
  const inset = (d: number) => [corner.lo ? u0 + d : u0, corner.hi ? u1 - d : u1] as const;
  const owned = (d: number) => [corner.lo && !corner.ownLo ? u0 + d : u0, corner.hi && !corner.ownHi ? u1 - d : u1] as const;
  const kickFace = new Face(kick, face.origin, face.along, face.out);
  const [k0, k1] = inset(KICK.depth);
  kickFace.front(k0, k1, 0, KICK.top, -KICK.depth);
  const [s0, s1] = owned(KICK.depth);
  face.level(s0, s1, KICK.top, -KICK.depth, 0, -1);
  face.front(u0, u1, KICK.top, PANEL.v0, 0);
  face.front(u0, u1, PANEL.v1, BEAD.v0, 0);
  const [b0, b1] = owned(BEAD.depth);
  face.level(b0, b1, BEAD.v0, -BEAD.depth, 0, 1);
  face.level(b0, b1, BEAD.v1, -BEAD.depth, 0, -1);
  const [g0, g1] = inset(BEAD.depth);
  face.front(g0, g1, BEAD.v0, BEAD.v1, -BEAD.depth);
  face.front(u0, u1, BEAD.v1, F.top, 0);
  let at = u0;
  for (const [a, c] of bays) {
    face.front(at, a, PANEL.v0, PANEL.v1, 0);
    at = c;
    const v0 = PANEL.v0;
    const v1 = PANEL.v1;
    face.walls(a, c, v0, v1, 0, -14);
    const m = 8;
    face.front(a, c, v0, v0 + m, -14);
    face.front(a, c, v1 - m, v1, -14);
    face.front(a, a + m, v0 + m, v1 - m, -14);
    face.front(c - m, c, v0 + m, v1 - m, -14);
    const f = 58;
    const p = (u: number, v: number, d: number) => face.at(u, v, d);
    const out = face.out;
    face.m.plane(p(a + m, v0 + m, -14), p(c - m, v0 + m, -14), p(c - f, v0 + f, -6), p(a + f, v0 + f, -6), out);
    face.m.plane(p(a + m, v1 - m, -14), p(a + f, v1 - f, -6), p(c - f, v1 - f, -6), p(c - m, v1 - m, -14), out);
    face.m.plane(p(a + m, v0 + m, -14), p(a + f, v0 + f, -6), p(a + f, v1 - f, -6), p(a + m, v1 - m, -14), out);
    face.m.plane(p(c - m, v0 + m, -14), p(c - m, v1 - m, -14), p(c - f, v1 - f, -6), p(c - f, v0 + f, -6), out);
    face.front(a + f, c - f, v0 + f, v1 - f, -6);
  }
  face.front(at, u1, PANEL.v0, PANEL.v1, 0);
}

/** Bays between stiles along a length: whole stiles at the box's ends, half stiles where a length is cut, so the lengths join into whole ones. */
function bays(lo: number, hi: number, endLo: boolean, endHi: boolean, width: number): [number, number][] {
  const l = lo + (endLo ? STILE : STILE / 2);
  const h = hi - (endHi ? STILE : STILE / 2);
  const n = Math.max(1, Math.round((h - l + STILE) / width));
  const w = (h - l - (n - 1) * STILE) / n;
  return Array.from({ length: n }, (_, i): [number, number] => [l + i * (w + STILE), l + i * (w + STILE) + w]);
}

function frontLength(b: Builder, area: number, s: Span) {
  const wood = new Mesh();
  const kick = new Mesh();
  const face = new Face(wood, [F.x1, 0, 0], [0, 0, 1], [1, 0, 0]);
  panelled(face, kick, s.lo, s.hi, bays(s.lo, s.hi, s.endLo, s.endHi, 560), { lo: s.endLo, hi: s.endHi, ownLo: true, ownHi: true });
  // The ends, one panel each; the customers' corner is the front face's.
  for (const [end, z, dir] of [[s.endLo, s.lo, -1], [s.endHi, s.hi, 1]] as const) {
    if (!end) continue;
    const endFace = new Face(wood, [0, 0, z], [1, 0, 0], [0, 0, dir]);
    panelled(endFace, kick, F.x0, F.x1, [[F.x0 + 70, F.x1 - STILE]], { lo: false, hi: true, ownLo: false, ownHi: false });
  }
  // The bartender's side: plain boards, mostly behind the counter there.
  new Face(wood, [F.x0, 0, 0], [0, 0, 1], [-1, 0, 0]).front(s.lo, s.hi, 0, F.top, 0);
  b.detail(area, wood.geometry(), "#ffffff", KIND.mahogany);
  b.detail(area, kick.geometry(), DARK, KIND.paint);
  const far = new Mesh();
  const farKick = new Mesh();
  for (const [m, v0, v1] of [[farKick, 0, KICK.top], [far, KICK.top, F.top]] as const) {
    new Face(m, [F.x1, 0, 0], [0, 0, 1], [1, 0, 0]).front(s.lo, s.hi, v0, v1, 0);
    if (s.endLo) new Face(m, [0, 0, s.lo], [1, 0, 0], [0, 0, -1]).front(F.x0, F.x1, v0, v1, 0);
    if (s.endHi) new Face(m, [0, 0, s.hi], [1, 0, 0], [0, 0, 1]).front(F.x0, F.x1, v0, v1, 0);
  }
  b.standIn(area, far.geometry(), "#ffffff", KIND.mahogany);
  b.standIn(area, farKick.geometry(), DARK, KIND.paint);
}

const SHELF = { v0: 440, v1: 460 };
const CAB = { kick: 100, kickDepth: 20, frame: 3, rail: 40, depth: 250 };

/** The bartender's counter, along its working face (toward the back bar): cupboard doors and open shelves under the steel top. */
function underbarLength(b: Builder, area: number, s: Span) {
  const steel = new Mesh();
  const inside = new Mesh();
  const kick = new Mesh();
  const towels = new Mesh();
  const handles: THREE.BufferGeometry[] = [];
  const zl = s.endLo ? s.lo + 3 : s.lo;
  const zh = s.endHi ? s.hi - 3 : s.hi;
  steel.quad([U.x0 + 3, U.top, zl], [U.x1, U.top, zl], [U.x1, U.top, zh], [U.x0 + 3, U.top, zh], [0, 1, 0]);
  const legs = s.endHi ? { path: [[U.x1, s.hi], [U.x0, s.hi], [U.x0, s.lo]], normals: [[0, 1], [-1, 0]] } : s.endLo ? { path: [[U.x0, s.hi], [U.x0, s.lo], [U.x1, s.lo]], normals: [[-1, 0], [0, -1]] } : { path: [[U.x0, s.lo], [U.x0, s.hi]], normals: [[-1, 0]] };
  b.detail(area, edge(legs.path as [number, number][], legs.normals as [number, number][], APRON), "#ffffff", KIND.steel);
  const d0 = -CAB.frame;
  const face = new Face(steel, [U.x0, 0, 0], [0, 0, 1], [-1, 0, 0]);
  const cave = new Face(inside, [U.x0, 0, 0], [0, 0, 1], [-1, 0, 0]);
  const kickFace = new Face(kick, [U.x0, 0, 0], [0, 0, 1], [-1, 0, 0]);
  const top = U.top - 40;
  kickFace.front(zl, zh, 0, CAB.kick, -CAB.kickDepth);
  face.level(zl, zh, CAB.kick, -CAB.kickDepth, d0, -1);
  face.front(zl, zh, CAB.kick, CAB.kick + CAB.rail, d0);
  face.front(zl, zh, top - CAB.rail, top, d0);
  const v0 = CAB.kick + CAB.rail;
  const v1 = top - CAB.rail;
  const list = bays(zl, zh, s.endLo, s.endHi, 520).map(([a, c]) => [a - 25, c + 25] as [number, number]);
  let at = zl;
  for (const [a, c] of list) {
    face.front(at, a, v0, v1, d0);
    at = c;
    // Open shelves and cupboards by turns along the whole counter, wherever its lengths are cut.
    if (Math.round((a - U.z0) / 560) % 2 === 0) {
      cave.walls(a, c, v0, v1, d0, -CAB.depth);
      cave.front(a, c, v0, v1, -CAB.depth);
      cave.level(a, c, SHELF.v1, -CAB.depth, d0, 1);
      cave.level(a, c, SHELF.v0, -CAB.depth, d0, -1);
      face.front(a, c, SHELF.v0, SHELF.v1, d0);
      // Folded bar towels, stacked on the lower shelf and the upper.
      for (const [v, n] of [[v0, 5], [SHELF.v1, 3]] as const) {
        for (let k = 0; k < n; k++) {
          const w = 0.5 * (c - a) - 30;
          const zc = (a + c) / 2 + Math.sin(k * 2.3 + a) * 6;
          const xc = U.x0 + 140 + Math.cos(k * 1.7 + a) * 5;
          const tf = new Face(towels, [xc - 80, 0, 0], [0, 0, 1], [-1, 0, 0]);
          const y0 = v + k * 22;
          tf.front(zc - w / 2, zc + w / 2, y0, y0 + 21, 0);
          towels.quad([xc - 80, y0 + 21, zc - w / 2], [xc + 80, y0 + 21, zc - w / 2], [xc + 80, y0 + 21, zc + w / 2], [xc - 80, y0 + 21, zc + w / 2], [0, 1, 0]);
        }
      }
    } else {
      // A door hung a little behind the frame, a shadow gap round it, and a bar handle across its top.
      cave.walls(a, c, v0, v1, d0, -8);
      cave.front(a, c, v0, v1, -8);
      face.front(a + 2, c - 2, v0 + 2, v1 - 2, -4);
      handles.push(turn([[0, 0], [1.8, 0], [1.8, 150], [0, 150]], 10).rotateX(Math.PI / 2).translate(U.x0 + 1.9, v1 - 50, (a + c) / 2 - 75));
      for (const z of [(a + c) / 2 - 65, (a + c) / 2 + 65]) handles.push(turn([[1.4, 0], [1.4, 2.2]], 8).rotateZ(-Math.PI / 2).translate(U.x0 + 1.9, v1 - 50, z));
    }
  }
  face.front(at, zh, v0, v1, d0);
  // Its ends, seen from the room, are panelled in the bar's wood.
  const ends = new Mesh();
  for (const [end, z, dir] of [[s.endLo, s.lo, -1], [s.endHi, s.hi, 1]] as const) {
    if (end) new Face(ends, [0, 0, z - dir * CAB.frame], [1, 0, 0], [0, 0, dir]).front(U.x0 + CAB.frame, U.x1, 0, top, 0);
  }
  b.detail(area, ends.geometry(), "#ffffff", KIND.mahogany);
  new Face(steel, [U.x1, 0, 0], [0, 0, 1], [1, 0, 0]).front(s.lo, s.hi, 0, U.top, 0);
  b.detail(area, steel.geometry(), "#ffffff", KIND.steel);
  b.detail(area, inside.geometry(), "#5a5d62", KIND.steel);
  b.detail(area, kick.geometry(), DARK, KIND.paint);
  b.detail(area, towels.geometry(), "#ece8de", KIND.linen);
  for (const h of handles) b.detail(area, h, "#ffffff", KIND.steel);
  b.standIn(area, block(U.x0, U.x1, 0, U.top, s, { top: true, back: true }), "#ffffff", KIND.steel);
}

/** The brass foot rail: a tube, its ends closed by chamfered discs inside its box. */
function railLength(b: Builder, area: number, s: Span) {
  const r = rail.half;
  const tube = (segments: number, lo: number, hi: number, endLo: boolean, endHi: boolean) => {
    const profile: [number, number][] = [];
    if (endLo) profile.push([0, lo], [r - 3, lo], [r - 0.8, lo + 0.6], [r, lo + 2.5]);
    else profile.push([r, lo]);
    if (endHi) profile.push([r, hi - 2.5], [r - 0.8, hi - 0.6], [r - 3, hi], [0, hi]);
    else profile.push([r, hi]);
    return turn(profile, segments).rotateX(Math.PI / 2).translate(rail.x, RAIL_Y, 0);
  };
  b.detail(area, tube(28, s.lo, s.hi, s.endLo, s.endHi), "#ffffff", KIND.brass);
  b.standIn(area, tube(6, s.lo, s.hi, s.endLo, s.endHi), "#ffffff", KIND.brass);
}

/** A bracket from the bar's front to the rail: a brass arm with rounded edges. */
function bracket(b: Builder, s: Solid) {
  const f = s.footprint as { x: number; z: number; hx: number; hz: number };
  const y0 = s.bottom ?? 0;
  const y1 = s.top.kind === "flat" ? s.top.y : y0;
  const g = new RoundedBoxGeometry(f.hx * 2, y1 - y0, f.hz * 2, 2, 3).translate(f.x, (y0 + y1) / 2, f.z);
  for (const { area } of pieces(s)) b.detail(area, g, "#ffffff", KIND.brass);
}

/** Draws the bar's body: whichever of its solids it is given. */
export function buildBarBody(b: Builder, solids: readonly Solid[]) {
  for (const solid of solids) {
    if (solid.name === "bracket") {
      bracket(b, solid);
      continue;
    }
    for (const { piece, area } of pieces(solid)) {
      if (solid.name === "zinc") zincLength(b, area, spanOf(piece, Z.z0, Z.z1));
      else if (solid.name === "bar front") frontLength(b, area, spanOf(piece, F.z0, F.z1));
      else if (solid.name === "underbar") underbarLength(b, area, spanOf(piece, U.z0, U.z1));
      else if (solid.name === "foot rail") {
        const f = solid.footprint as { z: number; hz: number };
        railLength(b, area, spanOf(piece, f.z - f.hz, f.z + f.hz));
      }
    }
  }
}

/** The names of the solids the bar's body draws. */
export const BODY = new Set(["zinc", "bar front", "underbar", "foot rail", "bracket"]);
