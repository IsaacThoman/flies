// The back bar's bottles. Each of the world's kinds (wine, spirit, square,
// tall) is turned once at exactly its felt shape (the body's column, the
// shoulder's dome, the neck and its rounded top), cut into what it is made
// of (glass empty and full, label, capsule or stopper) and copied wherever
// a bottle of it stands, each copy its own drink. Far off, a bottle is a
// dark spike of twelve triangles. The fridge's bottles behind its glass are
// smaller, plainer and opaque: dark shapes against its light.

import * as THREE from "three";
import { BOTTLE_SHAPES } from "@fly/world";
import type { BottleKind } from "@fly/world";
import { random } from "../../scene/build.ts";
import type { Builder } from "./builder.ts";
import { KIND } from "./kinds.ts";
import { look } from "./backbar-sheet.ts";
import type { Look, Sheets } from "./backbar-sheet.ts";

/** How far inside its felt shape a bottle is drawn (mm). */
const INSET = 0.2;

/** What each part of a bottle is: below 10 glass (clear), from 10 opaque. */
const EMPTY = 0;
const FULL = 1;
const CORK = 2;
const LABEL = 10;
const BAND = 11;
const CAP = 12;
const COLLAR = 13;

type Row = { a: number; y: number; square: boolean };
type Piece = { pos: Float32Array; nor: Float32Array; role: Uint8Array; count: number };
type Template = { clear: Piece; solid: Piece };

/**
 * Rows of a profile turned round the y axis (`a` its radius, or a square's
 * half-width), each band between rows cut into `segments` and given a role
 * by `role(y, angle from +x)`. Round bands are shaded smooth (but for creases),
 * square ones flat.
 */
function turn(rows: readonly Row[], segments: number, role: (y: number, angle: number) => number): Template {
  const clear: number[] = [];
  const solid: number[] = [];
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
      // Counter-clockwise seen from outside: round the axis the other way to the angle.
      for (const k of [0, 2, 1, 0, 3, 2]) out.push(p[k][0], p[k][1], p[k][2], ns[k][0], ns[k][1], ns[k][2], r);
    }
  }
  const piece = (a: number[]): Piece => {
    const count = a.length / 7;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const role = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      pos.set(a.slice(i * 7, i * 7 + 3), i * 3);
      nor.set(a.slice(i * 7 + 3, i * 7 + 6), i * 3);
      role[i] = a[i * 7 + 6];
    }
    return { pos, nor, role, count };
  };
  return { clear: piece(clear), solid: piece(solid) };
}

/** Where on each kind its label, band, collar and top are, by height above what it stands on, and how far round the label goes. */
const DRESS: Readonly<Record<BottleKind, { label: [number, number, number]; band?: [number, number]; collar?: [number, number]; cap: number; cork?: number; stopper?: boolean }>> = {
  // A claret: a broad label, a foil capsule over the neck.
  wine: { label: [55, 150, 1.26], cap: 245 },
  // A whisky's: a squat label with a band above it, a cork stopper with a wooden head.
  spirit: { label: [42, 122, 0.95], band: [130, 144], cap: 247, cork: 226, stopper: true },
  // A gin's square bottle: the label on its face, a collar on the neck, a screw cap.
  square: { label: [58, 150, 0.53], collar: [222, 234], cap: 244 },
  // A tall liqueur: a narrow label, a collar, the top sealed in wax.
  tall: { label: [80, 172, 0.95], collar: [282, 294], cap: 300 },
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
  const thin = dress.stopper ? n - 2.5 : n;
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
  const neckMarks = [fill, ...(dress.collar ?? []), dress.cork ?? 0, dress.cap, yc].filter((y) => y > neck0 + 0.5 && y <= yc).sort((a, b) => a - b);
  for (const y of new Set(neckMarks)) {
    // A stopper's head sits on a thinner neck: a step out under it.
    if (dress.stopper && y === dress.cap) rows.push({ a: thin, y, square: false }, { a: n, y: y + 0.01, square: false });
    else rows.push({ a: y > dress.cap ? n : thin, y, square: false });
  }
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
    if (dress.cork && y > dress.cork) return CORK;
    return y < fill ? FULL : EMPTY;
  });
  templates.set(key, t);
  return t;
}

