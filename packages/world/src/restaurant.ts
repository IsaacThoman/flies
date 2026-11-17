// The restaurant: a small city bistro, closed for the night. Everything the
// fly can stand on, bump into or eat is here, in millimetres. Unlike the
// other places the fly's floor is the room's own: y = 0 is the tiled floor,
// the origin is the middle of the room, the street windows run along the
// front wall (+z), the zinc bar stands along the left wall (-x) with the back
// bar behind it, the kitchen pass is in the back wall (-z), and a banquette
// runs along the right wall (+x) with the door at its front end. Table tops,
// chair seats, shelves and lamps are slabs (`bottom`): there is air under
// them, and the fly can walk and fly beneath them.

import type { FoodPatch } from "./pantry.ts";
import type { Footprint, Solid, Top } from "./shapes.ts";
import { World } from "./world.ts";
import type { Place } from "./world.ts";

/** The room inside its walls: half-sizes along x and z, the ceiling's height, and the walls' thickness. */
export const DINING_ROOM = { hx: 4200, hz: 3000, height: 3200, wall: 150 };

/**
 * The street front: a timber shop front along the front wall. A ledge runs
 * inside the glass (`ledge`), the big panes stand between mullions from the
 * ledge to the transom, small panes above it to the head, and the door is at
 * the right-hand end, between its posts.
 */
export const SHOPFRONT = {
  glass: DINING_ROOM.hz,
  ledge: { x0: -DINING_ROOM.hx, x1: 2800, depth: 180, top: 450 },
  mullions: [-2700, -1200, 300, 1800] as readonly number[],
  mullion: { half: 30, depth: 60 },
  door: { x0: 2950, x1: 3750, head: 2300 },
  transom: { y: 2320, half: 20, depth: 40 },
  head: 2750,
};

/**
 * The zinc bar: its top (`zinc`), the panelled front under it set back to
 * leave an overhang on the customers' side, the bartender's lower working
 * counter behind it (`underbar`, against the front's back, leaving no slot), the brass foot rail, and the back bar
 * against the left wall: cabinets (the drinks fridge's glass doors in their
 * face, `fridge`), and shelves of bottles above against the mirror.
 */
export const ZINC_BAR = {
  zinc: { x: -2850, z: -600, hx: 300, hz: 1700, bottom: 1045, top: 1080 },
  front: { x: -2915, hx: 235, hz: 1660 },
  underbar: { x: -3285, hx: 135, z0: -2250, z1: 1050, top: 860 },
  rail: { x: -2610, half: 25, bottom: 175, top: 225 },
  back: { x0: -DINING_ROOM.hx, x1: -3700, z0: -2400, z1: 1300, top: 900 },
  fridge: { z0: -1500, z1: 0 },
  shelves: { x0: -DINING_ROOM.hx, x1: -3960, z0: -2000, z1: 900, tops: [1360, 1720, 2080] as readonly number[], thick: 25 },
};

/**
 * The kitchen pass in the back wall: the opening, its steel shelf (out over
 * the dining room and back into the kitchen), the heat lamps under its head,
 * the ticket rail on the wall above, and behind the wall, beyond the floor,
 * the kitchen's bench at the shelf's height between the pass's deep side
 * walls: a fly blown through the pass is held in front of it, to be drawn
 * back out, never down behind the wall or along it out of the way back.
 */
export const PASS = {
  x0: 900,
  x1: 2500,
  sill: 1100,
  head: 1900,
  shelf: { x: 1700, z0: -3300, z1: -2760, hx: 820, top: 1130 },
  lamps: { hx: 760, z0: -3130, z1: -3010, bottom: 1800, top: 1880 },
  rail: { hx: 720, z0: -3000, z1: -2975, bottom: 1920, top: 1945 },
  tickets: [1300, 1500, 2050] as readonly number[],
  kitchen: { x0: 880, x1: 2520, z0: -3800, z1: -3150, top: 1130, wall: 150 },
  /** The kitchen's swing door, in the back wall right of the pass, with a round window: drawn flat in the wall. */
  door: { x0: 2750, x1: 3550, head: 2150 },
};

export type ChairPlace = {
  x: number;
  z: number;
  /** Which way it faces (radians; 0 faces +z, as the fly's yaw). */
  yaw: number;
  /** Upside down on a table top this high, its legs up and its back hanging over the edge. */
  upturned?: number;
};

export type TableKind =
  /** A round marble top on a cast-iron pedestal: the window tables. */
  | "round"
  /** A square marble top on a cast-iron pedestal with a crossed foot: the banquette's tables. */
  | "square"
  /** A square oak top on four legs with an apron: the four-tops in the middle of the room. */
  | "four";

export type TablePlace = { id: string; kind: TableKind; x: number; z: number; chairs: readonly ChairPlace[] };

/** Every table's top: round ones by radius, square ones by half-size, and how high. */
export const TABLE_TOPS = {
  round: { r: 330, bottom: 738, top: 760 },
  square: { half: 300, bottom: 738, top: 760 },
  four: { half: 400, bottom: 730, top: 760 },
};

/** The cast-iron spider under a marble top: its hub's radius, its arms' half-width, how far each reaches along its diagonal, and how deep it is. */
export const SPIDER = { round: { hub: 48, arm: 11, reach: 149 }, square: { hub: 48, arm: 11, reach: 192 }, depth: 26 };

/** The bentwood chair (in its own frame: `ahead` toward where it faces, `aside` across): seat, legs, the back's posts and rails. */
export const CHAIR = {
  seat: { r: 200, bottom: 428, rim: 446, crown: 4 },
  leg: { r: 14, at: 113 },
  post: { top: 880, crown: 6 },
  rail: { half: 113, depth: 12, bottom: 800, top: 880 },
  mid: { half: 100, depth: 9, bottom: 610, top: 640 },
};

/** Where a pushed-in chair stands from its table's middle. */
const TUCK = 470;

