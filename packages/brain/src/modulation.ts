// Slow neuromodulation. Dopamine, octopamine and serotonin don't work as fast
// synapses, which is why params.ts mutes them: they act through receptors
// coupled to G proteins, over seconds to minutes, changing how excitable the
// cells that carry the receptors are and how much those cells release. Here
// each modulatory neuron's spikes feed a level, its firing rate smoothed over
// MODULATION.tau, and each receptor in RECEPTORS turns the levels its carriers
// are exposed to into a change of their release or their excitability, with
// its own sign, strength and speed.
//
// A receptor's carriers get their transmitter through the synapses its
// modulatory neurons make onto them (a carrier is exposed to those neurons'
// levels, weighted by its synapses from each), or, where the data doesn't
// identify the neuron that releases it, from a stand-in source set by
// internal state (STAND_INS), labelled as such.
//
// Where nothing says which receptor a cell carries, it is left alone: no
// default. Each transmitter has receptors of both signs in the fly (dopamine's
// D1-like Dop1R1 and Dop1R2 raise cAMP and D2-like Dop2R lowers it; serotonin's
// 5-HT1A and 5-HT1B inhibit and 5-HT2 and 5-HT7 excite; octopamine's OAMB and
// Octβ receptors mostly excite and Octα2R inhibits), cells carry several, and
// which a cell type carries is known for few types. Any default would put an
// effect of a chosen sign on thousands of cells nothing has measured, and the
// predicted transmitter that makes a neuron a source is least certain for the
// types nobody has named.
//
// The levels are kept whatever reads them: the mushroom body's dopaminergic
// neurons have theirs, for example, though nothing here uses them yet.

import type { Connectome } from "./format.ts";
import { DFB_SLEEP, select, smooth } from "./io.ts";
import type { ScalarSense, Selection, StateKey } from "./io.ts";
import { DFB_DOPAMINERGIC } from "./params.ts";
import type { BrainSenses } from "./types.ts";

/** The modulatory transmitters, as params.ts's transmitter names them. */
export const MODULATORS = ["DA", "OCT", "SER"] as const;
export type Modulator = (typeof MODULATORS)[number];

export const MODULATION = {
  /**
   * Time constant, ms, of a modulatory neuron's level: its firing rate
   * smoothed. A round number, chosen: slow beside the fast synapses' 5 ms, as
   * transmitter released into the tissue and the second messengers its
   * receptors make are, and short beside the receptor effects measured here,
   * which have kinetics of their own (RECEPTORS).
   */
  tau: 1000,
} as const;

/**
 * A source of a transmitter the data doesn't identify, standing in for a
 * neuron the fly has: its rate, Hz, follows internal state linearly, from
 * `low` at 0 to `high` at 1.
 */
export type StandInSpec = {
  name: string;
  transmitter: Modulator;
  description: string;
  state: "hunger";
  low: number;
  high: number;
};

export const STAND_INS: readonly StandInSpec[] = [
  {
    name: "TH-VUM",
    transmitter: "DA",
    // Marella et al. 2012, Neuron 73: 941: TH-VUM, an unpaired dopaminergic neuron
    // of the gnathal ganglia whose activity makes a fly extend its proboscis
    // more readily, fires at about 1 Hz just after a meal and 25 Hz after 24
    // hours without food. Linear between, a round assumption. No neuron in the
    // data is it: FlyEM names none, and no dopaminergic neuron synapses onto
    // any head taste neuron (README, Hunger).
    description: "TH-VUM, the gnathal ganglia's dopaminergic VUM neuron, firing with hunger",
    state: "hunger",
    low: 1,
    high: 25,
  },
];

