// Where a touch lands on the fly. Its bristles are of separate parts of its
// body, each with its own neurons (packages/brain README, Senses), so what
// touches it is felt where it is: a feather on its back bends the notum's
// bristles and the wings', not its face's.
//
// Each thing touching it this frame is a contact: a point in the world, how
// far round it reaches and how hard it presses. The body's surface is a set
// of points, each of one part, placed on packages/fly's model (anatomy.ts) as
// the fly stands with its wings folded. A contact meets the fly at the point
// nearest it and bends the bristles there and at any point within its reach
// of that; something flat it runs into (a wall, the ground) bends what stands
// out furthest toward it. Each part feels the contact's strength times the
// share of its points bent, as it would if each point stood for an equal
// patch of its bristles.

import type { BrainSenses } from "@fly/brain";
import type { Vec3 } from "@fly/world";
import { FLY_LENGTH } from "./motion.ts";

/** The parts of the body touch can land on: the brain's touch senses, in its order. */
export const TOUCH_PARTS = [
  "touchEyeLeft",
  "touchEyeRight",
  "touchFrontLeft",
  "touchFrontRight",
  "touchOcciputLeft",
  "touchOcciputRight",
  "touchMouthpartsLeft",
  "touchMouthpartsRight",
  "touchNotum",
  "touchWings",
  "touchAbdomen",
  "touchLegs",
] as const satisfies readonly (keyof BrainSenses)[];
export type TouchPart = (typeof TOUCH_PARTS)[number];

/** A contact at a point (another fly's body, a bubble's film, a wall hit in flight) bends what lies within this of where it meets the fly, mm. */
export const POINT_REACH = 0.25;

