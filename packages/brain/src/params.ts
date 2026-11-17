// The operating point: how the connectome's synapse counts and predicted
// transmitters become signed connection strengths, and the neuron model's
// constants. Every departure from "synapse count × transmitter sign" is here;
// the README explains each.

import type { Connectome, NeuronQuery } from "./format.ts";

export type TransmitterFix = {
  /** What the fix is and why. */
  reason: string;
  /** Which neurons it applies to (`nt` is the predicted transmitter, before any fix). */
  select: NeuronQuery;
  /** The transmitter they get instead. */
  nt: string;
};

/**
 * A group of neurons whose two sides were reconstructed unequally: the same
 * cells, wired to the same partners, but one side's with far fewer synapses.
 */
export type CompletenessFix = {
  /** What the group is, and the evidence that its sides differ only in how completely they were traced. */
  reason: string;
  /** The group, both sides; each side is its neurons with that soma (or root) side. */
  select: NeuronQuery;
};

export type OperatingPoint = {
  /** mV per synapse of an excitatory (cholinergic) neuron. */
  excitatory: number;
  /** mV per synapse of an inhibitory (GABA, glutamate, histamine) neuron; positive, applied with a minus sign. */
  inhibitory: number;
  /** mV per synapse of the slow modulators (dopamine, serotonin, octopamine); signed. */
  modulatory: number;
  /** mV per synapse of neurons with no predicted transmitter after the fixes; signed. */
  unknown: number;
  /**
   * Factor on the strength of every synapse made by a columnar neuron of the
   * optic lobe (see `columnar`): graded, non-spiking relays whose synapses
   * release continuously, which one spike per synapse understates.
   */
  graded: number;
  /**
   * Synaptic saturation: a connection of n synapses acts as
   * saturation × (1 - exp(-n / saturation)) synapses (rounded), so one
   * presynaptic spike can't push its target arbitrarily far. About n for small
   * n, never more than `saturation`. 0 turns it off.
   */
  saturation: number;
  /** Corrections to the predicted transmitter, applied in order. */
  fixes: readonly TransmitterFix[];
  /**
   * Groups reconstructed less completely on one side: that side's synapses
   * count as many times more as the other side has output synapses (see
   * `completenessFactors`), so that at the same firing rate both sides
   * deliver the same drive.
   */
  completeness: readonly CompletenessFix[];
  /** Neuron model constants, passed to Simulation. */
  neuron: {
    dt: number;
    tauMem: number;
    tauSyn: number;
    threshold: number;
    refractory: number;
    delay: number;
    epsilon: number;
    resetDrive: boolean;
    adaptation: { increment: number; tau: number };
  };
};

const MONOAMINES: readonly string[] = ["DA", "SER", "OCT"];

/**
 * Cell types known to be octopaminergic by name: every OA- type, and the
 * descending OA-VL1 and OA-VL2 (DNd02, DNd03) and OA-VPM1 (DNg34), and the
 * OA-VUMd neurons (DNge138, DNge149, DNge150, DNge152, DNg66), which FlyEM
 * names as descending neurons and cross-references to Busch et al. (2009)
 * and Babski et al. (2024).
 */
export const OCTOPAMINERGIC = /^(OA-.+|DNd02|DNd03|DNg34|DNge138|DNge149|DNge150|DNge152|DNg66)$/;
/** The dopaminergic tangential neurons of the dorsal fan-shaped body (Hulse et al. 2021, SS56699), which promote waking. */
export const DFB_DOPAMINERGIC: readonly string[] = ["FB5H", "FB6H", "FB7B"];

