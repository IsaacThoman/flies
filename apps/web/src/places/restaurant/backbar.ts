// The back bar against the left wall: mahogany cabinets with panelled doors,
// the drinks fridge's three glass doors set in their face and lit inside,
// the shelves of bottles above on brass brackets, the old mirror sunk into
// the wall behind them under a cornice, and the bottles on the window's
// ledge. Everything the fly can reach is at the world's felt shape: the
// cabinets' face is flat with everything in it cut in (backbar-face.ts),
// the mirror and the brackets are behind the wall's face, the cornice above
// the fly's ceiling. Detail is gathered in sheets (backbar-sheet.ts) and
// handed to each area in one go; far off the cabinets are their felt boxes
// with the panels sunk in, the shelves boards, and each bottle a spike.

import * as THREE from "three";
import { BOTTLES, ZINC_BAR } from "@fly/world";
import { random } from "../../scene/build.ts";
import { areaAt, areaNamed } from "./areas.ts";
import type { Builder } from "./builder.ts";
import { box } from "./geometry.ts";
import { KIND } from "./kinds.ts";
import type { Part } from "./parts.ts";
import { FRIDGE, OUT_OF_REACH, WAINSCOT } from "./plan.ts";
import { BB_KINDS, COLD_KINDS, bottles, coldBottles, farBottles, stock } from "./backbar-bottles.ts";
import type { Bottle } from "./backbar-bottles.ts";
import { cutFace } from "./backbar-face.ts";
import type { Cut, Plane } from "./backbar-face.ts";
import { Sheets, look } from "./backbar-sheet.ts";
import type { Look } from "./backbar-sheet.ts";

const { back, fridge, shelves } = ZINC_BAR;
/** The cabinets' face, and the wall behind them. */
const FACE = back.x1;
const WALL = back.x0;

/** The cabinets' face, up from the floor: the toe kick, the doors between their rails, the groove under the top. */
const KICK = { top: 90, depth: 60, inset: 20 };
const DOORS = { y0: 130, y1: 830, gap: 4, stile: 65, panel: 8, bevel: 20 };
const GROOVE = { y0: 855, y1: 859 };
/** The top's front edge, rounded over this much. */
const ROUND = 1.5;

/** The fridge in the face: three doors, their frames (stiles) and glass, the gaps between them, the pulls cut into the stiles. */
const COLD = { y0: 95, y1: 855, doors: 3, stile: 50, gap: 4, glass: 6, pull: { half: 8, y0: 330, y1: 630, depth: 18 } };
/** Inside it: from the cabinets' back to the glass, a wire shelf, the light along its top. */
const INSIDE = { x0: WALL + 40, x1: FACE - COLD.glass - 0.5, z0: fridge.z0 + 10, z1: fridge.z1 - 10, y0: 100, y1: 850, shelf: 470, wire: 3, light: 836 };

/** The mirror sunk into the wall behind the shelves, its reveal sloping in to it, three pilasters dividing it; the cornice over it. */
export const BACK_MIRROR = { z0: shelves.z0, z1: shelves.z1, y0: WAINSCOT.rail, y1: OUT_OF_REACH, depth: 30, reveal: 40, pilaster: 40, pilasters: 3 };
/** The cornice's profile: out from the wall, and up from the mirror's head. */
const CORNICE: readonly [number, number][] = [
  [0, 0],
  [24, 0],
  [24, 18],
  [40, 26],
  [52, 44],
  [52, 66],
  [68, 74],
  [68, 104],
  [0, 104],
];

const MAHOGANY = look(KIND.mahogany, "#ffffff");
const PANEL = look(KIND.mahogany, "#d8c8bc");
const DARK = look(KIND.mahogany, "#3a2a20");
const SHADOW = look(KIND.mahogany, "#1e140e");
const BRASS = look(KIND.brass, "#ffffff");
const FRAME = look(KIND.steel, "#3a3a3c");
const PULL = look(KIND.steel, "#c8c8c8");
const GLASS = look(KIND.fridgeGlass, "#ffffff");
const LINING = look(BB_KINDS.inside, "#e8eef2");
const WIRE = look(BB_KINDS.cold, "#9aa0a4");
const MIRROR = look(KIND.mirror, "#ffffff");