/** A point of the surface, in body lengths ahead of its middle, up from its feet and to its left, as packages/fly's model is shaped. */
type Point = { part: TouchPart; ahead: number; up: number; left: number };
/** A left point and its mirror image on the right, each of its own side's part. */
const sided = (name: (side: "Left" | "Right") => TouchPart, ahead: number, up: number, left: number): Point[] => [
  { part: name("Left"), ahead, up, left },
  { part: name("Right"), ahead, up, left: -left },
];
/** A left point and its mirror image, both of a part with no side. */
const both = (name: TouchPart, ahead: number, up: number, left: number): Point[] => [
  { part: name, ahead, up, left },
  { part: name, ahead, up, left: -left },
];
const POINTS: readonly Point[] = [
  // The eye, turned out and a little forward: its outer face, top, front and lower edge (EYE).
  ...sided((s) => `touchEye${s}`, 0.4, 0.34, 0.165),
  ...sided((s) => `touchEye${s}`, 0.41, 0.45, 0.1),
  ...sided((s) => `touchEye${s}`, 0.47, 0.35, 0.11),
  ...sided((s) => `touchEye${s}`, 0.39, 0.24, 0.12),
  // Between the eyes: the antenna, the frons above it and the ocellar triangle on top (the antennal nerve's bristles).
  ...sided((s) => `touchFront${s}`, 0.49, 0.36, 0.022),
  ...sided((s) => `touchFront${s}`, 0.48, 0.43, 0.035),
  ...sided((s) => `touchFront${s}`, 0.4, 0.465, 0.025),
  // The back of the head, behind the eye, over the neck.
  ...sided((s) => `touchOcciput${s}`, 0.31, 0.38, 0.08),
  // Under the head: the proboscis and the palps either side of it.
  ...sided((s) => `touchMouthparts${s}`, 0.44, 0.2, 0.03),
  // The notum, the thorax's back from the neck to the scutellum (THORAX, SCUTELLUM).
  ...both("touchNotum", 0.27, 0.45, 0.06),
  ...both("touchNotum", 0.13, 0.49, 0.06),
  ...both("touchNotum", 0, 0.46, 0.06),
  { part: "touchNotum", ahead: -0.06, up: 0.465, left: 0 },
  // The wings folded over the abdomen, each from its hinge back past the abdomen's tip (WING), and the halteres behind them.
  ...both("touchWings", -0.1, 0.445, 0.08),
  ...both("touchWings", -0.3, 0.43, 0.07),
  ...both("touchWings", -0.5, 0.4, 0.06),
  ...both("touchWings", -0.66, 0.36, 0.05),
  ...both("touchWings", 0, 0.385, 0.112),
  // The abdomen where the folded wings leave it bare: its sides, its underside and its tip (ABDOMEN).
  ...both("touchAbdomen", -0.15, 0.29, 0.128),
  ...both("touchAbdomen", -0.35, 0.29, 0.11),
  { part: "touchAbdomen", ahead: -0.2, up: 0.19, left: 0 },
  { part: "touchAbdomen", ahead: -0.38, up: 0.2, left: 0 },
  { part: "touchAbdomen", ahead: -0.49, up: 0.27, left: 0 },
];
// Each leg's knee, its tibia's middle and its foot, front, middle and hind (LEGS): standing, and in the air, drawn in under the
// body with the front legs folded under the head and the others trailing (packages/fly's rig, TUCK).
const STANDING_LEGS: readonly Point[] = [
  ...both("touchLegs", 0.44, 0.24, 0.2),
  ...both("touchLegs", 0.49, 0.16, 0.22),
  ...both("touchLegs", 0.6, 0.01, 0.24),
  ...both("touchLegs", 0.18, 0.28, 0.28),
  ...both("touchLegs", 0.15, 0.17, 0.36),
  ...both("touchLegs", 0.1, 0.01, 0.48),
  ...both("touchLegs", -0.02, 0.3, 0.27),
  ...both("touchLegs", -0.12, 0.17, 0.3),
  ...both("touchLegs", -0.27, 0.01, 0.34),
];
const FLYING_LEGS: readonly Point[] = [
  ...both("touchLegs", 0.35, 0.15, 0.12),
  ...both("touchLegs", 0.34, 0.09, 0.11),
  ...both("touchLegs", 0.33, 0.03, 0.09),
  ...both("touchLegs", 0.15, 0.17, 0.2),
  ...both("touchLegs", 0.09, 0.11, 0.17),
  ...both("touchLegs", 0.03, 0.06, 0.13),
  ...both("touchLegs", -0.05, 0.2, 0.17),
  ...both("touchLegs", -0.19, 0.15, 0.14),
  ...both("touchLegs", -0.33, 0.11, 0.1),
];
/** Every point, standing and in the air: the same but for the legs. */
const STANDING = [...POINTS, ...STANDING_LEGS];
const FLYING = [...POINTS, ...FLYING_LEGS];
// Packed for the loop that runs every frame: ahead, up, left and part, point by point.
const pack = (points: readonly Point[]) => ({
  ahead: Float64Array.from(points, (p) => p.ahead),
  up: Float64Array.from(points, (p) => p.up),
  left: Float64Array.from(points, (p) => p.left),
});
const ON_FEET = pack(STANDING);
const IN_AIR = pack(FLYING);
const PART = Uint8Array.from(STANDING, (p) => TOUCH_PARTS.indexOf(p.part));
const OF_PART = Float64Array.from(TOUCH_PARTS, (name) => STANDING.filter((p) => p.part === name).length);

/** The most contacts in a frame; more are dropped (a frame has a handful at most). */
export const MAX_CONTACTS = 16;

/** What a flat thing pressing down from above covers, seen from above (a fingertip's underside): whether it is over a point of the world. */
export interface Over {
  covers(x: number, z: number): boolean;
}

