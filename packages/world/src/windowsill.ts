// A deep kitchen windowsill in late morning light. Everything the fly can
// stand on, bump into or eat is here, in millimetres; a fruit fly is about
// 2.5 mm long. The sill's middle is the origin, its top is y = 0, the window
// stands along its back edge (toward -z) and the kitchen lies toward +z.

import type { FoodPatch } from "./pantry.ts";
import type { Solid } from "./shapes.ts";
import { World } from "./world.ts";
import type { Place } from "./world.ts";

/** The sill's half-sizes: 640 mm along the window, 250 mm from the glass to its front edge. */
export const SILL = { hx: 320, hz: 125 };

/**
 * The window: a painted timber casement of two sashes, each two panes wide
 * and two high. The glass stands on the sill's back edge (`glass`), above a
 * bottom rail whose top is a ledge at its foot; the jambs, the mullion where
 * the sashes meet and the glazing bars stand proud of the glass on the room
 * side. `wall` is where the room's wall face is: the sill's rounded front
 * edge stands out past it.
 */
export const WINDOW = {
  glass: -SILL.hz,
  head: 560,
  /** The wall continues above the opening to the kitchen ceiling. */
  ceiling: 1350,
  rail: { top: 34, depth: 22 },
  jamb: { width: 26, depth: 24 },
  mullion: { half: 16, depth: 16 },
  bar: { half: 6, depth: 10, at: [-160, 160] as readonly number[] },
  /** The glazing bar across each sash, above the fly's ceiling. */
  transom: { y: 300, half: 6 },
  wall: SILL.hz - 20,
};

const { glass, ceiling, rail, jamb, mullion, bar } = WINDOW;

/** The window's sashes and the wall it is set in, as the fly (and the camera) meets them. */
const WINDOW_SOLIDS: Solid[] = [
  // The glass, and the wall either side of the opening (its reveals), stand off the sill's edges: walls to the fly, and nowhere for the camera to stand.
  { name: "glass", footprint: { kind: "box", x: 0, z: glass - 25, hx: SILL.hx + 20, hz: 25, angle: 0 }, top: { kind: "flat", y: ceiling } },
  { name: "wall", footprint: { kind: "box", x: SILL.hx + 690, z: (WINDOW.wall - 420) / 2, hx: 690, hz: (WINDOW.wall + 420) / 2, angle: 0 }, top: { kind: "flat", y: ceiling } },
  { name: "wall", footprint: { kind: "box", x: -SILL.hx - 690, z: (WINDOW.wall - 420) / 2, hx: 690, hz: (WINDOW.wall + 420) / 2, angle: 0 }, top: { kind: "flat", y: ceiling } },
  // The bottom rail: a ledge at the foot of the glass, too tall to step up onto, for a fly that flies there.
  { name: "rail", footprint: { kind: "box", x: 0, z: glass + rail.depth / 2, hx: SILL.hx, hz: rail.depth / 2, angle: 0 }, top: { kind: "flat", y: rail.top } },
  { name: "jamb", footprint: { kind: "box", x: -SILL.hx + jamb.width / 2, z: glass + jamb.depth / 2, hx: jamb.width / 2, hz: jamb.depth / 2, angle: 0 }, top: { kind: "flat", y: ceiling } },
  { name: "jamb", footprint: { kind: "box", x: SILL.hx - jamb.width / 2, z: glass + jamb.depth / 2, hx: jamb.width / 2, hz: jamb.depth / 2, angle: 0 }, top: { kind: "flat", y: ceiling } },
  { name: "mullion", footprint: { kind: "box", x: 0, z: glass + mullion.depth / 2, hx: mullion.half, hz: mullion.depth / 2, angle: 0 }, top: { kind: "flat", y: ceiling } },
  ...bar.at.map((x): Solid => ({ name: "bar", footprint: { kind: "box", x, z: glass + bar.depth / 2, hx: bar.half, hz: bar.depth / 2, angle: 0 }, top: { kind: "flat", y: ceiling } })),
];

const BANANA_STALK = 0.88;