/** Transmitter corrections backed by known biology. */
export const TRANSMITTER_FIXES: readonly TransmitterFix[] = [
  {
    reason:
      "Kenyon cells are cholinergic (Barnstedt et al. 2016). This dataset predicts them as dopaminergic, and dopamine is muted here, which would cut the mushroom body's output.",
    select: { type: /^KC/ },
    nt: "ACH",
  },
  {
    reason: "Photoreceptors are histaminergic; the prediction is blank for most of them.",
    select: { superClass: "ol_sensory", nt: "" },
    nt: "HIST",
  },
  {
    reason:
      "Mechanosensory, gustatory, olfactory and other primary sensory neurons outside the eye are cholinergic; the prediction is blank for about 2,100 of them, most head bristle neurons among them.",
    select: { superClass: (s) => /sensory/.test(s) && s !== "ol_sensory", nt: "" },
    nt: "ACH",
  },
  {
    reason:
      "The head's mechanosensory neurons, its bristles' (BM) and Johnston's organ's (JO), are cholinergic like the rest of their types: the dataset's own type-level transmitter for them is acetylcholine. Eleven are predicted a monoamine one by one, at low confidence (51-73%, against a median of 95% for the bristles predicted cholinergic), and so were muted: seven bristle neurons, five of them on the right, which were the right side's whole route from the head's bristles to grooming, and four of the right antenna's zone E.",
    select: { superClass: "cb_sensory", type: /^(BM|JO-)/, nt: MONOAMINES },
    nt: "ACH",
  },
  {
    reason:
      "Antennal lobe local neurons are overwhelmingly GABAergic (Chou et al. 2010). The prediction makes 75 lateral LNs (lLN1, lLN2T, lLN2X and others) cholinergic; wired densely to each other, they then lock the antennal lobe into saturated firing after any olfactory input. The least certain fix.",
    select: { type: /^lLN/, nt: "ACH" },
    nt: "GABA",
  },
  {
    reason:
      "The octopaminergic neurons named for it (Busch et al. 2009's clusters, as FlyEM names them, OA-VL1 and OA-VL2 among them as DNd02 and DNd03) are octopaminergic; the prediction makes some glutamatergic, serotonergic or blank.",
    select: { type: OCTOPAMINERGIC },
    nt: "OCT",
  },
  {
    reason:
      "The wake-promoting PPL1 neurons of the dorsal fan-shaped body (Liu et al. 2012; Ueno et al. 2012), FB5H, FB6H and FB7B in the hemibrain's types (Hulse et al. 2021), are dopaminergic; the prediction is blank.",
    select: { type: DFB_DOPAMINERGIC },
    nt: "DA",
  },
];

// Johnston's organ's neurons are grouped by the zone of the antennal mechanosensory
// and motor centre their axons end in (Kamikouchi et al. 2006, 2009; zone F,
// Hampel et al. 2020); the dataset's types are named for them. Zones C and E
// sense the antenna's sustained deflection, and they and F drive antennal
// grooming (Kamikouchi et al. 2009; Yorozu et al. 2009; Hampel et al. 2015,
// 2020). C and E are what `bump` drives, and with F most of what `wind` does.
// On each side each zone's neurons send their synapses to the same partner
// types in much the same proportions (by synapse counts partner type by partner type, the cosine
// similarity of a zone's left and right halves is 0.75 for C, 0.95 for E and
// 0.78 for F, against at most 0.39 between different zones), but the right
// antenna's C and E neurons have 7.9 and 2.5 times fewer output synapses than
// the left's, and the left's F 1.2 times fewer than the right's: one side was
// traced less completely. Zones A and B (sound) are left as they are: their right
// halves are mostly fragments of 18 synapses a neuron (26 and 31 times fewer
// than the left's), which no factor could stand for, and only a few of them are
// driven at all (by wind). Zone D has no right half. The README (Johnston's
// organ, completeness) gives the evidence zone by zone.
const jo = (zone: string): CompletenessFix => ({
  reason: `Johnston's organ zone ${zone}: the same partners on both sides, but one side traced less completely`,
  select: { superClass: "cb_sensory", type: new RegExp(`^JO-${zone}`) },
});

