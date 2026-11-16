// The picnic table: a round white café table by a lake on a sunny day, with a
// little picnic on it. Everything the fly can stand on, bump into or eat is
// here, in millimetres; a fruit fly is about 2.5 mm long. The table's centre
// is the origin, its top is y = 0, and the lake lies toward -z.

import type { FoodPatch } from "./pantry.ts";
import type { Solid } from "./shapes.ts";
import { World } from "./world.ts";
import type { Place } from "./world.ts";

export const TABLE_RADIUS = 320;

/** What each solid is, for the scene builder to draw it: the names below. */
export const SOLIDS: readonly Solid[] = [
  // A tall jar of lemonade with a lid and a paper straw: the highest perch.
  // It stands in a saucer: up a gentle slope, a rounded rim to walk along, and
  // down into a moat where lemonade has dripped and pooled.
  { name: "saucer", footprint: { kind: "circle", x: -112, z: -64, r: 62 }, top: { kind: "dish", well: 0.8, rim: 4, inner: 0.72, lip: 0.88 } },
  { name: "lemonade", footprint: { kind: "circle", x: -112, z: -64, r: 34 }, top: { kind: "flat", y: 112 } },
  { name: "straw", footprint: { kind: "circle", x: -102, z: -56, r: 3.5 }, top: { kind: "flat", y: 178 } },
  // A short jam jar, its lid covered with a gingham cloth.
  { name: "jam", footprint: { kind: "circle", x: 104, z: -98, r: 31 }, top: { kind: "flat", y: 66 } },
  // A whole strawberry lying on its side, its foot spreading onto the cloth so a fly can walk up and over it, and a half one, cut face up.
  { name: "strawberry", footprint: { kind: "ellipse", x: 18, z: 52, rx: 19, rz: 24, angle: 0.5 }, top: { kind: "dome", base: 0, height: 22, power: 1.15 } },
  { name: "strawberry half", footprint: { kind: "ellipse", x: 64, z: 62, rx: 16, rz: 20, angle: -0.4 }, top: { kind: "dome", base: 0, height: 9, power: 1 } },
  // Two cherries.
  { name: "cherry", footprint: { kind: "circle", x: -54, z: 96, r: 11 }, top: { kind: "dome", base: 11, height: 11, power: 0.5 } },
  { name: "cherry", footprint: { kind: "circle", x: -31, z: 108, r: 10.5 }, top: { kind: "dome", base: 10.5, height: 10.5, power: 0.5 } },
  // A slice of orange lying flat.
  { name: "orange slice", footprint: { kind: "circle", x: -128, z: 54, r: 33 }, top: { kind: "flat", y: 7 } },
  // A green apple, a high round perch.
  { name: "apple", footprint: { kind: "circle", x: 176, z: -12, r: 37 }, top: { kind: "dome", base: 33, height: 37, power: 0.5 } },
  // Sugar cubes: two side by side and one on top.
  { name: "sugar", footprint: { kind: "box", x: 118, z: 58, hx: 8, hz: 8, angle: 0.25 }, top: { kind: "flat", y: 16 } },
  { name: "sugar", footprint: { kind: "box", x: 134, z: 64, hx: 8, hz: 8, angle: 0.4 }, top: { kind: "flat", y: 16 } },
  { name: "sugar", footprint: { kind: "box", x: 126, z: 61, hx: 8, hz: 8, angle: 0.1 }, top: { kind: "flat", y: 32 } },
  // Drops of dew: low enough to see over, too steep to walk onto.
  { name: "dew", footprint: { kind: "circle", x: -22, z: -36, r: 3.2 }, top: { kind: "dome", base: 0, height: 2.4, power: 0.5 } },
  { name: "dew", footprint: { kind: "circle", x: 36, z: -18, r: 2.4 }, top: { kind: "dome", base: 0, height: 1.8, power: 0.5 } },
  { name: "dew", footprint: { kind: "circle", x: -46, z: 12, r: 4 }, top: { kind: "dome", base: 0, height: 3, power: 0.5 } },
  { name: "dew", footprint: { kind: "circle", x: 22, z: 8, r: 2 }, top: { kind: "dome", base: 0, height: 1.5, power: 0.5 } },
  { name: "dew", footprint: { kind: "circle", x: -70, z: -12, r: 2.6 }, top: { kind: "dome", base: 0, height: 2, power: 0.5 } },
  { name: "dew", footprint: { kind: "circle", x: 58, z: -44, r: 3.4 }, top: { kind: "dome", base: 0, height: 2.6, power: 0.5 } },
  // Crumbs of a biscuit near where the fly starts: boulders at its scale, low and round enough to climb.
  { name: "crumb", footprint: { kind: "ellipse", x: -2, z: -33, rx: 3.2, rz: 2.4, angle: 0.4 }, top: { kind: "dome", base: 0, height: 1.9, power: 1 } },
  { name: "crumb", footprint: { kind: "ellipse", x: 6, z: -26, rx: 2.6, rz: 1.9, angle: 0.7 }, top: { kind: "dome", base: 0, height: 1.5, power: 1 } },
  { name: "crumb", footprint: { kind: "ellipse", x: 14, z: -31, rx: 1.8, rz: 1.5, angle: -0.3 }, top: { kind: "dome", base: 0, height: 1.1, power: 1 } },
  // Two lemon pips, fallen from the slice in the lemonade.
  { name: "pip", footprint: { kind: "ellipse", x: -46, z: -14, rx: 1.0, rz: 1.8, angle: 0.9 }, top: { kind: "dome", base: 0, height: 0.95, power: 1 } },
  { name: "pip", footprint: { kind: "ellipse", x: -40, z: -21, rx: 0.95, rz: 1.7, angle: -0.5 }, top: { kind: "dome", base: 0, height: 0.9, power: 1 } },
];