/** A banana lying on the sill: its middle line from the tip to the stalk (a quadratic curve), and how thick it is along it. */
export const BANANA = {
  from: { x: -268, z: 82 },
  via: { x: -178, z: 118 },
  to: { x: -94, z: 84 },
  /** Radius along it (0 at the tip, 1 at the stalk's cut end), mm. Past `stalk` it is the stalk. */
  radius: (t: number) => (t < BANANA_STALK ? 4.6 + 13.5 * Math.pow(Math.sin((Math.PI * t) / BANANA_STALK), 0.75) * (1 - 0.2 * t) : 4.4 + Math.max(0, t - 0.96) * 30),
  stalk: BANANA_STALK,
  /** Rounds of it in the world. */
  rings: 34,
};

/** A point along the banana's middle line, t from 0 (tip) to 1 (stalk). */
export function bananaAt(t: number, out: { x: number; z: number }) {
  const { from: a, via: b, to: c } = BANANA;
  const u = 1 - t;
  out.x = u * u * a.x + 2 * u * t * b.x + t * t * c.x;
  out.z = u * u * a.z + 2 * u * t * b.z + t * t * c.z;
  return out;
}

/**
 * The banana as the fly feels it: a chain of overlapping ovals along it, each
 * long in the way the banana runs, so that its back is smooth to a fraction
 * of a step. Toward the tip they are low and gently sloped, so a fly can walk
 * up from the sill onto its back.
 */
function bananaSolids(): Solid[] {
  const out: Solid[] = [];
  const p = { x: 0, z: 0 };
  const q = { x: 0, z: 0 };
  for (let i = 0; i < BANANA.rings; i++) {
    const t = i / (BANANA.rings - 1);
    bananaAt(t, p);
    bananaAt(Math.min(1, t + 0.01), q);
    const back = bananaAt(Math.max(0, t - 0.01), { x: 0, z: 0 });
    const r = BANANA.radius(t);
    // Round in section where it is thick; toward the tip a gentle cone a fly can climb. At the ends, round.
    const climb = Math.max(0, 1 - t / 0.3);
    const long = 1 + 0.9 * Math.min(1, t / 0.08, (1 - t) / 0.08);
    out.push({ name: "banana", footprint: { kind: "ellipse", x: p.x, z: p.z, rx: r, rz: r * long, angle: Math.atan2(q.x - back.x, q.z - back.z) }, top: { kind: "dome", base: 0, height: r * (0.92 - 0.3 * climb), power: 0.62 + 0.38 * climb } });
  }
  return out;
}

/** The terracotta pot of basil, in its saucer. */
export const BASIL_POT = { x: -225, z: -30, r: 54, rim: 96, soil: 89, saucer: 72 };

/**
 * The basil: a dense mound of leaves no wider than the pot, so that it can be
 * a solid a fly lands on with nothing but the pot under it: the hull its
 * outermost leaves reach, none standing out of it, and a clump of shoots
 * standing up out of it. Domes (their middles from the pot's, mm, and
 * the height each rises from): one from the rim over all of it, and the
 * clump's, rising from inside the mound so that it swells smoothly out of it.
 * There is one clump only: where two met the mound together they would leave
 * a hollow a falling fly could be caught in.
 */
export const BASIL_CROWN: readonly { x: number; z: number; r: number; base: number; top: number; power: number }[] = [
  { x: 0, z: 0, r: 53, base: BASIL_POT.rim, top: 158, power: 0.6 },
  { x: -8, z: -6, r: 24, base: 135, top: 174, power: 0.7 },
];

/** The basil's flowering tips: where each stands, and how high its top is. */
export const BASIL_TIPS: readonly { x: number; z: number; top: number }[] = [
  { x: BASIL_POT.x - 30, z: BASIL_POT.z + 14, top: 200 },
  { x: BASIL_POT.x + 24, z: BASIL_POT.z - 20, top: 192 },
];