export const COMPLETENESS_FIXES: readonly CompletenessFix[] = [jo("C"), jo("E"), jo("F")];

export const OPERATING_POINT: OperatingPoint = {
  // Shiu et al. 2024's w_syn, for both signs.
  excitatory: 0.275,
  inhibitory: 0.275,
  // Muted: their effects are slow and modulatory, not fast synaptic.
  modulatory: 0,
  unknown: 0,
  // A spike of the main columnar relay, L2 to Tm1 and Tm2 (124 and 130
  // synapses, 61 and 62 after saturation), brings its target from rest to
  // threshold: 7 mV / (0.177 × 0.275 mV × 61.5), where 0.177 is the peak of
  // the membrane's response to a unit step of drive at these time constants.
  graded: 2.3,
  saturation: 75,
  fixes: TRANSMITTER_FIXES,
  completeness: COMPLETENESS_FIXES,
  neuron: {
    // Shiu et al. 2024: rest -52 mV, threshold -45 mV, tauMem 20 ms, tauSyn 5 ms,
    // refractory 2.2 ms, delay 1.8 ms, and a spike resets g as well as v. They
    // stepped at 0.1 ms; at 1 ms the refractory period and delay round to 2 ms.
    dt: 1,
    tauMem: 20,
    tauSyn: 5,
    threshold: 7,
    refractory: 2.2,
    delay: 1.8,
    resetDrive: true,
    // Not in Shiu et al.: weak, slow adaptation, which stops self-sustaining loops.
    adaptation: { increment: 0.1, tau: 1000 },
    epsilon: 0.01,
  },
};

/**
 * The optic lobe's columnar classes (Fischbach and Dittrich 1989): lamina
 * monopolar (L), centrifugal (C), T, transmedullary (Tm, TmY), Y and medulla
 * intrinsic (Mi) neurons.
 */
const COLUMNAR_CLASSES = /^(L[1-5]|C[23]|T[1-5][a-d]?|Tm\d+[a-zA-Z]*|TmY\d+[a-z]*|Y\d+|Mi\d+)$/;
/** Fewer cells of a type on a side than this, and each cell pools many columns: not a column's relay. */
export const COLUMNAR_MIN_CELLS = 100;

/**
 * Optic lobe intrinsic neurons of a columnar type: one of the columnar classes
 * with at least COLUMNAR_MIN_CELLS cells on its side, one for every few of
 * the eye's ~890 columns. They are the column-by-column relays from the
 * lamina to the lobula and lobula plate. Left out: the amacrine and other
 * multicolumnar cells (Dm, Pm, Cm, Lawf and others), which pool many columns
 * into one point neuron and so are driven hard enough already, and for the
 * same reason the columnar classes' rarer types, such as Mi18 (36 a side).
 */
export function columnar(connectome: Connectome): Uint8Array {
  const candidates = connectome.find({ superClass: "ol_intrinsic", type: COLUMNAR_CLASSES });
  // Counted by type and side, each by the first code with its name, so a table that repeats a name counts it as one.
  const { type, side } = connectome.columns;
  const named = (table: readonly string[]) => {
    const first = new Map<string, number>();
    return Uint32Array.from(table, (name, k) => first.get(name) ?? (first.set(name, k), k));
  };
  const types = named(type.table);
  const sides = named(side.table);
  const key = (i: number) => types[type.codes[i]] * side.table.length + sides[side.codes[i]];
  const counts = new Uint32Array(type.table.length * side.table.length);
  for (const i of candidates) counts[key(i)]++;
  const out = new Uint8Array(connectome.neurons);
  for (const i of candidates) if (counts[key(i)] >= COLUMNAR_MIN_CELLS) out[i] = 1;
  return out;
}