/** A drink: its glass and what is in it, its label, and how it is closed. */
type Drink = { glass: Look; full: Look; cork: Look; label: Look; band: Look; cap: Look; far: THREE.Color };

/** Kinds of the back bar's own: clear flint glass empty, with a clear spirit in it, and dark with red wine or rum; the fridge's lit lining and what stands in it. */
export const BB_KINDS = { flint: 116, gin: 117, dark: 118, inside: 80, cold: 81 } as const;

const tinted = (c: THREE.ColorRepresentation) => look(KIND.bottle, c);
const flint = look(BB_KINDS.flint, "#e6f0ec");
const drink = (glass: Look, full: Look, label: THREE.ColorRepresentation, band: THREE.ColorRepresentation, cap: Look, far: THREE.ColorRepresentation): Drink => ({ glass, full, cork: look(KIND.bottle, "#8a6a44"), label: look(KIND.label, label), band: look(KIND.label, band), cap, far: new THREE.Color(far) });

/** What each kind of bottle may hold. */
const DRINKS: Readonly<Record<BottleKind, readonly Drink[]>> = {
  wine: [
    drink(tinted("#10301a"), look(BB_KINDS.dark, "#1a0608"), "#ece2c8", "#6a1418", look(KIND.glossy, "#5c0e18"), "#0d1a10"),
    drink(tinted("#5a6a26"), tinted("#9c8a3a"), "#f2eee2", "#2a3a5a", look(KIND.brass, "#d8b060"), "#3a4018"),
    drink(tinted("#14261a"), look(BB_KINDS.dark, "#140a06"), "#d8c49a", "#1a1a1a", look(KIND.glossy, "#121212"), "#0c140e"),
  ],
  spirit: [
    drink(flint, tinted("#b05e18"), "#1a1612", "#b08a3a", look(KIND.oak, "#ffffff"), "#5a2c0c"),
    drink(flint, tinted("#7a300e"), "#efe4cc", "#6a1010", look(KIND.glossy, "#1a1210"), "#3a160a"),
    drink(tinted("#3a2a1a"), look(BB_KINDS.dark, "#2e1206"), "#e2c88a", "#1a1a1a", look(KIND.oak, "#c8a888"), "#1e0e06"),
    drink(flint, tinted("#b8121c"), "#f4f0e6", "#b8121c", look(KIND.glossy, "#e8e4dc"), "#5a0a0e"),
  ],
  square: [
    drink(flint, look(BB_KINDS.gin, "#e8f4f2"), "#f2f0ea", "#24467e", look(KIND.steel, "#ffffff"), "#4a5a5c"),
    drink(flint, tinted("#4e8c1c"), "#e8dcb8", "#2e5a1a", look(KIND.glossy, "#1e3a14"), "#24420e"),
    drink(flint, tinted("#9a5012"), "#121212", "#d8d0c0", look(KIND.glossy, "#121212"), "#3e1e08"),
  ],
  tall: [
    drink(flint, look(BB_KINDS.gin, "#f2f2ea"), "#ece6d6", "#7a1414", look(KIND.wax, "#8a1212"), "#4c5050"),
    drink(flint, tinted("#9a3612"), "#e2c890", "#5a1a0a", look(KIND.glossy, "#3a1a0e"), "#3c1406"),
    drink(flint, tinted("#e2c21c"), "#f4f0e0", "#3a6a1a", look(KIND.brass, "#e0c070"), "#6a5a0c"),
    drink(tinted("#1a3a20"), tinted("#2a6a1a"), "#1a1a1a", "#c8a050", look(KIND.wax, "#1a3a14"), "#10240c"),
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
    // Wine is full to the neck; what is poured by the glass has gone down.
    const yb = shape.body - shape.r * 0.6;
    const level = rand();
    const fill = b.kind === "wine" ? yb + 12 : Math.round((yb * (0.3 + 0.6 * level)) / 20) * 20;
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
    looks[CORK] = d.cork;
    looks[LABEL] = d.label;
    looks[BAND] = d.band;
    looks[CAP] = d.cap;
    looks[COLLAR] = d.band;
    copy(s, template(b.kind, b.fill), b.x, b.on, b.z, b.facing, b.area, looks);
  }
}

