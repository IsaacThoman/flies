// The back bar's bottles: a café's water, juices, oil and coffee syrups.
// Each of the world's kinds (water, juice, square, syrup) is turned once at
// exactly its felt shape (the body's column, the shoulder's dome, the neck
// and its rounded top), cut into what it is made of (glass empty and full,
// label, cap) and copied wherever a bottle of it stands, each copy its own
// drink. Far off, a bottle is the
// same in a few dozen triangles and the same looks, so it hardly changes
// as its detail comes and goes. The fridge's bottles behind its glass are
// smaller, plainer and opaque: dark shapes against its light.

import * as THREE from "three";
import { BOTTLE_SHAPES } from "@fly/world";
import type { BottleKind } from "@fly/world";
import { random } from "../../scene/build.ts";
import type { Builder } from "./builder.ts";
import { CLEAR, KIND } from "./kinds.ts";
import { Sheet, look } from "./backbar-sheet.ts";
import type { Look, Sheets } from "./backbar-sheet.ts";

/** How far inside its felt shape a bottle is drawn (mm). */
const INSET = 0.2;

/** What each part of a bottle is: below 10 glass (clear), from 10 opaque. */
const EMPTY = 0;
const FULL = 1;
const LABEL = 10;
const BAND = 11;
const CAP = 12;
const COLLAR = 13;

type Row = { a: number; y: number; square: boolean };
/** A band's quad as two triangles, counter-clockwise seen from outside: round the axis the other way to the angle. */
const CORNERS = [0, 2, 1, 0, 3, 2];
/** A triangle's corners in the order made, and the other way round. */
const ORDER = [0, 1, 2];
const FLIPPED = [0, 2, 1];
type Piece = { pos: Float32Array; nor: Float32Array; role: Uint8Array; count: number };
type Gather = { pos: number[]; nor: number[]; role: number[] };
type Template = { clear: Piece; solid: Piece };

/**
 * Rows of a profile turned round the y axis (`a` its radius, or a square's
 * half-width), each band between rows cut into `segments` and given a role
 * by `role(y, angle from +x)`. Round bands are shaded smooth (but for creases),
 * square ones flat.
 */
function turn(rows: readonly Row[], segments: number, role: (y: number, angle: number) => number): Template {
  const clear: Gather = { pos: [], nor: [], role: [] };
  const solid: Gather = { pos: [], nor: [], role: [] };
  const dir = (th: number, square: boolean) => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    const m = square ? Math.max(Math.abs(c), Math.abs(s)) : 1;
    return [c / m, s / m];
  };
  // Each band's slope as a normal (out, up), and each row's for the band above and below it.
  const bands = rows.slice(1).map((r, i) => {
    const da = r.a - rows[i].a;
    const dy = r.y - rows[i].y;
    const l = Math.hypot(da, dy) || 1;
    return [dy / l, -da / l];
  });
  const smooth = (i: number, k: number) => {
    // Row k's normal on band i's side, shared with the next band unless they meet at a crease.
    const j = k === i ? i - 1 : i + 1;
    const a = bands[i];
    const b = bands[j];
    if (!b || rows[k].square || a[0] * b[0] + a[1] * b[1] < 0.8) return a;
    const l = Math.hypot(a[0] + b[0], a[1] + b[1]);
    return [(a[0] + b[0]) / l, (a[1] + b[1]) / l];
  };
  for (let i = 0; i < rows.length - 1; i++) {
    const r0 = rows[i];
    const r1 = rows[i + 1];
    const n0 = smooth(i, i);
    const n1 = smooth(i, i + 1);
    const flat = r0.square || r1.square;
    for (let j = 0; j < segments; j++) {
      const t0 = (j / segments) * Math.PI * 2;
      const t1 = ((j + 1) / segments) * Math.PI * 2;
      const tm = (t0 + t1) / 2;
      const r = role((r0.y + r1.y) / 2, Math.atan2(Math.sin(tm), Math.cos(tm)));
      const out = r < LABEL ? clear : solid;
      const [c00, s00] = dir(t0, r0.square);
      const [c01, s01] = dir(t1, r0.square);
      const [c10, s10] = dir(t0, r1.square);
      const [c11, s11] = dir(t1, r1.square);
      const p = [
        [r0.a * c00, r0.y, r0.a * s00],
        [r0.a * c01, r0.y, r0.a * s01],
        [r1.a * c11, r1.y, r1.a * s11],
        [r1.a * c10, r1.y, r1.a * s10],
      ];
      let ns: number[][];
      if (flat) {
        // Outward: the quad runs 0, 3, 2, 1 counter-clockwise seen from outside.
        const ux = p[2][0] - p[0][0];
        const uy = p[2][1] - p[0][1];
        const uz = p[2][2] - p[0][2];
        const vx = p[1][0] - p[3][0];
        const vy = p[1][1] - p[3][1];
        const vz = p[1][2] - p[3][2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
        ns = [[nx, ny, nz], [nx, ny, nz], [nx, ny, nz], [nx, ny, nz]];
      } else {
        ns = [
          [Math.cos(t0) * n0[0], n0[1], Math.sin(t0) * n0[0]],
          [Math.cos(t1) * n0[0], n0[1], Math.sin(t1) * n0[0]],
          [Math.cos(t1) * n1[0], n1[1], Math.sin(t1) * n1[0]],
          [Math.cos(t0) * n1[0], n1[1], Math.sin(t0) * n1[0]],
        ];
      }
      for (const k of CORNERS) {
        out.pos.push(p[k][0], p[k][1], p[k][2]);
        out.nor.push(ns[k][0], ns[k][1], ns[k][2]);
        out.role.push(r);
      }
    }
  }
  const piece = (g: Gather): Piece => ({ pos: new Float32Array(g.pos), nor: new Float32Array(g.nor), role: new Uint8Array(g.role), count: g.role.length });
  return { clear: piece(clear), solid: piece(solid) };
}

