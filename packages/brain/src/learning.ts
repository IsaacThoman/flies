// Learning in the mushroom body: dopamine-gated plasticity of the Kenyon cell
// to mushroom body output neuron (KC -> MBON) synapses, compartment by
// compartment (README, Learning). No Node APIs; it runs in the browser
// game's Web Worker.
//
// The mushroom body's lobes are a row of compartments. In each, the axons of
// the Kenyon cells that pass through it synapse onto the dendrites of that
// compartment's MBONs, and its dopaminergic neurons (DANs) release dopamine
// onto both (Aso et al. 2014a, eLife 3:e04577; Li et al. 2020, eLife
// 9:e62576). Dopamine acts only in its own compartment (Hige et al. 2015,
// Neuron 88:985; Cohn et al. 2015, Cell 163:1742). A KC's synapses onto a
// compartment's MBONs are depressed when the KC was active shortly before or
// as that compartment's DANs fire, and potentiated back when the DANs fired
// shortly before the KC (Handler et al. 2019, Cell 178:60).
//
// What the DANs carry here is their spikes: their fast output is muted
// (params.ts), but they fire. Each compartment's dopamine is a trace of its
// DANs' spikes, and each KC's eligibility a trace of its own; the rule reads
// nothing else, so either could later come from a slower model of dopamine.

import type { Connectome } from "./format.ts";
import type { Simulation } from "./sim.ts";

/** The compartments of one hemisphere's mushroom body lobes, by lobe (Aso et al. 2014a; the peduncle's, `ped`, is the α/β lobe's). */
export const COMPARTMENTS = [
  { id: "g1", lobe: "g" },
  { id: "g2", lobe: "g" },
  { id: "g3", lobe: "g" },
  { id: "g4", lobe: "g" },
  { id: "g5", lobe: "g" },
  { id: "ped", lobe: "ab" },
  { id: "a1", lobe: "ab" },
  { id: "a2", lobe: "ab" },
  { id: "a3", lobe: "ab" },
  { id: "b1", lobe: "ab" },
  { id: "b2", lobe: "ab" },
  { id: "ap1", lobe: "apbp" },
  { id: "ap2", lobe: "apbp" },
  { id: "ap3", lobe: "apbp" },
  { id: "bp1", lobe: "apbp" },
  { id: "bp2a", lobe: "apbp" },
  { id: "bp2m", lobe: "apbp" },
  { id: "bp2p", lobe: "apbp" },
] as const;
export type Compartment = (typeof COMPARTMENTS)[number]["id"];
export type Lobe = (typeof COMPARTMENTS)[number]["lobe"];

/** The lobe a Kenyon cell type's axon runs in: γ, α/β or α'/β' (the dataset's KCg*, KCab*, KCapbp*). Untyped "KC"s have none. */
export function kcLobe(type: string): Lobe | null {
  if (type.startsWith("KCg")) return "g";
  if (type.startsWith("KCab")) return "ab";
  if (type.startsWith("KCapbp")) return "apbp";
  return null;
}

/**
 * Where each DAN type releases dopamine (Aso et al. 2014a; the types as Li et
 * al. 2020 named them in the hemibrain, which the male CNS keeps). Checked
 * against this wiring: each type's synapses onto MBONs go to the MBONs of
 * these compartments (README, Learning). PPL107 and PPL108, whose
 * compartments aren't described and which synapse onto no Kenyon cell here,
 * are left out.
 */
export const DAN_COMPARTMENTS: Readonly<Record<string, readonly Compartment[]>> = {
  PAM01: ["g5"],
  PAM02: ["bp2a"],
  PAM03: ["b2", "bp2a"],
  PAM04: ["b2"],
  PAM05: ["bp2p"],
  PAM06: ["bp2m"],
  PAM07: ["g4"],
  PAM08: ["g4"],
  PAM09: ["b1", "ped"],
  PAM10: ["b1"],
  PAM11: ["a1"],
  PAM12: ["g3"],
  PAM13: ["bp1"],
  PAM14: ["bp1"],
  PAM15: ["g5", "bp2a"],
  PPL101: ["g1", "ped"],
  PPL102: ["g1"],
  PPL103: ["g2", "ap1"],
  PPL104: ["ap3"],
  PPL105: ["ap2", "a2"],
  PPL106: ["a3"],
};

