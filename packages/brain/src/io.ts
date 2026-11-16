// What the brain is wired to: which neurons each sense drives, which neurons
// each command is read from, and the arithmetic between firing rates and the
// game's 0..1 values. No Node APIs; this runs in the browser game's Web Worker.

import type { Connectome, NeuronQuery } from "./format.ts";
import type { BrainCommand, BrainSenses } from "./types.ts";

/**
 * A group of neurons, picked by annotation and, where the annotations in the
 * wiring don't say enough (which leg a sensory neuron comes from), also by root ID.
 */
export type Selection = NeuronQuery & { rootIds?: readonly number[] };

export type InputSpec = {
  /** Name of the Poisson input in the simulation. */
  name: string;
  /** What these neurons are. */
  description: string;
  select: Selection;
  /**
   * Firing rate per neuron, Hz, at full strength. For a sense this is scaled by
   * its intensity; for a left/right pair it may be lowered on one side (see
   * `balance`).
   */
  maxRate: number;
  /**
   * For one side of a left/right pair: the input group of the other side. The
   * side whose neurons have more output synapses has its rate lowered so that,
   * at full strength, both deliver the same synapse-spikes per second (rate ×
   * output synapses). This makes up for one side being less completely
   * reconstructed than the other.
   */
  balance?: string;
  /**
   * Added to the simulation after the eyes, so that its random stream leaves
   * every input that came before it as it was: a sense added later changes
   * nothing until it is felt.
   */
  afterEyes?: boolean;
};

/** The senses that are one intensity each; `light` is a picture, handled apart, and `hunger` internal state, not a sense. */
export type ScalarSense = Exclude<keyof BrainSenses, "light" | "hunger">;
export type SenseSpec = InputSpec & { sense: ScalarSense };

export type ReadoutSpec = {
  /** Name in `stats.rates`. */
  name: string;
  description: string;
  select: Selection;
  /** Time constant of the exponential smoothing of the group's mean rate, ms. */
  tau: number;
};

/** One side's part of a selection. */
const sided = (query: NeuronQuery, side: "left" | "right"): NeuronQuery => ({ ...query, side });

const LOOMING: NeuronQuery = { type: ["LPLC2", "LC4"] };
// Pushing the antenna deflects it and holds it there. The Johnston's organ neurons
// that answer a sustained push or pull are zones C and E (Kamikouchi et al. 2009;
// Yorozu et al. 2009; Hampel et al. 2020), and they drive antennal grooming
// (Hampel et al. 2015, 2020). A and B answer sound and vibration; F drives
// grooming too, but answers neither a push nor vibration (what it senses is
// unknown, Hampel et al. 2020).
const ANTENNA: NeuronQuery = { superClass: "cb_sensory", type: /^JO-[CE]/ };
// Nothing in the data says which taste neurons are sweet-sensing. These were
// chosen by what they do in this model: built greedily from the head's taste
// neuron types, each added for raising the proboscis motor neuron MN9's rate
// most (README; `probe.ts --superClass cb_sensory --class gustatory --each type
// --target MN9 --greedy`).
export const SWEET_TYPES = ["dorsal_tpGRN", "LB3d", "PhG9", "LB3c", "LB2a", "LB4a", "LB3b", "PhG1c", "PhG3"];

// The front legs' taste neurons that answer a male's cuticle. A male's
// forelegs carry pheromone-sensing taste neurons: in each of their
// pheromone-sensing taste bristles one ppk23 neuron answers male pheromones
// (7-tricosene, the M cell) and one female ones (the F cell, ppk25 too;
// Thistle et al. 2012, Lu et al. 2012, Toda et al. 2012), and Gr32a bitter
// neurons answer 7-tricosene too (Miyamoto & Amrein 2008; Wang et al. 2011).
// Both keep males from courting males. Which types they are in this dataset is
// the proposal of Tastekin et al. (2025, the male CNS's taste connectome):
// LgLG1a is fru+ ppk23+ ppk25- (the M cell's identity) and LgAG1 the Gr33a
// (with Gr32a) bitter neurons. Both types are on every leg; these are the front
// legs' (entry nerve ProLN in FlyEM's annotations, which the packed wiring
// doesn't carry; `scripts/song.ts` checks them against the anatomy file).
export const FORELEG_MALE_TASTE = {
  LgLG1a: [
    807958, 808071, 808278, 808369, 808379, 808524, 809798, 810164, 811797, 812809, 813636, 814020, 814544, 814710, 815091, 815110, 816273, 816447, 816927,
    816972, 817352, 817570, 818574, 819815, 820449, 821805, 823278, 823555, 824934, 905725, 907867, 911569, 912149, 933097,
  ],
  LgAG1: [91673, 92777, 94281, 94719, 94995, 95900, 105964, 108436, 111872, 816710],
} as const;