/** Where on each kind its label, band, collar and top are, by height above what it stands on, and how far round the label goes. */
const DRESS: Readonly<Record<BottleKind, { label: [number, number, number]; band?: [number, number]; collar?: [number, number]; cap: number }>> = {
  // Mineral water: a broad label with a band of colour over it, a screw cap.
  water: { label: [60, 150, 1.26], band: [150, 162], cap: 258 },
  // Juice: a label nearly all the way round, a wide screw cap.
  juice: { label: [30, 110, 1.5], cap: 234 },
  // Oil or a syrup in a square bottle: the label on its face, a collar on the neck, a screw cap.
  square: { label: [58, 150, 0.53], collar: [222, 234], cap: 244 },
  // A coffee syrup's: a narrow label, a collar, a screw cap.
  syrup: { label: [80, 172, 0.95], collar: [268, 278], cap: 290 },
};

/** The rows of a kind's profile at its felt shape, with rows where it is filled to and where its dress changes. */
function profile(kind: BottleKind, fill: number): Row[] {
  const s = BOTTLE_SHAPES[kind];
  const dress = DRESS[kind];
  const square = kind === "square";
  // The felt body: a column of radius r (a box of half 0.75 r), its dome a power-1 shoulder 0.6 r high; the neck a column topped by a half-ellipse.
  const span = square ? s.r * 0.75 : s.r;
  const R = span - INSET;
  const h = s.r * 0.6;
  const yb = s.body - h;
  const n = s.neck - INSET;
  const rows: Row[] = [
    { a: R - 3, y: -0.1, square },
    { a: R - 0.8, y: 1.2, square },
    { a: R, y: 4, square },
  ];
  const marks = [dress.label[0], dress.label[1], ...(dress.band ?? []), fill].filter((y) => y > 4 && y < yb - 6).sort((a, b) => a - b);
  for (const y of new Set(marks)) rows.push({ a: R, y, square });
  rows.push({ a: R, y: yb - 6, square }, { a: R - 1, y: yb, square });
  // The shoulder, at the dome's height just outside each radius so it stays within it.
  const K = 7;
  for (let k = 1; k <= K; k++) {
    const a = R - 1 - ((R - 1 - n) * k) / K;
    rows.push({ a, y: yb + h * (1 - ((a + INSET) / span) ** 2), square });
  }
  const neck0 = rows[rows.length - 1].y;
  if (square) rows.push({ a: n, y: neck0 + 0.01, square: false });
  const yc = s.top - s.neck * 0.5;
  const neckMarks = [fill, ...(dress.collar ?? []), dress.cap, yc].filter((y) => y > neck0 + 0.5 && y <= yc).sort((a, b) => a - b);
  for (const y of new Set(neckMarks)) rows.push({ a: n, y, square: false });
  for (const t of [0.45, 0.75, 0.93, 1]) rows.push({ a: t < 1 ? n * Math.sqrt(1 - t * t) : 0, y: yc + (s.neck * 0.5 - INSET) * t, square: false });
  return rows;
}