const AREA_1 = areaNamed("back bar 1");
const AREA_2 = areaNamed("back bar 2");
/** Where along the bar the first back-bar area gives way to the second. */
const SPLIT = AREA_1.z1;
const areaOfZ = (z: number) => (z < SPLIT ? AREA_1.id : AREA_2.id);
/** The z ranges of the back bar's two areas. */
const RANGES: readonly [number, number, number][] = [
  [back.z0, SPLIT, AREA_1.id],
  [SPLIT, back.z1, AREA_2.id],
];

/**
 * The panelled doors either side of the fridge, two to its left and three to
 * its right: each door's edges (the gaps between them), its sunk panel, and
 * the brass cup pull in its stile toward the middle, where the hand goes.
 */
const CABINETS = ([[back.z0 + 50, fridge.z0 - 50, 2], [fridge.z1 + 50, back.z1 - 50, 3]] as const).map(([o0, o1, n]) => {
  const g = DOORS.gap;
  const w = (o1 - o0) / n;
  const st = DOORS.stile;
  const doors = Array.from({ length: n }, (_, i) => {
    const d0 = o0 + i * w + (i === 0 ? g : g / 2);
    const d1 = o0 + (i + 1) * w - (i === n - 1 ? g : g / 2);
    const panel = { u0: d0 + st, u1: d1 - st, v0: DOORS.y0 + g + st, v1: DOORS.y1 - g - st };
    return { d0, d1, panel, pull: (d0 + d1) / 2 < (o0 + o1) / 2 ? d1 - st / 2 : d0 + st / 2 };
  });
  return { o0, o1, doors };
});

/** The cabinets' front, at the face: everything cut into it. */
function front(s: Sheets) {
  const cuts: Cut[] = [];
  const add = (u0: number, u1: number, v0: number, v1: number, depth: number, floor: Look, wall?: Look, bevel?: number) => cuts.push({ u0, u1, v0, v1, depth, floor, wall, bevel });
  add(back.z0 + KICK.inset, SPLIT, 0, KICK.top, KICK.depth, SHADOW, DARK);
  add(SPLIT, back.z1 - KICK.inset, 0, KICK.top, KICK.depth, SHADOW, DARK);
  add(back.z0 + 4, back.z1 - 4, GROOVE.y0, GROOVE.y1, 4, DARK);
  for (const { o0, o1, doors } of CABINETS) {
    const g = DOORS.gap;
    add(o0, o1, DOORS.y0, DOORS.y0 + g, 5, SHADOW, DARK);
    add(o0, o1, DOORS.y1 - g, DOORS.y1, 5, SHADOW, DARK);
    for (const d of doors) add(d.d0 - g, d.d0, DOORS.y0, DOORS.y1, 5, SHADOW, DARK);
    add(o1 - g, o1, DOORS.y0, DOORS.y1, 5, SHADOW, DARK);
    for (const d of doors) {
      const p = d.panel;
      add(p.u0, p.u1, p.v0, p.v1, DOORS.panel, PANEL, MAHOGANY, DOORS.bevel);
      add(d.pull - 11, d.pull + 11, 689, 711, 9, BRASS);
    }
  }
  // The fridge: its doors' frames flush with the face, the gaps round and between them, the glass a little in.
  const dw = (fridge.z1 - fridge.z0) / COLD.doors;
  const g = COLD.gap;
  add(fridge.z0, fridge.z1, COLD.y0, COLD.y1, 0, FRAME);
  add(fridge.z0, fridge.z1, COLD.y0, COLD.y0 + g, 8, SHADOW, FRAME);
  add(fridge.z0, fridge.z1, COLD.y1 - g, COLD.y1, 8, SHADOW, FRAME);
  for (let i = 0; i <= COLD.doors; i++) {
    const at = fridge.z0 + i * dw;
    const a = i === 0 ? at : i === COLD.doors ? at - g : at - g / 2;
    add(a, a + g, COLD.y0, COLD.y1, 8, SHADOW, FRAME);
  }
  for (let i = 0; i < COLD.doors; i++) {
    const d0 = fridge.z0 + i * dw;
    const d1 = d0 + dw;
    add(d0 + COLD.stile, d1 - COLD.stile, COLD.y0 + COLD.stile, COLD.y1 - COLD.stile, COLD.glass, GLASS, FRAME);
    // Pulls cut into the stiles: the first two doors meet in the middle, the third opens from its left.
    const c = i === 0 ? d1 - COLD.stile / 2 - 1 : d0 + COLD.stile / 2 + 1;
    const p = COLD.pull;
    add(c - p.half, c + p.half, p.y0, p.y1, p.depth, PULL, FRAME);
  }
  const plane: Plane = { at: [FACE, 0, 0], u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0] };
  cutFace(s, plane, back.z0, back.z1, 0, back.top - ROUND, MAHOGANY, cuts, areaOfZ, [SPLIT]);
}

