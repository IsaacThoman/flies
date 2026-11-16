// The bar: the polished wooden counter of a small, warm bar in the evening,
// with a cocktail, a beer, peanuts, cherries and a candle on it. Everything
// the fly can stand on, bump into or eat is here, in millimetres. The
// counter's middle is the origin and its top y = 0; the patrons sit toward
// +z, the bottles stand behind the bar toward -z, and the street window is
// off the counter's end toward -x.

import type { FoodPatch } from "./pantry.ts";
import type { Solid } from "./shapes.ts";
import { World } from "./world.ts";
import type { Place } from "./world.ts";

/** The counter top's half-sizes, mm: a short counter, a real edge all round. */
export const BAR_TOP = { hx: 430, hz: 210 };

/** The cocktail: a rocks glass, filled nearly to the brim. */
const COCKTAIL = { x: -168, z: 8, r: 38 };
/** Where the lime wedge lies in the cocktail: the way out to the rim it is perched on, and how far its middle is from the glass's. */
export const LIME = { x: 0.6, z: 0.8, r: 18 };
/** The sticky ring a glass of syrupy cocktail left where it stood before. */
export const SYRUP_RING = { x: -58, z: 104, r: 33 };

/** What each solid is, for the scene builder to draw it: the names below. */
export const BAR_SOLIDS: readonly Solid[] = [
  // Round cardboard coasters, a bevelled edge a fly can walk up.
  { name: "coaster", footprint: { kind: "circle", x: COCKTAIL.x + 2, z: COCKTAIL.z + 3, r: 50 }, top: { kind: "dish", well: 1.4, rim: 1.4, inner: 0.9, lip: 0.93 } },
  { name: "coaster", footprint: { kind: "circle", x: 174, z: -48, r: 52 }, top: { kind: "dish", well: 1.4, rim: 1.4, inner: 0.9, lip: 0.93 } },
  // A storm lantern with a candle in it: a glass chimney on a brass foot under a brass cap. The cap is the
  // lantern's top: a fly can land on it, never on the flame inside.
  { name: "lantern", footprint: { kind: "circle", x: -300, z: -96, r: 34 }, top: { kind: "dome", base: 142, height: 9, power: 1 } },
  // The cocktail in its rocks glass: the drink a few millimetres below a thick rounded rim. A fly that lands
  // in it can walk up the meniscus onto the rim, and off the outside it falls.
  { name: "cocktail", footprint: { kind: "circle", x: COCKTAIL.x, z: COCKTAIL.z, r: COCKTAIL.r }, top: { kind: "dish", well: 83, rim: 86, inner: 0.8, lip: 0.95 } },
  // Ice floating in it, standing proud of the drink.
  { name: "ice", footprint: { kind: "box", x: COCKTAIL.x - 9, z: COCKTAIL.z - 8, hx: 10.5, hz: 10.5, angle: 0.45 }, top: { kind: "flat", y: 88.5 } },
  { name: "ice", footprint: { kind: "box", x: COCKTAIL.x - 12, z: COCKTAIL.z + 14, hx: 9.5, hz: 9.5, angle: 1.15 }, top: { kind: "flat", y: 87.6 } },
  // A wedge of lime perched on the rim and lying in over the drink, peel up, resting on the ice: its peel is a perch.
  { name: "lime", footprint: { kind: "ellipse", x: COCKTAIL.x + LIME.x * LIME.r, z: COCKTAIL.z + LIME.z * LIME.r, rx: 20, rz: 11, angle: -Math.atan2(LIME.z, LIME.x) }, top: { kind: "dome", base: 84, height: 13, power: 0.5 } },
  // A tall straight glass of beer, its head of foam standing a little proud of the rim.
  { name: "beer", footprint: { kind: "circle", x: 172, z: -50, r: 34 }, top: { kind: "dome", base: 150, height: 5, power: 1 } },
  // Salted peanuts heaped in a fluted ramekin.
  { name: "peanuts", footprint: { kind: "circle", x: -34, z: -122, r: 46 }, top: { kind: "dome", base: 34, height: 11, power: 1 } },
  // Two halves fallen out onto the counter: low and round enough to climb.
  { name: "peanut", footprint: { kind: "ellipse", x: 40, z: -84, rx: 3.2, rz: 4.5, angle: 0.7 }, top: { kind: "dome", base: 0, height: 3.2, power: 1 } },
  { name: "peanut", footprint: { kind: "ellipse", x: 56, z: -66, rx: 3.1, rz: 4.3, angle: -0.5 }, top: { kind: "dome", base: 0, height: 3.1, power: 1 } },
  // Maraschino cherries.
  { name: "cherry", footprint: { kind: "circle", x: 8, z: 148, r: 10.5 }, top: { kind: "dome", base: 10.5, height: 10.5, power: 0.5 } },
  { name: "cherry", footprint: { kind: "circle", x: 30, z: 160, r: 10 }, top: { kind: "dome", base: 10, height: 10, power: 0.5 } },
  // Drops that ran down the cold beer glass onto its coaster: too steep to walk onto.
  { name: "drop", footprint: { kind: "circle", x: 142, z: -24, r: 2.6 }, top: { kind: "dome", base: 1.4, height: 1.7, power: 0.5 } },
  { name: "drop", footprint: { kind: "circle", x: 136, z: -38, r: 1.8 }, top: { kind: "dome", base: 1.4, height: 1.2, power: 0.5 } },
  // Bits of peanut near where the fly starts: boulders at its scale, low and round enough to climb.
  { name: "bit", footprint: { kind: "ellipse", x: 22, z: -6, rx: 2.3, rz: 1.7, angle: 0.4 }, top: { kind: "dome", base: 0, height: 1.5, power: 1 } },
  { name: "bit", footprint: { kind: "ellipse", x: 31, z: -15, rx: 1.7, rz: 1.3, angle: 1.2 }, top: { kind: "dome", base: 0, height: 1.1, power: 1 } },
  { name: "bit", footprint: { kind: "ellipse", x: 12, z: 6, rx: 1.9, rz: 1.5, angle: -0.6 }, top: { kind: "dome", base: 0, height: 1.2, power: 1 } },
];

