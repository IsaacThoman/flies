// What the brain is wired to: which neurons each sense drives, which neurons
// each command is read from, and the arithmetic between firing rates and the
// game's 0..1 values. No Node APIs; this runs in the browser game's Web Worker.

import type { Connectome, NeuronQuery } from "./format.ts";
import { DFB_DOPAMINERGIC } from "./params.ts";
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

/**
 * The senses that are one intensity each and drive a group of their own; `light` is a picture, handled apart, `hunger`, `thirst` and the
 * clock and sleep internal state, not senses, the antennae's temperatures handled apart (thermo.ts), and the touch senses each drive a
 * region of a group (`regions`).
 */
export type ScalarSense = Exclude<keyof BrainSenses, "light" | "hunger" | "thirst" | StateKey | "temperatureLeft" | "temperatureRight" | TouchSense>;
export type SenseSpec = InputSpec & {
  sense: ScalarSense;
  /**
   * Mechanosensory: reaches the brain at less than its strength while the fly
   * sleeps (SLEEP_GATE). The eyes and taste aren't gated.
   */
  gated?: boolean;
  /**
   * The parts of the body this group's neurons are of, each felt as its own
   * sense: the group is their neurons, region after region, all within
   * `select`, and each region fires at `maxRate` times the stronger of its
   * own sense and the group's (`touch`, the whole body at once).
   */
  regions?: readonly TouchRegion[];
};

/** The touch senses that say where a touch lands. */
export const TOUCH_SENSES = [
  "touchEyeLeft",
  "touchEyeRight",
  "touchFrontLeft",
  "touchFrontRight",
  "touchOcciputLeft",
  "touchOcciputRight",
  "touchMouthpartsLeft",
  "touchMouthpartsRight",
  "touchNotum",
  "touchWings",
  "touchAbdomen",
  "touchLegs",
] as const satisfies readonly (keyof BrainSenses)[];
export type TouchSense = (typeof TOUCH_SENSES)[number];

/** One part of the body's mechanosensory bristles, touched as `sense` says. */
export type TouchRegion = { sense: TouchSense; description: string; select: Selection };

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

// Touch lands somewhere: each part of the body's bristles is its own sense
// (README, Senses). The head's are told apart by type, which FlyEM gives by
// the nerve they enter by, and have a side. The body's types are each of one
// nerve, so they are told apart by type too (`scripts/touch.ts` checks the
// split against the anatomy file's entry nerves), but the packed wiring
// doesn't say their side.
const HEAD_PARTS: readonly { part: string; description: string; types: readonly string[] }[] = [
  { part: "Eye", description: "the compound eye's interommatidial bristles (BM_InOm)", types: ["BM_InOm"] },
  {
    part: "Front",
    description: "the bristles that enter by the antennal nerve (BM): the antenna's, and the front and top of the head's between the eyes",
    types: ["BM"],
  },
  { part: "Occiput", description: "the back of the head's: the occiput's and behind the eye (BM_vOcci_vPoOr, BM_Vt_PoOc)", types: ["BM_vOcci_vPoOr", "BM_Vt_PoOc"] },
  {
    part: "Mouthparts",
    description: "under the head: the proboscis', maxillary palps', vibrissae's and haustellum's (BM_Taste, BM_MaPa, BM_Vib, BM_Hau)",
    types: ["BM_Taste", "BM_MaPa", "BM_Vib", "BM_Hau"],
  },
];
export const HEAD_TOUCH: readonly TouchRegion[] = HEAD_PARTS.flatMap(({ part, description, types }) =>
  (["left", "right"] as const).map((side) => ({
    sense: `touch${part}${side === "left" ? "Left" : "Right"}` as TouchSense,
    description: `${side === "left" ? "Left" : "Right"}: ${description}`,
    select: { superClass: "cb_sensory", type: [...types], side },
  })),
);
// The notum's microchaetae (SNta02) and macrochaetae (SNta05, 10, 12, 13), and
// SNta33, by the posterior dorsal mesothoracic and dorsal prothoracic nerves.
export const NOTUM_TYPES = ["SNta02", "SNta05", "SNta10", "SNta12", "SNta13", "SNta33"];
// The wing margin's bristles (SNta04, 06, 07, 11, 14, 18; Marin et al. 2024),
// by the anterior dorsal mesothoracic nerve, and the halteres' (SNta03), the
// hind wings', by the dorsal metathoracic nerve.
export const WING_TYPES = ["SNta04", "SNta06", "SNta07", "SNta11", "SNta14", "SNta18", "SNta03"];
export const BODY_TOUCH: readonly TouchRegion[] = [
  { sense: "touchNotum", description: `The notum's bristles (${NOTUM_TYPES.join(", ")})`, select: { superClass: "vnc_sensory", type: NOTUM_TYPES } },
  { sense: "touchWings", description: `The wings' margins' and the halteres' bristles (${WING_TYPES.join(", ")})`, select: { superClass: "vnc_sensory", type: WING_TYPES } },
  {
    // Its bristles are among the abdominal nerves' sensory neurons of no known
    // modality, which the data doesn't sort further (README, Senses).
    sense: "touchAbdomen",
    description: "The abdominal nerves' sensory neurons of no known modality, its bristles among them",
    select: { superClass: ["vnc_sensory", "sensory_ascending"], class: "unknown_sensory", subClass: "abdomen" },
  },
  {
    sense: "touchLegs",
    description: "The legs' tactile neurons: every other tactile neuron of the cord",
    select: { superClass: "vnc_sensory", class: "mechanosensory_tactile", type: (t: string) => !NOTUM_TYPES.includes(t) && !WING_TYPES.includes(t) },
  },
];
// A bristle neuron's mean rate over half a second of deflection: about 13
// spikes in its first 60 ms, then 25 Hz while held (Tuthill & Wilson 2016,
// Cell 164:1046, Figure 2A, counted from the raster). Wherever it is: a
// bristle's neuron answers its own bristle, and the body says which are bent.
export const BRISTLE_RATE = 50;