/** The cabinets' ends, each a panel sunk in, and their top with its front edge rounded over. */
function endsAndTop(s: Sheets) {
  for (const [z, n, area] of [[back.z0, -1, AREA_1.id], [back.z1, 1, AREA_2.id]] as const) {
    const plane: Plane = { at: [FACE, 0, z], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, n] };
    const width = FACE - WALL;
    const cuts: Cut[] = [
      { u0: 60, u1: width - 60, v0: 150, v1: 780, depth: DOORS.panel, floor: PANEL, wall: MAHOGANY, bevel: DOORS.bevel },
      { u0: 4, u1: width - 4, v0: GROOVE.y0, v1: GROOVE.y1, depth: 4, floor: DARK },
    ];
    cutFace(s, plane, 0, width, 0, back.top, MAHOGANY, cuts, () => area);
  }
  for (const [z0, z1, area] of RANGES) {
    const t = back.top;
    s.quad(area, [WALL, t, z0], [FACE - ROUND, t, z0], [FACE - ROUND, t, z1], [WALL, t, z1], MAHOGANY, [0, 1, 0]);
    s.quad(area, [FACE - ROUND, t, z0], [FACE, t - ROUND, z0], [FACE, t - ROUND, z1], [FACE - ROUND, t, z1], MAHOGANY, [1, 1, 0]);
  }
}

/** The fridge's inside, behind the glass: its lining, the light along its top, the wire shelf, and the bottles in rows on its floor and shelf. */
function inside(s: Sheets) {
  const { x0, x1, z0, z1, y0, y1 } = INSIDE;
  const zs = [z0, SPLIT, z1];
  for (let i = 0; i < 2; i++) {
    const a = zs[i];
    const b = zs[i + 1];
    const area = areaOfZ((a + b) / 2);
    s.quad(area, [x0, y0, a], [x0, y1, a], [x0, y1, b], [x0, y0, b], LINING, [1, 0, 0]);
    s.quad(area, [x0, y0, a], [x1, y0, a], [x1, y0, b], [x0, y0, b], LINING, [0, 1, 0]);
    s.quad(area, [x0, y1, a], [x1, y1, a], [x1, y1, b], [x0, y1, b], LINING, [0, -1, 0]);
    // The light: a bar along the top, just behind the doors.
    s.box(area, x1 - 30, INSIDE.light, a, x1 - 12, y1, b, LINING, "+x-x-y");
    // The wire shelf's front and back rails.
    const sh = INSIDE.shelf;
    s.box(area, x1 - 24, sh - 6, a, x1 - 18, sh, b, WIRE, "+x-x+y-y");
    s.box(area, x0 + 10, sh - 6, a, x0 + 16, sh, b, WIRE, "+x+y-y");
  }
  s.quad(areaOfZ(z0 + 1), [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], LINING, [0, 0, 1]);
  s.quad(areaOfZ(z1 - 1), [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], LINING, [0, 0, -1]);
  // The shelf's wires, front to back.
  const w = INSIDE.wire;
  for (let z = z0 + 20; z < z1 - 10; z += 28) s.box(areaOfZ(z), x0 + 10, INSIDE.shelf - w, z - w / 2, x1 - 18, INSIDE.shelf, z + w / 2, WIRE, "+y-y+z-z");
  // Two rows on each level, the back row between the front's, one or two gone here and there.
  const rand = random(80).next;
  const placed: { which: number; x: number; z: number; on: number; area: number; yaw: number }[] = [];
  const levels = [
    { on: y0, kinds: [1, 2] },
    { on: INSIDE.shelf, kinds: [0, 3] },
  ];
  for (const { on, kinds } of levels) {
    for (const [x, offset] of [[x1 - 64, 0], [x1 - 170, 0.5]] as const) {
      const step = 84;
      for (let z = z0 + 48 + offset * step; z < z1 - 40; z += step) {
        if (Math.abs(z - SPLIT) < 44 || rand() < 0.1) continue;
        const which = kinds[rand() < 0.6 ? 0 : 1] % COLD_KINDS;
        placed.push({ which, x: x + (rand() - 0.5) * 10, z: z + (rand() - 0.5) * 8, on: on - 0.1, area: areaOfZ(z), yaw: rand() * Math.PI * 2 });
      }
    }
  }
  coldBottles(s, placed);
}