/** Food on the sticky ring, every eighth of the way round. */
const ring: FoodPatch[] = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 + 0.3;
  return { name: "syrup", x: SYRUP_RING.x + Math.cos(a) * SYRUP_RING.r, z: SYRUP_RING.z + Math.sin(a) * SYRUP_RING.r, r: 5, sweet: 1 };
});

/** The counter's own food. Heights come from the surface under each. */
export const BAR_PATCHES: readonly FoodPatch[] = [
  ...ring,
  // Where the syrup ran thickest, at the foot of the ring.
  { name: "syrup", x: SYRUP_RING.x + 12, z: SYRUP_RING.z + SYRUP_RING.r + 3, r: 6, sweet: 1 },
  // The cocktail itself, for a fly that lands in it.
  { name: "cocktail", x: COCKTAIL.x + 6, z: COCKTAIL.z - 6, r: 24, sweet: 0.85, pool: true },
  { name: "lime", x: COCKTAIL.x + LIME.x * LIME.r, z: COCKTAIL.z + LIME.z * LIME.r, r: 6, sweet: 0.25 },
  // Beer spilt on the counter, and the head on the glass.
  { name: "beer", x: 102, z: 26, r: 13, sweet: 0.45, pool: true },
  { name: "beer foam", x: 172, z: -50, r: 22, sweet: 0.4 },
  // Syrup run from the cherries.
  { name: "cherry syrup", x: 22, z: 136, r: 7, sweet: 1 },
];

/** Where the fly first stands, and which way it faces: toward the peanuts and the bottles. */
export const BAR_START = { x: 44, z: 30, yaw: -2.7 };

/** Flat things on the counter that change nothing for the fly: they are drawn, not felt. */
export const BAR_DECOR = {
  /** A folded paper cocktail napkin. */
  napkin: { x: 302, z: 74, size: 122, angle: 0.32 },
  /** Specks of peanut no taller than half a millimetre: where they lie, how far round, and how many. */
  bits: [
    { x: 20, z: -8, r: 13, count: 30 },
    { x: 46, z: -76, r: 16, count: 22 },
    { x: -34, z: -64, r: 18, count: 14 },
  ],
  /** Grains of salt, a third of a millimetre: shaken off the peanuts. */
  salt: [
    { x: 20, z: -8, r: 16, count: 60 },
    { x: 46, z: -76, r: 20, count: 70 },
    { x: -34, z: -64, r: 26, count: 50 },
    { x: 300, z: 74, r: 30, count: 24 },
  ],
};

export const BAR: Place = { floor: { kind: "rect", hx: BAR_TOP.hx, hz: BAR_TOP.hz }, solids: BAR_SOLIDS, patches: BAR_PATCHES, start: BAR_START, ceiling: 300 };

export function createBar(): World {
  return new World(BAR);
}