export const SENSES: readonly SenseSpec[] = [
  { sense: "loomLeft", name: "loomLeft", description: "Looming detectors (LPLC2, LC4) of the left eye", select: sided(LOOMING, "left"), maxRate: 100 },
  { sense: "loomRight", name: "loomRight", description: "Looming detectors (LPLC2, LC4) of the right eye", select: sided(LOOMING, "right"), maxRate: 100 },
  {
    sense: "touch",
    name: "touch head",
    description: "Mechanosensory bristle neurons of the head (BM types)",
    select: { superClass: "cb_sensory", type: /^BM/ },
    maxRate: 50,
  },
  {
    sense: "touch",
    name: "touch body",
    description: "Mechanosensory bristle neurons of the thorax, abdomen and legs",
    select: { superClass: "vnc_sensory", subClass: "mechanosensory_bristle" },
    maxRate: 10,
  },
  {
    sense: "bumpLeft",
    name: "bumpLeft",
    description: "Displacement-sensitive Johnston's organ neurons (zones C and E) of the left antenna",
    select: sided(ANTENNA, "left"),
    maxRate: 100,
  },
  {
    sense: "bumpRight",
    name: "bumpRight",
    description: "Displacement-sensitive Johnston's organ neurons (zones C and E) of the right antenna",
    select: sided(ANTENNA, "right"),
    maxRate: 100,
  },
  {
    sense: "wind",
    name: "wind",
    description: "Wind- and gravity-sensitive Johnston's organ neurons of both antennae",
    select: { superClass: "cb_sensory", subClass: "wind_gravity" },
    maxRate: 100,
  },
  {
    sense: "sweet",
    name: "sweet",
    description: `Head taste neurons ${SWEET_TYPES.join(", ")}`,
    select: { superClass: "cb_sensory", class: "gustatory", type: SWEET_TYPES },
    maxRate: 100,
  },
  {
    sense: "grounded",
    name: "grounded",
    description: "Campaniform sensilla (load sensors) of the legs, firing tonically while standing",
    select: { superClass: ["vnc_sensory", "sensory_ascending"], subClass: "campaniform_sensilla" },
    maxRate: 20,
  },
  {
    sense: "maleTaste",
    name: "maleTaste",
    description: "Front legs' taste neurons for a male's pheromones: LgLG1a (ppk23 M cells) and LgAG1 (Gr32a/Gr33a)",
    select: { type: ["LgLG1a", "LgAG1"], rootIds: [...FORELEG_MALE_TASTE.LgLG1a, ...FORELEG_MALE_TASTE.LgAG1] },
    // A round number, of the order of what a contact chemoreceptor fires for
    // its ligand (tens of spikes a second); at 100 the answer is the same (README).
    maxRate: 50,
    afterEyes: true,
  },
];

/**
 * Spontaneous input, always on: the visual scene a fly at rest still sees.
 * Every visual projection neuron except the looming detectors (nothing is
 * looming at rest) fires at a low background rate, set per eye by the
 * internal state (see state.ts). The two eyes are balanced (see
 * InputSpec.balance): the right eye's neurons have 19% more output synapses.
 */
export const BACKGROUND: readonly (InputSpec & { side: "left" | "right" })[] = (["left", "right"] as const).map((side) => ({
  name: `background ${side}`,
  side,
  description: `Visual projection neurons of the ${side} eye except LPLC2 and LC4`,
  select: { superClass: "visual_projection", side, type: (t: string) => t !== "LPLC2" && t !== "LC4" },
  maxRate: 6,
  balance: `background ${side === "left" ? "right" : "left"}`,
}));