export type ReceptorSpec = {
  receptor: string;
  transmitter: Modulator;
  /** What it does, and the evidence. */
  description: string;
  /** Its carriers: a sense's neurons (so it follows whatever that sense drives), or a selection. */
  on: { sense: ScalarSense } | { select: Selection };
  /** The neurons it gets its transmitter from, through their synapses onto each carrier; or a stand-in source, reaching every carrier alike. */
  from: { select: Selection } | { standIn: string };
  /** The level, Hz, at which it is fully engaged; linear below that. */
  full: number;
  /** How fast its effect follows the level, ms, as it rises and as it falls; left out, at once. */
  kinetics?: { rise: number; fall: number };
  /**
   * Fully engaged, it scales its carrier's release by 1 + `release`, against
   * what the connectome's weights stand for, which is `wired` of the way
   * engaged; or it adds `excitability` mV to its carrier's drive.
   */
  effect: { release: number; wired: number } | { excitability: number };
};

export const RECEPTORS: readonly ReceptorSpec[] = [
  {
    receptor: "DopEcR",
    transmitter: "DA",
    // Inagaki et al. 2012, Cell 148: 583: starvation leaves the sugar neurons'
    // spiking as it was but raises the calcium that enters their terminals for
    // each spike, through dopamine on DopEcR (their Figures 6 and S5); a bath of
    // dopamine raises it 1.3 to 1.4 fold (Figure 6G), taken here as release, one
    // for one (release grows faster than calcium at most synapses, so if
    // anything that understates it). The connectome's weights stand for a
    // starved fly's, which is the fly the sweet neurons were chosen in (README,
    // Senses): engaged all the way. Dopamine's source onto them is TH-VUM,
    // which the data doesn't have, so a stand-in.
    description: "Dopamine on the sweet taste neurons' terminals raises their release",
    on: { sense: "sweet" },
    from: { standIn: "TH-VUM" },
    full: 25,
    effect: { release: 0.4, wired: 1 },
  },
  {
    receptor: "Dop1R2",
    transmitter: "DA",
    // Pimentel et al. 2016, Nature 536: 333: dopamine on Dop1R2 switches the
    // dorsal fan-shaped body's sleep-promoting neurons from excitable to
    // electrically silent (input resistance and time constant down to 53% and
    // 24%), through potassium conductances. 50 ms pulses at 10 Hz, or 20 Hz
    // stimulation of the dopaminergic neurons, sustained for 2 to 10 minutes,
    // switch them (full at 10 Hz; 5 minutes to rise, between the two); once
    // switched they stay silent without dopamine and recover in 7 to 60
    // minutes, 26 on average (the fall). The dopamine comes from the
    // wake-promoting PPL1 neurons of the dorsal fan-shaped body (Liu et al.
    // 2012, Curr Biol 22: 2114; Ueno et al. 2012, Nat Neurosci 15: 1516),
    // FB5H, FB6H and FB7B (Hulse et al. 2021). Fully engaged it takes away what
    // full sleep pressure gives them (io.ts, STATE_EXCITABILITY).
    description: "Dopamine on the dorsal fan-shaped body's sleep-promoting neurons silences them",
    on: { select: DFB_SLEEP },
    from: { select: { type: DFB_DOPAMINERGIC } },
    full: 10,
    kinetics: { rise: 5 * 60_000, fall: 26 * 60_000 },
    effect: { excitability: -7 },
  },
];

/** A receptor resolved against a connectome. */
type Route = {
  spec: ReceptorSpec;
  /** Its carriers, ascending; with a synaptic source, only those its sources synapse onto. */
  carriers: Uint32Array;
  /** With a synaptic source: each carrier's sources (indices into `sources`) and synapses from each, as CSR. */
  ptr: Uint32Array | null;
  from: Uint32Array | null;
  synapses: Float64Array | null;
  /** Each carrier's total synapses from its sources. */
  total: Float64Array | null;
  /** With a stand-in source, its index. */
  standIn: number;
  /** How far each carrier's receptor is engaged now, 0 to 1. */
  engaged: Float64Array;
  /** For a release receptor: each carrier's release factor now. */
  factors: Float64Array | null;
};

export type ModulationOptions = {
  /** Each neuron's transmitter after params.ts's fixes. */
  nt: readonly string[];
  /** The neurons each sense drives, for receptors carried by a sense's neurons. */
  senses: { sense: ScalarSense; neurons: Uint32Array }[];
  /** Internal state that sets excitability directly (io.ts, STATE_EXCITABILITY). */
  excitability: { state: StateKey; mV: number; neurons: Uint32Array }[];
  receptors?: readonly ReceptorSpec[];
  standIns?: readonly StandInSpec[];
};