/** What touches the fly this frame, from outside: added to, read once, and cleared, without allocating. */
export class Contacts {
  readonly x = new Float64Array(MAX_CONTACTS);
  readonly y = new Float64Array(MAX_CONTACTS);
  readonly z = new Float64Array(MAX_CONTACTS);
  readonly reach = new Float64Array(MAX_CONTACTS);
  readonly strength = new Float64Array(MAX_CONTACTS);
  /** For a flat press from above (`addFlat`), what it covers; null for a contact at a point. */
  readonly over: (Over | null)[] = new Array<Over | null>(MAX_CONTACTS).fill(null);
  count = 0;

  /** Something at (x, y, z) in the world reaching `reach` mm round it, pressing `strength` (0 to 1). */
  add(x: number, y: number, z: number, reach: number, strength: number) {
    if (!(strength > 0) || this.count >= MAX_CONTACTS) return;
    const k = this.count++;
    this.x[k] = x;
    this.y[k] = y;
    this.z[k] = z;
    this.reach[k] = Math.max(0, reach);
    this.strength[k] = Math.min(1, strength);
    this.over[k] = null;
  }

  /** Something flat pressing down on it from above, only where `over` covers it, bending what stands highest there and within `reach` mm under that. */
  addFlat(over: Over, reach: number, strength: number) {
    if (!(strength > 0) || this.count >= MAX_CONTACTS) return;
    const k = this.count++;
    this.x[k] = this.y[k] = this.z[k] = 0;
    this.reach[k] = Math.max(0, reach);
    this.strength[k] = Math.min(1, strength);
    this.over[k] = over;
  }

  /** Adds every contact of another's. */
  addAll(other: Contacts) {
    for (let k = 0; k < other.count; k++) {
      const over = other.over[k];
      if (over) this.addFlat(over, other.reach[k], other.strength[k]);
      else this.add(other.x[k], other.y[k], other.z[k], other.reach[k], other.strength[k]);
    }
  }

  /** The strongest contact's strength, 0 with none. */
  get strongest(): number {
    let most = 0;
    for (let k = 0; k < this.count; k++) most = Math.max(most, this.strength[k]);
    return most;
  }

  clear() {
    this.count = 0;
  }
}

/** Where the body is: its feet's position, which way it faces, and whether it stands (its legs under it) or flies (drawn in). */
export type Placed = { readonly position: Readonly<Vec3>; readonly yaw: number; readonly onFeet: boolean };

const bent = new Float64Array(TOUCH_PARTS.length);
const distance = new Float64Array(STANDING.length);
const away = new Float64Array(STANDING.length);
/** Points this much further than the nearest (body lengths, 25 µm) are as near: a contact on the fly's midline, as the feather following it is, meets its left and its right alike. */
const TIE = 0.01;

/** Each part's share of its points bent (`distance` within `within`), times `strength`, into `out` where it is the stronger. */
function bend(within: number, strength: number, out: Float64Array) {
  bent.fill(0);
  for (let p = 0; p < distance.length; p++) if (distance[p] <= within) bent[PART[p]]++;
  for (let k = 0; k < bent.length; k++) if (bent[k] > 0) out[k] = Math.max(out[k], (strength * bent[k]) / OF_PART[k]);
}

/**
 * How hard something at a point presses each part (into `out`, by
 * TOUCH_PARTS, keeping the stronger of what is there and this): it meets the
 * fly at the point of its surface nearest it, and bends that and whatever
 * lies within its reach (mm) of that.
 */
export function press(body: Placed, x: number, y: number, z: number, reach: number, strength: number, out: Float64Array) {
  if (!(strength > 0)) return;
  const s = Math.sin(body.yaw);
  const c = Math.cos(body.yaw);
  const dx = (x - body.position.x) / FLY_LENGTH;
  const dz = (z - body.position.z) / FLY_LENGTH;
  // In the fly's frame: ahead is (sin yaw, 0, cos yaw), its left (cos yaw, 0, -sin yaw).
  const ahead = dx * s + dz * c;
  const left = dx * c - dz * s;
  const up = (y - body.position.y) / FLY_LENGTH;
  const { ahead: A, up: U, left: S } = body.onFeet ? ON_FEET : IN_AIR;
  let best = Infinity;
  for (let p = 0; p < away.length; p++) {
    away[p] = Math.hypot(A[p] - ahead, U[p] - up, S[p] - left);
    best = Math.min(best, away[p]);
  }
  // Every point as near as the nearest meets it: on its midline, both sides alike.
  distance.fill(Infinity);
  for (let q = 0; q < away.length; q++) {
    if (away[q] > best + TIE) continue;
    for (let p = 0; p < distance.length; p++) distance[p] = Math.min(distance[p], Math.hypot(A[p] - A[q], U[p] - U[q], S[p] - S[q]));
  }
  bend(reach / FLY_LENGTH, strength, out);
}