const tuckedRound = (x: number, z: number): ChairPlace[] => [
  { x: x - TUCK, z, yaw: Math.PI / 2 },
  { x: x + TUCK, z, yaw: -Math.PI / 2 },
];
const tuckedFour = (x: number, z: number): ChairPlace[] => [
  { x, z: z + TUCK, yaw: Math.PI },
  { x, z: z - TUCK, yaw: 0 },
  { x: x + TUCK, z, yaw: -Math.PI / 2 },
  { x: x - TUCK, z, yaw: Math.PI / 2 },
];
/** Two chairs upside down on a four-top for the night, their backs over the front and back edges. */
const upturned = (x: number, z: number): ChairPlace[] => {
  const top = TABLE_TOPS.four.top;
  const off = TABLE_TOPS.four.half + 25 - CHAIR.leg.at;
  return [
    { x, z: z + off, yaw: Math.PI, upturned: top },
    { x, z: z - off, yaw: 0, upturned: top },
  ];
};

/** The tables, by where they stand: the window's, the middle of the room's, and the banquette's. */
export const TABLES: readonly TablePlace[] = [
  { id: "window-left", kind: "round", x: -1800, z: 2330, chairs: tuckedRound(-1800, 2330) },
  { id: "window", kind: "round", x: -300, z: 2330, chairs: tuckedRound(-300, 2330) },
  { id: "window-right", kind: "round", x: 1200, z: 2330, chairs: tuckedRound(1200, 2330) },
  { id: "middle-left", kind: "four", x: -900, z: 500, chairs: tuckedFour(-900, 500) },
  { id: "middle-right", kind: "four", x: 1100, z: 500, chairs: upturned(1100, 500) },
  { id: "back-left", kind: "four", x: -900, z: -1300, chairs: upturned(-900, -1300) },
  { id: "back-right", kind: "four", x: 1100, z: -1300, chairs: tuckedFour(1100, -1300) },
  { id: "banquette-front", kind: "square", x: 3350, z: 900, chairs: [{ x: 3350 - TUCK, z: 900, yaw: Math.PI / 2 }] },
  { id: "banquette", kind: "square", x: 3350, z: -300, chairs: [{ x: 3350 - TUCK, z: -300, yaw: Math.PI / 2 }] },
  { id: "banquette-back", kind: "square", x: 3350, z: -1500, chairs: [{ x: 3350 - TUCK, z: -1500, yaw: Math.PI / 2 }] },
];

/** The upholstered banquette along the right wall: its seat, and its back against the wall. */
export const BANQUETTE = { x0: 3700, x1: DINING_ROOM.hx, z0: -2200, z1: 1500, seat: 450, back: { x0: 4080, top: 1050 } };

/** The bar stools along the customers' side, pushed in under the zinc's overhang: a round seat on a post on a cast-iron foot. */
export const STOOL = { x: -2380, zs: [-1900, -1300, -700, -100, 500, 1000] as readonly number[], seat: { r: 180, bottom: 735, rim: 768, crown: 10 }, post: 28, foot: { r: 220, rim: 6, crown: 24 } };

/** Enamel bell pendants over the bar on long cords, a frosted diffuser closing each underneath; the middle one left on for the night. */
export const PENDANTS = { x: -2850, zs: [-1500, -300, 900] as readonly number[], lit: 1, r: 170, bottom: 1820, height: 190, cord: 4 };

/** The host's stand by the door: a podium, with the menus and the reservations book on it. */
export const HOST_STAND = { x: 2550, z: 2150, hx: 280, hz: 210, top: 1100 };

/** The service station against the back wall: a cabinet with a tray of cutlery, a stack of plates, a carafe, and tumblers upturned to dry. */
export const STATION = { x: -1700, z: -2775, hx: 600, hz: 225, top: 920 };

/** Things on the walls, standing proud of them: the mirror over the banquette, the chalkboard and the framed print on the back wall, and the exit sign over the door. */
export const WALL_THINGS = {
  mirror: { x: DINING_ROOM.hx - 15, z: -350, hx: 15, hz: 1500, bottom: 1150, top: 2250 },
  chalkboard: { x: -500, z: -DINING_ROOM.hz + 12, hx: 450, hz: 12, bottom: 1300, top: 2100 },
  print: { x: -1700, z: -DINING_ROOM.hz + 15, hx: 350, hz: 15, bottom: 1400, top: 2000 },
  exit: { x: 3350, z: DINING_ROOM.hz - 40, hx: 170, hz: 40, bottom: 2480, top: 2660 },
};

/**
 * A bottle: a round (or square) body to its shoulder, then a neck. Mineral
 * water; juice, its neck wide for a screw cap; a square bottle of oil or
 * syrup; and the tall, slim bottles of the coffee syrups.
 */
export type BottleKind = "water" | "juice" | "square" | "syrup";
export const BOTTLE_SHAPES: Readonly<Record<BottleKind, { r: number; body: number; neck: number; top: number }>> = {
  water: { r: 37, body: 220, neck: 17, top: 275 },
  juice: { r: 40, body: 200, neck: 20, top: 255 },
  square: { r: 42, body: 210, neck: 14, top: 265 },
  syrup: { r: 33, body: 260, neck: 13, top: 315 },
};
export type BottlePlace = { kind: BottleKind; x: number; z: number; on: number };

const KINDS: readonly BottleKind[] = ["water", "juice", "square", "syrup", "juice", "water", "syrup", "square"];
/** The back bar's bottles: along its counter and on each shelf, spaced along the wall. */
export const BOTTLES: readonly BottlePlace[] = [
  ...Array.from({ length: 6 }, (_, i): BottlePlace => ({ kind: KINDS[(i + 3) % KINDS.length], x: -4100, z: -2050 + i * 140 + (i > 2 ? 1500 : 0), on: ZINC_BAR.back.top })),
  ...ZINC_BAR.shelves.tops.flatMap((on, s) =>
    Array.from({ length: 8 }, (_, i): BottlePlace => ({ kind: KINDS[(i + s * 3) % KINDS.length], x: -4080, z: -1850 + i * 360 + (s % 2) * 120, on })),
  ),
  // Three on the window's ledge, for the look of the place.
  { kind: "syrup", x: -3700, z: 2900, on: SHOPFRONT.ledge.top },
  { kind: "water", x: -3580, z: 2920, on: SHOPFRONT.ledge.top },
  { kind: "syrup", x: -3480, z: 2890, on: SHOPFRONT.ledge.top },
];