/** Each neuron's transmitter after the fixes, and how many neurons each fix changed. */
export function transmitters(connectome: Connectome, fixes: readonly TransmitterFix[]): { nt: string[]; changed: number[] } {
  const { codes, table } = connectome.columns.nt;
  const out = Array.from(codes, (code) => table[code]);
  // Each neuron meets the fixes in order, whichever way round the loops go.
  const changed = fixes.map((fix) => {
    let count = 0;
    for (const i of connectome.find(fix.select)) {
      if (out[i] === fix.nt) continue;
      out[i] = fix.nt;
      count++;
    }
    return count;
  });
  return { nt: out, changed };
}

/** mV per synapse for a transmitter at this operating point. */
export function transmitterGain(point: OperatingPoint, transmitter: string): number {
  switch (transmitter) {
    case "ACH":
      return point.excitatory;
    case "GABA":
    case "GLUT":
    case "HIST":
      return -point.inhibitory;
    case "DA":
    case "SER":
    case "OCT":
      return point.modulatory;
    default:
      return point.unknown;
  }
}

/** Synapse counts after saturation (the input itself when saturation is off). */
export function saturatedCounts(count: Uint16Array, saturation: number): Uint16Array {
  if (!(saturation > 0)) return count;
  const lookup = new Uint16Array(65536);
  for (let n = 0; n < 65536; n++) lookup[n] = Math.round(saturation * -Math.expm1(-n / saturation));
  const out = new Uint16Array(count.length);
  for (let e = 0; e < count.length; e++) out[e] = lookup[count[e]];
  return out;
}

/**
 * The factor on each neuron's gain from the completeness fixes (1 for most):
 * for each group, the side with fewer output synapses gets the ratio of the
 * other side's to its own, so that the two sides' synapses carry the same
 * total. Derived from the wiring, not fitted. Synaptic saturation is left as it
 * is: scaling the weaker side's saturated connections this way brings their
 * total within 3% of the stronger side's (for every zone of Johnston's organ),
 * where adding the missing synapses to each connection before saturating would
 * fall short by up to 35%.
 */
export function completenessFactors(connectome: Connectome, fixes: readonly CompletenessFix[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const fix of fixes) {
    const left = connectome.find({ ...fix.select, side: "left" });
    const right = connectome.find({ ...fix.select, side: "right" });
    const synapses = (neurons: Uint32Array) => {
      let total = 0;
      for (const i of neurons) for (let e = connectome.ptr[i]; e < connectome.ptr[i + 1]; e++) total += connectome.count[e];
      return total;
    };
    const l = synapses(left);
    const r = synapses(right);
    if (l === 0 || r === 0 || l === r) continue;
    const [weaker, factor] = l < r ? [left, r / l] : [right, l / r];
    for (const i of weaker) out.set(i, factor);
  }
  return out;
}

export type Weights = {
  /** Simulation's `gain`: mV per synapse of each presynaptic neuron. */
  gain: Float32Array;
  /** The wiring with saturated synapse counts, for Simulation. */
  network: { ptr: Uint32Array; post: Uint32Array; count: Uint16Array };
  /** Each neuron's transmitter after the fixes, and how many neurons each fix changed. */
  nt: string[];
  changed: number[];
};

/** The Simulation's wiring and gains at this operating point. */
export function buildWeights(connectome: Connectome, point: OperatingPoint = OPERATING_POINT): Weights {
  const { nt, changed } = transmitters(connectome, point.fixes);
  const gain = new Float32Array(nt.length);
  for (let i = 0; i < nt.length; i++) gain[i] = transmitterGain(point, nt[i]);
  if (point.graded !== 1) {
    const graded = columnar(connectome);
    for (let i = 0; i < connectome.neurons; i++) if (graded[i]) gain[i] *= point.graded;
  }
  for (const [i, factor] of completenessFactors(connectome, point.completeness)) gain[i] *= factor;
  const network = { ptr: connectome.ptr, post: connectome.post, count: saturatedCounts(connectome.count, point.saturation) };
  return { gain, network, nt, changed };
}