const templates = new Map<string, Template>();

/** A kind's template filled to `fill` mm. */
function template(kind: BottleKind, fill: number) {
  const key = `${kind}:${fill}`;
  let t = templates.get(key);
  if (t) return t;
  const dress = DRESS[kind];
  const square = kind === "square";
  t = turn(profile(kind, fill), square ? 24 : 20, (y, angle) => {
    if (y > dress.cap) return CAP;
    if (dress.collar && y > dress.collar[0] && y < dress.collar[1]) return COLLAR;
    if (y > dress.label[0] && y < dress.label[1] && Math.abs(angle) < dress.label[2]) return LABEL;
    if (dress.band && y > dress.band[0] && y < dress.band[1] && Math.abs(angle) < dress.label[2]) return BAND;
    return y < fill ? FULL : EMPTY;
  });
  templates.set(key, t);
  return t;
}

/** A drink: its glass and what is in it, its label, and its cap. */
type Drink = { glass: Look; full: Look; label: Look; band: Look; cap: Look };

/** Kinds of the back bar's own: clear flint glass, empty; the fridge's lit lining and what stands in it. */
export const BB_KINDS = { flint: 116, inside: 80, cold: 81 } as const;

const tinted = (c: THREE.ColorRepresentation) => look(KIND.bottle, c);
const flint = look(BB_KINDS.flint, "#e6f0ec");
// Clear water in clear glass would show only the dark mirror behind it: the water is in pale blue glass.
const blue = tinted("#a8d4ec");
const water = tinted("#c8e6f6");
const cap = (c: THREE.ColorRepresentation) => look(KIND.glossy, c);
const drink = (glass: Look, full: Look, label: THREE.ColorRepresentation, band: THREE.ColorRepresentation, top: Look): Drink => ({ glass, full, label: look(KIND.label, label), band: look(KIND.label, band), cap: top });

/** What each kind of bottle may hold: bright, so that none could be taken for anything stronger. */
const DRINKS: Readonly<Record<BottleKind, readonly Drink[]>> = {
  water: [
    drink(blue, water, "#f4f8fa", "#2a6ac8", cap("#2a6ac8")),
    drink(blue, water, "#eef6f2", "#3aa8d8", cap("#e8eef2")),
    drink(blue, water, "#f6f4ee", "#e23a3a", cap("#e23a3a")),
  ],
  juice: [
    drink(flint, tinted("#f5901a"), "#f8f2dc", "#38a040", cap("#38a040")),
    drink(flint, tinted("#f2dc6a"), "#fbf8ea", "#7ac83a", cap("#7ac83a")),
    drink(flint, tinted("#f6a83c"), "#fff6e4", "#e8501e", cap("#f0f0ec")),
    drink(flint, tinted("#f4c84a"), "#f6f8ff", "#2a7ad8", cap("#2a7ad8")),
  ],
  square: [
    drink(flint, tinted("#c4b830"), "#f2ead2", "#4a7a2a", look(KIND.steel, "#ffffff")),
    drink(flint, tinted("#2ec85a"), "#f6f8f2", "#1e9a44", cap("#1e9a44")),
    drink(flint, tinted("#e8204a"), "#fbf2f2", "#e8204a", cap("#e8204a")),
  ],
  syrup: [
    drink(flint, tinted("#e01c40"), "#fbf6ee", "#e01c40", cap("#e01c40")),
    drink(flint, tinted("#2cc455"), "#f6faf4", "#2cc455", cap("#2cc455")),
    drink(flint, tinted("#f88a14"), "#fffaf0", "#f88a14", cap("#f88a14")),
    drink(flint, tinted("#f4e8c2"), "#fbf6ea", "#8ac0e0", cap("#8ac0e0")),
    drink(flint, tinted("#f4d82a"), "#fbfbf0", "#e8c40a", cap("#f4d82a")),
  ],
};

export type Bottle = { kind: BottleKind; x: number; z: number; on: number; area: number; yaw: number };
/** A bottle with what is in it, how full, and which way its label faces. */
export type Stocked = Bottle & { drink: Drink; fill: number; facing: number };