/**
 * Where each MBON type's dendrites are (Aso et al. 2014a; Li et al. 2020; the
 * "-like" types by the DANs that synapse onto them here). MBON22's are in the
 * calyx, outside the lobes, so its inputs don't learn.
 */
export const MBON_COMPARTMENTS: Readonly<Record<string, readonly Compartment[]>> = {
  MBON01: ["g5", "bp2a"],
  MBON02: ["b2", "bp2a"],
  MBON03: ["bp2m", "bp2p"],
  MBON04: ["bp2m", "bp2p"],
  MBON05: ["g4"],
  MBON06: ["b1"],
  MBON07: ["a1"],
  MBON09: ["g3", "bp1"],
  MBON10: ["bp1"],
  MBON11: ["g1", "ped"],
  MBON12: ["g2", "ap1"],
  MBON13: ["ap2"],
  MBON14: ["a3"],
  MBON15: ["ap1"],
  "MBON15-like": ["ap1"],
  MBON16: ["ap3"],
  MBON17: ["ap3"],
  "MBON17-like": ["ap3"],
  MBON18: ["a2"],
  MBON19: ["a2", "a3"],
  MBON20: ["g1", "g2"],
  MBON21: ["g4", "g5"],
  MBON23: ["a2"],
  MBON24: ["b2", "g5"],
  MBON25: ["g1", "g2"],
  "MBON25-like": ["g1", "g2"],
  MBON26: ["bp2a", "bp2m", "bp2p"],
  MBON27: ["g5"],
  MBON28: ["ap3"],
  MBON29: ["g4", "g5"],
  MBON30: ["g1", "g2", "g3"],
  MBON31: ["ap1"],
  MBON32: ["g2"],
  MBON33: ["g2", "g3"],
  MBON34: ["g2"],
  MBON35: ["g2"],
};

export type LearningParameters = {
  /**
   * Time constant, ms, of a KC's eligibility after it fires and of a
   * compartment's dopamine after its DANs fire. Handler et al. (2019, Figure
   * 2D) found plasticity at intervals of up to about a second either way and
   * little at 6 s: 2000 puts 6 s at e^-3, 5%.
   */
  tau: number;
  /** Beyond this many ms a trace counts as 0 (7 tau: under 0.1%). */
  window: number;
  /**
   * Depression per spike of a compartment's DANs (averaged over them) of the
   * synapses of a KC that has just fired: each falls by this fraction times
   * the KC's eligibility. Hige et al. (2015, Figure 1F; Figure S6F-I) saw a
   * KC -> MBON-γ1pedc synapse fall to 20% of its strength after one 1-s odour
   * paired with a single brief burst of PPL1-γ1pedc: at 0.3, five spikes take
   * it to 17%.
   */
  depression: number;
  /**
   * Potentiation, back toward the synapse's strength in the wiring, per spike
   * of a KC, times its compartment's dopamine trace (in spikes per DAN): a
   * backward pairing undoing a forward one (Handler et al. 2019, Figure
   * S3A). Smaller than the depression so that, when the two come together,
   * depression wins, as Handler et al. found with the DANs and KCs
   * stimulated at once. Chosen, not measured: at 0.1, a KC firing five times
   * in the second after its compartment's DANs fired five times each
   * restores about four fifths of what was lost.
   */
  potentiation: number;
};

export const LEARNING: LearningParameters = { tau: 2000, window: 14000, depression: 0.3, potentiation: 0.1 };

