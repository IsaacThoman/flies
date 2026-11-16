// The street outside the restaurant's shop front, in the room's millimetres
// (y up, the room's floor y = 0, the glass at z = 3000): what the backdrop
// draws (street.ts) and what throws its light into the room (traffic.ts)
// are built from this one description, so that the lamp outside is where
// its light comes in from, and the car seen passing is the one whose
// headlamps sweep the ceiling.

import { DINING_ROOM } from "@fly/world";

/** Across the street (z, outward from the shop front) and down it (y). */
export const STREET = {
  /** The shop front's outside face: the pavement starts here. */
  front: DINING_ROOM.hz + DINING_ROOM.wall,
  /** The pavement, a step down from the room's floor, out to the kerb. */
  pavement: -150,
  kerb: 6400,
  /** The road, a kerb's height below, to the far kerb. */
  road: -280,
  farKerb: 15_200,
  /** The parking lane along this side, and the two lanes: this side's runs toward +x, the far side's toward -x. */
  parking: 7450,
  lanes: [10_400, 13_500] as readonly number[],
  /** The fronts of the buildings across. */
  facades: 19_000,
  /** A side street opening off across the road, between these, running away from it. */
  side: { x0: 800, x1: 7600 },
  /** How tall the restaurant's own row is: by day it shades the near pavement when the sun is behind it. */
  nearRow: 15_500,
  /** How far along the street anything is built, either way. */
  reach: 90_000,
};

/** The door's glass starts over its bottom rail (mm up from the floor). */
export const DOOR_RAIL = 250;

/** A car's headlamps' height over the road. */
export const HEADLAMPS = 680;

/** A street lamp: where its lantern is. */
export type Lamp = { x: number; y: number; z: number };

const LANTERN = 4700;
/**
 * The street lamps: on this kerb (the one just outside, by the door, lights
 * the room), on the far kerb staggered between them, and lanterns on
 * brackets down the side street.
 */
export const LAMPS: readonly Lamp[] = [
  { x: 2300, y: LANTERN, z: STREET.kerb - 320 },
  { x: -27_500, y: LANTERN, z: STREET.kerb - 320 },
  { x: 24_500, y: LANTERN, z: STREET.kerb - 320 },
  { x: -14_500, y: LANTERN, z: STREET.farKerb + 320 },
  { x: 11_000, y: LANTERN, z: STREET.farKerb + 320 },
  { x: -41_000, y: LANTERN, z: STREET.farKerb + 320 },
  { x: 37_000, y: LANTERN, z: STREET.farKerb + 320 },
  { x: STREET.side.x1 - 450, y: 4200, z: 30_000 },
  { x: STREET.side.x0 + 450, y: 4200, z: 44_000 },
];

/** The lamp outside the window, whose light comes in. */
export const NEAR_LAMP = LAMPS[0];

/**
 * The corner bar across the road, on the corner of the side street: its
 * window (x0..x1, y0..y1 on its front) and the neon in it, a wine glass;
 * the late shop further along, lit inside all night.
 */
export const CORNER_BAR = { x0: -4800, x1: 300, y0: STREET.pavement + 500, y1: STREET.pavement + 3300, neon: { x: -2300, y: STREET.pavement + 2050, z: STREET.facades + 250 } };
export const LATE_SHOP = { x0: -20_200, x1: -15_800, y0: STREET.pavement + 300, y1: STREET.pavement + 3100 };

/** The cars parked along this kerb (their middles along x, and lengths), leaving the view from the window tables open. */
export const PARKED: readonly { x: number; length: number; look: number }[] = [
  { x: -15_400, length: 4300, look: 3 },
  { x: -9600, length: 4600, look: 1 },
  { x: -5200, length: 4100, look: 4 },
  { x: 7400, length: 4400, look: 2 },
  { x: 12_400, length: 4700, look: 0 },
  { x: 17_600, length: 4200, look: 5 },
];