/**
 * A tumbler where it was left, on a table top or the bar, a third full: its
 * straight side, its rim, the thick glass of its bottom rounding up into the
 * side, and the drink's surface its well.
 */
export const JUICE_GLASS = { r: 38, well: 40, rim: 105, inner: 0.9, lip: 0.97 };
export const JUICE_GLASSES: readonly { x: number; z: number; on: number }[] = [
  { x: -150, z: 2235, on: TABLE_TOPS.round.top },
  { x: -2720, z: -310, on: ZINC_BAR.zinc.top },
  { x: -2790, z: -140, on: ZINC_BAR.zinc.top },
];

/** Salt and pepper: glass shakers with steel caps. */
export const SHAKER = { r: 20, top: 85, cap: 8 };
export const SHAKERS: readonly { x: number; z: number; on: number }[] = [
  { x: -240, z: 2500, on: 760 },
  { x: -196, z: 2462, on: 760 },
  { x: -1880, z: 2480, on: 760 },
  { x: -1838, z: 2512, on: 760 },
  { x: 1350, z: 2480, on: 760 },
  { x: 1392, z: 2442, on: 760 },
  { x: -860, z: 470, on: 760 },
  { x: -820, z: 505, on: 760 },
  { x: 3420, z: 960, on: 760 },
  { x: 3460, z: 925, on: 760 },
  { x: 3420, z: -1440, on: 760 },
  { x: 3460, z: -1475, on: 760 },
];

/** The window table's things, where the fly starts: the sugar, a bud vase, a votive, and the torn packet spilt beside them. */
export const START_TABLE = {
  sugar: { x: -330, z: 2480, hx: 45, hz: 30, angle: 0.3, top: 822 },
  vase: { x: -280, z: 2560, r: 22, top: 140, stem: 2, bloom: { r: 26, bottom: 300, base: 312, height: 16 } },
  votive: { x: -430, z: 2370, r: 30, wax: 20, rim: 62 },
  packet: { x: -265, z: 2405, hx: 25, hz: 18, angle: -0.5, top: 0.5 },
  sugarSpill: { x: -305, z: 2425, r: 9 },
  ring: { x: -205, z: 2345, r: 37 },
};

/** The ketchup bottle on the left window table, its cap crusted, and a laminated menu left there. */
export const KETCHUP = { x: -1750, z: 2470, r: 34, shoulder: 140, crown: 30, neck: 15, cap: { r: 18, bottom: 200, top: 218 } };
export const MENU = { x: -1860, z: 2240, hx: 110, hz: 160, angle: 0.5, thick: 0.8 };

/** The bread basket on the right window table, a heel of bread left in its napkin. */
export const BREAD = { x: 1180, z: 2390, rx: 130, rz: 85, angle: 0.4, well: 20, rim: 70, heel: { rx: 70, rz: 45, height: 45 } };

/** An espresso cup on its saucer, sugar left in the bottom, on the banquette's middle table. */
export const ESPRESSO = { x: 3400, z: -260, saucer: { r: 60, well: 4, rim: 12 }, cup: { r: 30, well: 12, rim: 60 }, handle: { out: 44, half: 2, bottom: 16, top: 44 } };

/** On the zinc: the fruit bowl near the front end, the cutting board with a cut lemon, the bar mat with the milk jug drying on it, and a cake under a glass cloche at the back end. */
export const ON_BAR = {
  bowl: { x: -2800, z: 800, r: 150, well: 12, rim: 80, inner: 0.55, lip: 0.9 },
  // Each wholly inside the bowl's lip, touching its neighbours at most.
  oranges: [
    { x: -2845, z: 760, r: 38 },
    { x: -2760, z: 825, r: 37 },
    { x: -2830, z: 870, r: 36 },
  ] as readonly { x: number; z: number; r: number }[],
  lemons: [{ x: -2895, z: 830, rx: 34, rz: 25, angle: -1.265 }] as readonly { x: number; z: number; rx: number; rz: number; angle: number }[],
  peach: { x: -2740, z: 745, r: 34 },
  board: { x: -2790, z: 330, hx: 150, hz: 100, angle: 0.2, thick: 18 },
  halfLemon: { x: -2830, z: 300, r: 32, height: 30 },
  slices: [
    { x: -2740, z: 300, r: 26 },
    { x: -2735, z: 360, r: 25 },
    { x: -2790, z: 395, r: 26 },
  ] as readonly { x: number; z: number; r: number }[],
  sliceThick: 6,
  knife: { x: -2880, z: 390, angle: 0.2 + Math.PI / 2, blade: { hx: 55, hz: 7, thick: 3 }, handle: { hx: 26, hz: 6, thick: 14 } },
  mat: { x: -2780, z: -900, hx: 225, hz: 75, thick: 10 },
  jug: { x: -2760, z: -940, r: 45, top: 170 },
  cake: { x: -2850, z: -1900, foot: { r: 90, height: 6 }, stem: { r: 22, top: 95 }, plate: { r: 150, top: 108 }, cloche: { r: 142, height: 210 }, knob: { r: 14, height: 15 } },
};

/** On the pass: a dessert plate sent back with crumbs and a smear of coulis, and a stack of clean plates. */
export const ON_PASS = {
  dessert: { x: 1500, z: -2870, r: 120, well: 3, rim: 15, inner: 0.62, lip: 0.82 },
  stack: { x: 2080, z: -2880, r: 115, height: 65 },
};

/** On the host's stand: the menus (the top one sticky), the reservations book, and a bowl of mints. */
export const ON_HOST = {
  menus: { x: 2410, z: 2150, hx: 120, hz: 170, thick: 25 },
  book: { x: 2680, z: 2090, hx: 110, hz: 140, thick: 35 },
  mints: { x: 2690, z: 2295, r: 48, well: 6, rim: 32 },
};