const HEMISPHERES = ["left", "right"] as const;

/**
 * What a mushroom body has learned, as bytes to keep (MushroomBody.memory),
 * little-endian: "FLYM"; the format's version (u32); the layout hash of the
 * brain that wrote it (u32, `layoutHash`); how many learning synapses it has
 * (u32); how the factors follow (u32): 0, sparse, or 1, dense; and how many
 * entries (u32). Each factor is kept to a 255th, a byte (round(factor × 255)).
 * Sparse: for each synapse whose byte isn't 255, ascending, its index (u32)
 * and its byte, 5 bytes. Dense: every synapse's byte, in order. The writer
 * takes whichever is shorter, so a memory is never more than a byte a
 * synapse and the header. A brain refuses a memory of another layout:
 * another connectome, or other compartment tables.
 */
export const MEMORY = { magic: 0x4d594c46, version: 1, header: 24, entry: 5, steps: 255 } as const;

/** FNV-1a's offset basis: the layout hash of a brain with no learning synapses. */
export const EMPTY_LAYOUT_HASH = 2166136261;
const FNV_BASIS = EMPTY_LAYOUT_HASH;
const fnv = (h: number, word: number) => Math.imul(h ^ word, 16777619) >>> 0;

/** A factor kept to a 255th. */
const quantum = (factor: number) => Math.round(factor * MEMORY.steps);

/** The memory of a brain with no learning synapses (it has learned nothing, and can take only another such). */
export function emptyMemory(): Uint8Array {
  return writeMemory(FNV_BASIS, 0, new Float64Array(0));
}

function writeMemory(hash: number, count: number, factors: Float64Array): Uint8Array {
  let changed = 0;
  for (let p = 0; p < factors.length; p++) if (quantum(factors[p]) !== MEMORY.steps) changed++;
  const dense = MEMORY.entry * changed > factors.length;
  const out = new Uint8Array(MEMORY.header + (dense ? factors.length : MEMORY.entry * changed));
  const view = new DataView(out.buffer);
  view.setUint32(0, MEMORY.magic, true);
  view.setUint32(4, MEMORY.version, true);
  view.setUint32(8, hash, true);
  view.setUint32(12, count, true);
  view.setUint32(16, dense ? 1 : 0, true);
  view.setUint32(20, dense ? factors.length : changed, true);
  let at = MEMORY.header;
  for (let p = 0; p < factors.length; p++) {
    const q = quantum(factors[p]);
    if (dense) {
      out[at++] = q;
    } else if (q !== MEMORY.steps) {
      view.setUint32(at, p, true);
      out[at + 4] = q;
      at += MEMORY.entry;
    }
  }
  return out;
}

/**
 * Reads a memory for a brain of this layout: the factor of every synapse it
 * changes, as [index, factor] pairs, or throws, saying why, if it isn't one
 * (the same messages as packages/brain-native's learning.cpp).
 */
export function readMemory(memory: Uint8Array, hash: number, count: number): { index: Uint32Array; factor: Float64Array } {
  const view = new DataView(memory.buffer, memory.byteOffset, memory.byteLength);
  if (memory.byteLength < MEMORY.header || view.getUint32(0, true) !== MEMORY.magic) throw new Error("This isn't a fly's memory");
  if (view.getUint32(4, true) !== MEMORY.version) throw new Error(`This memory is of version ${view.getUint32(4, true)}, not ${MEMORY.version}`);
  if (view.getUint32(8, true) !== hash || view.getUint32(12, true) !== count) throw new Error("This memory is another brain's");
  const kind = view.getUint32(16, true);
  const entries = view.getUint32(20, true);
  if (kind > 1) throw new Error("This memory is damaged: its kind is unknown");
  if (kind === 1 ? entries !== count || memory.byteLength !== MEMORY.header + count : memory.byteLength !== MEMORY.header + MEMORY.entry * entries) {
    throw new Error("This memory is damaged: its length is wrong");
  }
  const index = new Uint32Array(entries);
  const factor = new Float64Array(entries);
  for (let n = 0; n < entries; n++) {
    const at = MEMORY.header + (kind === 1 ? n : MEMORY.entry * n);
    index[n] = kind === 1 ? n : view.getUint32(at, true);
    const q = memory[kind === 1 ? at : at + 4];
    if (index[n] >= count || (n > 0 && index[n] <= index[n - 1])) throw new Error("This memory is damaged: its synapses are out of order");
    factor[n] = q / MEMORY.steps;
  }
  return { index, factor };
}