/**
 * A wind-up alarm clock in red enamel, standing toward the back of the sill
 * with its dial to the room: a drum on its side (`r`, its middle `y` high, as
 * deep as `depth` with a bezel `bezel` deep in front) on two splayed feet,
 * with two bells on top and the hammer between them.
 */
export const ALARM_CLOCK = { x: 128, z: -70, r: 38, y: 45, depth: 30, bezel: 5, bells: { x: 16, r: 12, base: 84 }, hammer: { r: 3, base: 88 } };

/** A jar of honey in the corner by the bottle, its lid screwed on: the honey the spoon was dipped in. */
export const HONEY_JAR = { x: 289, z: -80, r: 20, top: 70 };

/**
 * A postcard from the seaside propped up at the end of the sill, standing on
 * its edge with its top leaning on the wall of the window's opening, its
 * picture to the sill: its foot `foot` mm out from the wall, `width` along
 * it round `z`, `length` from its foot to its top.
 */
export const POSTCARD = { foot: 8, z: 4, width: 105, length: 148 };

/** The postcard as the fly feels it: a wall of card, and between it and the wall a wedge it can't get into, in slices as thick as a fly's toe. */
function postcardSolids(): Solid[] {
  const { foot, z, width, length } = POSTCARD;
  const lean = Math.asin(foot / length);
  const out: Solid[] = [];
  for (let k = 0; k < foot; k++) {
    // How high the card stands over a slice: where it is k mm in from its foot.
    const y = (k / foot) * length * Math.cos(lean);
    out.push({ name: "postcard", footprint: { kind: "box", x: SILL.hx - foot + k + 0.5, z, hx: 0.5, hz: width / 2, angle: 0 }, top: { kind: "flat", y: Math.max(y, 1) } });
  }
  return out;
}

/** Pebbles, shells and a piece of sea glass brought home from the beach, in little groups along the back of the sill: low and smooth enough to climb. */
export const PEBBLES: readonly { name: string; x: number; z: number; rx: number; rz: number; angle: number; height: number }[] = [
  { name: "pebble", x: -160, z: -90, rx: 10, rz: 7, angle: 0.2, height: 6 },
  { name: "sea glass", x: -138, z: -94, rx: 7, rz: 5, angle: -0.4, height: 3.5 },
  { name: "shell", x: -114, z: -90, rx: 9, rz: 7, angle: 0.7, height: 7 },
  { name: "pebble", x: 21, z: -90, rx: 12, rz: 8.5, angle: 0.3, height: 7.5 },
  { name: "pebble", x: 41, z: -94, rx: 8, rz: 6.5, angle: -0.6, height: 5.5 },
  { name: "pebble", x: 58, z: -86, rx: 10, rz: 7.5, angle: 1.2, height: 6.5 },
  { name: "shell", x: 77, z: -94, rx: 8.5, rz: 7.5, angle: 0.4, height: 5 },
  { name: "shell", x: 182, z: -92, rx: 8, rz: 7, angle: -0.3, height: 5 },
  { name: "pebble", x: 204, z: -95, rx: 11, rz: 6, angle: 0.1, height: 4 },
  { name: "pebble", x: 222, z: -97, rx: 6, rz: 5, angle: 0.5, height: 4.5 },
];

/** The steepest a fly stands on, as rise over run. */
const STANDABLE_SLOPE = Math.tan((65 * Math.PI) / 180);

/**
 * The clock as the fly feels it. The world can't hold a drum on its side,
 * so its case is a row of thin boxes across it, each as deep as the case and
 * its bezel, each flat top within a third of a millimetre of the drum's curve
 * where a fly could stand on it (so it walks across the top in steps it
 * hardly notices), and in coarser steps down its steep sides. Under its belly
 * the column goes down to the sill, between its feet. The bells are domes,
 * the hammer's head a little one.
 */