/** On the service station: a cutlery tray, a stack of plates, a water carafe, and six tumblers upturned to dry. */
export const ON_STATION = {
  tray: { x: -2060, z: -2760, hx: 160, hz: 110, well: 4, rim: 55 },
  plates: { x: -1700, z: -2800, r: 135, height: 90 },
  // Its mouth as deep as the neck, down to where the body's dome closes it.
  carafe: { x: -1420, z: -2700, r: 55, shoulder: 200, crown: 40, neck: 22, top: 280, mouth: 40 },
  tumblers: Array.from({ length: 6 }, (_, i) => ({ x: -1330 + (i % 3) * 80, z: -2880 + Math.floor(i / 3) * 80 })) as readonly { x: number; z: number }[],
  tumbler: { r: 35, height: 95 },
};

// Building the solids.

const box = (x: number, z: number, hx: number, hz: number, angle = 0): Footprint => ({ kind: "box", x, z, hx, hz, angle });
const circle = (x: number, z: number, r: number): Footprint => ({ kind: "circle", x, z, r });
const flat = (y: number): Top => ({ kind: "flat", y });
const dome = (base: number, height: number, power: number): Top => ({ kind: "dome", base, height, power });
const vault = (base: number, height: number, power: number): Top => ({ kind: "vault", base, height, power });
const solid = (name: string, footprint: Footprint, top: Top, bottom?: number): Solid => (bottom === undefined ? { name, footprint, top } : { name, footprint, top, bottom });

function room(): Solid[] {
  const { hx, hz, height, wall } = DINING_ROOM;
  const half = wall / 2;
  const { x0, x1, sill, head } = PASS;
  return [
    solid("ceiling", box(0, 0, hx + wall, hz + wall), flat(height + 200), height),
    solid("wall", box(-hx - half, 0, half, hz + wall), flat(height)),
    solid("wall", box(hx + half, 0, half, hz + wall), flat(height)),
    // The street front's glass, and the wall either side of the pass.
    solid("glass", box(0, hz + half, hx + wall, half), flat(height)),
    solid("wall", box((-hx - wall + x0) / 2, -hz - half, (x0 + hx + wall) / 2, half), flat(height)),
    solid("wall", box((x1 + hx + wall) / 2, -hz - half, (hx + wall - x1) / 2, half), flat(height)),
    solid("wall", box((x0 + x1) / 2, -hz - half, (x1 - x0) / 2, half), flat(sill)),
    solid("wall", box((x0 + x1) / 2, -hz - half, (x1 - x0) / 2, half), flat(height), head),
  ];
}

function shopfront(): Solid[] {
  const { ledge, mullions, mullion, door, transom } = SHOPFRONT;
  const z = SHOPFRONT.glass - mullion.depth / 2;
  return [
    solid("ledge", box((ledge.x0 + ledge.x1) / 2, SHOPFRONT.glass - ledge.depth / 2, (ledge.x1 - ledge.x0) / 2, ledge.depth / 2), flat(ledge.top)),
    ...[...mullions, door.x0, door.x1].map((x) => solid("mullion", box(x, z, mullion.half, mullion.depth / 2), flat(DINING_ROOM.height))),
    solid("transom", box(0, SHOPFRONT.glass - transom.depth / 2, DINING_ROOM.hx, transom.depth / 2), vault(transom.y + transom.half - 8, 8, 1), transom.y - transom.half),
  ];
}

function bar(): Solid[] {
  const { zinc, front, underbar, rail, back, shelves } = ZINC_BAR;
  const out: Solid[] = [
    solid("zinc", box(zinc.x, zinc.z, zinc.hx, zinc.hz), flat(zinc.top), zinc.bottom),
    solid("bar front", box(front.x, zinc.z, front.hx, front.hz), flat(zinc.bottom)),
    solid("underbar", box(underbar.x, (underbar.z0 + underbar.z1) / 2, underbar.hx, (underbar.z1 - underbar.z0) / 2), flat(underbar.top)),
    // A brass tube: rounded over its top, its lower half felt as the box it sits in.
    solid("foot rail", box(rail.x, zinc.z, rail.half, front.hz - 10), vault(rail.top - rail.half, rail.half, 0.5), rail.bottom),
    solid("back bar", box((back.x0 + back.x1) / 2, (back.z0 + back.z1) / 2, (back.x1 - back.x0) / 2, (back.z1 - back.z0) / 2), flat(back.top)),
  ];
  // The rail's brackets, back to the bar's front.
  const face = front.x + front.hx;
  for (const z of [-2100, -1100, -100, 900]) out.push(solid("bracket", box((face + rail.x) / 2, z, (rail.x - face) / 2, 8), flat(rail.top - rail.half + 10), rail.top - rail.half - 10));
  for (const top of shelves.tops) {
    out.push(solid("shelf", box((shelves.x0 + shelves.x1) / 2, (shelves.z0 + shelves.z1) / 2, (shelves.x1 - shelves.x0) / 2, (shelves.z1 - shelves.z0) / 2), flat(top), top - shelves.thick));
  }
  for (const z of STOOL.zs) {
    const { seat, post, foot } = STOOL;
    out.push(
      solid("stool foot", circle(STOOL.x, z, foot.r), dome(foot.rim, foot.crown, 1)),
      solid("stool post", circle(STOOL.x, z, post), flat(seat.bottom)),
      solid("stool", circle(STOOL.x, z, seat.r), dome(seat.rim, seat.crown, 1), seat.bottom),
    );
  }
  for (const z of PENDANTS.zs) {
    const p = PENDANTS;
    out.push(
      solid("pendant", circle(p.x, z, p.r), dome(p.bottom, p.height, 1), p.bottom),
      solid("cord", circle(p.x, z, p.cord), flat(DINING_ROOM.height), p.bottom + p.height - 5),
    );
  }
  return out;
}