/** Slow neuromodulation on one brain: the levels, the receptors and what they do now. */
export class Modulation {
  /** The modulatory neurons, ascending: every neuron whose transmitter (after params.ts's fixes) is dopamine, octopamine or serotonin. */
  readonly sources: Uint32Array;
  /** Each source's transmitter. */
  readonly transmitters: Modulator[];
  /** Each source's level, Hz: its firing rate smoothed over MODULATION.tau. */
  readonly level: Float64Array;
  /** Spikes of each source in the last chunk, for the simulation's tally to fill. */
  readonly counts: Uint32Array;
  readonly standIns: { spec: StandInSpec; level: number; target: number; started: boolean }[];
  readonly routes: Route[];
  /** Neurons whose excitability is set, ascending, and the drive each gets now, mV. */
  readonly excitable: Uint32Array;
  readonly bias: Float64Array;
  #sourceOf: Int32Array;
  #excitability: { state: StateKey; mV: number; at: Uint32Array; value: number }[];
  // For each excitability receptor, where each carrier sits in `excitable`.
  #excitableAt: (Uint32Array | null)[];

  constructor(connectome: Connectome, options: ModulationOptions) {
    const n = connectome.neurons;
    const isModulator = (t: string): t is Modulator => (MODULATORS as readonly string[]).includes(t);
    const sources: number[] = [];
    for (let i = 0; i < n; i++) if (isModulator(options.nt[i])) sources.push(i);
    this.sources = Uint32Array.from(sources);
    this.transmitters = sources.map((i) => options.nt[i] as Modulator);
    this.level = new Float64Array(sources.length);
    this.counts = new Uint32Array(sources.length);
    this.#sourceOf = new Int32Array(n).fill(-1);
    this.sources.forEach((i, k) => {
      this.#sourceOf[i] = k;
    });
    const standIns = options.standIns ?? STAND_INS;
    this.standIns = standIns.map((spec) => ({ spec, level: 0, target: 0, started: false }));
    this.routes = [];
    for (const spec of options.receptors ?? RECEPTORS) {
      const on = "sense" in spec.on ? options.senses.filter((s) => s.sense === (spec.on as { sense: ScalarSense }).sense).flatMap((s) => [...s.neurons]) : [...select(connectome, spec.on.select)];
      const wanted = [...new Set(on)].sort((a, b) => a - b);
      let route: Route;
      if ("standIn" in spec.from) {
        const name = spec.from.standIn;
        const standIn = standIns.findIndex((s) => s.name === name);
        if (standIn < 0) throw new Error(`No stand-in source called "${name}"`);
        route = { spec, carriers: Uint32Array.from(wanted), ptr: null, from: null, synapses: null, total: null, standIn, engaged: new Float64Array(wanted.length), factors: null };
      } else {
        // Its sources: the selection's neurons of its transmitter.
        const own = new Set([...select(connectome, spec.from.select)].filter((i) => options.nt[i] === spec.transmitter));
        const incoming = new Map<number, { from: number; synapses: number }[]>();
        const carrying = new Set(wanted);
        for (const i of own) {
          for (let e = connectome.ptr[i]; e < connectome.ptr[i + 1]; e++) {
            const j = connectome.post[e];
            if (!carrying.has(j)) continue;
            const list = incoming.get(j) ?? [];
            list.push({ from: this.#sourceOf[i], synapses: connectome.count[e] });
            incoming.set(j, list);
          }
        }
        const carriers = wanted.filter((j) => incoming.has(j));
        const ptr = new Uint32Array(carriers.length + 1);
        const from: number[] = [];
        const synapses: number[] = [];
        const total = new Float64Array(carriers.length);
        carriers.forEach((j, c) => {
          for (const each of incoming.get(j)!.sort((a, b) => a.from - b.from)) {
            from.push(each.from);
            synapses.push(each.synapses);
            total[c] += each.synapses;
          }
          ptr[c + 1] = from.length;
        });
        route = { spec, carriers: Uint32Array.from(carriers), ptr, from: Uint32Array.from(from), synapses: Float64Array.from(synapses), total, standIn: -1, engaged: new Float64Array(carriers.length), factors: null };
      }
      if ("release" in spec.effect) {
        // Engaged as the weights stand for until the first update says otherwise.
        route.engaged.fill(spec.effect.wired);
        route.factors = new Float64Array(route.carriers.length).fill(1);
      }
      this.routes.push(route);
    }
    const excitable = new Set<number>();
    for (const each of options.excitability) for (const i of each.neurons) excitable.add(i);
    for (const route of this.routes) if ("excitability" in route.spec.effect) for (const i of route.carriers) excitable.add(i);
    this.excitable = Uint32Array.from([...excitable].sort((a, b) => a - b));
    this.bias = new Float64Array(this.excitable.length);
    const at = new Map<number, number>();
    this.excitable.forEach((i, k) => at.set(i, k));
    this.#excitability = options.excitability.map(({ state, mV, neurons }) => ({ state, mV, at: Uint32Array.from(neurons, (i) => at.get(i)!), value: 0 }));
    this.#excitableAt = this.routes.map((route) => ("excitability" in route.spec.effect ? Uint32Array.from(route.carriers, (i) => at.get(i)!) : null));
  }

  /** A neuron's level, Hz (0 for a neuron that isn't a modulatory source). */
  levelOf(neuron: number): number {
    const k = this.#sourceOf[neuron];
    return k < 0 ? 0 : this.level[k];
  }

  /** Takes internal state for this tick: the stand-ins' rates (each starts at its first) and the excitability internal state sets. */
  setState(senses: BrainSenses, hunger: number, stateOf: (senses: BrainSenses, key: StateKey) => number) {
    for (const standIn of this.standIns) {
      const { low, high } = standIn.spec;
      standIn.target = low + (high - low) * hunger;
      if (!standIn.started) {
        standIn.level = standIn.target;
        standIn.started = true;
      }
    }
    for (const each of this.#excitability) each.value = stateOf(senses, each.state);
  }

  /**
   * Moves the levels on by `ran` ms, `counts` holding each source's spikes in
   * it, and works out what the receptors do now. With `ran` 0 it only works
   * out the effects, from the levels as they are.
   */
  update(ran: number) {
    if (ran > 0) {
      const { level, counts } = this;
      for (let k = 0; k < level.length; k++) level[k] = smooth(level[k], (counts[k] / ran) * 1000, ran, MODULATION.tau);
      for (const standIn of this.standIns) standIn.level = smooth(standIn.level, standIn.target, ran, MODULATION.tau);
    }
    const bias = this.bias;
    bias.fill(0);
    for (const each of this.#excitability) {
      const add = each.mV * each.value;
      for (let k = 0; k < each.at.length; k++) bias[each.at[k]] += add;
    }
    for (let r = 0; r < this.routes.length; r++) {
      const route = this.routes[r];
      const { spec, engaged } = route;
      for (let c = 0; c < route.carriers.length; c++) {
        let exposed: number;
        if (route.ptr === null) {
          exposed = this.standIns[route.standIn].level;
        } else {
          let sum = 0;
          for (let e = route.ptr[c]; e < route.ptr[c + 1]; e++) sum += route.synapses![e] * this.level[route.from![e]];
          exposed = sum / route.total![c];
        }
        const target = Math.min(1, exposed / spec.full);
        if (spec.kinetics) engaged[c] = smooth(engaged[c], target, ran, target > engaged[c] ? spec.kinetics.rise : spec.kinetics.fall);
        else engaged[c] = target;
      }
      const effect = spec.effect;
      if ("release" in effect) {
        const factors = route.factors!;
        for (let c = 0; c < factors.length; c++) factors[c] = (1 + effect.release * engaged[c]) / (1 + effect.release * effect.wired);
      } else {
        const at = this.#excitableAt[r]!;
        for (let c = 0; c < at.length; c++) bias[at[c]] += effect.excitability * engaged[c];
      }
    }
  }
}
