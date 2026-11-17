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

/** The internal state that comes with the senses (types.ts): the daily clock and sleep, 0 to 1 each. */
export const STATE_KEYS = ["clockMorning", "clockEvening", "clockSleep", "sleepPressure", "sleepDepth"] as const;
export type StateKey = (typeof STATE_KEYS)[number];

/** The senses that are one intensity each; `light` is a picture, handled apart, and `hunger` and the clock and sleep internal state, not senses. */
export type ScalarSense = Exclude<keyof BrainSenses, "light" | "hunger" | StateKey | "temperatureLeft" | "temperatureRight">;
export type SenseSpec = InputSpec & {
  sense: ScalarSense;
  /**
   * Mechanosensory: reaches the brain at less than its strength while the fly
   * sleeps (SLEEP_GATE). The eyes and taste aren't gated.
   */
  gated?: boolean;
};

/** An input that stands for internal state the connectome can't supply, driving the real neurons that carry it. */
export type StateSpec = InputSpec & { state: StateKey };

/** One antenna's heating or cooling cells, whose rates thermo.ts works out from the temperature there (maxRate is unused: 0). */
export type ThermoSpec = InputSpec & { side: "left" | "right"; cell: "heating" | "cooling" };

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
// The mouth's taste neurons, by what they are. Tastekin et al. (2026, Cell,
// the gustatory connectome of the male CNS and FlyWire) typed every taste
// neuron of the labellum, its taste pegs and the pharynx and matched each
// type's projections to receptor GAL4 lines; FlyWire's annotations carry the
// labellar types' putative tastes from them (release 3.2.0, cell_sub_class).
// Each sense drives every type of the mouth matched to that taste's receptors
// (`scripts/taste.ts` checks the types against FlyEM's annotations). The
// legs' and wings' taste neurons aren't driven: the body tastes with its
// mouthparts (README, Senses).
// Sugar: the labellar bristles' LB3b and LB3c (Gr64f), the dorsal taste pegs'
// (Gr5a) and the pharynx's PhG1 (Gr64e).
export const SWEET_TYPES = ["LB3b", "LB3c", "dorsal_tpGRN", "PhG1a", "PhG1b", "PhG1c"];
// Bitter: LB1a to LB1d (Gr33a). LB1e, once counted bitter, is Ir94e's.
export const BITTER_TYPES = ["LB1a", "LB1b", "LB1c", "LB1d"];
// Water: the labellar bristles' LB3a and the pharynx's PhG3 and PhG4 (ppk28).
export const WATER_TYPES = ["LB3a", "PhG3", "PhG4"];
/** The mouth's taste neurons of these types. */
const mouthTaste = (types: readonly string[]): NeuronQuery => ({ superClass: "cb_sensory", class: "gustatory", type: [...types] });

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

// The campaniform sensilla (strain sensors in the cuticle) are of three
// places, which FlyEM's entry nerves tell apart (the packed wiring doesn't carry
// them; `scripts/wingbeat.ts` checks the types against the anatomy file):
// the legs' (SNpp53: 12 by the leg nerves, and one with no nerve recorded), the wings' (the anterior
// dorsal mesothoracic nerve, ADMN: 218) and the halteres' (the dorsal
// metathoracic nerve, DMetaN: 195). Only the legs' bear the body's weight.
// The wings' and halteres' are strained by every stroke and fire phase-locked
// with it in flight (Fayyazuddin & Dickinson 1999; Dhawan, Huang & Dickerson
// 2025; Lesser, Moussa & Tuthill 2025 reconstructed the ADMN).
export const LEG_CAMPANIFORM = "SNpp53";
// In flight the wings' and halteres' sensors fire a spike a stroke, about 200
// a second, each locked to the stroke. A Poisson input carries only a rate, at
// random: under the refractory period, 250 Hz of it fires them 200 times a
// second and 100 Hz 91 times. WINGBEAT_RATE is the round rate the model drives
// its other hard-driven sensory neurons at; anywhere from 100 to 250 Hz the
// loop it closes with the body dies away the same (README, Senses).
export const WINGBEAT_RATE = 100;