/** A bottle standing on something `on` high. */
function bottle(b: BottlePlace): Solid[] {
  const s = BOTTLE_SHAPES[b.kind];
  const body = b.kind === "square" ? box(b.x, b.z, s.r * 0.75, s.r * 0.75) : circle(b.x, b.z, s.r);
  return [
    solid("bottle", body, dome(b.on + s.body - s.r * 0.6, s.r * 0.6, 1), b.on),
    solid("bottle neck", circle(b.x, b.z, s.neck), dome(b.on + s.top - s.neck * 0.5, s.neck * 0.5, 0.5), b.on + s.body - s.r * 0.7),
  ];
}

/** A point in a chair's frame: `ahead` toward where it faces, `aside` to its left. */
function chairPoint(c: ChairPlace, ahead: number, aside: number) {
  const s = Math.sin(c.yaw);
  const k = Math.cos(c.yaw);
  return { x: c.x + s * ahead + k * aside, z: c.z + k * ahead - s * aside };
}

function chair(c: ChairPlace): Solid[] {
  const { seat, leg, post, rail, mid } = CHAIR;
  const out: Solid[] = [];
  const back = chairPoint(c, -leg.at, 0);
  if (c.upturned === undefined) {
    out.push(solid("chair seat", circle(c.x, c.z, seat.r), dome(seat.rim, seat.crown, 1), seat.bottom));
    for (const side of [-1, 1]) {
      const front = chairPoint(c, leg.at, side * leg.at);
      const rear = chairPoint(c, -leg.at, side * leg.at);
      out.push(solid("chair leg", circle(front.x, front.z, leg.r), flat(seat.bottom)));
      out.push(solid("chair post", circle(rear.x, rear.z, leg.r), dome(post.top - post.crown, post.crown, 0.5)));
    }
    out.push(solid("chair rail", box(back.x, back.z, rail.half, rail.depth, c.yaw), vault(rail.top - rail.depth, rail.depth, 0.5), rail.bottom));
    out.push(solid("chair rail", box(back.x, back.z, mid.half, mid.depth, c.yaw), flat(mid.top), mid.bottom));
    return out;
  }
  // Upside down: the seat face down on the table, its four legs in the air, its back hanging over the edge.
  const on = c.upturned;
  const under = on + (seat.rim + seat.crown - seat.bottom);
  const flip = (y: number) => under - (y - seat.bottom);
  out.push(solid("chair seat", circle(c.x, c.z, seat.r), flat(under), on));
  for (const side of [-1, 1]) {
    const front = chairPoint(c, leg.at, side * leg.at);
    const rear = chairPoint(c, -leg.at, side * leg.at);
    out.push(solid("chair leg", circle(front.x, front.z, leg.r), dome(flip(0) - leg.r * 0.5, leg.r * 0.5, 0.5), under));
    // The rear legs run on up through the seat to tips like the front legs', the back hanging below.
    out.push(solid("chair post", circle(rear.x, rear.z, leg.r), dome(flip(0) - leg.r * 0.5, leg.r * 0.5, 0.5), flip(post.top)));
  }
  out.push(solid("chair rail", box(back.x, back.z, rail.half, rail.depth, c.yaw), flat(flip(rail.bottom)), flip(rail.top)));
  out.push(solid("chair rail", box(back.x, back.z, mid.half, mid.depth, c.yaw), flat(flip(mid.bottom)), flip(mid.top)));
  return out;
}

function table(t: TablePlace): Solid[] {
  const out: Solid[] = [];
  if (t.kind === "four") {
    const { half, bottom, top } = TABLE_TOPS.four;
    out.push(solid("table", box(t.x, t.z, half, half), flat(top), bottom));
    const inset = half - 50;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(solid("table leg", box(t.x + sx * inset, t.z + sz * inset, 22, 22), flat(bottom)));
    const along = inset - 22;
    const at = half - 45;
    for (const s of [-1, 1]) {
      out.push(solid("apron", box(t.x, t.z + s * at, along, 10), flat(bottom), bottom - 80));
      out.push(solid("apron", box(t.x + s * at, t.z, 10, along), flat(bottom), bottom - 80));
    }
  } else {
    const spec = t.kind === "round" ? TABLE_TOPS.round : TABLE_TOPS.square;
    const footprint = t.kind === "round" ? circle(t.x, t.z, TABLE_TOPS.round.r) : box(t.x, t.z, TABLE_TOPS.square.half, TABLE_TOPS.square.half);
    out.push(solid("table", footprint, flat(spec.top), spec.bottom));
    // The cast-iron spider under the top (a hub, and four arms out along the diagonals to the screws), the pedestal, and the foot.
    const { hub, arm, reach } = SPIDER[t.kind];
    out.push(solid("spider", circle(t.x, t.z, hub), flat(spec.bottom), spec.bottom - SPIDER.depth));
    for (const a of [Math.PI / 4, -Math.PI / 4]) out.push(solid("spider", box(t.x, t.z, reach, arm, a), flat(spec.bottom), spec.bottom - SPIDER.depth));
    out.push(solid("pedestal", circle(t.x, t.z, 32), flat(spec.bottom - SPIDER.depth)));
    if (t.kind === "round") out.push(solid("table foot", circle(t.x, t.z, 230), dome(8, 40, 1)));
    else for (const a of [Math.PI / 4, -Math.PI / 4]) out.push(solid("table foot", box(t.x, t.z, 260, 30, a), dome(12, 22, 1)));
  }
  for (const c of t.chairs) out.push(...chair(c));
  return out;
}

function juiceGlass(g: { x: number; z: number; on: number }): Solid {
  const t = JUICE_GLASS;
  return solid("juice glass", circle(g.x, g.z, t.r), { kind: "dish", well: g.on + t.well, rim: g.on + t.rim, inner: t.inner, lip: t.lip }, g.on);
}