/** The table's own food. Heights come from the surface under each. */
export const PATCHES: readonly FoodPatch[] = [
  { name: "honey", x: 30, z: -64, r: 7, sweet: 1 },
  { name: "jam", x: 72, z: -58, r: 6, sweet: 0.95 },
  { name: "strawberry juice", x: 64, z: 62, r: 9, sweet: 0.8 },
  // A bruise on top of the whole strawberry, for a fly that climbs it.
  { name: "strawberry juice", x: 18, z: 52, r: 4, sweet: 0.7 },
  // Lemonade dripped down the jar and pooled in the saucer's moat, on the side toward the middle of the table.
  { name: "lemonade", x: -77.7, z: -45.7, r: 6, sweet: 0.7, pool: true },
  { name: "orange", x: -128, z: 54, r: 18, sweet: 0.6 },
  { name: "sugar", x: 126, z: 61, r: 8, sweet: 1 },
  { name: "sugar", x: 112, z: 56, r: 5, sweet: 1 },
  { name: "sugar", x: 140, z: 66, r: 5, sweet: 1 },
  { name: "spilt sugar", x: 98, z: 40, r: 6, sweet: 1 },
  // A few grains of sugar spilt near where the fly starts: something to find on a walk.
  { name: "spilt sugar", x: -36, z: -24, r: 4, sweet: 1 },
];

/** Where the fly first stands, and which way it faces. */
export const START = { x: -8, z: -8, yaw: 0.6 };

/** Flat things lying on the table that change nothing for the fly: they are drawn, not felt. */
export const DECOR = {
  napkin: { x: -10, z: 30, size: 150, angle: 0.18 },
  leaf: { x: -200, z: 0, length: 70, angle: -0.6 },
  /** Specks of biscuit no taller than half a millimetre, well under a step: where they lie, how far round, and how many. */
  crumbs: [
    { x: 4, z: -30, r: 14, count: 46 },
    { x: -40, z: 30, r: 10, count: 18 },
    { x: 46, z: 12, r: 9, count: 14 },
  ],
};

export const PICNIC: Place = { floor: { kind: "circle", r: TABLE_RADIUS }, solids: SOLIDS, patches: PATCHES, start: START, ceiling: 320 };

export function createPicnic(): World {
  return new World(PICNIC);
}