/** Each bottle its own drink, filled and turned. */
export function stock(list: readonly Bottle[], seed: number): Stocked[] {
  const rand = random(seed).next;
  return list.map((b) => {
    const shape = BOTTLE_SHAPES[b.kind];
    const choices = DRINKS[b.kind];
    const drink = choices[Math.floor(rand() * choices.length) % choices.length];
    // Water is full to the neck, unopened; the juices and syrups poured from are down to their shoulders or a little below (empty glass shows only the dark mirror behind).
    const h = shape.r * 0.6;
    const yb = shape.body - h;
    const level = rand();
    const fill = b.kind === "water" ? yb + 12 : Math.round((yb + h * (1.2 * level - 0.2)) / 10) * 10;
    // A square bottle stays square to its felt box.
    const facing = b.yaw + (b.kind === "square" ? 0 : (rand() - 0.5) * 0.7);
    return { ...b, drink, fill, facing };
  });
}

const looks: Look[] = [];

/** Bottles in detail, into their areas' sheets. */
export function bottles(s: Sheets, list: readonly Stocked[]) {
  for (const b of list) {
    const d = b.drink;
    looks[EMPTY] = d.glass;
    looks[FULL] = d.full;
    looks[LABEL] = d.label;
    looks[BAND] = d.band;
    looks[CAP] = d.cap;
    looks[COLLAR] = d.band;
    copy(s, template(b.kind, b.fill), b.x, b.on, b.z, b.facing, b.area, looks);
  }
}

/** A template copied to (x, y, z), turned `yaw` round y, each role its look. */
function copy(s: Sheets, t: Template, x: number, y: number, z: number, yaw: number, area: number, looks: readonly Look[]) {
  for (const piece of [t.clear, t.solid]) {
    if (piece.count) s.sheet(area, looks[piece.role[0]].kind).copy(piece, x, y, z, yaw, looks);
  }
}

/** A ring of a far bottle: its corners' angles from the way it faces (ascending, the first shared with the ring it meets), out to `r`, at `y`. */
type Ring = { angles: readonly number[]; r: number; y: number };

/** A polygon's corners' angles, `sides` of them from `start`. */
const corners = (sides: number, start: number) => Array.from({ length: sides }, (_, i) => start + (i / sides) * Math.PI * 2);

/**
 * Far off, a round bottle's body is a hexagon with a corner toward the
 * room, its neck three-sided; a square bottle's body is its box. Those seen
 * nearer at the switch (the window's) are finer: an octagon with a face
 * toward the room, its shoulder rounded in two, its neck four-sided.
 */
const SHAPES = {
  round: { body: corners(6, 0), neck: corners(3, 0) },
  square: { body: corners(4, Math.PI / 4), neck: corners(3, Math.PI / 4) },
  fineRound: { body: corners(8, Math.PI / 8), neck: corners(4, Math.PI / 8) },
  fineSquare: { body: corners(4, Math.PI / 4), neck: corners(4, Math.PI / 4) },
};

/** What each part of a far bottle is drawn as. */
type Role = "glass" | "full" | "label" | "band" | "cap";

/**
 * Far off, a bottle in forty to fifty triangles (`fine`: seventy), in the
 * looks its detail has: the body to its shoulder, full to where it is
 * filled, its label on the faces toward the room; the shoulder narrowing to
 * the neck; the cap closing it. They go to the
 * far mesh painted and tagged as they are made, each area's in a piece.
 */
