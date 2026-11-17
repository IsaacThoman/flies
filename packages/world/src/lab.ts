// The lab bench: the bench of a fruit-fly lab, where flies like this one are
// sorted under a microscope, and where wiring like its own was traced. A pale
// epoxy top with a stereo microscope, a rack of vials, a vial with its plug
// pulled, a dish of grape-juice agar, a fly pad, a brush and forceps, a lab
// notebook, a lamp. Everything the fly can stand on, bump into or eat is here,
// in millimetres; a fruit fly is about 2.5 mm long. The bench's centre is the
// origin, its top is y = 0, the windows lie toward -z and the room toward +z.

import { TASTES } from "./tastes.ts";
import type { FoodPatch } from "./pantry.ts";
import type { Solid } from "./shapes.ts";
import { World } from "./world.ts";
import type { Place } from "./world.ts";

/** Half the bench's width (x) and depth (z), mm. */
export const BENCH = { hx: 440, hz: 270 };

/** A point along a footprint's own u axis (turned by `angle` like the footprints), `t` mm from (x, z). */
export function along(x: number, z: number, angle: number, t: number) {
  return { x: x + Math.cos(angle) * t, z: z - Math.sin(angle) * t };
}

/** A point in a footprint's own coordinates (u along its x axis, v along its z axis), in the world. */
export function at(f: { x: number; z: number; angle: number }, u: number, v: number) {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  return { x: f.x + u * c + v * s, z: f.z - u * s + v * c };
}

/** The stereo microscope's base: a heavy box with a round stage plate let into it, turned a little toward the room. */
export const MICROSCOPE = { x: -215, z: -125, hx: 112, hz: 92, angle: 0.2, height: 30 };
const PILLAR = at(MICROSCOPE, 0, -66);
/** Its dimmer knob, a knurled wheel standing out of the base's right side. */
const DIMMER = at(MICROSCOPE, MICROSCOPE.hx + 4.5, 40);
/** The CO2 fly pad on its stage, where sleeping flies are sorted under the eyepieces. */
export const FLY_PAD = { ...at(MICROSCOPE, 0, 14), hx: 46, hz: 34, angle: MICROSCOPE.angle, height: MICROSCOPE.height + 9 };

/** The rack of vials: three rows of four, plugged with foam, standing in a plastic rack. */
export const RACK = { x: -15, z: -192, hx: 66, hz: 50, angle: -0.05, height: 62, pitch: 31, rows: 3, columns: 4, vialTop: 98 };
/** A fly vial: 25 mm across, 95 mm tall. */
export const VIAL_RADIUS = 12.5;

/** The paintbrush, its tip toward the fly pad: the handle's middle, its half-length and radius, and the way it lies. */
export const BRUSH = { x: -42, z: 128, angle: -0.62, handle: 72, r: 2.6 };
const FERRULE = along(BRUSH.x, BRUSH.z, BRUSH.angle, -BRUSH.handle - 9);
const BRISTLES = along(BRUSH.x, BRUSH.z, BRUSH.angle, -BRUSH.handle - 24);

/** Fine forceps lying flat, slightly open: where the arms join, which way the tips point, how long, how far apart the tips, how thick. */
export const FORCEPS = { x: 112, z: 34, angle: 2.9, length: 108, open: 7, thick: 0.8 };

function forcepsArms(): Solid[] {
  const { x, z, angle, length, open, thick } = FORCEPS;
  const arms: Solid[] = [];
  for (const side of [-1, 1]) {
    // Each arm: a broad grip from the joint, then a fine tip, splaying out by half the opening.
    const spread = Math.atan2(open / 2, length) * side;
    const a = angle + spread;
    const grip = along(x, z, a, 32);
    const tip = along(x, z, a, 64 + 22);
    arms.push({ name: "forceps", footprint: { kind: "box", x: grip.x, z: grip.z, hx: 32, hz: 1.4, angle: a }, top: { kind: "flat", y: thick } });
    arms.push({ name: "forceps", footprint: { kind: "box", x: tip.x, z: tip.z, hx: 22, hz: 0.6, angle: a }, top: { kind: "flat", y: thick } });
  }
  return arms;
}

function rackVials(): Solid[] {
  const vials: Solid[] = [];
  for (let row = 0; row < RACK.rows; row++) {
    for (let col = 0; col < RACK.columns; col++) {
      const p = at(RACK, (col - (RACK.columns - 1) / 2) * RACK.pitch, (row - (RACK.rows - 1) / 2) * RACK.pitch);
      // Its foam plug stands proud of the rim and is rounded on top.
      vials.push({ name: "vial", footprint: { kind: "circle", x: p.x, z: p.z, r: VIAL_RADIUS }, top: { kind: "dome", base: RACK.vialTop, height: 5, power: 1 } });
    }
  }
  return vials;
}