export const SENSES: readonly SenseSpec[] = [
  { sense: "loomLeft", name: "loomLeft", description: "Looming detectors (LPLC2, LC4) of the left eye", select: sided(LOOMING, "left"), maxRate: 100 },
  { sense: "loomRight", name: "loomRight", description: "Looming detectors (LPLC2, LC4) of the right eye", select: sided(LOOMING, "right"), maxRate: 100 },
  {
    sense: "touch",
    name: "touch head",
    description: "Mechanosensory bristle neurons of the head (BM types)",
    select: { superClass: "cb_sensory", type: /^BM/ },
    maxRate: 50,
    gated: true,
  },
  {
    sense: "touch",
    name: "touch body",
    description: "Mechanosensory bristle neurons of the thorax, abdomen and legs",
    select: { superClass: "vnc_sensory", subClass: "mechanosensory_bristle" },
    maxRate: 10,
    gated: true,
  },
  {
    sense: "bumpLeft",
    name: "bumpLeft",
    description: "Displacement-sensitive Johnston's organ neurons (zones C and E) of the left antenna",
    select: sided(ANTENNA, "left"),
    maxRate: 100,
    gated: true,
  },
  {
    sense: "bumpRight",
    name: "bumpRight",
    description: "Displacement-sensitive Johnston's organ neurons (zones C and E) of the right antenna",
    select: sided(ANTENNA, "right"),
    maxRate: 100,
    gated: true,
  },
  {
    sense: "wind",
    name: "wind",
    description: "Wind- and gravity-sensitive Johnston's organ neurons of both antennae",
    select: { superClass: "cb_sensory", subClass: "wind_gravity" },
    maxRate: 100,
    gated: true,
  },
  {
    sense: "sweet",
    name: "sweet",
    description: `The mouth's sugar-sensing taste neurons: ${SWEET_TYPES.join(", ")}`,
    select: mouthTaste(SWEET_TYPES),
    maxRate: 100,
  },
  {
    sense: "grounded",
    name: "grounded",
    description: "Campaniform sensilla (load sensors) of the legs (SNpp53), firing tonically while standing",
    select: { subClass: "campaniform_sensilla", type: LEG_CAMPANIFORM },
    maxRate: 20,
    gated: true,
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
  {
    sense: "wingbeat",
    name: "wingbeat",
    description: "Campaniform sensilla (strain sensors) of the wings and halteres, firing with each stroke",
    select: { superClass: ["vnc_sensory", "sensory_ascending"], subClass: "campaniform_sensilla", type: (t: string) => t !== LEG_CAMPANIFORM },
    maxRate: WINGBEAT_RATE,
    afterEyes: true,
  },
  // The round rate of the other hard-driven sensory neurons, as `sweet`'s.
  { sense: "bitter", name: "bitter", description: `The mouth's bitter-sensing taste neurons: ${BITTER_TYPES.join(", ")}`, select: mouthTaste(BITTER_TYPES), maxRate: 100, afterEyes: true },
  { sense: "water", name: "water", description: `The mouth's water-sensing taste neurons: ${WATER_TYPES.join(", ")}`, select: mouthTaste(WATER_TYPES), maxRate: 100, afterEyes: true },
];

/**
 * How much of a mechanosensory sense's strength is lost at full sleep depth.
 * A stand-in for sleep's raised arousal threshold: sleeping flies need
 * stronger stimuli to respond, more so the longer a bout has lasted (van
 * Alphen et al. 2013; Faville et al. 2015), and their brains answer stimuli
 * less (Nitz et al. 2002; van Swinderen et al. 2004). How sleep does that in
 * the fly isn't known circuit by circuit, and the model has none of it, so
 * the senses that arousal thresholds are measured with (touch, the antennae,
 * the legs' load) reach the brain at a lower rate: at depth 1, 60% of it.
 * Chosen by what it does (README, Sleep and the daily rhythm): stroking (touch
 * 1) then arrives as touch 0.6, which rouses a fly that is only still, and the
 * feather resting (0.4) as 0.24, less than a raindrop; at half, stroking hardly
 * woke it. The eyes aren't gated: a loom still reaches the giant fiber.
 */
export const SLEEP_GATE = 0.4;

/**
 * How much of the eyes' input is lost when the fly is as sleepy as the clock
 * makes it at night (state.ts, `sleepiness`). A stand-in for vision's gain
 * following arousal: fly visual neurons answer more strongly when the fly is
 * active (Maimon et al. 2010; Chiappe et al. 2010; Suver et al. 2012), and a
 * sleepy fly's less. It is needed because lowering arousal takes away the
 * background that holds the giant fiber back: without it a night scene seen
 * through the eyes, which brings the escape command near take-off in an awake
 * fly, set a sleepy one off every half a minute or so. 0.3 is chosen by what it
 * does (README, Sleep and the daily rhythm): the night's picture then drives
 * the giant fiber no harder than it does an awake fly, and a loom still wakes it.
 */
export const SLEEP_EYES = 0.3;

/**
 * Internal state the connectome can't supply, fed to the real neurons that
 * carry it in the fly (README, Sleep and the daily rhythm). What makes the
 * fly sleep is not these: as modelled they reach no command (measured there),
 * and the sleep term in state.ts does it. A connectome without them (a test's)
 * leaves them out.
 */
export const STATE_INPUTS: readonly StateSpec[] = [
  {
    state: "clockMorning",
    name: "clock morning",
    // Their daily rhythm of firing, higher in the morning, is the molecular clock's (Flourakis et al. 2015); a few Hz at its height.
    description: "The morning oscillator's clock neurons, s-LNv and l-LNv (the M cells)",
    select: { type: ["s-LNv", "l-LNv"] },
    maxRate: 5,
  },
  {
    state: "clockEvening",
    name: "clock evening",
    description: "The evening oscillator's clock neurons, LNd and the 5th s-LNv (the E cells)",
    select: { type: ["LNd_b", "LNd_c", "5thsLNv_LNd6"] },
    maxRate: 5,
  },
  {
    state: "sleepPressure",
    name: "sleep pressure",
    // Sleep need makes the dorsal fan-shaped body neurons fire (Donlea et al. 2014) and the R5 ring neurons fire more (Liu et al. 2016).
    description: "Tangential neurons of the fan-shaped body's dorsal layers 6 and 7 (FB6, FB7) and the R5 ring neurons (ER5)",
    select: { type: (t: string) => /^FB[67]/.test(t) || t === "ER5" },
    maxRate: 10,
  },
];

/**
 * The aristae's thermoreceptors. Each arista holds three heating cells (Gr28b.d)
 * and three cooling cells (Ir21a, Ir25a, Ir93a), one of each in each of its
 * three sensilla (Gallio et al. 2011; Ni et al. 2013; Budelli et al. 2019).
 * Their axons end in the antennal lobe's VP2 (heating) and VP3 (cooling)
 * glomeruli (Gallio et al. 2011; Frank et al. 2015; Marin et al. 2020, who
 * reconstructed them: Gr28b.d in VP2, Ir21a in VP3), and the dataset's types
 * are named for those: TRN_VP2, and TRN_VP3a and TRN_VP3b. Side is the
 * antenna's (`scripts/thermo.ts` checks it against FlyEM's root sides). The
 * sacculus's VP1 cells are left out: which of them answer cooling and which
 * humidity is still a proposal (Marin et al. 2020), and the annotations name
 * them the other way round from it.
 */
export const THERMO_INPUTS: readonly ThermoSpec[] = (["left", "right"] as const).flatMap((side) => [
  {
    name: `heating ${side}`,
    side,
    cell: "heating" as const,
    description: `Heating cells (Gr28b.d) of the ${side} arista, TRN_VP2`,
    select: { superClass: "cb_sensory", class: "thermosensory", type: "TRN_VP2", side },
    maxRate: 0,
  },
  {
    name: `cooling ${side}`,
    side,
    cell: "cooling" as const,
    description: `Cooling cells (Ir21a) of the ${side} arista, TRN_VP3a and TRN_VP3b`,
    select: { superClass: "cb_sensory", class: "thermosensory", type: ["TRN_VP3a", "TRN_VP3b"], side },
    maxRate: 0,
  },
]);

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
 * Inagaki et al. measured it in the labellum's Gr5a sugar neurons; the taste
 * pegs' and the pharynx's sugar neurons get the same gain, an assumption.
 *
 * At 1 the brain is what it was before it had a hunger: the synapses'
 * weights stand for a starved fly's, as in the proboscis extension assays,
 * which starve flies first. Which end of the range the weights stand for is
 * a choice the data can't make; it was made when the sweet neurons were
 * still chosen by what they do, and is kept.
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

/** An internal state's value, 0..1 (0 when left out). */
export function stateOf(senses: BrainSenses, key: StateKey): number {
  return clamp(senses[key] ?? 0, 0, 1);
}

/** What a mechanosensory sense keeps of its strength at this sleep depth (SLEEP_GATE). */
export function sleepGate(senses: BrainSenses): number {
  return 1 - SLEEP_GATE * stateOf(senses, "sleepDepth");
}

/** Each sense input's rate, Hz per neuron, for these senses. */
export function senseRates(wiring: Pick<Wiring, "senses">, senses: BrainSenses): Map<string, number> {
  const gate = sleepGate(senses);
  return new Map(wiring.senses.map(({ spec, maxRate }) => [spec.name, maxRate * intensity(senses, spec.sense) * (spec.gated ? gate : 1)]));
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
  /** The internal-state inputs this connectome has neurons for. */
  state: { spec: StateSpec; neurons: Uint32Array; maxRate: number }[];
  /** The thermoreceptor inputs this connectome has neurons for. */
  thermo: { spec: ThermoSpec; neurons: Uint32Array }[];
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
  const state = STATE_INPUTS.map((spec) => ({ spec, neurons: select(connectome, spec.select), maxRate: spec.maxRate })).filter((g) => g.neurons.length > 0);
  const thermo = THERMO_INPUTS.map((spec) => ({ spec, neurons: select(connectome, spec.select) })).filter((g) => g.neurons.length > 0);
  const readouts = READOUTS.map((spec) => ({ spec, neurons: select(connectome, spec.select) }));
  for (const group of [...senses, ...background, ...readouts]) {
    if (group.neurons.length === 0) throw new Error(`The connectome has no neurons for "${group.spec.name}" (${group.spec.description})`);
  }
  const driven = new Set<number>();
  for (const group of [...senses, ...background, ...state, ...thermo]) for (const i of group.neurons) driven.add(i);
  for (const group of readouts) {
    for (const i of group.neurons) if (driven.has(i)) throw new Error(`Neuron ${i} is both driven and read (readout "${group.spec.name}")`);
  }
  return { senses, background, state, thermo, readouts };
}
