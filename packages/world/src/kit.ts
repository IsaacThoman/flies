// The player's building kit: a fixed set of fly-scale things (dishes, tiles,
// a crumb, a twig, a leaf, a ramp, short walls) that can be set down on a
// place, turned and taken away. A piece set down is a solid like any other
// in the world: the fly stands on it, bumps into it and sees it, the camera
// keeps out of it, and food dropped into a dish lies in it. Here is what each
// piece is as the fly meets it, where one may go, and how a place's pieces
// are kept; how they look is apps/web/src/scene/kit.ts.
//
// Pieces rest on the place's own surfaces (its table, a slab's top, a flat
// thing standing on it), never on one another, so taking one away never
// leaves another in the air.

import { footprintRadius, inside, topHeight, topPeak } from "./shapes.ts";
import type { Footprint, Solid, Top } from "./shapes.ts";
import { TOUCH, createSurface } from "./world.ts";
import type { Place, World } from "./world.ts";

/** What can be built. The coloured ones are told apart by a fly's eyes by how bright they are to it, as by ours by their hue (dishes and tiles share the colours). */
export const PIECE_KINDS = ["dish-blue", "dish-yellow", "tile-blue", "tile-yellow", "tile-red", "crumb", "twig", "leaf", "ramp", "wall"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

/** A piece set down: what it is, where its middle is, how far it is turned (eighths of a turn, counter-clockwise from above) and the height it rests on, mm. */
export type Piece = { kind: PieceKind; x: number; z: number; turns: number; y: number };

/** The most pieces a place keeps: a maze or an arena's worth, and a few dishes. */
export const MAX_PIECES = 40;
/** Pieces are set down on this grid (mm), so walls meet end to end and tiles side by side. */
export const BUILD_GRID = 2.5;
/** Pieces may touch, or overlap at their very edges (mm), as walls do at a corner. */
const EDGE = 0.8;
/** How far (mm) a piece keeps from a fly, and from where the place sets the fly down. */
export const KEEP_CLEAR = 2.2;
/** A support counts as level when it varies less than this under a piece (mm). */
const LEVEL = 0.25;

export const isPieceKind = (kind: unknown): kind is PieceKind => (PIECE_KINDS as readonly unknown[]).includes(kind);

/** A piece's shape about its middle, on what it rests on: its footprint's size and its top, raised by `y`. */
type Shape = { footprint: (x: number, z: number, angle: number) => Footprint; top: (y: number) => Top; height: number; name: string };

const dish = (name: string): Shape => ({
  name,
  // A shallow glazed dish 22 mm across: up its gentle outside, over a rounded rim and down into a flat well 13 mm across, where food lies.
  footprint: (x, z) => ({ kind: "circle", x, z, r: 11 }),
  top: (y) => ({ kind: "dish", well: y + 0.45, rim: y + 1.6, inner: 0.6, lip: 0.78 }),
  height: 1.6,
});
const tile = (name: string): Shape => ({
  name,
  // A glazed tile 14 mm square, low enough to step onto.
  footprint: (x, z, angle) => ({ kind: "box", x, z, hx: 7, hz: 7, angle }),
  top: (y) => ({ kind: "flat", y: y + 0.5 }),
  height: 0.5,
});

export const PIECE_SHAPES: Readonly<Record<PieceKind, Shape>> = {
  "dish-blue": dish("blue dish"),
  "dish-yellow": dish("yellow dish"),
  "tile-blue": tile("blue tile"),
  "tile-yellow": tile("yellow tile"),
  "tile-red": tile("red tile"),
  // A biscuit crumb, a boulder to a fly: low and round enough to walk up.
  crumb: { name: "crumb", footprint: (x, z, angle) => ({ kind: "ellipse", x, z, rx: 4.2, rz: 3.3, angle }), top: (y) => ({ kind: "dome", base: y, height: 2.6, power: 1 }), height: 2.6 },
  // A twig lying along its length: round on top, a rail to walk along once up on it.
  twig: { name: "twig", footprint: (x, z, angle) => ({ kind: "box", x, z, hx: 18, hz: 1.1, angle }), top: (y) => ({ kind: "vault", base: y + 1.1, height: 1.1, power: 0.5 }), height: 2.2 },
  // A fallen leaf lying flat: a green floor to walk over.
  leaf: { name: "leaf", footprint: (x, z, angle) => ({ kind: "ellipse", x, z, rx: 14, rz: 6.5, angle }), top: (y) => ({ kind: "flat", y: y + 0.35 }), height: 0.35 },
  // A wooden ramp up to a wall's height, gentle enough to walk up.
  ramp: { name: "ramp", footprint: (x, z, angle) => ({ kind: "box", x, z, hx: 9, hz: 4.5, angle }), top: (y) => ({ kind: "ramp", low: y + 0.35, high: y + 3 }), height: 3 },
  // A short wooden wall, too high to step over: end to end, a maze or an arena.
  wall: { name: "wall", footprint: (x, z, angle) => ({ kind: "box", x, z, hx: 10, hz: 0.75, angle }), top: (y) => ({ kind: "flat", y: y + 3 }), height: 3 },
};

/** A piece's angle, radians. */
export const pieceAngle = (piece: Pick<Piece, "turns">) => (piece.turns * Math.PI) / 4;

/** A piece as the world has it. */
export function pieceSolid(piece: Piece): Solid {
  const shape = PIECE_SHAPES[piece.kind];
  const solid: Solid = { name: shape.name, footprint: shape.footprint(piece.x, piece.z, pieceAngle(piece)), top: shape.top(piece.y) };
  // On something standing on the floor (a slab, a flat thing), it rests on that: a slab itself.
  if (piece.y > TOUCH) solid.bottom = piece.y;
  return solid;
}

/** A place with pieces set down on it: its own solids first, so theirs keep their places. */
export function withPieces(place: Place, pieces: readonly Piece[]): Place {
  return pieces.length === 0 ? place : { ...place, solids: [...place.solids, ...pieces.map(pieceSolid)] };
}

/** Snaps a point to the building grid. */
export const snap = (v: number) => Math.round(v / BUILD_GRID) * BUILD_GRID;

const support = createSurface();

/**
 * The height a piece set down at (x, z) would rest on: the place's own
 * surface there at or below `below`, if it is level enough to build on; else
 * null. `base` is the place's world without any pieces.
 */
export function restingHeight(base: World, x: number, z: number, below: number): number | null {
  if (!base.onTable(x, z)) return null;
  const s = base.surface(x, z, support, below + TOUCH);
  return s.normal.y > 0.995 ? s.y : null;
}

/** Points over a footprint, kept a little in from its edge: where a piece must find support and room. */
function samples(f: Footprint, out: number[]): number[] {
  out.length = 0;
  if (f.kind === "box") {
    const c = Math.cos(f.angle);
    const s = Math.sin(f.angle);
    const hu = Math.max(0, f.hx - EDGE);
    const hv = Math.max(0, f.hz - EDGE);
    const nu = Math.max(1, Math.ceil(hu / 2.5));
    const nv = Math.max(1, Math.ceil(hv / 2.5));
    for (let i = -nu; i <= nu; i++) {
      for (let j = -nv; j <= nv; j++) {
        const u = (hu * i) / nu;
        const v = (hv * j) / nv;
        out.push(f.x + u * c + v * s, f.z - u * s + v * c);
      }
    }
    return out;
  }
  const rx = f.kind === "circle" ? f.r : f.rx;
  const rz = f.kind === "circle" ? f.r : f.rz;
  const angle = f.kind === "circle" ? 0 : f.angle;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out.push(f.x, f.z);
  for (const k of [0.5, 1]) {
    const ku = Math.max(0, rx - EDGE) * k;
    const kv = Math.max(0, rz - EDGE) * k;
    const n = k === 1 ? 16 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const u = Math.cos(a) * ku;
      const v = Math.sin(a) * kv;
      out.push(f.x + u * c + v * s, f.z - u * s + v * c);
    }
  }
  return out;
}