function clockSolids(): Solid[] {
  const { x, z, r, y, depth, bezel, bells, hammer } = ALARM_CLOCK;
  const zMid = z + bezel / 2;
  const hz = (depth + bezel) / 2;
  const curve = (u: number) => y + Math.sqrt(Math.max(0, r * r - u * u));
  const box = (u0: number, u1: number): Solid => ({ name: "clock", footprint: { kind: "box", x: x + (u0 + u1) / 2, z: zMid, hx: (u1 - u0) / 2, hz, angle: 0 }, top: { kind: "flat", y: curve(Math.abs(u0 + u1) / 2) } });
  const out: Solid[] = [box(-3, 3)];
  for (let a = 3; a < r; ) {
    const step = a / Math.sqrt(r * r - a * a) < STANDABLE_SLOPE ? 0.6 : 2;
    let b = Math.min(r, a + 6);
    if (curve(a) - curve(b) > step) {
      let lo = a;
      for (let i = 0; i < 40; i++) {
        const m = (lo + b) / 2;
        if (curve(a) - curve(m) > step) b = m;
        else lo = m;
      }
      b = lo;
    }
    if (r - b < 0.3) b = r;
    out.push(box(a, b), box(-b, -a));
    a = b;
  }
  for (const side of [-1, 1]) out.push({ name: "bell", footprint: { kind: "circle", x: x + side * bells.x, z, r: bells.r }, top: { kind: "dome", base: bells.base, height: bells.r, power: 0.5 } });
  out.push({ name: "hammer", footprint: { kind: "circle", x, z, r: hammer.r }, top: { kind: "dome", base: hammer.base, height: hammer.r, power: 0.5 } });
  return out;
}
/** The fruit bowl: shallow stoneware with a rim a fly can walk round. */
export const FRUIT_BOWL = { x: -40, z: -20, r: 80 };
/** The bottle of red wine, corked, at the right of the sill. */
export const WINE_BOTTLE = { x: 236, z: -54, r: 36, shoulder: 206, neck: 13.5, top: 300 };
/** The small plate with half a peach on it. */
export const PEACH_PLATE = { x: 95, z: 75, r: 48 };
/** The teaspoon: its bowl's middle, the way its handle points (radians, as a footprint's angle), and its handle's length. */
export const TEASPOON = { x: 214, z: 92, angle: 2.034, rx: 12.5, rz: 18, handle: 88 };

const spoonAxis = { x: Math.sin(TEASPOON.angle), z: Math.cos(TEASPOON.angle) };

