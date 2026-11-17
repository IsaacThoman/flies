// The antennae's thermoreceptors: how the air's temperature at each arista
// becomes firing of its heating and cooling cells. A stand-in for their
// transduction, built from what Budelli et al. (2019, Neuron 101:738) recorded
// from the arista; which neurons they are is the connectome's (io.ts,
// THERMO_INPUTS). No Node APIs; it runs in the browser game's Web Worker.

import type { BrainSenses } from "./types.ts";

/**
 * Budelli et al. 2019 recorded the arista's thermoreceptors through its cut
 * tip, where three sensilla each hold one heating ("Hot") and one cooling
 * ("Cold") cell; spikes were told apart by size, not by cell, so each rate
 * they give is the three cells' together. Each cell fires a third of it.
 */
const CELLS_PER_ARISTA = 3;

export const THERMO = {
  /**
   * A cooling cell's steady rate, Hz: the same at 25 and 30 °C (92 ± 19 and
   * 102 ± 20 Hz, not distinct, Fig. 1B), so no tonic term. 97 Hz, a third each.
   */
  coolingRate: 97 / CELLS_PER_ARISTA,
  /**
   * How much a cooling cell's rate rises for each °C the air is cooler than
   * what it has adapted to: more than 1.5 times after 0.1 °C of cooling and 3
   * times after 0.2 °C (Fig. 1B), so 1 + 10 × 0.2 = 3. Warming lowers it as
   * much, to silence ("often ceasing for a few seconds", Fig. 1A).
   */
  coolingGain: 10,
  /**
   * A heating cell's steady rate at 25 °C, Hz, and how it rises with
   * temperature: 17, 37 and 74 Hz at 20, 25 and 30 °C, a Q10 of about 4.4
   * (Supp. Fig. 5B). Recorded only over 20 to 30 °C, so outside that the
   * steady rate stays at its end of the range.
   */
  heatingRate25: 37 / CELLS_PER_ARISTA,
  heatingQ10: 4.4,
  tonicMin: 20,
  tonicMax: 30,
  /** A heating cell's rise for each °C of warming: about 3 times for 2.5 to 3 °C (Supp. Fig. 5C), so 1 + 2/2.75 per °C. Cooling lowers it as much. */
  heatingGain: 2 / 2.75,
  /** Neither cell rose past about 3 times its steady rate however long the change went on (Fig. 1B, Supp. Fig. 5C). */
  ceiling: 3,
  /**
   * How fast each cell adapts to a new temperature, ms: what it compares the
   * air with follows the air over this long. Chosen from the recordings'
   * time course, not fitted: warming by 5 °C silenced the cooling cells for
   * "a few seconds" (Fig. 1A), which at this gain and 1 s takes 3.9 s.
   */
  adaptMs: 1000,
  /** What the cells are given is held within these, °C: from freezing to well past what kills a fly, a guard against nonsense, not a claim about either end. */
  feltMin: 0,
  feltMax: 50,
} as const;

const HEATING_LOG_Q10 = Math.log(THERMO.heatingQ10);

/** The air's temperature at that antenna, °C (within THERMO.feltMin to feltMax), or NaN when the senses leave it out or it is not a number. */
export function temperatureOf(senses: BrainSenses, side: "left" | "right"): number {
  const t = side === "left" ? senses.temperatureLeft : senses.temperatureRight;
  return typeof t === "number" && !Number.isNaN(t) ? Math.min(THERMO.feltMax, Math.max(THERMO.feltMin, t)) : NaN;
}

/** A heating cell's rate, Hz per neuron, at temperature `t` having adapted to `adapted` (°C). */
export function heatingRate(t: number, adapted: number): number {
  const steady = Math.min(THERMO.tonicMax, Math.max(THERMO.tonicMin, t));
  const tonic = THERMO.heatingRate25 * Math.exp((HEATING_LOG_Q10 * (steady - 25)) / 10);
  return tonic * Math.min(THERMO.ceiling, Math.max(0, 1 + THERMO.heatingGain * (t - adapted)));
}

/** A cooling cell's rate, Hz per neuron, at temperature `t` having adapted to `adapted` (°C). */
export function coolingRate(t: number, adapted: number): number {
  return THERMO.coolingRate * Math.min(THERMO.ceiling, Math.max(0, 1 + THERMO.coolingGain * (adapted - t)));
}

/**
 * What each antenna's thermoreceptors have adapted to, °C: NaN until a
 * temperature is felt there, and again once the senses leave it out.
 */
export class Thermoreceptors {
  readonly adapted = { left: NaN, right: NaN };

  /**
   * The rates of that antenna's heating and cooling cells over the next
   * `ms` (0 when it feels no temperature), after which it has adapted that
   * much further toward `t`. A first temperature is one it has adapted to.
   */
  step(side: "left" | "right", t: number, ms: number, out: { heating: number; cooling: number }) {
    if (Number.isNaN(t)) {
      this.adapted[side] = NaN;
      out.heating = 0;
      out.cooling = 0;
      return;
    }
    const adapted = Number.isNaN(this.adapted[side]) ? t : this.adapted[side];
    out.heating = heatingRate(t, adapted);
    out.cooling = coolingRate(t, adapted);
    this.adapted[side] = adapted + (t - adapted) * -Math.expm1(-ms / THERMO.adaptMs);
  }
}