export const READOUTS: readonly ReadoutSpec[] = [
  { name: "DNg100", description: "BDN2, forward walking", select: { type: "DNg100" }, tau: 150 },
  { name: "DNa02 left", description: "Steering, left", select: { type: "DNa02", side: "left" }, tau: 150 },
  { name: "DNa02 right", description: "Steering, right", select: { type: "DNa02", side: "right" }, tau: 150 },
  { name: "MDN", description: "Moonwalker, backward walking", select: { type: "MDN" }, tau: 150 },
  { name: "DNp01", description: "Giant fiber, escape take-off", select: { type: "DNp01" }, tau: 40 },
  { name: "flight", description: "Indirect flight power muscle motor neurons", select: { type: ["DLM1-4", "DLMn/a", "DVM1a-c", "DVMn/2a", "DVMn/3a"] }, tau: 100 },
  { name: "DNg12", description: "Head-grooming descending neurons DNg12_a, _b and _c", select: { type: ["DNg12_a", "DNg12_b", "DNg12_c"] }, tau: 150 },
  { name: "MN9", description: "Proboscis extension motor neuron", select: { type: "MN9" }, tau: 150 },
  { name: "pIP10", description: "Courtship song command descending neurons", select: { type: "pIP10" }, tau: 150 },
];

/** Rate, Hz, at which each command reaches 1 (decode says which readouts each is read from). */
export const SCALES = {
  walk: 40,
  turn: 40,
  back: 40,
  escape: 200,
  wings: 120,
  groom: 60,
  feed: 40,
  sing: 40,
} as const;

const clamp = (value: number, min: number, max: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0);

/** Commands from the smoothed readout rates, Hz. */
export function decode(rates: Readonly<Record<string, number>>): BrainCommand {
  const r = (name: string) => rates[name] ?? 0;
  return {
    walk: clamp(r("DNg100") / SCALES.walk, 0, 1),
    // DNa02 drives turning toward its own side; positive is toward the fly's right.
    turn: clamp((r("DNa02 right") - r("DNa02 left")) / SCALES.turn, -1, 1),
    back: clamp(r("MDN") / SCALES.back, 0, 1),
    escape: clamp(r("DNp01") / SCALES.escape, 0, 1),
    wings: clamp(r("flight") / SCALES.wings, 0, 1),
    groom: clamp(r("DNg12") / SCALES.groom, 0, 1),
    feed: clamp(r("MN9") / SCALES.feed, 0, 1),
    sing: clamp(r("pIP10") / SCALES.sing, 0, 1),
  };
}

/**
 * Hunger (BrainSenses.hunger) acts on the sweet taste neurons' output, not on
 * how fast they fire. Starvation leaves sugar-sensing taste neurons' spiking
 * as it was but raises the calcium that enters their terminals for each
 * spike, through dopamine on their DopEcR receptors, and so how much they
 * release (Inagaki et al. 2012, Cell 148: 583): what the dopaminergic TH-VUM
 * neuron does, firing at about 1 Hz just after a meal and 25 Hz after a day
 * without food (Marella et al. 2012, Neuron 73: 941). Its own output is muted
 * here, as every dopaminergic neuron's is (params.ts), so this gain stands in
 * for it.
 *
 * `sated` is the gain just after a meal against 1 for a day's starvation:
 * dopamine raises the sugar-evoked calcium in the terminals 1.3 to 1.4 fold
 * (ibid., Figure 6G), taken here as release, one for one, so a fed fly's
 * sweet neurons pass on 1/1.4 of a starved one's. Release grows faster than
 * calcium at most synapses, so if anything this understates it. Between the
 * two the gain is linear in hunger, a round assumption.
 *
 * At 1 the brain is what it was before it had a hunger. That is a hungry
 * fly: the sweet neurons were chosen for driving the proboscis to extend
 * (Senses), as starved flies' do in the assays that found them.
 */
export const HUNGER = { sated: 1 / 1.4 } as const;

/** How hungry the senses say it is, 0..1: 1 (as it was before hunger) when left out or not a number. */
export function hungerOf(senses: BrainSenses): number {
  const hunger = senses.hunger;
  return typeof hunger === "number" && Number.isFinite(hunger) ? Math.min(1, Math.max(0, hunger)) : 1;
}

