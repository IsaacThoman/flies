// What a fly smells where it is: each food's odour, carried by the air and
// spread by diffusion (docs/world.md, Smell). The field is the one the
// olfaction study's gates protocol fixed before anything was measured
// (docs/olfaction-gates-protocol.md, Part D; docs/smell-protocol.md): the
// steady solution of advection and diffusion from a point source on a floor
// in uniform air, normalised to the food's edge,
//
//   C = min(1, (r₀ / r) · exp(−U (r − x) / 2D))
//
// r the distance from the food's centre, x its component downwind, r₀ the
// food's radius, U the wind's speed. In still air it is diffusion's r₀ / r.
// A simplification, labelled as one: no turbulence, no intermittency, no time
// for a plume to build up or to follow the wind as it changes, and solids
// don't stand in its way.

import type { Vec3 } from "./shapes.ts";
import type { Odor } from "./tastes.ts";
import { ODORANTS } from "./tastes.ts";

export const PLUME = {
  /** mm²/s: about these small volatiles' diffusivity in air (chosen; Fuller estimates give 6 to 16). */
  diffusivity: 10,
  /** Below this strength at an antenna, an odorant isn't there at all (chosen: docs/smell-protocol.md). */
  floor: 0.01,
} as const;

/** Anything that gives off odour: where it is, how big (mm), how much of it is left (1 whole). */
export type OdorSource = { readonly x: number; readonly y: number; readonly z: number; readonly r: number; readonly amount: number; readonly odor?: Odor };

/** A food gives off less only over its last quarter, as its taste fades (pantry.ts tasteIntensity). */
const left = (amount: number) => Math.min(1, Math.max(0, amount) * 4);

/**
 * Each odorant's strength at (x, y, z), 0 to 1 in ODORANTS' order, from all
 * of `sources` in air moving at `wind` (mm/s; only across the ground carries
 * it), into `out`. What comes to less than PLUME.floor is none.
 */
export function smellAt(sources: readonly OdorSource[], wind: Readonly<Vec3>, x: number, y: number, z: number, out: Float64Array): Float64Array {
  const n = ODORANTS.length;
  out.fill(0);
  const speed = Math.hypot(wind.x, wind.z);
  // Per mm: U / 2D, and the wind's direction.
  const fall = speed / (2 * PLUME.diffusivity);
  const wx = speed > 0 ? wind.x / speed : 0;
  const wz = speed > 0 ? wind.z / speed : 0;
  // Indexed: asked for each antenna of each fly every step, and an iterator is an allocation without a JIT.
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const odor = s.odor;
    if (!odor || s.amount <= 0) continue;
    const dx = x - s.x;
    const dy = y - s.y;
    const dz = z - s.z;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const c = (r <= s.r ? 1 : Math.min(1, (s.r / r) * Math.exp(-fall * (r - (dx * wx + dz * wz))))) * left(s.amount);
    for (let k = 0; k < n; k++) out[k] += c * odor[k];
  }
  for (let k = 0; k < n; k++) out[k] = out[k] < PLUME.floor ? 0 : Math.min(1, out[k]);
  return out;
}