function tableThings(): Solid[] {
  const on = TABLE_TOPS.round.top;
  const t = START_TABLE;
  const out: Solid[] = [
    solid("sugar caddy", box(t.sugar.x, t.sugar.z, t.sugar.hx, t.sugar.hz, t.sugar.angle), flat(t.sugar.top), on),
    solid("bud vase", circle(t.vase.x, t.vase.z, t.vase.r), dome(on + t.vase.top - 30, 30, 1), on),
    solid("flower stem", circle(t.vase.x, t.vase.z, t.vase.stem), flat(on + t.vase.bloom.bottom), on + t.vase.top - 25),
    solid("flower", circle(t.vase.x, t.vase.z, t.vase.bloom.r), dome(on + t.vase.bloom.base, t.vase.bloom.height, 0.5), on + t.vase.bloom.bottom),
    solid("votive", circle(t.votive.x, t.votive.z, t.votive.r), { kind: "dish", well: on + t.votive.wax, rim: on + t.votive.rim, inner: 0.7, lip: 0.9 }, on),
    solid("sugar packet", box(t.packet.x, t.packet.z, t.packet.hx, t.packet.hz, t.packet.angle), flat(on + t.packet.top), on),
  ];
  for (const s of SHAKERS) out.push(solid("shaker", circle(s.x, s.z, SHAKER.r), dome(s.on + SHAKER.top - SHAKER.cap, SHAKER.cap, 0.5), s.on));
  for (const g of JUICE_GLASSES) out.push(juiceGlass(g));
  const k = KETCHUP;
  out.push(
    solid("ketchup", circle(k.x, k.z, k.r), dome(on + k.shoulder, k.crown, 1), on),
    solid("ketchup neck", circle(k.x, k.z, k.neck), flat(on + k.cap.bottom), on + k.shoulder),
    solid("ketchup cap", circle(k.x, k.z, k.cap.r), flat(on + k.cap.top), on + k.cap.bottom),
    solid("menu", box(MENU.x, MENU.z, MENU.hx, MENU.hz, MENU.angle), flat(on + MENU.thick), on),
  );
  const b = BREAD;
  out.push(
    solid("bread basket", { kind: "ellipse", x: b.x, z: b.z, rx: b.rx, rz: b.rz, angle: b.angle }, { kind: "dish", well: on + b.well, rim: on + b.rim, inner: 0.75, lip: 0.92 }, on),
    solid("bread", { kind: "ellipse", x: b.x + 15, z: b.z - 5, rx: b.heel.rx, rz: b.heel.rz, angle: b.angle + 0.3 }, dome(on + b.well, b.heel.height, 0.7), on + b.well),
  );
  const e = ESPRESSO;
  out.push(
    solid("saucer", circle(e.x, e.z, e.saucer.r), { kind: "dish", well: on + e.saucer.well, rim: on + e.saucer.rim, inner: 0.55, lip: 0.85 }, on),
    solid("espresso cup", circle(e.x, e.z, e.cup.r), { kind: "dish", well: on + e.saucer.well + e.cup.well, rim: on + e.saucer.well + e.cup.rim, inner: 0.75, lip: 0.92 }, on + e.saucer.well),
    // Its handle, toward the banquette: a loop felt as the slab it fills, from the cup's side out.
    solid("cup handle", box(e.x + (e.cup.r + e.handle.out) / 2 - 1, e.z, (e.handle.out - e.cup.r) / 2 + 1, e.handle.half), flat(on + e.saucer.well + e.handle.top), on + e.saucer.well + e.handle.bottom),
  );
  return out;
}

function barThings(): Solid[] {
  const on = ZINC_BAR.zinc.top;
  const b = ON_BAR;
  const out: Solid[] = [
    solid("fruit bowl", circle(b.bowl.x, b.bowl.z, b.bowl.r), { kind: "dish", well: on + b.bowl.well, rim: on + b.bowl.rim, inner: b.bowl.inner, lip: b.bowl.lip }, on),
  ];
  const well = on + b.bowl.well;
  for (const o of b.oranges) out.push(solid("orange", circle(o.x, o.z, o.r), dome(well + o.r * 0.8, o.r, 0.5), well));
  for (const l of b.lemons) out.push(solid("lemon", { kind: "ellipse", x: l.x, z: l.z, rx: l.rx, rz: l.rz, angle: l.angle }, dome(well + l.rz * 0.8, l.rz, 0.5), well));
  out.push(solid("peach", circle(b.peach.x, b.peach.z, b.peach.r), dome(well + b.peach.r * 0.9, b.peach.r, 0.5), well));
  const board = on + b.board.thick;
  out.push(
    solid("board", box(b.board.x, b.board.z, b.board.hx, b.board.hz, b.board.angle), flat(board), on),
    solid("lemon", circle(b.halfLemon.x, b.halfLemon.z, b.halfLemon.r), dome(board, b.halfLemon.height, 0.5), board),
  );
  for (const s of b.slices) out.push(solid("lemon slice", circle(s.x, s.z, s.r), flat(board + b.sliceThick), board));
  const knife = b.knife;
  const c = Math.cos(knife.angle);
  const s = Math.sin(knife.angle);
  // The blade toward the board's middle, the handle out past its edge.
  out.push(
    solid("knife", box(knife.x + c * 20, knife.z - s * 20, knife.blade.hx, knife.blade.hz, knife.angle), flat(board + knife.blade.thick), board),
    solid("knife handle", box(knife.x - c * 60, knife.z + s * 60, knife.handle.hx, knife.handle.hz, knife.angle), flat(board + knife.handle.thick), board),
  );
  out.push(
    solid("bar mat", box(b.mat.x, b.mat.z, b.mat.hx, b.mat.hz), flat(on + b.mat.thick), on),
    solid("milk jug", circle(b.jug.x, b.jug.z, b.jug.r), dome(on + b.mat.thick + b.jug.top - 10, 10, 1), on + b.mat.thick),
  );
  const k = b.cake;
  out.push(
    solid("cake stand", circle(k.x, k.z, k.foot.r), dome(on + 1, k.foot.height - 1, 1), on),
    solid("cake stand", circle(k.x, k.z, k.stem.r), flat(on + k.stem.top), on + k.foot.height),
    solid("cake plate", circle(k.x, k.z, k.plate.r), flat(on + k.plate.top), on + k.stem.top),
    // The glass over the cake: the cake is inside it, out of reach.
    solid("cloche", circle(k.x, k.z, k.cloche.r), dome(on + k.plate.top, k.cloche.height, 0.5), on + k.plate.top),
    solid("cloche knob", circle(k.x, k.z, k.knob.r), dome(on + k.plate.top + k.cloche.height - 2, k.knob.height, 0.5), on + k.plate.top + k.cloche.height - 6),
  );
  return out;
}