/** The shelves: mahogany boards from the mirror's recess out, their front edges rounded over, in a piece for each area. */
function shelfBoards(s: Sheets) {
  const x0 = WALL - BACK_MIRROR.depth + 1;
  const x1 = shelves.x1;
  for (const top of shelves.tops) {
    const y0 = top - shelves.thick;
    for (const [a0, a1] of [[shelves.z0, SPLIT], [SPLIT, shelves.z1]]) {
      const area = areaOfZ((a0 + a1) / 2);
      s.quad(area, [x0, top, a0], [x1 - ROUND, top, a0], [x1 - ROUND, top, a1], [x0, top, a1], MAHOGANY, [0, 1, 0]);
      s.quad(area, [x1 - ROUND, top, a0], [x1, top - ROUND, a0], [x1, top - ROUND, a1], [x1 - ROUND, top, a1], MAHOGANY, [1, 1, 0]);
      s.quad(area, [x1, top - ROUND, a0], [x1, y0 + ROUND, a0], [x1, y0 + ROUND, a1], [x1, top - ROUND, a1], MAHOGANY, [1, 0, 0]);
      s.quad(area, [x1, y0 + ROUND, a0], [x1 - ROUND, y0, a0], [x1 - ROUND, y0, a1], [x1, y0 + ROUND, a1], MAHOGANY, [1, -1, 0]);
      s.quad(area, [x0, y0, a0], [x1 - ROUND, y0, a0], [x1 - ROUND, y0, a1], [x0, y0, a1], MAHOGANY, [0, -1, 0]);
    }
    s.box(areaOfZ(shelves.z0 + 1), x0, y0, shelves.z0, x1, top, shelves.z0, MAHOGANY, "-z");
    s.box(areaOfZ(shelves.z1 - 1), x0, y0, shelves.z1, x1, top, shelves.z1, MAHOGANY, "+z");
  }
}

/** The mirror in the wall, its reveal and pilasters, the brass brackets under the shelves, the cornice: always drawn, as the room is. */
function mirror(b: Builder) {
  // Each its own kind: the shell takes one at a time.
  const s = new Sheets();
  const glass = new Sheets();
  const brass = new Sheets();
  const m = BACK_MIRROR;
  const d = m.depth;
  const r = m.reveal;
  const x = WALL - d;
  const o = [[m.z0, m.y0], [m.z1, m.y0], [m.z1, m.y1], [m.z0, m.y1]];
  const n = [[m.z0 + r, m.y0 + r], [m.z1 - r, m.y0 + r], [m.z1 - r, m.y1 - r], [m.z0 + r, m.y1 - r]];
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    s.quad(0, [WALL, o[k][1], o[k][0]], [WALL, o[k1][1], o[k1][0]], [x, n[k1][1], n[k1][0]], [x, n[k][1], n[k][0]], MAHOGANY, [1, 0, 0]);
  }
  const step = (m.z1 - m.z0) / (m.pilasters + 1);
  const p = m.pilaster;
  const edges = [m.z0 + r, ...Array.from({ length: m.pilasters }, (_, i) => m.z0 + step * (i + 1)), m.z1 - r];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = i === 0 ? edges[i] : edges[i] + p;
    const c = i === edges.length - 2 ? edges[i + 1] : edges[i + 1] - p;
    glass.quad(0, [x, m.y0 + r, a], [x, m.y1 - r, a], [x, m.y1 - r, c], [x, m.y0 + r, c], MIRROR, [1, 0, 0]);
  }
  for (let i = 1; i <= m.pilasters; i++) {
    const z = m.z0 + step * i;
    s.box(0, x, m.y0 + 8, z - p, WALL - 6, m.y1 - 8, z + p, MAHOGANY, "+x+z-z");
    for (const top of shelves.tops) {
      const under = top - shelves.thick;
      brass.box(0, x, under - 60, z - p + 10, WALL - 0.3, under + 6, z + p - 10, BRASS, "+x-y+z-z");
    }
  }
  // The cornice, above the fly's reach: a profile swept along the wall, its ends closed.
  const z0 = m.z0 - 40;
  const z1 = m.z1 + 40;
  for (let i = 0; i < CORNICE.length - 1; i++) {
    const [a0, h0] = CORNICE[i];
    const [a1, h1] = CORNICE[i + 1];
    const out: [number, number, number] = [h1 - h0, -(a1 - a0), 0];
    s.quad(0, [WALL + a0, m.y1 + h0, z0], [WALL + a1, m.y1 + h1, z0], [WALL + a1, m.y1 + h1, z1], [WALL + a0, m.y1 + h0, z1], MAHOGANY, [out[0] || 0.001, out[1], 0]);
    if (h1 > h0) {
      for (const [z, nz] of [[z0, -1], [z1, 1]] as const) s.quad(0, [WALL, m.y1 + h0, z], [WALL + a0, m.y1 + h0, z], [WALL + a1, m.y1 + h1, z], [WALL, m.y1 + h1, z], MAHOGANY, [0, 0, nz]);
    }
  }
  b.shell(s.sheet(0, 0).geometry(), "#ffffff", KIND.mahogany);
  b.shell(glass.sheet(0, 0).geometry(), "#ffffff", KIND.mirror);
  b.shell(brass.sheet(0, 0).geometry(), "#ffffff", KIND.brass);
}

