// The bench top is y=0. Pots are filled, and foliage has solid crowns:
// there is no unreachable pocket beneath a drawn leaf.
import type { FoodPatch } from "./pantry.ts";
import type { Solid } from "./shapes.ts";
import type { Place } from "./world.ts";

export const GREENHOUSE_BENCH = { hx: 320, hz: 200 };
export const GLAZING = { x: 760, z: 640, eave: 880, ridge: 1220 };
export const POTS = [{ x: -190, z: -105, r: 45, height: 70 }, { x: -80, z: -132, r: 32, height: 48 }];
export const TRAY = { x: 75, z: -115, hx: 74, hz: 42, height: 14 };
export const SAUCER = { x: 104, z: 40, r: 43, water: 2 };

const box = (name: string, x: number, z: number, hx: number, hz: number, y: number, bottom?: number): Solid => ({ name, footprint: { kind: "box", x, z, hx, hz, angle: 0 }, top: { kind: "flat", y }, ...(bottom === undefined ? {} : { bottom }) });
export const GREENHOUSE_SOLIDS: readonly Solid[] = [
  ...POTS.map(p => ({ name: "terracotta pot", footprint: { kind: "circle" as const, x: p.x, z: p.z, r: p.r }, top: { kind: "dish" as const, well: p.height - 5, rim: p.height, inner: 0.83, lip: 0.93 } })),
  ...POTS.map(p => ({ name: "greenhouse leaves", bottom: p.height - 5, footprint: { kind: "circle" as const, x: p.x, z: p.z, r: p.r * 0.78 }, top: { kind: "dome" as const, base: p.height - 5, height: p.r * 1.1, power: 0.65 } })),
  box("seed tray", TRAY.x, TRAY.z, TRAY.hx, TRAY.hz, TRAY.height),
  ...Array.from({ length: 12 }, (_, i): Solid => ({ name: "seedling crown", bottom: TRAY.height, footprint: { kind: "ellipse", x: TRAY.x - 54 + i % 4 * 36, z: TRAY.z - 24 + Math.floor(i / 4) * 24, rx: 12, rz: 9, angle: i * 0.7 }, top: { kind: "dome", base: TRAY.height, height: 10 + i % 3 * 2, power: 0.7 } })),
  { name: "watering can", footprint: { kind: "circle", x: 230, z: -80, r: 39 }, top: { kind: "flat", y: 88 } },
  // The spout is a sequence of overlapping flat sections, without air pockets.
  ...Array.from({ length: 10 }, (_, i) => box("watering spout", 265 + i * 3, -80, 5, 7 - i * 0.2, 26 + i * 4, 16 + i * 4)),
  ...Array.from({length: 33},(_,i) => {
    const x = 205+i*46/32;
    const y = 107+Math.sqrt(Math.max(0,23*23-(x-228)*(x-228)));
    return box("can handle",x,-80,0.78,5,y+4,y-4);
  }),
  box("can handle", 205, -80, 4, 5, 108, 88),
  box("can handle", 251, -80, 4, 5, 108, 88),
  { name: "water saucer", footprint: { kind: "circle", x: SAUCER.x, z: SAUCER.z, r: SAUCER.r }, top: { kind: "dish", well: SAUCER.water, rim: 6, inner: 0.76, lip: 0.91 } },
  { name: "fallen tomato", footprint: { kind: "circle", x: -50, z: -12, r: 19 }, top: { kind: "dome", base: 0, height: 24, power: 0.55 } },
  { name: "fallen tomato", footprint: { kind: "circle", x: -82, z: 51, r: 13 }, top: { kind: "dome", base: 0, height: 17, power: 0.6 } },
  { name: "split fig", footprint: { kind: "ellipse", x: 20, z: 56, rx: 19, rz: 25, angle: -0.35 }, top: { kind: "dome", base: 0, height: 9, power: 1 } },
  { name: "trowel blade", footprint: { kind: "ellipse", x: -187, z: 66, rx: 20, rz: 38, angle: -0.6 }, top: { kind: "dome", base: 0, height: 3.5, power: 1 } },
  { name: "trowel handle", footprint: { kind: "ellipse", x: -218, z: 111, rx: 9, rz: 24, angle: -0.6 }, top: { kind: "dome", base: 0, height: 13, power: 0.5 } },
  // The panes are beyond the bench and extend above the flight excursion.
  box("greenhouse pane", 0, -GLAZING.z, GLAZING.x, 3, 1800, -850),
  box("greenhouse pane", 0, GLAZING.z, GLAZING.x, 3, 1800, -850),
  box("greenhouse pane", -GLAZING.x, 0, 3, GLAZING.z, 1800, -850),
  box("greenhouse pane", GLAZING.x, 0, 3, GLAZING.z, 1800, -850),
];

export const GREENHOUSE_PATCHES: readonly FoodPatch[] = [
  { name: "tomato juice", x: -50, z: -12, r: 7, sweet: 0.72 },
  { name: "tomato juice", x: -82, z: 51, r: 4, sweet: 0.72 },
  { name: "fig flesh", x: 20, z: 56, r: 12, sweet: 0.95 },
  { name: "tomato juice", x: -14, z: 8, r: 6, sweet: 0.72 },
  ...Array.from({length: 4},(_,i) => ({name: "tomato juice",x:-30+i*4,z:-5+i*3,r:1.4+i*0.15,sweet:0.72})),
  { name: "water", x: SAUCER.x, z: SAUCER.z, r: 31, sweet: 0.05, pool: true },
];
export const GREENHOUSE: Place = {
  floor: { kind: "rect", ...GREENHOUSE_BENCH }, solids: GREENHOUSE_SOLIDS, patches: GREENHOUSE_PATCHES,
  start: { x: 20, z: 56, y: 9, yaw: 0.6 }, ceiling: 280,
};
