// A small diner for the tests: a table top on its legs with a plate on it, a
// chair seat pushed in under its edge, a shelf, a lamp on a cord from a
// ceiling slab over everything, and two rails just over the floor.

import type { Place, Solid } from "../src/index.ts";

const box = (x: number, z: number, hx: number, hz: number) => ({ kind: "box", x, z, hx, hz, angle: 0 }) as const;
const flat = (y: number) => ({ kind: "flat", y }) as const;

export const DINER: Place = {
  floor: { kind: "rect", hx: 300, hz: 300 },
  solids: [
    { name: "ceiling", footprint: box(0, 0, 400, 400), top: flat(320), bottom: 300 },
    { name: "table", footprint: box(0, 0, 100, 60), top: flat(76), bottom: 72 },
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz): Solid => ({ name: "leg", footprint: box(sx * 90, sz * 50, 4, 4), top: flat(72) }))),
    { name: "plate", footprint: { kind: "circle", x: 20, z: 0, r: 30 }, top: { kind: "dish", well: 77, rim: 80, inner: 0.6, lip: 0.85 }, bottom: 76 },
    { name: "seat", footprint: { kind: "circle", x: -140, z: 0, r: 40 }, top: { kind: "dome", base: 45, height: 2, power: 1 }, bottom: 43 },
    { name: "shelf", footprint: box(0, -150, 60, 15), top: flat(120), bottom: 117 },
    { name: "lamp", footprint: { kind: "circle", x: 0, z: 150, r: 25 }, top: { kind: "dome", base: 150, height: 20, power: 1 }, bottom: 150 },
    { name: "cord", footprint: { kind: "circle", x: 0, z: 150, r: 1 }, top: flat(300), bottom: 168 },
    // Rails over the floor: one a fly's body is too tall to pass under, one it just fits beneath.
    { name: "low rail", footprint: box(-100, 220, 40, 10), top: flat(3), bottom: 1 },
    { name: "high rail", footprint: box(100, 220, 40, 10), top: flat(3), bottom: 1.3 },
  ],
  patches: [
    { name: "jam", x: 20, z: 0, y: 100, r: 5, sweet: 1 },
    { name: "grape", x: 20, z: 0, y: 10, r: 5, sweet: 0.8 },
  ],
  start: { x: -50, z: 0, yaw: 0, y: 76 },
  ceiling: 250,
};