/** The learning connections and what they have learned: built the first time they're needed (MushroomBody). */
type Synapses = {
  edges: Uint32Array;
  edgeKC: Uint32Array;
  edgeGate: Uint32Array;
  gatePtr: Uint32Array;
  gateCompartments: Uint32Array;
  // Whether gate g has compartment c: gateHas[g * compartments + c].
  gateHas: Uint8Array;
  // KC -> its learning edges (indices into edges), as CSR.
  kcPtr: Uint32Array;
  layoutHash: number;
  factors: Float64Array;
  // Edges whose factor changed since the simulation was last told.
  dirty: Uint32Array;
  dirtyCount: number;
  isDirty: Uint8Array;
};

/**
 * The mushroom body's learning for one brain: which KC -> MBON edges learn,
 * the DANs that teach each compartment, and the traces and factors (state per
 * brain, starting from the wiring: every factor 1).
 *
 * Building the brain must stay quick (src/cost.budget.ts), so how the DANs
 * teach is worked out at the first DAN spike, and the learning connections
 * are found only when first needed: when a compartment's DANs fire with one
 * of its KCs still eligible, or for a memory. Until then no
 * factor can have left 1 (depression needs a KC to have fired first, and
 * potentiation gives back only what was lost), so the result is the same as
 * if they had been there from the start. In the game, where nothing fires the
 * KCs, they are found only for the fly's record.
 */
export class MushroomBody {
  readonly parameters: LearningParameters;
  /** Compartments of both hemispheres, left first: `${id} ${side}`. */
  readonly compartments: readonly string[];
  /** The Kenyon cells and DANs, as neuron indices. */
  readonly kcs: Uint32Array;
  readonly dans: Uint32Array;

  #connectome: Connectome;
  #lobeOf: Int8Array;
  #isMbon: Uint8Array;
  #hemisphereOf: Int8Array;
  #synapses: Synapses | null = null;
  // The simulation the learning edges' weights are set in, once they are.
  #sim: Simulation | null = null;
  // Each KC's and each compartment's lobe and hemisphere as one number: a KC can learn only in compartments with its own.
  #kcPlace: Uint8Array;
  #compartmentPlace: Uint8Array;
  // DAN -> the compartments it releases into and how much of their dopamine one of its spikes is, as CSR: found at the first DAN spike.
  #teaching: { danPtr: Uint32Array; danCompartment: Uint32Array; danAmount: Float64Array } | null = null;
  // Neuron -> its KC index k (k), its DAN index d (-2 - d), or -1.
  #role: Int32Array;
  // When each KC last fired, ms (-Infinity before it has).
  #fired: Float64Array;
  // KCs that fired within the window, in the order they first did since they were last out of it.
  #eligible: Uint32Array;
  #eligibleCount = 0;
  #isEligible: Uint8Array;
  // Each compartment's dopamine trace and when it was last brought up to date, ms.
  #dopamine: Float64Array;
  #dopamineAt: Float64Array;