/** Every bottle the back bar holds, with its area; their labels face the room. */
function placed(): Bottle[] {
  return BOTTLES.map((p) => {
    const area = areaAt(p.x, p.on + 1, p.z);
    // On the window's ledge they face back into the room.
    const yaw = p.z > back.z1 ? Math.PI / 2 : 0;
    return { ...p, area, yaw };
  });
}

/** A stand-in's colour by how deep in its face it is: the panels a little darker, the toe kick dark. */
const panelColor = PANEL.color.clone();
const shadowColor = SHADOW.color.clone();
const white = new THREE.Color("#ffffff");
const byDepth = (p: THREE.Vector3) => (p.x < FACE - KICK.depth / 2 ? shadowColor : p.x < FACE - 0.5 ? panelColor : white);

/** The far stand-ins: the cabinets as their felt boxes with the doors' panels and the toe kick sunk in, the fridge's doors a glowing face, the shelves as boards. */
function farBoxes(b: Builder) {
  const plane: Plane = { at: [FACE, 0, 0], u: [0, 0, 1], v: [0, 1, 0], n: [1, 0, 0] };
  const panels = CABINETS.flatMap((c) => c.doors.map((d) => ({ ...d.panel, depth: DOORS.panel, floor: PANEL })));
  for (const [z0, z1, area] of RANGES) {
    const s = new Sheets();
    const at = () => area;
    const kick = (a: number, c: number): Cut => ({ u0: Math.max(a, back.z0 + KICK.inset), u1: Math.min(c, back.z1 - KICK.inset), v0: 0, v1: KICK.top, depth: KICK.depth, floor: SHADOW });
    s.quad(area, [WALL, back.top, z0], [FACE, back.top, z0], [FACE, back.top, z1], [WALL, back.top, z1], MAHOGANY, [0, 1, 0]);
    const f0 = Math.max(z0, fridge.z0);
    const f1 = Math.min(z1, fridge.z1);
    const spans: [number, number][] = f1 > f0 ? [[z0, f0], [f1, z1]] : [[z0, z1]];
    for (const [a, c] of spans) {
      if (c - a > 1) cutFace(s, plane, a, c, 0, back.top, MAHOGANY, [kick(a, c), ...panels.filter((p) => p.u0 > a && p.u1 < c)], at);
    }
    if (f1 > f0) {
      cutFace(s, plane, f0, f1, 0, FRIDGE.y0, MAHOGANY, [kick(f0, f1)], at);
      s.quad(area, [FACE, FRIDGE.y1, f0], [FACE, back.top, f0], [FACE, back.top, f1], [FACE, FRIDGE.y1, f1], MAHOGANY, [1, 0, 0]);
      const glow = new Sheets();
      glow.quad(area, [FACE, FRIDGE.y0, f0], [FACE, FRIDGE.y1, f0], [FACE, FRIDGE.y1, f1], [FACE, FRIDGE.y0, f1], MAHOGANY, [1, 0, 0]);
      b.standIn(area, glow.sheet(area, 0).geometry(), "#ffffff", KIND.fridge);
    }
    if (z0 === back.z0) s.quad(area, [WALL, 0, z0], [FACE, 0, z0], [FACE, back.top, z0], [WALL, back.top, z0], MAHOGANY, [0, 0, -1]);
    if (z1 === back.z1) s.quad(area, [WALL, 0, z1], [FACE, 0, z1], [FACE, back.top, z1], [WALL, back.top, z1], MAHOGANY, [0, 0, 1]);
    b.standIn(area, s.sheet(area, 0).geometry(), byDepth, KIND.mahogany);
    for (const top of shelves.tops) b.standIn(area, box(WALL - BACK_MIRROR.depth + 1, top - shelves.thick, Math.max(z0, shelves.z0), shelves.x1, top, Math.min(z1, shelves.z1)), "#ffffff", KIND.mahogany);
  }
}