/** What each solid is, for the scene builder to draw it: the names below. */
export const SILL_SOLIDS: readonly Solid[] = [
  ...WINDOW_SOLIDS,
  // A saucer a fly can walk up into, with water standing round the pot's foot, and the pot.
  { name: "saucer", footprint: { kind: "circle", x: BASIL_POT.x, z: BASIL_POT.z, r: BASIL_POT.saucer }, top: { kind: "dish", well: 1.4, rim: 6, inner: 0.84, lip: 0.92 } },
  { name: "pot", footprint: { kind: "circle", x: BASIL_POT.x, z: BASIL_POT.z, r: BASIL_POT.r }, top: { kind: "dish", well: BASIL_POT.soil, rim: BASIL_POT.rim, inner: 0.8, lip: 0.92 } },
  // The basil: a mound of leaves from the pot's rim, hiding the stems and the soil, and its flowering tips standing up out of it.
  ...BASIL_CROWN.map((c): Solid => ({ name: "basil", footprint: { kind: "circle", x: BASIL_POT.x + c.x, z: BASIL_POT.z + c.z, r: c.r }, top: { kind: "dome", base: c.base, height: c.top - c.base, power: c.power } })),
  ...BASIL_TIPS.map((t): Solid => ({ name: "basil tip", footprint: { kind: "circle", x: t.x, z: t.z, r: 6 }, top: { kind: "dome", base: t.top - 4, height: 4, power: 0.5 } })),
  ...clockSolids(),
  ...PEBBLES.map((p): Solid => ({ name: p.name, footprint: { kind: "ellipse", x: p.x, z: p.z, rx: p.rx, rz: p.rz, angle: p.angle }, top: { kind: "dome", base: 0, height: p.height, power: 0.85 } })),
  { name: "honey jar", footprint: { kind: "circle", x: HONEY_JAR.x, z: HONEY_JAR.z, r: HONEY_JAR.r }, top: { kind: "flat", y: HONEY_JAR.top } },
  ...postcardSolids(),
  // The fruit bowl: up its outside, round its rim and down into it, among a peach and two plums.
  { name: "bowl", footprint: { kind: "circle", x: FRUIT_BOWL.x, z: FRUIT_BOWL.z, r: FRUIT_BOWL.r }, top: { kind: "dish", well: 6, rim: 28, inner: 0.4, lip: 0.72 } },
  { name: "peach", footprint: { kind: "circle", x: FRUIT_BOWL.x - 8, z: FRUIT_BOWL.z - 6, r: 26 }, top: { kind: "dome", base: 32, height: 26, power: 0.5 } },
  { name: "plum", footprint: { kind: "circle", x: FRUIT_BOWL.x + 32, z: FRUIT_BOWL.z - 24, r: 17 }, top: { kind: "dome", base: 28, height: 17, power: 0.5 } },
  { name: "plum", footprint: { kind: "circle", x: FRUIT_BOWL.x + 20, z: FRUIT_BOWL.z + 30, r: 17 }, top: { kind: "dome", base: 24.5, height: 17, power: 0.5 } },
  // An overripe banana, freckled brown, its tip on the sill.
  ...bananaSolids(),
  // The bottle: its body, its shoulder and its neck up to the cork.
  { name: "bottle", footprint: { kind: "circle", x: WINE_BOTTLE.x, z: WINE_BOTTLE.z, r: WINE_BOTTLE.r }, top: { kind: "dome", base: WINE_BOTTLE.shoulder, height: 26, power: 0.5 } },
  { name: "neck", footprint: { kind: "circle", x: WINE_BOTTLE.x, z: WINE_BOTTLE.z, r: WINE_BOTTLE.neck }, top: { kind: "flat", y: WINE_BOTTLE.top } },
  // Half a peach, cut face up on a plate, with its stone.
  { name: "plate", footprint: { kind: "circle", x: PEACH_PLATE.x, z: PEACH_PLATE.z, r: PEACH_PLATE.r }, top: { kind: "dish", well: 1.2, rim: 5, inner: 0.7, lip: 0.86 } },
  // Its cut face is nearly flat, its skin rounding steeply down to the plate: a perch for a fly that flies there.
  { name: "peach half", footprint: { kind: "circle", x: PEACH_PLATE.x - 5, z: PEACH_PLATE.z - 3, r: 27 }, top: { kind: "dome", base: 1.2, height: 15.5, power: 0.4 } },
  { name: "stone", footprint: { kind: "ellipse", x: PEACH_PLATE.x - 5, z: PEACH_PLATE.z - 3, rx: 7.5, rz: 10, angle: 0.5 }, top: { kind: "dome", base: 14.8, height: 6.5, power: 1 } },
  // A teaspoon lying in its back: a shallow bowl to climb into, and a handle low enough to step over.
  { name: "spoon", footprint: { kind: "ellipse", x: TEASPOON.x, z: TEASPOON.z, rx: TEASPOON.rx, rz: TEASPOON.rz, angle: TEASPOON.angle }, top: { kind: "dish", well: 0.9, rim: 3.6, inner: 0.45, lip: 0.72 } },
  { name: "handle", footprint: { kind: "box", x: TEASPOON.x + spoonAxis.x * (TEASPOON.rz + TEASPOON.handle / 2 - 2), z: TEASPOON.z + spoonAxis.z * (TEASPOON.rz + TEASPOON.handle / 2 - 2), hx: 3.2, hz: TEASPOON.handle / 2, angle: TEASPOON.angle }, top: { kind: "flat", y: 0.8 } },
  // Crumbs of toast near where the fly starts: boulders at its scale, low and round enough to climb.
  { name: "crumb", footprint: { kind: "ellipse", x: 44, z: 36, rx: 3.4, rz: 2.6, angle: 0.3 }, top: { kind: "dome", base: 0, height: 2.1, power: 1 } },
  { name: "crumb", footprint: { kind: "ellipse", x: 53, z: 44, rx: 2.4, rz: 1.9, angle: 1.1 }, top: { kind: "dome", base: 0, height: 1.4, power: 1 } },
  { name: "crumb", footprint: { kind: "ellipse", x: 36, z: 47, rx: 2.0, rz: 1.6, angle: -0.4 }, top: { kind: "dome", base: 0, height: 1.2, power: 1 } },
  { name: "crumb", footprint: { kind: "ellipse", x: 27, z: 30, rx: 1.6, rz: 1.3, angle: 0.8 }, top: { kind: "dome", base: 0, height: 0.95, power: 1 } },
  // Drops of water, spilt watering the basil: low enough to see over, too steep to walk onto.
  { name: "drop", footprint: { kind: "circle", x: -146, z: 40, r: 3.6 }, top: { kind: "dome", base: 0, height: 2.6, power: 0.5 } },
  { name: "drop", footprint: { kind: "circle", x: -137, z: 52, r: 2.4 }, top: { kind: "dome", base: 0, height: 1.8, power: 0.5 } },
  { name: "drop", footprint: { kind: "circle", x: -158, z: 58, r: 2.8 }, top: { kind: "dome", base: 0, height: 2.1, power: 0.5 } },
  { name: "drop", footprint: { kind: "circle", x: -126, z: 34, r: 1.8 }, top: { kind: "dome", base: 0, height: 1.3, power: 0.5 } },
];