export function farBottles(b: Builder, list: readonly Stocked[], fine: (bottle: Stocked) => boolean) {
  const sheets = new Map<number, Sheet>();
  // A triangle's corners as they are made: x, y, z and the normal, three times.
  const corner = new Float64Array(18);
  for (const bottle of list) {
    const s = BOTTLE_SHAPES[bottle.kind];
    const dress = DRESS[bottle.kind];
    const d = bottle.drink;
    const square = bottle.kind === "square";
    const span = square ? s.r * 0.75 : s.r;
    const R = span - INSET;
    const n = s.neck - INSET;
    const h = s.r * 0.6;
    const yb = s.body - h;
    const yn = yb + h * (1 - (n / span) ** 2);
    const fill = bottle.fill;
    const looks = {} as Record<Role, Look>;
    for (const [role, l] of [["glass", d.glass], ["full", d.full], ["label", d.label], ["band", d.band], ["cap", d.cap]] as const) looks[role] = { kind: l.kind, color: l.color };
    const c = Math.cos(bottle.facing);
    const sn = Math.sin(bottle.facing);
    // Corner `k`: out along an angle and up, its normal leaning out (along `nth`) and up, turned to face the way the bottle does.
    const put = (k: number, th: number, r: number, y: number, no: number, nu: number, nth = th) => {
      const px = r * Math.cos(th);
      const pz = r * Math.sin(th);
      const nx = no * Math.cos(nth);
      const nz = no * Math.sin(nth);
      const o = k * 6;
      corner[o] = bottle.x + px * c + pz * sn;
      corner[o + 1] = bottle.on + y;
      corner[o + 2] = bottle.z - px * sn + pz * c;
      corner[o + 3] = nx * c + nz * sn;
      corner[o + 4] = nu;
      corner[o + 5] = -nx * sn + nz * c;
    };
    // The three corners made, in `role`'s look, wound to face the way their normals do.
    const tri = (role: Role) => {
      const l = looks[role];
      const key = bottle.area * 2 + (l.kind >= CLEAR ? 1 : 0);
      let sheet = sheets.get(key);
      if (!sheet) sheets.set(key, (sheet = new Sheet()));
      const p = corner;
      const ux = p[6] - p[0], uy = p[7] - p[1], uz = p[8] - p[2];
      const wx = p[12] - p[0], wy = p[13] - p[1], wz = p[14] - p[2];
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      const out = cx * (p[3] + p[9] + p[15]) + cy * (p[4] + p[10] + p[16]) + cz * (p[5] + p[11] + p[17]) > 0;
      sheet.reserve(3);
      for (const k of out ? ORDER : FLIPPED) sheet.put(p[k * 6], p[k * 6 + 1], p[k * 6 + 2], p[k * 6 + 3], p[k * 6 + 4], p[k * 6 + 5], l);
    };

    // The body: each face up from the foot in bands, changing where it is filled to and, on the faces toward the room, where the label is.
    const smooth = fine(bottle);
    const { body, neck } = SHAPES[smooth ? (square ? "fineSquare" : "fineRound") : square ? "square" : "round"];
    const rb = square ? R * Math.SQRT2 : R;
    const [l0, l1, half] = dress.label;
    const [b0, b1] = dress.band ?? [0, 0];
    for (let k = 0; k < body.length; k++) {
      const a0 = body[k];
      const a1 = k + 1 < body.length ? body[k + 1] : body[0] + Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const labelled = Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid))) < half;
      const rows = [0, yb, ...(fill > 0 && fill < yb ? [fill] : []), ...(labelled ? [l0, l1, ...(dress.band ?? [])] : [])].sort((p, q) => p - q);
      for (let i = 0; i + 1 < rows.length; i++) {
        const y0 = rows[i];
        const y1 = rows[i + 1];
        if (y1 - y0 < 0.01) continue;
        const m = (y0 + y1) / 2;
        const role = labelled && m > l0 && m < l1 ? "label" : labelled && m > b0 && m < b1 ? "band" : m < fill ? "full" : "glass";
        // A square bottle's faces are flat; a round one's shaded round.
        const n0 = square ? mid : a0;
        const n1 = square ? mid : a1;
        put(0, a0, rb, y0, 1, 0, n0);
        put(1, a1, rb, y0, 1, 0, n1);
        put(2, a1, rb, y1, 1, 0, n1);
        tri(role);
        put(1, a1, rb, y1, 1, 0, n1);
        put(2, a0, rb, y1, 1, 0, n0);
        tri(role);
      }
    }

    // The shoulder, from the body's top to the neck (by way of its middle, when fine); the neck to the cap; the cap, tapering to a flat top.
    const rn = n;
    const top = s.top - n * 0.2;
    const zip = (role: Role, lo: Ring, hi: Ring) => {
      const dr = lo.r - hi.r;
      const dy = hi.y - lo.y;
      const l = Math.hypot(dr, dy) || 1;
      const no = dy / l;
      const nu = dr / l;
      const angle = (ring: Ring, i: number) => (i < ring.angles.length ? ring.angles[i] : ring.angles[i - ring.angles.length] + Math.PI * 2);
      let i = 0;
      let j = 0;
      while (i < lo.angles.length || j < hi.angles.length) {
        put(0, angle(lo, i), lo.r, lo.y, no, nu);
        if (j >= hi.angles.length || (i < lo.angles.length && angle(lo, i + 1) <= angle(hi, j + 1))) {
          put(1, angle(lo, i + 1), lo.r, lo.y, no, nu);
          put(2, angle(hi, j), hi.r, hi.y, no, nu);
          i++;
        } else {
          put(1, angle(hi, j + 1), hi.r, hi.y, no, nu);
          put(2, angle(hi, j), hi.r, hi.y, no, nu);
          j++;
        }
        tri(role);
      }
    };
    const shoulder: Ring = { angles: body, r: rb, y: yb };
    const base: Ring = { angles: neck, r: rn, y: yn };
    const capped: Ring = { angles: neck, r: rn, y: dress.cap };
    const crown: Ring = { angles: neck, r: rn * 0.7, y: top };
    const full = (y0: number, y1: number) => (fill > (y0 + y1) / 2 ? "full" : "glass");
    if (smooth) {
      const a = (R + n) / 2;
      const middle: Ring = { angles: body, r: rb * (a / R), y: yb + h * (1 - ((a + INSET) / span) ** 2) };
      zip(full(yb, middle.y), shoulder, middle);
      zip(full(middle.y, yn), middle, base);
    } else zip(full(yb, yn), shoulder, base);
    zip(full(yn, dress.cap), base, capped);
    zip("cap", capped, crown);
    for (let k = 1; k + 1 < neck.length; k++) {
      put(0, neck[0], crown.r, top, 0, 1);
      put(1, neck[k], crown.r, top, 0, 1);
      put(2, neck[k + 1], crown.r, top, 0, 1);
      tri("cap");
    }
  }
  // Each area's sheets, solid and clear, as its stand-ins.
  for (const [key, sheet] of sheets) b.standInPainted(key >> 1, sheet.geometry(), key & 1 ? CLEAR : 0);
}