const points: number[] = [];
const others: number[] = [];

/**
 * Whether a piece fits where it is (its `y` from `restingHeight`), among the
 * place's own things (`base`, the world without pieces) and the pieces
 * already down (all but `skip`): level support under all of it, nothing of
 * the place's or another piece's where it would stand, and room over it.
 */
export function fits(base: World, pieces: readonly Piece[], piece: Piece, skip = -1): boolean {
  const shape = PIECE_SHAPES[piece.kind];
  const f = shape.footprint(piece.x, piece.z, pieceAngle(piece));
  const y = piece.y;
  const top = y + shape.height;
  samples(f, points);
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const z = points[i + 1];
    if (!base.onTable(x, z)) return false;
    const s = base.surface(x, z, support, y + LEVEL);
    if (Math.abs(s.y - y) > LEVEL || s.normal.y < 0.97) return false;
    if (base.underside(x, z, y + TOUCH) < top + 0.2) return false;
    if (base.solidAt(x, y + 0.05, z) >= 0 || base.solidAt(x, (y + top) / 2, z) >= 0 || base.solidAt(x, top - 0.02, z) >= 0) return false;
  }
  // Other pieces: neither in the other's footprint, where they share heights.
  const radius = footprintRadius(f);
  for (let k = 0; k < pieces.length; k++) {
    if (k === skip) continue;
    const other = pieces[k];
    const o = PIECE_SHAPES[other.kind];
    const of = o.footprint(other.x, other.z, pieceAngle(other));
    if (Math.hypot(of.x - f.x, of.z - f.z) > radius + footprintRadius(of)) continue;
    if (other.y + o.height <= y + TOUCH || top <= other.y + TOUCH) continue;
    for (let i = 0; i < points.length; i += 2) if (inside(of, points[i], points[i + 1])) return false;
    samples(of, others);
    for (let i = 0; i < others.length; i += 2) if (inside(f, others[i], others[i + 1])) return false;
  }
  return true;
}