/** The sill's own food. Heights come from the surface under each. */
export const SILL_PATCHES: readonly FoodPatch[] = [
  // Where the banana's skin has split, toward the stalk.
  { name: "banana", x: -141.5, z: 97.6, r: 6, sweet: 0.9 },
  { name: "peach juice", x: PEACH_PLATE.x + 7, z: PEACH_PLATE.z + 4, r: 8, sweet: 0.85 },
  // Juice from a split plum, run down into the bowl.
  { name: "plum juice", x: FRUIT_BOWL.x + 34, z: FRUIT_BOWL.z + 6, r: 6, sweet: 0.8 },
  { name: "honey", x: TEASPOON.x, z: TEASPOON.z, r: 5, sweet: 1 },
  // A drip of wine run down the bottle and pooled on the sill.
  { name: "wine", x: WINE_BOTTLE.x - 47, z: WINE_BOTTLE.z + 32, r: 9, sweet: 0.6, pool: true },
  // Water standing in the basil's saucer, round the pot's foot on the side toward the bowl.
  { name: "water", x: BASIL_POT.x + 57, z: BASIL_POT.z + 6, r: 2.6, sweet: 0, pool: true },
  { name: "spilt sugar", x: 38, z: 66, r: 4, sweet: 1 },
];

/** Where the fly first stands, and which way it faces: in the sun among the crumbs, toward the window. */
export const SILL_START = { x: 66, z: 22, yaw: Math.PI - 0.55 };

/** Flat things lying on the sill that change nothing for the fly: drawn, not felt. */
export const SILL_DECOR = {
  /** A linen tea towel folded on the sill, its end hanging over the front edge. */
  towel: { x: 245, z: 70, hx: 54, hz: 62 },
  /** A ring left by a glass, and a dried drip. */
  ring: { x: 165, z: -8, r: 30 },
  /** Specks of toast no taller than half a millimetre: where they lie, how far round, and how many. */
  crumbs: [
    { x: 42, z: 40, r: 16, count: 50 },
    { x: -30, z: 92, r: 10, count: 16 },
    { x: 150, z: 20, r: 9, count: 12 },
  ],
  /** A fallen basil leaf, dried flat. */
  leaf: { x: -112, z: 46, length: 26, angle: 0.4 },
};

export const WINDOWSILL: Place = { floor: { kind: "rect", hx: SILL.hx, hz: SILL.hz }, solids: SILL_SOLIDS, patches: SILL_PATCHES, start: SILL_START, ceiling: 260 };

export function createWindowsill(): World {
  return new World(WINDOWSILL);
}
