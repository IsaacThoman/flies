import type { FoodPatch } from "./pantry.ts";
import type { Solid } from "./shapes.ts";
import type { Place } from "./world.ts";

/** Millimetres, with the worktop at zero; the splashback is along -z. */
export const COUNTER = { hx: 500, hz: 300 };
export const KITCHEN_BOWL = { x: -155, z: -35, r: 124 };
export const KITCHEN_BOARD = { x: 80, z: 170, hx: 132, hz: 76, top: 14 };
export const KITCHEN_GLASS = { x: 186, z: -65, r: 43, wine: 112, rim: 187 };
export const KITCHEN_JAR = { x: 354, z: 110, r: 38, top: 112 };
export const KITCHEN_CADDY = { x: -369, z: -180, hx: 66, hz: 55, top: 162 };

const box = (
  name: string,
  x: number,
  z: number,
  hx: number,
  hz: number,
  y: number,
  bottom?: number,
): Solid => ({
  name,
  footprint: { kind: "box", x, z, hx, hz, angle: 0 },
  top: { kind: "flat", y },
  ...(bottom === undefined ? {} : { bottom }),
});
const dome = (
  name: string,
  x: number,
  z: number,
  r: number,
  base: number,
  height: number,
  power = 0.5,
): Solid => ({
  name,
  footprint: { kind: "circle", x, z, r },
  top: { kind: "dome", base, height, power },
});

/** Each banana is a continuous envelope of overlapping rounds, including its tapered ends. */
export const KITCHEN_BANANAS = [0, 1].map((row) =>
  Array.from({ length: 25 }, (_, i): Solid => {
    const t = i / 24;
    const x = -246 + 185 * t;
    const z = -68 - 29 * Math.sin(Math.PI * t) + row * 33;
    const r = 3 + 14 * Math.pow(Math.sin(Math.PI * t), 0.6);
    return {
      name: "kitchen banana",
      footprint: { kind: "ellipse", x, z, rx: r * 1.35, rz: r, angle: 0 },
      top: { kind: "dome", base: 42, height: r * 1.15, power: 0.5 },
    };
  }),
);

export const KITCHEN_GRAPES = [
  [-174, -9, 21],
  [-151, 0, 22],
  [-128, -13, 19],
  [-138, -34, 22],
  [-160, -29, 20],
  [-182, -31, 18],
  [-127, -36, 18],
  [-160, -5, 23],
].map(([x, z, height]) => dome("kitchen grape", x, z, 11, 9, height));

const c = KITCHEN_CADDY;
export const KITCHEN_SOLIDS: readonly Solid[] = [
  {
    name: "kitchen pendant",
    footprint: { kind: "circle", x: 260, z: -160, r: 70 },
    bottom: 430,
    top: { kind: "dome", base: 430, height: 62, power: 1 },
  },
  {
    name: "kitchen cord",
    footprint: { kind: "circle", x: 260, z: -160, r: 1.5 },
    bottom: 490,
    top: { kind: "flat", y: 1400 },
  },
  box("kitchen wall", 0, -325, 1800, 25, 1600),
  {
    name: "kitchen bowl",
    footprint: { kind: "circle", ...KITCHEN_BOWL },
    top: { kind: "dish", well: 9, rim: 58, inner: 0.42, lip: 0.84 },
  },
  ...KITCHEN_BANANAS.flat(),
  ...KITCHEN_GRAPES,
  box(
    "kitchen board",
    KITCHEN_BOARD.x,
    KITCHEN_BOARD.z,
    KITCHEN_BOARD.hx,
    KITCHEN_BOARD.hz,
    KITCHEN_BOARD.top,
  ),
  dome("kitchen peach", 30, 158, 35, 14, 23, 0.18),
  dome("kitchen stone", 30, 158, 10, 36, 4, 0.7),
  ...[
    [97, 178, 2.8],
    [105, 185, 1.7],
    [90, 189, 1.4],
    [140, 145, 2],
  ].map(([x, z, r]) => dome("kitchen crumb", x, z, r, 14, r * 0.65, 1)),
  {
    name: "kitchen glass foot",
    footprint: {
      kind: "circle",
      x: KITCHEN_GLASS.x,
      z: KITCHEN_GLASS.z,
      r: 32,
    },
    top: { kind: "dome", base: 0, height: 3, power: 0.45 },
  },
  {
    name: "kitchen glass stem",
    footprint: { kind: "circle", x: KITCHEN_GLASS.x, z: KITCHEN_GLASS.z, r: 3 },
    top: { kind: "flat", y: 103 },
  },
  {
    name: "kitchen wine",
    footprint: {
      kind: "circle",
      x: KITCHEN_GLASS.x,
      z: KITCHEN_GLASS.z,
      r: KITCHEN_GLASS.r,
    },
    bottom: 100,
    top: {
      kind: "dish",
      well: KITCHEN_GLASS.wine,
      rim: KITCHEN_GLASS.rim,
      inner: 0.43,
      lip: 0.97,
    },
  },
  {
    name: "kitchen honey jar",
    footprint: {
      kind: "circle",
      x: KITCHEN_JAR.x,
      z: KITCHEN_JAR.z,
      r: KITCHEN_JAR.r,
    },
    top: { kind: "flat", y: KITCHEN_JAR.top },
  },
  box("kitchen compost", c.x, c.z, c.hx - 3, c.hz - 3, c.top - 12),
  box("kitchen caddy", c.x - c.hx + 1.5, c.z, 1.5, c.hz, c.top),
  box("kitchen caddy", c.x + c.hx - 1.5, c.z, 1.5, c.hz, c.top),
  box("kitchen caddy", c.x, c.z - c.hz + 1.5, c.hx, 1.5, c.top),
  box("kitchen caddy", c.x, c.z + c.hz - 1.5, c.hx, 1.5, c.top),
  // Thin level slices follow the tilted lid, leaving a genuine fly-sized opening.
  ...Array.from({ length: 55 }, (_, i) =>
    box(
      "kitchen lid",
      c.x,
      c.z - c.hz + i * 2 + 1,
      c.hx + 2,
      1,
      c.top + i * 0.6 + 4,
      c.top + i * 0.6,
    ),
  ),
];

export const KITCHEN_PATCHES: readonly FoodPatch[] = [
  { name: "banana", x: -158, z: -96, r: 5, sweet: 0.95 },
  { name: "peach juice", x: 46, z: 165, r: 7, sweet: 0.9 },
  { name: "grape juice", x: -151, z: 0, r: 4, sweet: 0.8 },
  {
    name: "red wine",
    x: KITCHEN_GLASS.x,
    z: KITCHEN_GLASS.z,
    y: KITCHEN_GLASS.wine,
    r: 16,
    sweet: 0.65,
    pool: true,
  },
  { name: "honey", x: 305, z: 160, r: 10, sweet: 1, pool: true },
  { name: "wine", x: 225, z: -20, r: 8, sweet: 0.65, pool: true },
  { name: "crumbs", x: 98, z: 183, r: 12, sweet: 0.25 },
];
export const KITCHEN: Place = {
  floor: { kind: "rect", ...COUNTER },
  solids: KITCHEN_SOLIDS,
  patches: KITCHEN_PATCHES,
  start: { x: 81, z: 180, y: 14, yaw: Math.PI - 0.5 },
  ceiling: 300,
};