export const backbar: Part = {
  build(b) {
    const s = new Sheets();
    front(s);
    endsAndTop(s);
    inside(s);
    shelfBoards(s);
    const stocked = stock(placed(), 23);
    bottles(s, stocked);
    s.flush(b);
    farBoxes(b);
    farBottles(b, stocked);
    mirror(b);
  },
  solid: {
    head: /* glsl */ `
const int K_BB_INSIDE = ${BB_KINDS.inside};
const int K_BB_COLD = ${BB_KINDS.cold};
`,
    color: /* glsl */ `
if (rK == K_BB_INSIDE) {
  // Its own light is what shows: the room's hardly reaches in through the glass.
  diffuseColor.rgb *= 0.35;
  rRough = 0.7;
  rCoat = 0.0;
}
if (rK == K_BB_COLD) {
  // Seen against the light behind them, the fridge's bottles are dark shapes.
  diffuseColor.rgb *= 0.3;
  rRough = 0.25;
  rCoat = 0.5;
}
`,
    emissive: /* glsl */ `
if (rK == K_BB_INSIDE || rK == K_BB_COLD) {
  // The fridge's own cool light: a bar of it along the top behind the doors, washing down the lining and through the bottles.
  vec3 bbCool = vec3(0.72, 0.86, 1.0) * uFridge.b;
  float bbUp = smoothstep(${INSIDE.y0.toFixed(1)}, ${INSIDE.y1.toFixed(1)}, vWorld.y);
  if (rK == K_BB_INSIDE) {
    float bbBar = step(${INSIDE.light.toFixed(1)} - 0.5, vWorld.y) * step(vWorld.y, ${(INSIDE.y1 - 0.5).toFixed(1)}) * step(${(INSIDE.x1 - 31).toFixed(1)}, vWorld.x);
    rEmit += bbCool * (0.16 + 0.12 * bbUp + bbBar * 1.2);
  } else {
    vec3 bbView = normalize(cameraPosition - vWorld);
    float bbRim = pow(1.0 - abs(dot(rN, bbView)), 3.0);
    // Light from behind comes through the glass in its own colour; its edges catch the bar above.
    rEmit += bbCool * (diffuseColor.rgb * 0.25 + bbRim * (0.04 + 0.12 * bbUp) + max(rN.y, 0.0) * 0.04);
  }
}
`,
  },
  clear: {
    head: /* glsl */ `
const int K_BB_FLINT = ${BB_KINDS.flint};
const int K_BB_GIN = ${BB_KINDS.gin};
const int K_BB_DARK = ${BB_KINDS.dark};
`,
    color: /* glsl */ `
if (rK == K_BB_FLINT) diffuseColor.rgb *= 0.06;
if (rK == K_BB_GIN) diffuseColor.rgb *= 0.14;
if (rK == K_BB_DARK) rRough = 0.03;
`,
    final: /* glsl */ `
if (rK == K_BB_FLINT) rAlpha = 0.06 + edge * 0.6 + min(dot(outgoingLight, vec3(0.1)), 0.2);
if (rK == K_BB_GIN) rAlpha = 0.16 + edge * 0.55 + min(dot(outgoingLight, vec3(0.12)), 0.25);
// A full bottle of red wine lets almost nothing through but at its edges, where the glass is thin against the light.
if (rK == K_BB_DARK) rAlpha = 0.96 - edge * 0.2;
`,
  },
};