/**
 * Whether a piece would come down on something that moves or is eaten: a
 * fly (any of `flies`, its feet's positions, within KEEP_CLEAR of the piece,
 * below its top or a little over it), where the place sets the fly down, or
 * food it would cover (`foods`, lying lower than the piece's top over it).
 */
export function covers(piece: Piece, flies: readonly { x: number; y: number; z: number }[], start: { x: number; z: number }, foods: readonly { x: number; y: number; z: number; r: number }[]): boolean {
  const shape = PIECE_SHAPES[piece.kind];
  const f = shape.footprint(piece.x, piece.z, pieceAngle(piece));
  const top = piece.y + shape.height;
  if (near(f, start.x, start.z, KEEP_CLEAR)) return true;
  for (let i = 0; i < flies.length; i++) {
    const p = flies[i];
    if (p.y < top + 3 && p.y > piece.y - 3 && near(f, p.x, p.z, KEEP_CLEAR)) return true;
  }
  if (foods.length === 0) return false;
  const solid = pieceSolid(piece);
  for (let i = 0; i < foods.length; i++) {
    const food = foods[i];
    if (!near(f, food.x, food.z, food.r * 0.5)) continue;
    // Food under its top there is covered by it; food on it (a tile's) or in it (a dish's well) isn't.
    const inFoot = inside(f, food.x, food.z);
    if (!inFoot || food.y < topHeight(solid, food.x, food.z) - 0.05) return true;
  }
  return false;
}

/** Whether a point is within `reach` of a footprint (on it or near its edge). */
function near(f: Footprint, x: number, z: number, reach: number): boolean {
  if (f.kind === "circle") return Math.hypot(x - f.x, z - f.z) < f.r + reach;
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const dx = x - f.x;
  const dz = z - f.z;
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  if (f.kind === "box") return Math.hypot(Math.max(0, Math.abs(u) - f.hx), Math.max(0, Math.abs(v) - f.hz)) < reach;
  return (u / (f.rx + reach)) ** 2 + (v / (f.rz + reach)) ** 2 < 1;
}

/**
 * The piece at a point on a surface (x, z, at height y), or within `reach` of
 * it there: the one under the hand, to turn or take away. -1 for none.
 */
export function pieceAt(pieces: readonly Piece[], x: number, y: number, z: number, reach: number): number {
  let best = -1;
  let bestOff = Infinity;
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k];
    const shape = PIECE_SHAPES[p.kind];
    if (y < p.y - 0.5 || y > p.y + shape.height + 0.5) continue;
    const f = shape.footprint(p.x, p.z, pieceAngle(p));
    if (!near(f, x, z, reach)) continue;
    const off = inside(f, x, z) ? 0 : Math.hypot(x - f.x, z - f.z);
    if (off < bestOff) {
      bestOff = off;
      best = k;
    }
  }
  return best;
}

/** A piece's height over what it rests on, mm. */
export const pieceHeight = (kind: PieceKind) => PIECE_SHAPES[kind].height;

/** A place's pieces as kept: [kind, x, z, turns, y] each, to a hundredth of a millimetre. */
export type KeptPiece = [string, number, number, number, number];

export function keepPieces(pieces: readonly Piece[]): KeptPiece[] {
  const r = (v: number) => Math.round(v * 100) / 100;
  return pieces.map((p) => [p.kind, r(p.x), r(p.z), p.turns, r(p.y)]);
}

/**
 * A place's pieces as kept, those that still fit it: a save from another
 * build (whose place has changed), or a broken one, keeps only what this
 * place can have, up to MAX_PIECES.
 */
export function keptPieces(saved: unknown, base: World): Piece[] {
  const pieces: Piece[] = [];
  if (!Array.isArray(saved)) return pieces;
  for (const entry of saved) {
    if (pieces.length >= MAX_PIECES) break;
    if (!Array.isArray(entry) || entry.length !== 5) continue;
    const [kind, x, z, turns, y] = entry as unknown[];
    if (!isPieceKind(kind) || typeof x !== "number" || typeof z !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(y)) continue;
    if (typeof turns !== "number" || !Number.isInteger(turns) || turns < 0 || turns > 7) continue;
    const rest = restingHeight(base, x, z, y + LEVEL);
    if (rest === null || Math.abs(rest - y) > 0.02) continue;
    const piece: Piece = { kind, x, z, turns, y: rest };
    if (fits(base, pieces, piece)) pieces.push(piece);
  }
  return pieces;
}

/** The highest point of a piece, mm. */
export const pieceTop = (piece: Piece) => topPeak(pieceSolid(piece).top);