function passThings(): Solid[] {
  const { shelf, lamps, rail, tickets, kitchen } = PASS;
  const z = -DINING_ROOM.hz;
  const out: Solid[] = [
    solid("pass", box(shelf.x, (shelf.z0 + shelf.z1) / 2, shelf.hx, (shelf.z1 - shelf.z0) / 2), flat(shelf.top), PASS.sill),
    solid("heat lamp", box(shelf.x, (lamps.z0 + lamps.z1) / 2, lamps.hx, (lamps.z1 - lamps.z0) / 2), flat(lamps.top), lamps.bottom),
    solid("ticket rail", box(shelf.x, (rail.z0 + rail.z1) / 2, rail.hx, (rail.z1 - rail.z0) / 2), flat(rail.top), rail.bottom),
    solid("kitchen bench", box((kitchen.x0 + kitchen.x1) / 2, (kitchen.z0 + kitchen.z1) / 2, (kitchen.x1 - kitchen.x0) / 2, (kitchen.z1 - kitchen.z0) / 2), flat(kitchen.top)),
    ...[kitchen.x0 - kitchen.wall / 2, kitchen.x1 + kitchen.wall / 2].map((x) => solid("kitchen wall", box(x, (kitchen.z0 + kitchen.z1) / 2, kitchen.wall / 2, (kitchen.z1 - kitchen.z0) / 2), flat(DINING_ROOM.height))),
  ];
  for (const x of [shelf.x - lamps.hx + 60, shelf.x + lamps.hx - 60]) out.push(solid("bracket", box(x, (lamps.z0 + lamps.z1) / 2, 10, 10), flat(PASS.head), lamps.top));
  // Order slips hanging from the rail: paper, a fifth of a millimetre either side of its middle.
  for (const x of tickets) out.push(solid("ticket", box(x, z + 15, 40, 0.6), flat(rail.bottom + 5), 1790));
  const d = ON_PASS.dessert;
  const top = shelf.top;
  out.push(
    solid("dessert plate", circle(d.x, d.z, d.r), { kind: "dish", well: top + d.well, rim: top + d.rim, inner: d.inner, lip: d.lip }, top),
    solid("plates", circle(ON_PASS.stack.x, ON_PASS.stack.z, ON_PASS.stack.r), flat(top + ON_PASS.stack.height), top),
  );
  return out;
}