/** The sweet taste neurons' output gain at this hunger (0..1): HUNGER.sated just fed, 1 starved. */
export function sweetOutputGain(hunger: number): number {
  return HUNGER.sated + (1 - HUNGER.sated) * hunger;
}

/** Each sense's intensity, 0..1 (grounded as 0 or 1). */
export function intensity(senses: BrainSenses, sense: ScalarSense): number {
  const value = senses[sense];
  if (typeof value === "boolean") return value ? 1 : 0;
  return clamp(value, 0, 1);
}

/** Each sense input's rate, Hz per neuron, for these senses. */
export function senseRates(wiring: Pick<Wiring, "senses">, senses: BrainSenses): Map<string, number> {
  return new Map(wiring.senses.map(({ spec, maxRate }) => [spec.name, maxRate * intensity(senses, spec.sense)]));
}

/** Each background input's rate, Hz per neuron, for the eyes' levels (0..1). */
export function backgroundRates(wiring: Pick<Wiring, "background">, level: { left: number; right: number }): Map<string, number> {
  return new Map(wiring.background.map(({ spec, maxRate }) => [spec.name, maxRate * clamp(level[spec.side], 0, 1)]));
}

/** Exponential smoothing of a rate toward `sample` over `dt` ms with time constant `tau` ms. */
export function smooth(previous: number, sample: number, dt: number, tau: number): number {
  return previous + (sample - previous) * -Math.expm1(-dt / tau);
}

/** The neurons a selection picks. */
export function select(connectome: Connectome, selection: Selection): Uint32Array {
  const { rootIds, ...query } = selection;
  const found = connectome.find(query);
  if (!rootIds) return found;
  const wanted = new Set(rootIds);
  return found.filter((i) => wanted.has(connectome.rootId[i]));
}

/** Output synapses of a group of neurons. */
export function outputSynapses(connectome: Connectome, neurons: ArrayLike<number>): number {
  let total = 0;
  for (let k = 0; k < neurons.length; k++) {
    const i = neurons[k];
    for (let e = connectome.ptr[i]; e < connectome.ptr[i + 1]; e++) total += connectome.count[e];
  }
  return total;
}

export type Wiring = {
  senses: { spec: SenseSpec; neurons: Uint32Array; maxRate: number }[];
  background: { spec: (typeof BACKGROUND)[number]; neurons: Uint32Array; maxRate: number }[];
  readouts: { spec: ReadoutSpec; neurons: Uint32Array }[];
};

/** The rate factor for one side of a balanced pair: below 1 for the side with more output synapses. */
export function balanceFactor(connectome: Connectome, mine: ArrayLike<number>, theirs: ArrayLike<number>): number {
  const a = outputSynapses(connectome, mine);
  const b = outputSynapses(connectome, theirs);
  return a > b && a > 0 ? b / a : 1;
}

/** Resolves every group against a connectome; throws if a group is empty or an input is also read. */
export function wire(connectome: Connectome): Wiring {
  const senses = SENSES.map((spec) => ({ spec, neurons: select(connectome, spec.select), maxRate: spec.maxRate }));
  const background = BACKGROUND.map((spec) => ({ spec, neurons: select(connectome, spec.select), maxRate: spec.maxRate }));
  for (const groups of [senses, background]) {
    for (const each of groups) {
      const other = groups.find((g) => g.spec.name === each.spec.balance);
      if (other) each.maxRate = each.spec.maxRate * balanceFactor(connectome, each.neurons, other.neurons);
    }
  }
  const readouts = READOUTS.map((spec) => ({ spec, neurons: select(connectome, spec.select) }));
  for (const group of [...senses, ...background, ...readouts]) {
    if (group.neurons.length === 0) throw new Error(`The connectome has no neurons for "${group.spec.name}" (${group.spec.description})`);
  }
  const driven = new Set<number>();
  for (const group of [...senses, ...background]) for (const i of group.neurons) driven.add(i);
  for (const group of readouts) {
    for (const i of group.neurons) if (driven.has(i)) throw new Error(`Neuron ${i} is both driven and read (readout "${group.spec.name}")`);
  }
  return { senses, background, readouts };
}