/** The fridge's bottles: orange juice, lemonade, water, milk; (radius, height) up the outside. */
const COLD: readonly { rows: readonly [number, number][]; glass: string; label: [number, number]; labelColor: string; cap: string }[] = [
  { rows: [[30, 0], [31, 3], [31, 130], [27, 146], [19, 158], [19, 180], [0, 181]], glass: "#ffb437", label: [45, 110], labelColor: "#f4f4ec", cap: "#4ad050" },
  { rows: [[33, 0], [34, 3], [34, 185], [28, 205], [17, 224], [17, 256], [0, 257]], glass: "#f4e480", label: [60, 150], labelColor: "#2a8ad8", cap: "#f4f4ee" },
  { rows: [[34, 0], [35, 4], [35, 170], [26, 205], [14, 228], [14, 250], [0, 251]], glass: "#9ab8c0", label: [70, 140], labelColor: "#2a5a9a", cap: "#2a5a9a" },
  { rows: [[30, 0], [31, 3], [31, 118], [26, 136], [20, 150], [20, 168], [0, 169]], glass: "#f8f6ee", label: [40, 100], labelColor: "#2a5ab8", cap: "#2a5ab8" },
];
const coldTemplates = new Map<number, { t: Template; looks: Look[] }>();

function coldTemplate(i: number) {
  let c = coldTemplates.get(i);
  if (c) return c;
  const spec = COLD[i];
  const top = spec.rows[spec.rows.length - 2][1];
  // Rows where the label starts and stops, so it is a band of its own.
  const rows: Row[] = [];
  spec.rows.forEach(([a, y], i) => {
    const [pa, py] = spec.rows[i - 1] ?? [a, y];
    for (const ly of spec.label) if (ly > py && ly < y) rows.push({ a: pa + ((a - pa) * (ly - py)) / (y - py), y: ly, square: false });
    rows.push({ a, y, square: false });
  });
  const t = turn(rows, 10, (y) => (y > top - 10 ? CAP : y > spec.label[0] && y < spec.label[1] ? LABEL : COLLAR));
  const looks: Look[] = [];
  // Lit from behind, a label is a darker block on its bottle.
  looks[LABEL] = look(KIND.label, new THREE.Color(spec.labelColor).multiplyScalar(0.35));
  looks[CAP] = look(BB_KINDS.cold, spec.cap);
  looks[COLLAR] = look(BB_KINDS.cold, spec.glass);
  coldTemplates.set(i, (c = { t, looks }));
  return c;
}

/** Bottles standing in the fridge: `which` of `COLD`, at (x, on, z). */
export function coldBottles(s: Sheets, list: readonly { which: number; x: number; z: number; on: number; area: number; yaw: number }[]) {
  for (const b of list) {
    const { t, looks } = coldTemplate(b.which);
    copy(s, t, b.x, b.on, b.z, b.yaw, b.area, looks);
  }
}

/** How many kinds of bottle the fridge holds. */
export const COLD_KINDS = COLD.length;