/** The vial standing on its own, its foam plug pulled half out: where, and how high its rim and the plug's top are. */
export const OPEN_VIAL = { x: 78, z: -62, rim: 95, plug: 116, food: 22 };
/** The dish of grape-juice agar, poured to the brim, with its lid off. */
export const AGAR_DISH = { x: -34, z: -52, r: 44, rim: 11.5, agar: 11 };
/** The open lab notebook, slim enough to step up onto. */
export const NOTEBOOK = { x: 228, z: 152, hx: 118, hz: 84, angle: 0.1, thick: 0.8 };
/** A drop of water on its right-hand page, over a line of writing. */
export const DROP = { ...at(NOTEBOOK, 45, -24), r: 3.4, height: 1.9 };
/** The desk lamp: its heavy round base, and its stem. */
export const LAMP = { x: 282, z: -88, r: 62, base: 18, stem: { x: 290, z: -104, r: 6.5, top: 300 } };
/** A lab timer, its display reading nothing yet. */
export const TIMER = { x: -205, z: 172, hx: 33, hz: 29, angle: 0.25, height: 24 };
/** The foil-covered beaker and the wash bottle. */
export const BEAKER = { x: 136, z: -172, r: 34, height: 96 };
export const BOTTLE = { x: 345, z: -205, r: 37, height: 165, cap: 14, capTop: 186 };

/** What each solid is, for the scene builder to draw it: the names below. */
export const LAB_SOLIDS: readonly Solid[] = [
  // The stereo microscope: its base and the pillar its head hangs from. The head, its arm and the eyepieces are above the ceiling, out of the fly's reach.
  { name: "microscope base", footprint: { kind: "box", x: MICROSCOPE.x, z: MICROSCOPE.z, hx: MICROSCOPE.hx, hz: MICROSCOPE.hz, angle: MICROSCOPE.angle }, top: { kind: "flat", y: MICROSCOPE.height } },
  { name: "microscope pillar", footprint: { kind: "circle", x: PILLAR.x, z: PILLAR.z, r: 17 }, top: { kind: "flat", y: 340 } },
  { name: "dimmer", footprint: { kind: "box", x: DIMMER.x, z: DIMMER.z, hx: 4.5, hz: 13, angle: MICROSCOPE.angle }, top: { kind: "flat", y: 26 } },
  { name: "fly pad", footprint: { kind: "box", x: FLY_PAD.x, z: FLY_PAD.z, hx: FLY_PAD.hx, hz: FLY_PAD.hz, angle: FLY_PAD.angle }, top: { kind: "flat", y: FLY_PAD.height } },
  { name: "rack", footprint: { kind: "box", x: RACK.x, z: RACK.z, hx: RACK.hx, hz: RACK.hz, angle: RACK.angle }, top: { kind: "flat", y: RACK.height } },
  ...rackVials(),
  // The vial with its plug pulled: the rim, and the plug standing out of it.
  { name: "open vial", footprint: { kind: "circle", x: OPEN_VIAL.x, z: OPEN_VIAL.z, r: VIAL_RADIUS }, top: { kind: "flat", y: OPEN_VIAL.rim } },
  { name: "plug", footprint: { kind: "circle", x: OPEN_VIAL.x, z: OPEN_VIAL.z, r: 11.3 }, top: { kind: "dome", base: OPEN_VIAL.plug - 3, height: 3, power: 1 } },
  // The agar is level with the dish's rim: a fly that lands on it can walk off over the rim and drop to the bench.
  { name: "agar dish", footprint: { kind: "circle", x: AGAR_DISH.x, z: AGAR_DISH.z, r: AGAR_DISH.r }, top: { kind: "dish", well: AGAR_DISH.agar, rim: AGAR_DISH.rim, inner: 0.95, lip: 0.982 } },
  { name: "beaker", footprint: { kind: "circle", x: BEAKER.x, z: BEAKER.z, r: BEAKER.r }, top: { kind: "flat", y: BEAKER.height } },
  { name: "bottle", footprint: { kind: "circle", x: BOTTLE.x, z: BOTTLE.z, r: BOTTLE.r }, top: { kind: "flat", y: BOTTLE.height } },
  { name: "bottle cap", footprint: { kind: "circle", x: BOTTLE.x, z: BOTTLE.z, r: BOTTLE.cap }, top: { kind: "flat", y: BOTTLE.capTop } },
  // The lamp's cast base is gently domed; its stem rises straight to the arm, which is above the ceiling.
  { name: "lamp base", footprint: { kind: "circle", x: LAMP.x, z: LAMP.z, r: LAMP.r }, top: { kind: "dome", base: LAMP.base, height: 5, power: 1 } },
  { name: "lamp stem", footprint: { kind: "circle", x: LAMP.stem.x, z: LAMP.stem.z, r: LAMP.stem.r }, top: { kind: "flat", y: LAMP.stem.top } },
  { name: "timer", footprint: { kind: "box", x: TIMER.x, z: TIMER.z, hx: TIMER.hx, hz: TIMER.hz, angle: TIMER.angle }, top: { kind: "flat", y: TIMER.height } },
  { name: "tip box", footprint: { kind: "box", x: -336, z: 178, hx: 60, hz: 40, angle: -0.35 }, top: { kind: "flat", y: 64 } },
  // A used wipe, crumpled: soft and low enough at its foot to climb.
  { name: "wipe", footprint: { kind: "ellipse", x: -338, z: 52, rx: 30, rz: 25, angle: 0.5 }, top: { kind: "dome", base: 0, height: 16, power: 1 } },
  // The paintbrush lying where it was put down: its handle, its metal ferrule and its fine tip, each round enough to be close to what is drawn.
  { name: "brush", footprint: { kind: "ellipse", x: BRUSH.x, z: BRUSH.z, rx: BRUSH.handle, rz: BRUSH.r, angle: BRUSH.angle }, top: { kind: "dome", base: BRUSH.r, height: BRUSH.r, power: 0.5 } },
  { name: "ferrule", footprint: { kind: "ellipse", x: FERRULE.x, z: FERRULE.z, rx: 12, rz: 2, angle: BRUSH.angle }, top: { kind: "dome", base: 2, height: 2, power: 0.5 } },
  { name: "bristles", footprint: { kind: "ellipse", x: BRISTLES.x, z: BRISTLES.z, rx: 8, rz: 1.1, angle: BRUSH.angle }, top: { kind: "dome", base: 1, height: 1, power: 0.5 } },
  // The forceps' arms are just thin enough to step up onto and walk along.
  ...forcepsArms(),
  { name: "notebook", footprint: { kind: "box", x: NOTEBOOK.x, z: NOTEBOOK.z, hx: NOTEBOOK.hx, hz: NOTEBOOK.hz, angle: NOTEBOOK.angle }, top: { kind: "flat", y: NOTEBOOK.thick } },
  { name: "drop", footprint: { kind: "circle", x: DROP.x, z: DROP.z, r: DROP.r }, top: { kind: "dome", base: NOTEBOOK.thick, height: DROP.height, power: 0.5 } },
  // Dried crumbs of fly food, fallen when the vials were filled: low boulders a fly can climb.
  { name: "crumb", footprint: { kind: "ellipse", x: 22, z: 6, rx: 1.7, rz: 1.25, angle: 0.6 }, top: { kind: "dome", base: 0, height: 1.0, power: 1 } },
  { name: "crumb", footprint: { kind: "ellipse", x: 31, z: 14, rx: 1.2, rz: 1.0, angle: -0.4 }, top: { kind: "dome", base: 0, height: 0.8, power: 1 } },
  { name: "crumb", footprint: { kind: "ellipse", x: 58, z: -2, rx: 1.4, rz: 1.1, angle: 1.2 }, top: { kind: "dome", base: 0, height: 0.9, power: 1 } },
];