/** A template copied to (x, y, z), turned `yaw` round y, each role its look. */
function copy(s: Sheets, t: Template, x: number, y: number, z: number, yaw: number, area: number, looks: readonly Look[]) {
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  for (const piece of [t.clear, t.solid]) {
    if (!piece.count) continue;
    const { pos, nor, role } = piece;
    const sheet = s.sheet(area, looks[role[0]].kind);
    sheet.reserve(piece.count);
    for (let i = 0; i < piece.count; i++) {
      const px = pos[i * 3];
      const pz = pos[i * 3 + 2];
      const nx = nor[i * 3];
      const nz = nor[i * 3 + 2];
      sheet.put(x + px * c + pz * sn, y + pos[i * 3 + 1], z - px * sn + pz * c, nx * c + nz * sn, nor[i * 3 + 1], -nx * sn + nz * c, looks[role[i]]);
    }
  }
}

/** Far off: a spike of twelve triangles, four sides up the body and four to the neck's top, in the drink's dark colour. */
export function farBottles(b: Builder, list: readonly Stocked[]) {
  for (const bottle of list) {
    const s = BOTTLE_SHAPES[bottle.kind];
    const d = bottle.drink;
    const square = bottle.kind === "square";
    const a = square ? s.r * 0.75 * Math.SQRT2 : s.r;
    const shoulder = s.body - s.r * 0.6;
    const g = new THREE.CylinderGeometry(a, a, shoulder, 4, 1, true).translate(0, shoulder / 2, 0);
    const top = new THREE.ConeGeometry(a, s.top - shoulder, 4, 1, true).translate(0, shoulder + (s.top - shoulder) / 2, 0);
    // Corners toward the room, so its two lit sides read as round; a square bottle's faces square to the felt box.
    const m = new THREE.Matrix4().makeRotationY(square ? Math.PI / 4 : 0).setPosition(bottle.x, bottle.on, bottle.z);
    b.standIn(bottle.area, g, d.far, KIND.bottleFar, m);
    b.standIn(bottle.area, top, d.far, KIND.bottleFar, m);
  }
}

/** The fridge's bottles: beer, white wine, water, soda; (radius, height) up the outside. */
const COLD: readonly { rows: readonly [number, number][]; glass: string; label: [number, number]; labelColor: string; cap: string }[] = [
  { rows: [[29, 0], [30, 3], [30, 135], [24, 160], [13, 182], [12, 222], [13, 224], [13, 232], [0, 233]], glass: "#3a1c06", label: [55, 120], labelColor: "#c8b070", cap: "#b8a060" },
  { rows: [[36, 0], [37, 3], [37, 195], [30, 215], [14, 238], [14, 290], [0, 291]], glass: "#5a6424", label: [60, 150], labelColor: "#e8e2d0", cap: "#c8b47a" },
  { rows: [[34, 0], [35, 4], [35, 170], [26, 205], [14, 228], [14, 250], [0, 251]], glass: "#9ab8c0", label: [70, 140], labelColor: "#2a5a9a", cap: "#2a5a9a" },
  { rows: [[29, 0], [30, 3], [30, 120], [22, 150], [12, 172], [12, 196], [0, 197]], glass: "#2a5a20", label: [50, 105], labelColor: "#c82a1a", cap: "#c8c8c0" },
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