function standsAndWalls(): Solid[] {
  const h = HOST_STAND;
  const m = ON_HOST;
  const st = STATION;
  const os = ON_STATION;
  const w = WALL_THINGS;
  const q = BANQUETTE;
  const out: Solid[] = [
    solid("host stand", box(h.x, h.z, h.hx, h.hz), flat(h.top)),
    solid("menus", box(m.menus.x, m.menus.z, m.menus.hx, m.menus.hz), flat(h.top + m.menus.thick), h.top),
    solid("book", box(m.book.x, m.book.z, m.book.hx, m.book.hz), flat(h.top + m.book.thick), h.top),
    solid("mints", circle(m.mints.x, m.mints.z, m.mints.r), { kind: "dish", well: h.top + m.mints.well, rim: h.top + m.mints.rim, inner: 0.6, lip: 0.88 }, h.top),
    solid("station", box(st.x, st.z, st.hx, st.hz), flat(st.top)),
    solid("cutlery tray", box(os.tray.x, os.tray.z, os.tray.hx, os.tray.hz), { kind: "dish", well: st.top + os.tray.well, rim: st.top + os.tray.rim, inner: 0.9, lip: 0.96 }, st.top),
    solid("plates", circle(os.plates.x, os.plates.z, os.plates.r), flat(st.top + os.plates.height), st.top),
    solid("carafe", circle(os.carafe.x, os.carafe.z, os.carafe.r), dome(st.top + os.carafe.shoulder, os.carafe.crown, 1), st.top),
    // Its neck open at the top: a fly on the lip can look in, and down it.
    solid("carafe neck", circle(os.carafe.x, os.carafe.z, os.carafe.neck), { kind: "dish", well: st.top + os.carafe.top - os.carafe.mouth, rim: st.top + os.carafe.top, inner: 0.72, lip: 0.92 }, st.top + os.carafe.shoulder),
    ...os.tumblers.map((t) => solid("tumbler", circle(t.x, t.z, os.tumbler.r), flat(st.top + os.tumbler.height), st.top)),
    solid("banquette", box((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, (q.x1 - q.x0) / 2, (q.z1 - q.z0) / 2), vault(q.seat - 12, 12, 1)),
    solid("banquette back", box((q.back.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, (q.x1 - q.back.x0) / 2, (q.z1 - q.z0) / 2), vault(q.back.top - 30, 30, 1)),
    solid("mirror", box(w.mirror.x, w.mirror.z, w.mirror.hx, w.mirror.hz), flat(w.mirror.top), w.mirror.bottom),
    solid("chalkboard", box(w.chalkboard.x, w.chalkboard.z, w.chalkboard.hx, w.chalkboard.hz), flat(w.chalkboard.top), w.chalkboard.bottom),
    solid("print", box(w.print.x, w.print.z, w.print.hx, w.print.hz), flat(w.print.top), w.print.bottom),
    solid("exit sign", box(w.exit.x, w.exit.z, w.exit.hx, w.exit.hz), flat(w.exit.top), w.exit.bottom),
  ];
  return out;
}

/** Everything the fly meets, by name, for the scene to draw it. */
export const RESTAURANT_SOLIDS: readonly Solid[] = [
  ...room(),
  ...shopfront(),
  ...bar(),
  ...BOTTLES.flatMap(bottle),
  ...TABLES.flatMap(table),
  ...tableThings(),
  ...barThings(),
  ...passThings(),
  ...standsAndWalls(),
];

const TABLE = TABLE_TOPS.round.top;
const ZINC = ZINC_BAR.zinc.top;

/** Food left about the place, each at the height it lies at (the surface there at or below `y`). */
export const RESTAURANT_PATCHES: readonly FoodPatch[] = [
  // The window table, where the fly starts: spilt sugar, the last of a glass of orange juice, the ring it left.
  { name: "sugar", x: START_TABLE.sugarSpill.x, z: START_TABLE.sugarSpill.z, y: TABLE, r: START_TABLE.sugarSpill.r, sweet: 1 },
  { name: "sugar", x: START_TABLE.packet.x + 6, z: START_TABLE.packet.z - 3, y: TABLE + START_TABLE.packet.top, r: 6, sweet: 1 },
  { name: "orange juice", x: JUICE_GLASSES[0].x, z: JUICE_GLASSES[0].z, y: TABLE + JUICE_GLASS.well, r: 12, sweet: 0.7, pool: true },
  ...[0.4, 2.3, 4.4].map((a): FoodPatch => ({ name: "juice ring", x: START_TABLE.ring.x + Math.cos(a) * START_TABLE.ring.r, z: START_TABLE.ring.z + Math.sin(a) * START_TABLE.ring.r, y: TABLE, r: 5, sweet: 0.55 })),
  // The ketchup's crusted cap, and a smear on the menu beside it.
  { name: "ketchup", x: KETCHUP.x, z: KETCHUP.z, y: TABLE + KETCHUP.cap.top, r: 13, sweet: 0.6 },
  { name: "ketchup", x: MENU.x + 30, z: MENU.z - 40, y: TABLE + MENU.thick, r: 7, sweet: 0.6 },
  // The bread basket's crumbs, and those brushed onto the table.
  { name: "crumbs", x: BREAD.x - 60, z: BREAD.z + 20, y: TABLE + BREAD.well, r: 14, sweet: 0.3 },
  { name: "crumbs", x: 1070, z: 2240, y: TABLE, r: 10, sweet: 0.3 },
  // Sugar left in the bottom of an espresso cup.
  { name: "espresso", x: ESPRESSO.x, z: ESPRESSO.z, y: TABLE + ESPRESSO.saucer.well + ESPRESSO.cup.well, r: 10, sweet: 0.9 },
  // At the bar: the bruised peach in the fruit bowl, the cut lemon, orange juice and lemonade left in two glasses, syrup on the bar mat, crumbs of cake at the edge of its plate.
  { name: "peach", x: ON_BAR.peach.x + 4, z: ON_BAR.peach.z - 4, y: ZINC + ON_BAR.bowl.well + ON_BAR.peach.r * 1.9, r: 10, sweet: 0.9 },
  ...ON_BAR.slices.map((s): FoodPatch => ({ name: "lemon", x: s.x, z: s.z, y: ZINC + ON_BAR.board.thick + ON_BAR.sliceThick, r: 10, sweet: 0.3 })),
  { name: "orange juice", x: JUICE_GLASSES[1].x, z: JUICE_GLASSES[1].z, y: ZINC + JUICE_GLASS.well, r: 12, sweet: 0.7, pool: true },
  { name: "lemonade", x: JUICE_GLASSES[2].x, z: JUICE_GLASSES[2].z, y: ZINC + JUICE_GLASS.well, r: 12, sweet: 0.65, pool: true },
  { name: "syrup", x: ON_BAR.mat.x + 120, z: ON_BAR.mat.z + 30, y: ZINC + ON_BAR.mat.thick, r: 12, sweet: 0.95 },
  { name: "cake crumbs", x: ON_BAR.cake.x + 146 * Math.cos(0.7), z: ON_BAR.cake.z + 146 * Math.sin(0.7), y: ZINC + ON_BAR.cake.plate.top, r: 4, sweet: 1 },
  // Sent back to the pass: crumbs of tart and a smear of raspberry coulis.
  { name: "coulis", x: ON_PASS.dessert.x + 20, z: ON_PASS.dessert.z - 10, y: PASS.shelf.top + ON_PASS.dessert.well, r: 16, sweet: 1, pool: true },
  { name: "tart crumbs", x: ON_PASS.dessert.x - 35, z: ON_PASS.dessert.z + 25, y: PASS.shelf.top + ON_PASS.dessert.well, r: 9, sweet: 1 },
  // The host stand's sticky menu, and the dust of the mints.
  { name: "syrup", x: ON_HOST.menus.x + 30, z: ON_HOST.menus.z - 50, y: HOST_STAND.top + ON_HOST.menus.thick, r: 9, sweet: 0.8 },
  { name: "mints", x: ON_HOST.mints.x, z: ON_HOST.mints.z, y: HOST_STAND.top + ON_HOST.mints.well, r: 12, sweet: 0.6 },
  // On the floor: a soda spilt at the end of the bar, and a grape that rolled under the window's left table.
  { name: "soda", x: -2250, z: 1420, y: 0, r: 34, sweet: 0.9, pool: true },
  { name: "grape", x: -1660, z: 2120, y: 0, r: 8, sweet: 0.85 },
];

/** Where the fly first stands: on the window table, between the sugar and the glass, facing the sugar, with the street behind. */
export const RESTAURANT_START = { x: -255, z: 2335, yaw: -0.42, y: TABLE };

export const RESTAURANT: Place = {
  floor: { kind: "rect", hx: DINING_ROOM.hx, hz: DINING_ROOM.hz },
  solids: RESTAURANT_SOLIDS,
  patches: RESTAURANT_PATCHES,
  start: RESTAURANT_START,
  ceiling: 2400,
};

export function createRestaurant(): World {
  return new World(RESTAURANT);
}
