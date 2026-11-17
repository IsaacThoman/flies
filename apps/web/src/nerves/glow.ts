// How brightly each part of the nervous system glows, from the brain's region
// rates. A region's glow follows min(1, rate / fullHz): its mean firing rate
// over all its neurons (already a 100 ms average in the brain) on the scale
// the brain package measured for it, where strong stimulation comes near 1
// and its rest shows faintly. The glow rises to it with a 50 ms time constant
// and falls with 400 ms, so a burst of a few tens of milliseconds is seen for
// about half a second while nothing flickers from one brain state to the
// next. Command-group somata use the same envelope on their existing mean
// readout rates, scaled as the commands are. No individual spikes are inferred.
// Nothing else lights it: a group that doesn't fire stays dark.
//
// The shaders take the glow in linear light, so the screen's gamma shows a
// region at a tenth of its full rate at about a third of full brightness:
// quiet regions are visible without being made to look busy.

import { REGIONS } from "@fly/brain";
import { NERVE_PARTS, SOMA_GROUPS } from "@fly/fly";
import { partRegions } from "./regions.ts";

/** Seconds: how fast a part's glow rises toward its rate, and falls back. */
export const GLOW_RISE = 0.05;
export const GLOW_FALL = 0.4;

/** What the glow heads for at a rate: the rate on the region's own full scale, 0 to 1. */
export function glowTarget(rate: number, fullHz: number): number {
  const g = rate / fullHz;
  return g > 0 ? (g < 1 ? g : 1) : 0;
}

export class NerveGlow {
  /** Each region's glow now, in REGIONS order. */
  readonly regions = new Float32Array(REGIONS.length);
  readonly #full = Float32Array.from(REGIONS, (r) => r.fullHz);
  readonly #partRegion = partRegions();
  readonly #parts: Float32Array;
  readonly #somata = Uint16Array.from(SOMA_GROUPS, (g) => NERVE_PARTS.findIndex((p) => p.id === g.id));

  /** `parts` is the drawing's glow array (FlyNerves.glow), filled in place. */
  constructor(parts: Float32Array) {
    this.#parts = parts;
  }

  /** Once a frame: eases each region toward its rate, and lights its parts. Allocates nothing. */
  update(rates: Float32Array, dt: number, readouts?: Readonly<Record<string, number>>) {
    const up = 1 - Math.exp(-dt / GLOW_RISE);
    const down = 1 - Math.exp(-dt / GLOW_FALL);
    const regions = this.regions;
    for (let r = 0; r < regions.length; r++) {
      const target = glowTarget(rates[r], this.#full[r]);
      const g = regions[r];
      regions[r] = g + (target - g) * (target > g ? up : down);
    }
    const parts = this.#parts, partRegion = this.#partRegion;
    for (let p = 0; p < partRegion.length; p++) if (partRegion[p] >= 0) parts[p] = regions[partRegion[p]];
    for (let s = 0; s < SOMA_GROUPS.length; s++) {
      const group = SOMA_GROUPS[s], p = this.#somata[s];
      const target = glowTarget(readouts?.[group.rate] ?? 0, group.fullHz);
      const g = parts[p];
      parts[p] = g + (target - g) * (target > g ? up : down);
    }
  }

  /** All dark at once: a new brain, or nothing to show. */
  clear() {
    this.regions.fill(0);
    this.#parts.fill(0);
  }
}