  constructor(connectome: Connectome, parameters: LearningParameters = LEARNING) {
    if (!(parameters.tau > 0 && parameters.window > 0 && parameters.depression >= 0 && parameters.depression <= 1 && parameters.potentiation >= 0 && parameters.potentiation <= 1)) {
      throw new Error("Learning needs positive time constants and a depression and potentiation from 0 to 1");
    }
    this.parameters = parameters;
    this.#connectome = connectome;
    // Decided once per type and side, not per neuron or edge.
    const types = connectome.columns.type;
    const sides = connectome.columns.side;
    this.#lobeOf = Int8Array.from(types.table, (t) => {
      const lobe = kcLobe(t);
      return lobe === null ? -1 : LOBES.indexOf(lobe);
    });
    const isDan = Uint8Array.from(types.table, (t) => (Object.hasOwn(DAN_COMPARTMENTS, t) ? 1 : 0));
    // An MBON type's compartments are needed for a DAN's share and to find the learning connections.
    this.#isMbon = Uint8Array.from(types.table, (t) => (Object.hasOwn(MBON_COMPARTMENTS, t) ? 1 : 0));
    this.#hemisphereOf = Int8Array.from(sides.table, (h) => HEMISPHERES.indexOf(h as "left" | "right"));
    const lobeOf = this.#lobeOf;
    const hemisphere = (i: number) => this.#hemisphereOf[sides.codes[i]];
    const per = COMPARTMENTS.length;
    this.compartments = HEMISPHERES.flatMap((h) => COMPARTMENTS.map((c) => `${c.id} ${h}`));

    const kcs: number[] = [];
    const dans: number[] = [];
    for (let i = 0; i < connectome.neurons; i++) {
      const code = types.codes[i];
      if (lobeOf[code] >= 0 && hemisphere(i) >= 0) kcs.push(i);
      else if (isDan[code]) dans.push(i);
    }
    this.kcs = Uint32Array.from(kcs);
    this.dans = Uint32Array.from(dans);
    this.#role = new Int32Array(connectome.neurons).fill(-1);
    kcs.forEach((i, k) => (this.#role[i] = k));
    dans.forEach((i, d) => (this.#role[i] = -2 - d));
    this.#kcPlace = Uint8Array.from(kcs, (i) => hemisphere(i) * LOBES.length + lobeOf[types.codes[i]]);
    this.#compartmentPlace = Uint8Array.from(this.compartments, (_, c) => Math.floor(c / per) * LOBES.length + LOBES.indexOf(COMPARTMENTS[c % per].lobe));

    this.#fired = new Float64Array(kcs.length).fill(-Infinity);
    this.#eligible = new Uint32Array(kcs.length);
    this.#isEligible = new Uint8Array(kcs.length);
    this.#dopamine = new Float64Array(this.compartments.length);
    this.#dopamineAt = new Float64Array(this.compartments.length).fill(-Infinity);
  }

  /** Each learning edge: its index in the connectome, its KC (an index into kcs) and its gate (an index into gates). */
  get edges() {
    return this.#found().edges;
  }
  get edgeKC() {
    return this.#found().edgeKC;
  }
  get edgeGate() {
    return this.#found().edgeGate;
  }
  /** Each gate's compartments (a set of compartments of one hemisphere that an edge's synapses are in), as CSR. */
  get gatePtr() {
    return this.#found().gatePtr;
  }
  get gateCompartments() {
    return this.#found().gateCompartments;
  }
  /** Each learning edge's factor on its weight in the wiring, 0 to 1. */
  get factors() {
    return this.#found().factors;
  }
  /**
   * FNV-1a over each learning edge's presynaptic and postsynaptic root IDs
   * and its compartments, in order: the same for the same connectome and
   * compartment tables, so a memory is taken only by a brain it fits.
   */
  get layoutHash() {
    return this.#found().layoutHash;
  }

  /** The neurons whose spikes it needs: the KCs, then the DANs. */
  get watched(): Uint32Array {
    const out = new Uint32Array(this.kcs.length + this.dans.length);
    out.set(this.kcs);
    out.set(this.dans, this.kcs.length);
    return out;
  }

  /** Compartment c's dopamine at time t (ms, not before it was last updated), in spikes per DAN. */
  dopamine(c: number, t: number): number {
    const since = t - this.#dopamineAt[c];
    if (since > this.parameters.window) return 0;
    return this.#dopamine[c] * Math.exp(-since / this.parameters.tau);
  }

  /** KC k's eligibility at time t (ms, not before it last fired): 1 as it fires, then decaying. */
  eligibility(k: number, t: number): number {
    const since = t - this.#fired[k];
    if (since > this.parameters.window) return 0;
    return Math.exp(-since / this.parameters.tau);
  }

  /**
   * Learns from the spikes the simulation logged since the last call, in the
   * order fired, then sets the changed edges' weights in it; `now` is the
   * simulation's time, ms. Without a KC or DAN spike it costs next to nothing.
   */
  learn(sim: Simulation, now: number) {
    const { count, neurons, steps } = sim.drainSpikeLog();
    const dt = sim.dt;
    const { depression, potentiation } = this.parameters;
    const span = this.compartments.length;
    for (let q = 0; q < count; q++) {
      const i = neurons[q];
      const t = steps[q] * dt;
      const role = this.#role[i];
      if (role <= -2) {
        const d = -2 - role;
        const { danPtr, danCompartment, danAmount } = this.#taught();
        for (let m = danPtr[d]; m < danPtr[d + 1]; m++) {
          const c = danCompartment[m];
          const amount = danAmount[m];
          this.#dopamine[c] = this.dopamine(c, t) + amount;
          this.#dopamineAt[c] = t;
          if (this.#eligibleCount === 0) continue;
          // Forward: the KCs that fired before this release lose some of their synapses' strength in this compartment.
          const s = this.#found(sim);
          const place = this.#compartmentPlace[c];
          for (let n = 0; n < this.#eligibleCount; n++) {
            const k = this.#eligible[n];
            if (this.#kcPlace[k] !== place) continue;
            const e = this.eligibility(k, t);
            if (e === 0) continue;
            for (let p = s.kcPtr[k]; p < s.kcPtr[k + 1]; p++) {
              const g = s.edgeGate[p];
              if (s.gateHas[g * span + c] === 0) continue;
              const size = s.gatePtr[g + 1] - s.gatePtr[g];
              s.factors[p] = s.factors[p] * (1 - (depression * amount * e) / size);
              mark(s, p);
            }
          }
        }
        continue;
      }
      if (role < 0) continue;
      const k = role;
      // Backward: dopamine released before this spike gives back some of what its synapses lost (none, before they are found).
      const s = this.#synapses;
      if (s) {
        for (let p = s.kcPtr[k]; p < s.kcPtr[k + 1]; p++) {
          if (s.factors[p] === 1) continue;
          const g = s.edgeGate[p];
          let dopamine = 0;
          for (let m = s.gatePtr[g]; m < s.gatePtr[g + 1]; m++) dopamine += this.dopamine(s.gateCompartments[m], t);
          if (dopamine === 0) continue;
          const size = s.gatePtr[g + 1] - s.gatePtr[g];
          // At most all the way back: a long run of the DANs' spikes doesn't overshoot.
          s.factors[p] = s.factors[p] + Math.min(1, (potentiation * dopamine) / size) * (1 - s.factors[p]);
          mark(s, p);
        }
      }
      this.#fired[k] = t;
      if (this.#isEligible[k] === 0) {
        this.#isEligible[k] = 1;
        this.#eligible[this.#eligibleCount++] = k;
      }
    }
    // KCs out of the window leave the eligible list, the rest keeping their order.
    let kept = 0;
    for (let n = 0; n < this.#eligibleCount; n++) {
      const k = this.#eligible[n];
      if (now - this.#fired[k] > this.parameters.window) this.#isEligible[k] = 0;
      else this.#eligible[kept++] = k;
    }
    this.#eligibleCount = kept;
    const s = this.#synapses;
    if (!s) return;
    for (let n = 0; n < s.dirtyCount; n++) {
      const p = s.dirty[n];
      s.isDirty[p] = 0;
      sim.setPlasticFactor(p, s.factors[p]);
    }
    s.dirtyCount = 0;
  }

  /** What it has learned, as bytes to keep (MEMORY). */
  memory(): Uint8Array {
    const s = this.#found();
    return writeMemory(s.layoutHash, s.edges.length, s.factors);
  }

  /**
   * Takes back what `memory` gave, from this brain or another of the same
   * layout, and sets the simulation's weights to it; throws, changing
   * nothing, if it isn't such a memory. Synapses it doesn't list are at 1.
   * The traces of what just fired are left as they are.
   */
  remember(memory: Uint8Array, sim: Simulation) {
    const s = this.#found(sim);
    const { index, factor } = readMemory(memory, s.layoutHash, s.edges.length);
    for (let p = 0; p < s.factors.length; p++) {
      if (s.factors[p] === 1) continue;
      s.factors[p] = 1;
      sim.setPlasticFactor(p, 1);
    }
    for (let n = 0; n < index.length; n++) {
      s.factors[index[n]] = factor[n];
      sim.setPlasticFactor(index[n], factor[n]);
    }
  }

  /** How each DAN teaches its compartments, found now if it hasn't been. */
  #taught() {
    if (this.#teaching) return this.#teaching;
    const connectome = this.#connectome;
    const types = connectome.columns.type;
    const lobeOf = this.#lobeOf;
    const isMbon = this.#isMbon;
    const hemisphere = (i: number) => this.#hemisphereOf[connectome.columns.side.codes[i]];
    const per = COMPARTMENTS.length;
    // Each DAN releases into its compartments in the hemispheres it reaches,
    // in proportion to its synapses onto that hemisphere's KCs and MBONs (its
    // own side if it has none). One of its spikes is its share of its
    // compartment's DANs, so a compartment's dopamine counts spikes per DAN.
    const share: number[][] = Array.from(this.dans, (i) => {
      const synapses = [0, 0];
      for (let e = connectome.ptr[i]; e < connectome.ptr[i + 1]; e++) {
        const j = connectome.post[e];
        const t = types.codes[j];
        const h = hemisphere(j);
        if (h >= 0 && (lobeOf[t] >= 0 || isMbon[t])) synapses[h] += connectome.count[e];
      }
      const total = synapses[0] + synapses[1];
      if (total > 0) return synapses.map((s) => s / total);
      const own = hemisphere(i);
      return own >= 0 ? HEMISPHERES.map((_, h) => (h === own ? 1 : 0)) : [0.5, 0.5];
    });
    const supply = new Float64Array(this.compartments.length);
    this.dans.forEach((i, d) => {
      for (const c of DAN_COMPARTMENTS[types.table[types.codes[i]]]) for (let h = 0; h < 2; h++) supply[h * per + COMPARTMENT_INDEX.get(c)!] += share[d][h];
    });
    const danPtr = new Uint32Array(this.dans.length + 1);
    const danCompartment: number[] = [];
    const danAmount: number[] = [];
    this.dans.forEach((i, d) => {
      for (let h = 0; h < 2; h++) {
        if (share[d][h] === 0) continue;
        for (const c of DAN_COMPARTMENTS[types.table[types.codes[i]]]) {
          const at = h * per + COMPARTMENT_INDEX.get(c)!;
          danCompartment.push(at);
          danAmount.push(share[d][h] / supply[at]);
        }
      }
      danPtr[d + 1] = danCompartment.length;
    });
    return (this.#teaching = { danPtr, danCompartment: Uint32Array.from(danCompartment), danAmount: Float64Array.from(danAmount) });
  }

  /** The learning connections, found now if they haven't been; given the simulation, their weights are made settable there. */
  #found(sim?: Simulation): Synapses {
    const s = (this.#synapses ??= this.#find());
    if (sim && this.#sim !== sim) {
      sim.setPlasticEdges(s.edges);
      this.#sim = sim;
    }
    return s;
  }

  #find(): Synapses {
    const connectome = this.#connectome;
    const types = connectome.columns.type;
    const per = COMPARTMENTS.length;
    // A KC's synapses onto an MBON learn in the compartments that the MBON's
    // dendrites and the KC's lobe share, in the KC's hemisphere (its axon's).
    // Gates are numbered in the order their compartments are first met.
    const gates = new Map<string, number>();
    const gateLists: number[][] = [];
    // The gate for an MBON type and a KC's lobe and hemisphere (-1 for none), worked out the first time they meet.
    const gateFor = new Map<number, number>();
    const gateOf = (code: number, lobe: number, hemi: number) => {
      const key = (code * LOBES.length + lobe) * 2 + hemi;
      let gate = gateFor.get(key);
      if (gate === undefined) {
        const list = MBON_COMPARTMENTS[types.table[code]].filter((c) => COMPARTMENTS[COMPARTMENT_INDEX.get(c)!].lobe === LOBES[lobe]).map((c) => hemi * per + COMPARTMENT_INDEX.get(c)!);
        gate = -1;
        if (list.length > 0) {
          const joined = list.join(",");
          if (!gates.has(joined)) {
            gates.set(joined, gateLists.length);
            gateLists.push(list);
          }
          gate = gates.get(joined)!;
        }
        gateFor.set(key, gate);
      }
      return gate;
    };
    const edges: number[] = [];
    const edgeKC: number[] = [];
    const edgeGate: number[] = [];
    const kcPtr = new Uint32Array(this.kcs.length + 1);
    let hash = FNV_BASIS;
    this.kcs.forEach((i, k) => {
      const lobe = this.#lobeOf[types.codes[i]];
      const hemi = this.#hemisphereOf[connectome.columns.side.codes[i]];
      for (let e = connectome.ptr[i]; e < connectome.ptr[i + 1]; e++) {
        const code = types.codes[connectome.post[e]];
        if (!this.#isMbon[code]) continue;
        const gate = gateOf(code, lobe, hemi);
        if (gate < 0) continue;
        edges.push(e);
        edgeKC.push(k);
        edgeGate.push(gate);
        hash = fnv(hash, connectome.rootId[i]);
        hash = fnv(hash, connectome.rootId[connectome.post[e]]);
        for (const c of gateLists[gate]) hash = fnv(hash, c);
      }
      kcPtr[k + 1] = edges.length;
    });
    const gatePtr = new Uint32Array(gateLists.length + 1);
    gateLists.forEach((list, g) => (gatePtr[g + 1] = gatePtr[g] + list.length));
    const gateHas = new Uint8Array(gateLists.length * this.compartments.length);
    gateLists.forEach((list, g) => list.forEach((c) => (gateHas[g * this.compartments.length + c] = 1)));
    return {
      edges: Uint32Array.from(edges),
      edgeKC: Uint32Array.from(edgeKC),
      edgeGate: Uint32Array.from(edgeGate),
      gatePtr,
      gateCompartments: Uint32Array.from(gateLists.flat()),
      gateHas,
      kcPtr,
      layoutHash: hash,
      factors: new Float64Array(edges.length).fill(1),
      dirty: new Uint32Array(edges.length),
      dirtyCount: 0,
      isDirty: new Uint8Array(edges.length),
    };
  }
}

const LOBES: readonly Lobe[] = ["g", "ab", "apbp"];
const COMPARTMENT_INDEX = new Map<string, number>(COMPARTMENTS.map((c, k) => [c.id, k]));

function mark(s: Synapses, p: number) {
  if (s.isDirty[p] !== 0) return;
  s.isDirty[p] = 1;
  s.dirty[s.dirtyCount++] = p;
}