export const SENSES: readonly SenseSpec[] = [
  { sense: "loomLeft", name: "loomLeft", description: "Looming detectors (LPLC2, LC4) of the left eye", select: sided(LOOMING, "left"), maxRate: 100 },
  { sense: "loomRight", name: "loomRight", description: "Looming detectors (LPLC2, LC4) of the right eye", select: sided(LOOMING, "right"), maxRate: 100 },
  {
    sense: "touch",
    name: "touch head",
    description: "Mechanosensory bristle neurons of the head (BM types), by part and side",
    select: { superClass: "cb_sensory", type: /^BM/ },
    regions: HEAD_TOUCH,
    maxRate: BRISTLE_RATE,
    gated: true,
  },
  {
    sense: "touch",
    name: "touch body",
    description: "Mechanosensory bristle neurons of the notum, wings and halteres, abdomen and legs",
    select: { superClass: ["vnc_sensory", "sensory_ascending"], class: ["mechanosensory_tactile", "unknown_sensory"] },
    regions: BODY_TOUCH,
    maxRate: BRISTLE_RATE,
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
 * Chosen by what it does (README, Sleep and the daily rhythm), while touch
 * still drove every bristle at once: stroking (touch 1) then arrived as touch
 * 0.6, which rouses a fly that is only still, and the feather resting (0.4) as
 * 0.24, less than a raindrop; at half, stroking hardly woke it. Not chosen
 * again since touch lands where it does. The eyes aren't gated: a loom still reaches the giant fiber.
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
    // Sleep need makes the R5 ring neurons fire more (Liu et al. 2016, who called them R2).
    description: "The R5 ring neurons of the ellipsoid body (ER5)",
    select: { type: "ER5" },
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
 * The dorsal fan-shaped body's sleep-promoting neurons: its layers' 6 and 7
 * tangential neurons (FB6*, FB7*, glutamatergic but for a few with no
 * prediction), less the three dopaminergic types among them that promote
 * waking (params.ts, DFB_DOPAMINERGIC).
 */
export const DFB_SLEEP: Selection = { type: (t: string) => /^FB[67]/.test(t) && !DFB_DOPAMINERGIC.includes(t) };

/** Internal state that sets the excitability of the real neurons that carry it, mV added to their drive at 1. */
export type ExcitabilitySpec = { state: StateKey; name: string; description: string; select: Selection; mV: number };

/**
 * Sleep need makes the dorsal fan-shaped body's sleep-promoting neurons more
 * excitable: rested, they mostly don't fire to current injected into them;
 * after sleep loss they do, with higher input resistances and longer time
 * constants (Donlea, Pimentel & Miesenböck 2014, Neuron 81: 860; Pimentel et
 * al. 2016). Not a firing rate of their own: a drive under them that the
 * input they get then fires. At full pressure it brings them to threshold
 * (7 mV), a round number: as excitable as the neuron model goes without
 * firing on its own. Dopamine takes it away (modulation.ts, Dop1R2).
 */
export const STATE_EXCITABILITY: readonly ExcitabilitySpec[] = [
  {
    state: "sleepPressure",
    name: "sleep pressure",
    description: "The dorsal fan-shaped body's sleep-promoting neurons (FB6, FB7 but the dopaminergic FB6H and FB7B)",
    select: DFB_SLEEP,
    mV: 7,
  },
];

/**
 * Stand-ins for what reaches the mushroom body's dopaminergic neurons and
 * that the wiring doesn't carry there (README, Learning). Sugar on the
 * mouthparts excites the reward DANs of the β'2 and γ4 compartments (Burke
 * et al. 2012, Nature 492:433; Liu et al. 2012, Nature 488:512; Huetteroth et
 * al. 2015, Curr Biol 25:751), PAM02 (PAM-β'2a), PAM07 and PAM08 (PAM-γ4),
 * but in this model nothing from the `sweet` taste neurons reaches any PAM
 * (they stay silent under sugar). Driven at the sweet sense's intensity, at
 * most 20 Hz: chosen, the order of what PPL1 fires here under a loom (19 Hz),
 * which reaches them through the wiring, so that sugar and a threat teach at
 * comparable strength. Their output is muted, as every DAN's is (params.ts):
 * they change nothing but what the mushroom body learns, their own slow
 * modulatory levels (modulation.ts) and the region rates. Added after every
 * other input, so every other stream is as it was.
 */
export const REINFORCEMENT: readonly SenseSpec[] = [
  {
    sense: "sweet",
    name: "sweet reward",
    description: "Reward dopaminergic neurons of the mushroom body's β'2a and γ4 compartments (PAM02, PAM07, PAM08), which sugar excites",
    select: { type: ["PAM02", "PAM07", "PAM08"] },
    maxRate: 20,
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

/** How hungry the senses say it is, 0..1: 1 (as it was before hunger) when left out or not a number. */
export function hungerOf(senses: BrainSenses): number {
  const hunger = senses.hunger;
  return typeof hunger === "number" && Number.isFinite(hunger) ? Math.min(1, Math.max(0, hunger)) : 1;
}

/**
 * Thirst (BrainSenses.thirst) acts on the water taste neurons' output, as
 * hunger does on the sweet ones'. In the fly the gate is further in: thirst
 * raises the osmolality of the hemolymph, which quietens the four
 * interoceptive SEZ neurons (ISNs), and quieter ISNs let water be drunk and
 * sugar less (Jourjine et al. 2016, Cell 166: 855, Figures 4 to 7); their
 * targets, and so where the water pathway is gated, aren't known. Water
 * taste is what a thirsty fly drinks by (Cameron et al. 2010, Nature 465: 91;
 * Chen, Wang & Wang 2010, J Neurosci 30: 6247), and thirst makes water a
 * reward (Lin et al. 2014, Nat Neurosci 17: 1536). Nothing has measured a
 * thirsty fly's water neurons releasing more, so this is a stand-in for the
 * whole gate, put at the one place the model can hold it.
 *
 * `sated` is the gain just after drinking against 1 for a thirsty fly: 1/1.4,
 * chosen by analogy with dopamine's on the sweet neurons (modulation.ts, DopEcR), for want of
 * a measurement, and linear between. At 1 the brain is what it was before it
 * had a thirst, as hunger's is at 1.
 */
export const THIRST = { sated: 1 / 1.4 } as const;

/** How thirsty the senses say it is, 0..1: 1 (as it was before thirst) when left out or not a number. */
export function thirstOf(senses: BrainSenses): number {
  const thirst = senses.thirst;
  return typeof thirst === "number" && Number.isFinite(thirst) ? Math.min(1, Math.max(0, thirst)) : 1;
}

/** The water taste neurons' output gain at this thirst (0..1): THIRST.sated just after drinking, 1 thirsty. */
export function waterOutputGain(thirst: number): number {
  return THIRST.sated + (1 - THIRST.sated) * thirst;
}

/** Each sense's intensity, 0..1 (grounded as 0 or 1; a touch region left out, 0). */
export function intensity(senses: BrainSenses, sense: ScalarSense | TouchSense): number {
  const value = senses[sense] ?? 0;
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

/** Each sense input's rate, Hz per neuron, for these senses: the inputs of one rate (those with regions have one a region, `regionRate`). */
export function senseRates(wiring: Pick<Wiring, "senses">, senses: BrainSenses): Map<string, number> {
  const gate = sleepGate(senses);
  return new Map(
    wiring.senses.filter(({ spec }) => !spec.regions).map(({ spec, maxRate }) => [spec.name, maxRate * intensity(senses, spec.sense) * (spec.gated ? gate : 1)]),
  );
}

/** A region's rate, Hz per neuron: its group's full rate times the stronger of the region's own sense and the group's, gated as the group is. */
export function regionRate(group: Wiring["senses"][number], region: TouchRegion, senses: BrainSenses): number {
  const felt = Math.max(intensity(senses, group.spec.sense), intensity(senses, region.sense));
  return group.maxRate * felt * (group.spec.gated ? sleepGate(senses) : 1);
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
  /** With regions, `ends[r]` is where region r's neurons end in `neurons` (they start where the one before ends). */
  senses: { spec: SenseSpec; neurons: Uint32Array; maxRate: number; ends?: Uint32Array }[];
  background: { spec: (typeof BACKGROUND)[number]; neurons: Uint32Array; maxRate: number }[];
  /** The internal-state inputs this connectome has neurons for. */
  state: { spec: StateSpec; neurons: Uint32Array; maxRate: number }[];
  /** The thermoreceptor inputs this connectome has neurons for. */
  thermo: { spec: ThermoSpec; neurons: Uint32Array }[];
  /** The internal state that sets excitability, where this connectome has its neurons. */
  excitability: { spec: ExcitabilitySpec; neurons: Uint32Array }[];
  /** The reinforcement stand-ins this connectome has neurons for. */
  reinforcement: { spec: SenseSpec; neurons: Uint32Array; maxRate: number }[];
  readouts: { spec: ReadoutSpec; neurons: Uint32Array }[];
};

/** The rate factor for one side of a balanced pair: below 1 for the side with more output synapses. */
export function balanceFactor(connectome: Connectome, mine: ArrayLike<number>, theirs: ArrayLike<number>): number {
  const a = outputSynapses(connectome, mine);
  const b = outputSynapses(connectome, theirs);
  return a > b && a > 0 ? b / a : 1;
}

/**
 * A group of regions: their neurons, region after region; throws if a region's
 * neuron is outside the group or in another region too. A region this
 * connectome has no neurons for (a test's) is left empty: nothing it feels
 * reaches anything.
 */
function regional(connectome: Connectome, spec: SenseSpec): Wiring["senses"][number] {
  const within = new Set(select(connectome, spec.select));
  const seen = new Set<number>();
  const ends = new Uint32Array(spec.regions!.length);
  const neurons: number[] = [];
  spec.regions!.forEach((region, r) => {
    for (const i of select(connectome, region.select)) {
      if (!within.has(i)) throw new Error(`Neuron ${i} of "${region.sense}" is outside "${spec.name}"`);
      if (seen.has(i)) throw new Error(`Neuron ${i} of "${region.sense}" is in another region of "${spec.name}" too`);
      seen.add(i);
      neurons.push(i);
    }
    ends[r] = neurons.length;
  });
  return { spec, neurons: Uint32Array.from(neurons), maxRate: spec.maxRate, ends };
}

/** Resolves every group against a connectome; throws if a group is empty or an input is also read. */
export function wire(connectome: Connectome): Wiring {
  const senses: Wiring["senses"] = SENSES.map((spec) => (spec.regions ? regional(connectome, spec) : { spec, neurons: select(connectome, spec.select), maxRate: spec.maxRate }));
  const background = BACKGROUND.map((spec) => ({ spec, neurons: select(connectome, spec.select), maxRate: spec.maxRate }));
  for (const groups of [senses, background]) {
    for (const each of groups) {
      const other = groups.find((g) => g.spec.name === each.spec.balance);
      if (other) each.maxRate = each.spec.maxRate * balanceFactor(connectome, each.neurons, other.neurons);
    }
  }
  const state = STATE_INPUTS.map((spec) => ({ spec, neurons: select(connectome, spec.select), maxRate: spec.maxRate })).filter((g) => g.neurons.length > 0);
  const thermo = THERMO_INPUTS.map((spec) => ({ spec, neurons: select(connectome, spec.select) })).filter((g) => g.neurons.length > 0);
  const excitability = STATE_EXCITABILITY.map((spec) => ({ spec, neurons: select(connectome, spec.select) })).filter((g) => g.neurons.length > 0);
  const reinforcement = REINFORCEMENT.map((spec) => ({ spec, neurons: select(connectome, spec.select), maxRate: spec.maxRate })).filter((g) => g.neurons.length > 0);
  const readouts = READOUTS.map((spec) => ({ spec, neurons: select(connectome, spec.select) }));
  for (const group of [...senses, ...background, ...readouts]) {
    if (group.neurons.length === 0) throw new Error(`The connectome has no neurons for "${group.spec.name}" (${group.spec.description})`);
  }
  const driven = new Set<number>();
  for (const group of [...senses, ...background, ...state, ...excitability, ...thermo, ...reinforcement]) for (const i of group.neurons) driven.add(i);
  for (const group of readouts) {
    for (const i of group.neurons) if (driven.has(i)) throw new Error(`Neuron ${i} is both driven and read (readout "${group.spec.name}")`);
  }
  return { senses, background, state, excitability, thermo, reinforcement, readouts };
}
