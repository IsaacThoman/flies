import type { FoodPatch } from "./pantry.ts";
import type { Solid } from "./shapes.ts";
import type { Place } from "./world.ts";

/** Millimetres, with the worktop at zero; the splashback is along -z. */
export const COUNTER = { hx: 500, hz: 300 };
export const KITCHEN_BOWL = { x: -155, z: -35, r: 124 };
export const KITCHEN_BOARD = { x: 80, z: 170, hx: 132, hz: 76, top: 14 };
export const KITCHEN_GLASS = { x: 186, z: -65, r: 43, wine: 112, rim: 187 };
export const KITCHEN_JAR = { x: 354, z: 110, r: 38, top: 112 };
export const KITCHEN_CADDY = {
  x: -369,
  z: -180,
  hx: 66,
  hz: 55,
  top: 162,
  lidSlices: 440,
};

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

export const KITCHEN_PEACH = {
  x: 30,
  z: 158,
  rx: 35,
  rz: 30,
  angle: 0.25,
  base: 14,
  cut: 40,
};
/** Flat cut face above a rounded underside: slabs keep the air beneath its skin real. */
export const KITCHEN_PEACH_BANDS = Array.from({ length: 48 }, (_, i) => {
  const p = KITCHEN_PEACH;
  const bottom = p.base + ((p.cut - p.base) * i) / 48;
  const radius = Math.max(
    0.6 / p.rx,
    Math.sqrt(1 - Math.pow((p.cut - bottom) / (p.cut - p.base), 2)),
  );
  return { bottom, radius };
});

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
  // Equal-height surfaces choose the first solid. The widest band owns the
  // continuous cut face so its food remains tastable across the smaller bands.
  ...KITCHEN_PEACH_BANDS.toReversed().map(({ bottom, radius }): Solid => ({
    name: "kitchen peach",
    footprint: {
      kind: "ellipse",
      x: KITCHEN_PEACH.x,
      z: KITCHEN_PEACH.z,
      rx: KITCHEN_PEACH.rx * radius,
      rz: KITCHEN_PEACH.rz * radius,
      angle: KITCHEN_PEACH.angle,
    },
    bottom,
    top: { kind: "flat", y: KITCHEN_PEACH.cut },
  })),
  {
    name: "kitchen stone",
    footprint: {
      kind: "ellipse",
      x: 25,
      z: 155,
      rx: 7.8,
      rz: 12,
      angle: -0.35,
    },
    top: { kind: "dome", base: 40, height: 4.2, power: 0.6 },
  },
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
    top: { kind: "dome", base: 86, height: 11, power: 0.5 },
  },
  {
    name: "kitchen honey neck",
    footprint: { kind: "circle", x: KITCHEN_JAR.x, z: KITCHEN_JAR.z, r: 32 },
    top: { kind: "flat", y: 108 },
  },
  {
    name: "kitchen honey lid",
    footprint: { kind: "circle", x: KITCHEN_JAR.x, z: KITCHEN_JAR.z, r: 38 },
    bottom: 108,
    top: { kind: "flat", y: 112 },
  },

  box("kitchen compost", c.x, c.z, c.hx - 3, c.hz - 3, c.top - 12),
  box("kitchen caddy", c.x - c.hx + 1.5, c.z, 1.5, c.hz, c.top),
  box("kitchen caddy", c.x + c.hx - 1.5, c.z, 1.5, c.hz, c.top),
  box("kitchen caddy", c.x, c.z - c.hz + 1.5, c.hx, 1.5, c.top),
  box("kitchen caddy", c.x, c.z + c.hz - 1.5, c.hx, 1.5, c.top),
  // Thin level slices follow the tilted lid, leaving a genuine fly-sized opening.
  ...Array.from({ length: c.lidSlices }, (_, i) =>
    box(
      "kitchen lid",
      c.x,
      c.z - c.hz + (i + 0.5) * ((c.hz * 2) / c.lidSlices),
      c.hx + 2,
      // Footprints exclude their edge; a microscopic overlap closes slice seams.
      c.hz / c.lidSlices + 1e-6,
      c.top + i * ((c.hz * 0.6) / c.lidSlices) + 4,
      c.top + i * ((c.hz * 0.6) / c.lidSlices),
    ),
  ),
];

export const KITCHEN_PATCHES: readonly FoodPatch[] = [
  { name: "banana", x: -158, z: -96, r: 5, sweet: 0.95 },
  { name: "peach juice", x: 51, z: 170, r: 7, sweet: 0.9 },
  { name: "peach juice", x: 68, z: 176, y: 14, r: 9, sweet: 0.9, pool: true },
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
  // Leave room on the cut face for all eight shared-table spawn positions.
  start: { x: 50, z: 168, y: 40, yaw: -Math.PI / 2 },
  ceiling: 300,
};
