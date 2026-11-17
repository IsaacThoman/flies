// Smell: the antennae's and palps' olfactory receptor neurons (ORNs), every
// one the connectome labels by its glomerulus, firing as the recordings say
// they do, at rest and to the odorants the world gives off (README, Smell).
// No Node APIs; it runs in the browser game's Web Worker.

import type { Connectome } from "./format.ts";
import { ORN_TABLE } from "./orn-table.ts";
import type { BrainSenses } from "./types.ts";

/**
 * The odorants the world can give off, in the order of `BrainSenses.odor`:
 * what ripe and fermenting fruit, vinegar and yeast smell of (ethyl acetate,
 * acetic acid, ethanol and isoamyl acetate), and the carbon dioxide that
 * fermentation and breath give off.
 */
export const ODORANTS = ["ethylAcetate", "aceticAcid", "ethanol", "isoamylAcetate", "co2"] as const;
export type Odorant = (typeof ODORANTS)[number];

/** Which antenna's nerve a group's axons enter by; `unknown` where the reconstruction doesn't say. */
export type OrnSide = "left" | "right" | "unknown";

/** One glomerulus's receptor neurons on one side. */
export type OrnGroup = {
  /** Name of its input in the simulation. */
  name: string;
  glomerulus: string;
  side: OrnSide;
  neurons: Uint32Array;
  /** Hz at rest. */
  spontaneous: number;
  /** Hz added at full strength of each odorant (ODORANTS' order); negative is inhibition. */
  answers: Float64Array;
};

const SIDES: readonly OrnSide[] = ["left", "right", "unknown"];

/**
 * The neurons of every glomerulus by side. The packed wiring's side is the
 * root side for these neurons, the antenna's nerve (scripts/olfaction.ts
 * checks it against the anatomy). The four olfactory neurons with no
 * glomerulus fire at the median spontaneous rate and answer nothing.
 */
export function wireOlfaction(connectome: Connectome): OrnGroup[] {
  // One pass over the connectome: the olfactory neurons, then each glomerulus's among them.
  const olfactory = connectome.find({ superClass: "cb_sensory", class: "olfactory" });
  const groups: OrnGroup[] = [];
  const add = (glomerulus: string, type: string, spontaneous: number, answers: readonly number[]) => {
    const all = olfactory.filter((i) => connectome.columns.type.value(i) === type);
    for (const side of SIDES) {
      const neurons = all.filter((i) => (connectome.columns.side.value(i) || "unknown") === side);
      if (neurons.length === 0) continue;
      groups.push({ name: `smell ${glomerulus || "untyped"} ${side}`, glomerulus, side, neurons, spontaneous, answers: Float64Array.from(answers) });
    }
  };
  for (const [glomerulus, , , spontaneous, answers] of ORN_TABLE) add(glomerulus, `ORN_${glomerulus}`, spontaneous, answers);
  add("", "", UNTYPED_RATE, ODORANTS.map(() => 0));
  return groups;
}

/** The median spontaneous rate of the glomeruli, which the table gives those that were never recorded. */
export const UNTYPED_RATE = (() => {
  const rates = ORN_TABLE.map((row) => row[3]).sort((a, b) => a - b);
  const n = rates.length;
  return n % 2 ? rates[(n - 1) / 2] : (rates[n / 2 - 1] + rates[n / 2]) / 2;
})();

const strength = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * Each odorant's strength at each antenna, 0..1 (ODORANTS' order), into `into`
 * (left, then right): 0 for any left out or not a number.
 */
export function odorOf(senses: BrainSenses, into: Float64Array): Float64Array {
  const odor = senses.odor;
  const n = ODORANTS.length;
  for (let k = 0; k < n; k++) {
    into[k] = strength(odor?.left?.[k]);
    into[n + k] = strength(odor?.right?.[k]);
  }
  return into;
}

/**
 * A group's rate, Hz: its spontaneous rate plus each odorant's answer at its
 * strength, never below silence. Mixtures add: ORNs answer most binary
 * mixtures close to the sum of their parts (Silbering & Galizia 2007, J
 * Neurosci 27: 11966), which strong odours exceed, as the refractory period
 * caps it here. Neurons whose antenna isn't known smell the mean of the two.
 */
export function ornRate(group: OrnGroup, odor: Float64Array): number {
  const n = ODORANTS.length;
  let rate = group.spontaneous;
  for (let k = 0; k < n; k++) {
    const strength = group.side === "left" ? odor[k] : group.side === "right" ? odor[n + k] : (odor[k] + odor[n + k]) / 2;
    rate += group.answers[k] * strength;
  }
  return Math.max(0, rate);
}