/** The bench's own food. Heights come from the surface under each. */
export const LAB_PATCHES: readonly FoodPatch[] = [
  // The agar, sweet with grape juice.
  { name: "grape agar", x: AGAR_DISH.x, z: AGAR_DISH.z, r: AGAR_DISH.r * 0.9, ...TASTES.grapeAgar },
  // Drips of cornmeal and molasses food, spilt when the vials were filled.
  { name: "fly food", x: 48, z: -24, r: 4.5, ...TASTES.flyFood },
  { name: "fly food", x: 36, z: -8, r: 2.6, ...TASTES.flyFood },
  { name: "fly food", x: 104, z: -30, r: 3.4, ...TASTES.flyFood },
];

/** Where the fly first stands, and which way it faces: toward the drips of food and the open vial. */
export const LAB_START = { x: 12, z: 28, yaw: 2.55 };

/** Flat things on the bench that change nothing for the fly: drawn, not felt. */
export const LAB_DECOR = {
  /** Strips of labelling tape stuck to the bench. */
  tape: [
    { x: -40, z: 236, hx: 60, hz: 9, angle: 0.02, color: "#f2c94c" },
    { x: 360, z: -20, hx: 34, hz: 8, angle: -1.45, color: "#7fb8e6" },
  ],
  /** A dab of yeast paste on the agar. */
  yeast: { x: -30, z: -48, r: 6 },
  /** Grains of cornmeal no taller than half a millimetre, round the drips: where, how far round, how many. */
  grains: [
    { x: 46, z: -18, r: 16, count: 50 },
    { x: 100, z: -32, r: 9, count: 16 },
    { x: 26, z: 8, r: 8, count: 14 },
    { x: 16, z: 31, r: 4, count: 4, scale: 0.6 },
  ],
};

export const LAB: Place = { floor: { kind: "rect", hx: BENCH.hx, hz: BENCH.hz }, solids: LAB_SOLIDS, patches: LAB_PATCHES, start: LAB_START, ceiling: 125 };

export function createLab(): World {
  return new World(LAB);
}