/**
 * How hard something flat it runs into presses each part (into `out`, as
 * `press`): `(nx, ny, nz)` is the unit way out of it, in the world. What
 * stands out furthest toward it is bent, and whatever lies within its reach
 * (mm) of that, as it would be against a wall or the ground.
 */
export function pressFlat(body: Placed, nx: number, ny: number, nz: number, reach: number, strength: number, out: Float64Array) {
  if (!(strength > 0)) return;
  const s = Math.sin(body.yaw);
  const c = Math.cos(body.yaw);
  // Toward it, in the fly's frame.
  const ahead = -(nx * s + nz * c);
  const left = -(nx * c - nz * s);
  const up = -ny;
  const { ahead: A, up: U, left: S } = body.onFeet ? ON_FEET : IN_AIR;
  let furthest = -Infinity;
  for (let p = 0; p < distance.length; p++) furthest = Math.max(furthest, A[p] * ahead + U[p] * up + S[p] * left);
  for (let p = 0; p < distance.length; p++) distance[p] = furthest - (A[p] * ahead + U[p] * up + S[p] * left);
  bend(reach / FLY_LENGTH, strength, out);
}

/**
 * How hard something flat pressing down from above presses each part (into
 * `out`, as `press`), where `over` covers the fly: what stands highest under
 * it is bent, and whatever under it lies within its reach (mm) below that.
 * Nothing is bent where nothing of the fly is under it.
 */
export function pressFlatOver(body: Placed, over: Over, reach: number, strength: number, out: Float64Array) {
  if (!(strength > 0)) return;
  const s = Math.sin(body.yaw);
  const c = Math.cos(body.yaw);
  const L = FLY_LENGTH;
  const { ahead: A, up: U, left: S } = body.onFeet ? ON_FEET : IN_AIR;
  let highest = -Infinity;
  for (let p = 0; p < distance.length; p++) {
    // The point in the world, from the fly's frame: ahead is (sin yaw, 0, cos yaw), its left (cos yaw, 0, -sin yaw).
    const under = over.covers(body.position.x + (s * A[p] + c * S[p]) * L, body.position.z + (c * A[p] - s * S[p]) * L);
    away[p] = under ? U[p] : -Infinity;
    highest = Math.max(highest, away[p]);
  }
  if (highest === -Infinity) return;
  for (let p = 0; p < distance.length; p++) distance[p] = highest - away[p];
  bend(reach / L, strength, out);
}

/** What every contact presses on each part (into `out`, as `press`): a point's, or a flat press from above. */
export function pressContacts(body: Placed, contacts: Contacts, out: Float64Array) {
  for (let k = 0; k < contacts.count; k++) {
    const over = contacts.over[k];
    if (over) pressFlatOver(body, over, contacts.reach[k], contacts.strength[k], out);
    else press(body, contacts.x[k], contacts.y[k], contacts.z[k], contacts.reach[k], contacts.strength[k], out);
  }
}

/** The points of the surface, for tests: where each is (body lengths, as `press` reads them) and its part, standing and flying. */
export const TOUCH_POINTS: { readonly standing: readonly Readonly<Point>[]; readonly flying: readonly Readonly<Point>[] } = { standing: STANDING, flying: FLYING };
