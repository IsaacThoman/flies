// The spiking engine: leaky integrate-and-fire neurons on a connectome, stepped
// sparsely so that only neurons with some state cost anything.
//
// Each neuron has a membrane potential v (mV above rest), a synaptic drive g
// (mV) and, optionally, a spike-frequency adaptation a (mV), with
//
//   dv/dt = (g + bias - a - v) / tauMem   dg/dt = -g / tauSyn   da/dt = -a / tauAdapt
//
// stepped with forward Euler for v and exact decays for g and a. A neuron
// spikes when v reaches the threshold; then v resets to 0 and holds there for
// the refractory period, a grows by the adaptation increment, and with
// `resetDrive` g is cleared to 0 too. A spike adds its edge weight to each
// target's g after the synaptic delay. An edge's weight is
// count × gain[pre] × postScale[post].
//
// Step s (counting from 0) does, in order:
//   1. deliver the spikes fired at step s - delay, in ascending neuron order,
//      then the withdrawals drawn then, each its synapses' opposite;
//   2. update every active neuron: decay g and a; if refractory, count down
//      and hold v at 0, otherwise integrate v and fire at threshold;
//   3. fire the neurons the Poisson inputs pick, unless refractory, and note
//      the withdrawals the withdrawing inputs pick (the neuron itself is left
//      as it is).
// Delivering in a fixed order keeps g's float sums, and so the whole run,
// independent of where neurons happen to sit in the active set.
//
// A neuron is active while it has state. It joins the active set when a spike
// reaches it, an input fires it or it gets a bias. Every `cleanupInterval`
// steps (on steps where s % cleanupInterval is cleanupInterval - 1), after its
// update, a neuron that is not refractory, has no bias, and has |v|, |g| and a
// below `epsilon` is set to exactly 0 and leaves. That cut is the only way the
// result differs from stepping every neuron densely, and it moves v, g and a
// by less than epsilon.

import type { Connectome } from "./format.ts";

/** The wiring the engine needs: CSR by presynaptic neuron, as in format.ts. */
export type Network = {
  readonly ptr: Uint32Array;
  readonly post: Uint32Array;
  readonly count: ArrayLike<number>;
};

export type SimulationOptions = {
  /** Step, ms. Default 0.5. */
  dt?: number;
  /** Membrane time constant, ms. Default 20. */
  tauMem?: number;
  /** Synaptic time constant, ms. Default 5. */
  tauSyn?: number;
  /** Spike threshold, mV above rest. Default 7. */
  threshold?: number;
  /** Refractory period, ms; rounded to whole steps, at least one. Default 2.2. */
  refractory?: number;
  /** Synaptic delay, ms; rounded to whole steps, at least one. Default 1.8. */
  delay?: number;
  /** State below this, in mV, counts as rest. Default 1e-3. */
  epsilon?: number;
  /** Steps between checks for neurons at rest. Default 16. */
  cleanupInterval?: number;
  /** mV per synapse, per presynaptic neuron: negative inhibits, 0 mutes. */
  gain: Float32Array;
  /** Optional per-postsynaptic-neuron factor on incoming weights. */
  postScale?: Float32Array;
  /** Seeds the Poisson inputs. Default 1. */
  seed?: number;
  /**
   * Whether a spike also clears the neuron's synaptic drive g, as the reset of
   * Shiu et al. (2024) does (v = v_rst; g = 0). Default false.
   */
  resetDrive?: boolean;
  /**
   * Spike-frequency adaptation: each spike adds `increment` mV to an
   * adaptation variable a that decays with time constant `tau` ms and is
   * subtracted from the drive, dv/dt = (g + bias - a - v) / tauMem. Default
   * none.
   */
  adaptation?: { increment: number; tau: number };
};

export type SimulationStats = {
  /** Steps run since construction or reset. */
  steps: number;
  /** Spikes fired. */
  spikes: number;
  /** Spike deliveries to individual targets (muted neurons' spikes excluded). */
  events: number;
};

// Per-neuron state is interleaved, four floats a neuron, so an update touches
// one cache line rather than four; this is most of the sweep's speed. The
// bias, which is rare, is kept apart, and so are the neurons that have one:
// they are stepped by their own loop, which spares the main sweep the bias
// term.
const STRIDE = 4;
const SHIFT = 2;
const V = 0;
const G = 1;
// Spike-frequency adaptation, mV, subtracted from the drive.
const ADAPT = 2;
// Steps of refractory period left, a small whole number held as a float.
const HOLD = 3;

const SORT_BITS = 11;

export class Simulation {
  readonly neurons: number;
  readonly connections: number;
  readonly dt: number;
  readonly tauMem: number;
  readonly tauSyn: number;
  readonly threshold: number;
  readonly refractory: number;
  readonly delay: number;
  readonly epsilon: number;
  readonly cleanupInterval: number;
  readonly seed: number;
  readonly resetDrive: boolean;
  readonly adaptation: { readonly increment: number; readonly tau: number } | null;
  /** Synaptic delay and refractory period in whole steps. */
  readonly delaySteps: number;
  readonly refractorySteps: number;
  readonly stats: SimulationStats = { steps: 0, spikes: 0, events: 0 };

  #ptr: Uint32Array;
  #post: Uint32Array;
  #count: ArrayLike<number>;
  #weight: Float32Array;
  // Neurons whose every outgoing weight is 0; their spikes are not delivered,
  // which is exact, since adding 0 changes nothing.
  #silent: Uint8Array;
  #state: Float32Array;
  #bias: Float32Array;
  // Neurons with a nonzero bias. They count as active (inSet is 1) but are
  // kept out of the active list, never cut, and stepped by sweepBiased.
  #biased = new Uint32Array(0);
  #leak: number;
  #decay: number;
  // Per-step decay of the adaptation variable, and what a spike adds to it.
  // 0 with resetDrive, else 1: what a spike multiplies g by.
  #keepDrive: number;
  #adaptDecay: number;
  #adaptStep: number;

  #inSet: Uint8Array;
  #active: Uint32Array;
  #activeCount = 0;
  // active[0..sorted) is ascending; later entries were appended since.
  #sorted = 0;

  // Spikes by the step they were fired in, modulo the delay.
  #ring: Uint32Array[];
  #ringLength: Uint32Array;
  #lastSlot = -1;
  // Withdrawals by the step they were drawn in, modulo the delay: neurons
  // whose release fell below its resting level, delivered as their synapses'
  // opposite (see addRatedInput's `withdraw`). They are not spikes.
  #withdrawn: Uint32Array[];
  #withdrawnLength: Uint32Array;

  // Inputs in the order they were added, which seeds each one's stream. A
  // group input has one rate for all its neurons; a rated input (rates set)
  // has one per neuron, in the order given.
  #inputs: { name: string; neurons: Uint32Array; rate: number; rates: Float64Array | null; on: boolean; withdraw: boolean; source: PoissonInput | RatedPoissonInput }[] = [];
  #inputIndex = new Map<string, number>();
  #scratch: Uint32Array;
  #bins = new Uint32Array((1 << SORT_BITS) + 1);
  #sortPasses: number;

  #readoutNames: string[] = [];
  #readoutMembers: Uint32Array[] = [];
  #readoutCounts = new Uint32Array(0);
  #watched: Uint8Array;
  #watchPtr = new Uint32Array(0);
  #watchIds = new Uint32Array(0);
  #watchStale = false;

  // Which part of a partition each neuron is in, and each part's spikes since the last drain.
  #partOf: Uint8Array | null = null;
  #partCounts = new Uint32Array(0);

  // Groups whose neurons' outgoing weights are scaled, each neuron by a factor
  // of its own (setOutputGains): the members, where each member's edges start
  // in `edges` (CSR), those edges' weights at factor 1, and the factors now.
  #outputGains: { name: string; members: Uint32Array; starts: Uint32Array; edges: Uint32Array; base: Float32Array; factors: Float64Array }[] = [];

  // Groups whose neurons' excitability is set from outside (setExcitability):
  // a bias, as setBias's, kept for each member. Members are stepped with the
  // biased neurons, whatever their bias, so a change never moves them between lists.
  #excitability: { name: string; members: Uint32Array }[] = [];
  #pinned: Uint8Array;

  // Neurons whose spikes are counted one by one (setTally): each one's place in the count, or -1.
  #tallyIndex: Int32Array | null = null;
  #tally = new Uint32Array(0);

  #recording: Uint32Array | null = null;
  #carryMs = 0;
  #sweepResult = new Uint32Array(2);

  constructor(network: Network, options: SimulationOptions) {
    const n = network.ptr.length - 1;
    if (n < 0) throw new Error("ptr must have at least one entry");
    this.neurons = n;
    this.connections = network.post.length;
    if (network.count.length !== this.connections) throw new Error("post and count differ in length");
    if (network.ptr[0] !== 0 || network.ptr[n] !== this.connections) throw new Error("ptr does not span the connections");
    this.dt = options.dt ?? 0.5;
    this.tauMem = options.tauMem ?? 20;
    this.tauSyn = options.tauSyn ?? 5;
    this.threshold = options.threshold ?? 7;
    this.refractory = options.refractory ?? 2.2;
    this.delay = options.delay ?? 1.8;
    this.epsilon = options.epsilon ?? 1e-3;
    this.cleanupInterval = options.cleanupInterval ?? 16;
    this.seed = options.seed ?? 1;
    this.resetDrive = options.resetDrive ?? false;
    const adaptation = options.adaptation;
    if (adaptation && !(adaptation.increment >= 0 && adaptation.tau > 0)) throw new Error("adaptation needs an increment of zero or more and a positive tau");
    this.adaptation = adaptation && adaptation.increment > 0 ? { increment: adaptation.increment, tau: adaptation.tau } : null;
    if (!(this.dt > 0 && this.tauMem > 0 && this.tauSyn > 0)) throw new Error("dt and the time constants must be positive");
    if (!(this.epsilon >= 0)) throw new Error("epsilon must not be negative");
    if (!(Number.isInteger(this.cleanupInterval) && this.cleanupInterval >= 1)) throw new Error("cleanupInterval must be a whole number of steps");
    this.#leak = this.dt / this.tauMem;
    this.#decay = Math.exp(-this.dt / this.tauSyn);
    this.#keepDrive = this.resetDrive ? 0 : 1;
    this.#adaptDecay = this.adaptation ? Math.exp(-this.dt / this.adaptation.tau) : 0;
    this.#adaptStep = this.adaptation ? this.adaptation.increment : 0;
    this.refractorySteps = Math.min(65535, Math.max(1, Math.round(this.refractory / this.dt)));
    this.delaySteps = Math.max(1, Math.round(this.delay / this.dt));

    this.#ptr = network.ptr;
    this.#post = network.post;
    this.#count = network.count;
    this.#weight = new Float32Array(this.connections);
    this.#silent = new Uint8Array(n);
    this.#state = new Float32Array(STRIDE * n);
    this.#bias = new Float32Array(n);
    this.#inSet = new Uint8Array(n);
    this.#active = new Uint32Array(n);
    this.#scratch = new Uint32Array(n);
    this.#watched = new Uint8Array(n);
    this.#pinned = new Uint8Array(n);
    this.#ring = Array.from({ length: this.delaySteps }, () => new Uint32Array(Math.min(n, 256)));
    this.#ringLength = new Uint32Array(this.delaySteps);
    this.#withdrawn = Array.from({ length: this.delaySteps }, () => new Uint32Array(Math.min(n, 256)));
    this.#withdrawnLength = new Uint32Array(this.delaySteps);
    let bits = 1;
    while (2 ** bits < n) bits++;
    this.#sortPasses = Math.ceil(bits / SORT_BITS);
    this.setWeights(options.gain, options.postScale);
  }

  /** Simulated time since construction or reset, ms. */
  get time() {
    return this.stats.steps * this.dt;
  }

  /** Neurons in the active set now. */
  get active() {
    return this.#activeCount + this.#biased.length;
  }

  /** Neuron i's membrane potential, mV above rest. */
  potential(i: number) {
    return this.#state[STRIDE * i + V];
  }

  /** Neuron i's synaptic drive, mV. */
  drive(i: number) {
    return this.#state[STRIDE * i + G];
  }

  /** Neuron i's adaptation, mV (0 without adaptation). */
  adaptationOf(i: number) {
    return this.#state[STRIDE * i + ADAPT];
  }

  /** Whether neuron i is in the active set. */
  isActive(i: number) {
    return this.#inSet[i] === 1;
  }

  /** Recomputes every edge weight: count × gain[pre] × postScale[post]. */
  setWeights(gain: Float32Array, postScale?: Float32Array) {
    const n = this.neurons;
    if (gain.length !== n) throw new Error(`gain has ${gain.length} entries, expected ${n}`);
    if (postScale && postScale.length !== n) throw new Error(`postScale has ${postScale.length} entries, expected ${n}`);
    const ptr = this.#ptr;
    const post = this.#post;
    const count = this.#count;
    const weight = this.#weight;
    // A muted neuron's every weight is its gain's zero, sign and all, when no count is negative or not a number.
    const unsigned = count instanceof Uint16Array;
    for (let i = 0; i < n; i++) {
      const gi = gain[i];
      const start = ptr[i];
      const end = ptr[i + 1];
      if (gi === 0 && unsigned) {
        weight.fill(gi, start, end);
        this.#silent[i] = 1;
        continue;
      }
      let silent = 1;
      if (postScale) {
        for (let e = start; e < end; e++) {
          weight[e] = count[e] * gi * postScale[post[e]];
          if (weight[e] !== 0) silent = 0;
        }
      } else {
        for (let e = start; e < end; e++) {
          weight[e] = count[e] * gi;
          if (weight[e] !== 0) silent = 0;
        }
      }
      this.#silent[i] = silent;
    }
    for (const group of this.#outputGains) {
      for (let k = 0; k < group.edges.length; k++) group.base[k] = weight[group.edges[k]];
      for (let m = 0; m < group.members.length; m++) this.#scaleOutputs(group, m);
    }
  }

  /**
   * Adds a named group of neurons whose outgoing weights setOutputGains
   * scales, each neuron's by its own factor: how strongly each spike of theirs
   * reaches its targets (their transmitter release), not whether they fire.
   * At factor 1, where each starts, every weight is what it was.
   */
  addOutputGain(name: string, neurons: ArrayLike<number>) {
    if (this.#outputGains.some((g) => g.name === name)) throw new Error(`There is already an output gain called "${name}"`);
    const members = this.#members(neurons, `output gain "${name}"`);
    const starts = new Uint32Array(members.length + 1);
    const edges: number[] = [];
    members.forEach((i, m) => {
      for (let e = this.#ptr[i]; e < this.#ptr[i + 1]; e++) edges.push(e);
      starts[m + 1] = edges.length;
    });
    const list = Uint32Array.from(edges);
    this.#outputGains.push({ name, members, starts, edges: list, base: Float32Array.from(list, (e) => this.#weight[e]), factors: new Float64Array(members.length).fill(1) });
  }

  /**
   * Scales each member's outgoing weights by its factor (above 0) times their
   * weights at 1, from the next spike delivered on. The factors are in the
   * order of `outputGainMembers`; a member whose factor is unchanged costs nothing.
   */
  setOutputGains(name: string, factors: ArrayLike<number>) {
    const group = this.#outputGain(name);
    if (factors.length !== group.members.length) throw new Error(`"${name}" has ${group.members.length} neurons, not ${factors.length}`);
    // Above 0, so a neuron that delivers its spikes keeps delivering them (see #silent).
    for (let m = 0; m < factors.length; m++) if (!(factors[m] > 0 && Number.isFinite(factors[m]))) throw new Error("An output gain must be a positive number");
    for (let m = 0; m < factors.length; m++) {
      if (factors[m] === group.factors[m]) continue;
      group.factors[m] = factors[m];
      this.#scaleOutputs(group, m);
    }
  }

  /** Scales every member's outgoing weights by the same factor (above 0), as setOutputGains does each one's. */
  setOutputGain(name: string, factor: number) {
    const group = this.#outputGain(name);
    if (!(factor > 0 && Number.isFinite(factor))) throw new Error("An output gain must be a positive number");
    for (let m = 0; m < group.members.length; m++) {
      if (factor === group.factors[m]) continue;
      group.factors[m] = factor;
      this.#scaleOutputs(group, m);
    }
  }

  /** The neurons of an output gain group, ascending: the order of setOutputGains' factors. */
  outputGainMembers(name: string): Uint32Array {
    return this.#outputGain(name).members;
  }

  #outputGain(name: string) {
    const group = this.#outputGains.find((g) => g.name === name);
    if (!group) throw new Error(`No output gain called "${name}"`);
    return group;
  }

  #scaleOutputs(group: { starts: Uint32Array; edges: Uint32Array; base: Float32Array; factors: Float64Array }, m: number) {
    const weight = this.#weight;
    const factor = group.factors[m];
    for (let k = group.starts[m]; k < group.starts[m + 1]; k++) weight[group.edges[k]] = group.base[k] * factor;
  }

  /**
   * Adds a named group of neurons whose excitability setExcitability sets: a
   * steady drive, mV, as setBias's, one for each. Its members are stepped
   * every step from now on, at 0 as at any other bias, and never leave the
   * active set.
   */
  addExcitability(name: string, neurons: ArrayLike<number>) {
    if (this.#excitability.some((g) => g.name === name)) throw new Error(`There is already an excitability group called "${name}"`);
    const members = this.#members(neurons, `excitability "${name}"`);
    for (const i of members) if (this.#pinned[i]) throw new Error(`Neuron ${i} is already in an excitability group`);
    this.#excitability.push({ name, members });
    for (const i of members) this.#pinned[i] = 1;
    this.#rebuildBiased();
  }

  /** Sets each member's drive, mV, in the order of `excitabilityMembers`, from the next step on. */
  setExcitability(name: string, mV: ArrayLike<number>) {
    const group = this.#excitability.find((g) => g.name === name);
    if (!group) throw new Error(`No excitability group called "${name}"`);
    if (mV.length !== group.members.length) throw new Error(`"${name}" has ${group.members.length} neurons, not ${mV.length}`);
    for (let m = 0; m < mV.length; m++) if (!Number.isFinite(mV[m])) throw new Error("Excitability must be a finite number of mV");
    for (let m = 0; m < mV.length; m++) this.#bias[group.members[m]] = mV[m];
  }

  /** The neurons of an excitability group, ascending: the order of setExcitability's values. */
  excitabilityMembers(name: string): Uint32Array {
    const group = this.#excitability.find((g) => g.name === name);
    if (!group) throw new Error(`No excitability group called "${name}"`);
    return group.members;
  }

  /** Counts the spikes of each of these neurons apart, from now on, replacing any earlier tally; drainTally reads them. */
  setTally(neurons: ArrayLike<number>) {
    const members = this.#members(neurons, "tally");
    const index = new Int32Array(this.neurons).fill(-1);
    members.forEach((i, k) => {
      index[i] = k;
    });
    this.#tallyIndex = index;
    this.#tally = new Uint32Array(members.length);
  }

  /** Each tallied neuron's spikes since the last drain, ascending by neuron, into `into`; then zeroes them. */
  drainTally(into: Uint32Array) {
    into.set(this.#tally);
    this.#tally.fill(0);
  }

  /**
   * Sets a steady drive, mV, added to each neuron's g when integrating v (so v
   * settles at g + bias). Neurons with a bias never leave the active set, so
   * each costs an update every step. Pass null to clear it. This sets every
   * neuron's, excitability groups' members' included.
   */
  setBias(bias: Float32Array | null) {
    if (bias && bias.length !== this.neurons) throw new Error(`bias has ${bias.length} entries, expected ${this.neurons}`);
    for (let i = 0; i < this.neurons; i++) this.#bias[i] = bias ? bias[i] : 0;
    this.#rebuildBiased();
  }

  // The biased list is every neuron with a bias and every excitability group's member.
  #rebuildBiased() {
    // Neurons that had a bias rejoin the active list, which cuts them once at rest.
    for (const i of this.#biased) this.#active[this.#activeCount++] = i;
    const biased: number[] = [];
    for (let i = 0; i < this.neurons; i++) if (this.#bias[i] !== 0 || this.#pinned[i] !== 0) biased.push(i);
    this.#biased = Uint32Array.from(biased);
    if (biased.length > 0) {
      let kept = 0;
      for (let k = 0; k < this.#activeCount; k++) {
        const i = this.#active[k];
        if (this.#bias[i] === 0 && this.#pinned[i] === 0) this.#active[kept++] = i;
      }
      this.#activeCount = kept;
    }
    this.#sort(this.#active, this.#activeCount);
    this.#sorted = this.#activeCount;
    this.#activateBiased();
  }

  /**
   * Adds a named group of neurons driven as independent Poisson spike trains
   * at `rateHz` each. A picked neuron fires unless it is refractory. Each group
   * draws from its own stream, seeded from the simulation's seed and the
   * group's position, so adding groups does not disturb earlier ones.
   */
  addInput(name: string, neurons: ArrayLike<number>, rateHz = 0) {
    if (this.#inputIndex.has(name)) throw new Error(`There is already an input called "${name}"`);
    const members = this.#members(neurons, `input "${name}"`);
    const source = new PoissonInput(members, inputSeed(this.seed, this.#inputs.length));
    this.#inputIndex.set(name, this.#inputs.length);
    this.#inputs.push({ name, neurons: members, rate: 0, rates: null, on: false, withdraw: false, source });
    this.setRate(name, rateHz);
  }

  /** Changes a group input's rate, Hz per neuron, from the next step on. */
  setRate(name: string, rateHz: number) {
    const input = this.#input(name);
    if (input.rates) throw new Error(`"${name}" has a rate per neuron; use setRates`);
    if (!(rateHz >= 0)) throw new Error("Input rates must be zero or more");
    if (rateHz === input.rate) return;
    input.rate = rateHz;
    input.on = rateHz > 0;
    (input.source as PoissonInput).setProbability((rateHz * this.dt) / 1000);
  }

  /**
   * Adds a named group of neurons each driven as its own Poisson train, at a
   * rate of its own (setRates; all 0 to begin with). The neurons keep the
   * order given, which is the order of the rates, and must be distinct. It
   * draws from its own stream, like a group input, and costs per spike plus
   * a little per neuron when its fastest neuron is much faster than the rest
   * (see RatedPoissonInput).
   *
   * With `withdraw`, a picked neuron doesn't fire: its release falls below
   * its resting level for a moment, which its targets feel, after the
   * synaptic delay, as the opposite of what one of its spikes would do. That
   * is how a graded neuron that releases tonically signals hyperpolarisation
   * (the eyes use it for L1 under brightening). The neuron's own state is
   * untouched and nothing counts it as a spike.
   */
  addRatedInput(name: string, neurons: ArrayLike<number>, options: { withdraw?: boolean } = {}) {
    if (this.#inputIndex.has(name)) throw new Error(`There is already an input called "${name}"`);
    const members = Uint32Array.from(neurons);
    for (let k = 0; k < neurons.length; k++) {
      const i = neurons[k];
      if (!Number.isInteger(i) || i < 0 || i >= this.neurons) throw new Error(`input "${name}": no neuron ${i}`);
    }
    if (new Set(members).size !== members.length) throw new Error(`input "${name}": a neuron is listed twice`);
    const source = new RatedPoissonInput(members, inputSeed(this.seed, this.#inputs.length));
    this.#inputIndex.set(name, this.#inputs.length);
    this.#inputs.push({ name, neurons: members, rate: 0, rates: new Float64Array(members.length), on: false, withdraw: options.withdraw ?? false, source });
  }

  /** Changes each neuron's rate, Hz, of a rated input from the next step on, in the order its neurons were given. */
  setRates(name: string, ratesHz: ArrayLike<number>) {
    const input = this.#input(name);
    const rates = input.rates;
    if (!rates) throw new Error(`"${name}" has one rate for all its neurons; use setRate`);
    if (ratesHz.length !== rates.length) throw new Error(`"${name}" has ${rates.length} neurons, not ${ratesHz.length}`);
    let on = false;
    for (let k = 0; k < rates.length; k++) {
      const rate = ratesHz[k];
      if (!(rate >= 0)) throw new Error("Input rates must be zero or more");
      rates[k] = rate;
      if (rate > 0) on = true;
    }
    input.on = on;
    (input.source as RatedPoissonInput).setProbabilities(rates, this.dt / 1000);
  }

  #input(name: string) {
    const k = this.#inputIndex.get(name);
    if (k === undefined) throw new Error(`No input called "${name}"`);
    return this.#inputs[k];
  }

  /** Adds a named group of neurons whose spikes drainReadouts counts. */
  addReadout(name: string, neurons: ArrayLike<number>) {
    if (this.#readoutNames.includes(name)) throw new Error(`There is already a readout called "${name}"`);
    this.#readoutNames.push(name);
    this.#readoutMembers.push(this.#members(neurons, `readout "${name}"`));
    const counts = new Uint32Array(this.#readoutNames.length);
    counts.set(this.#readoutCounts);
    this.#readoutCounts = counts;
    this.#watchStale = true;
  }

  // Neuron -> readouts, as CSR: made when spikes are next counted, not once per readout added.
  #indexReadouts() {
    this.#watchStale = false;
    const n = this.neurons;
    const ptr = new Uint32Array(n + 1);
    for (const members of this.#readoutMembers) for (const i of members) ptr[i + 1]++;
    for (let i = 0; i < n; i++) ptr[i + 1] += ptr[i];
    const ids = new Uint32Array(ptr[n]);
    const fill = ptr.slice(0, n);
    this.#readoutMembers.forEach((members, r) => {
      for (const i of members) ids[fill[i]++] = r;
    });
    this.#watchPtr = ptr;
    this.#watchIds = ids;
    for (let i = 0; i < n; i++) this.#watched[i] = ptr[i + 1] > ptr[i] ? 1 : 0;
  }

  /** Spikes in each readout since the last drain. */
  drainReadouts(into: Record<string, number> = {}): Record<string, number> {
    const counts = this.#readoutCounts;
    this.#readoutNames.forEach((name, r) => {
      into[name] = counts[r];
    });
    counts.fill(0);
    return into;
  }

  /**
   * Counts every spike by the part of a partition of the neurons its neuron
   * is in: `partOf[i]` (below `parts`) for neuron i. Unlike a readout, this
   * costs one increment a spike whichever neuron fires, so it can cover them all.
   */
  setPartition(partOf: Uint8Array, parts: number) {
    if (partOf.length !== this.neurons) throw new Error(`A partition needs a part for each of the ${this.neurons} neurons, not ${partOf.length}`);
    for (let i = 0; i < partOf.length; i++) if (partOf[i] >= parts) throw new Error(`Neuron ${i} is in part ${partOf[i]}, but there are ${parts}`);
    this.#partOf = Uint8Array.from(partOf);
    this.#partCounts = new Uint32Array(parts);
  }

  /** Spikes in each part of the partition since the last drain, into `into` (at least as long as the parts); then zeroes them. */
  drainPartition(into: Uint32Array) {
    into.set(this.#partCounts);
    this.#partCounts.fill(0);
  }

  /** The neurons of a readout or input, deduplicated and ascending. */
  members(name: string): Uint32Array {
    const r = this.#readoutNames.indexOf(name);
    if (r >= 0) return this.#readoutMembers[r];
    const k = this.#inputIndex.get(name);
    if (k !== undefined) return this.#inputs[k].neurons;
    throw new Error(`No readout or input called "${name}"`);
  }

  /**
   * Turns per-neuron spike counting on (from zero) or off. While on,
   * `recording` holds each neuron's spikes since then.
   */
  setRecording(on: boolean) {
    this.#recording = on ? new Uint32Array(this.neurons) : null;
  }

  get recording(): Uint32Array | null {
    return this.#recording;
  }

  /** The neurons that spiked in the last step, ascending. A view: copy it to keep it. */
  lastSpikes(): Uint32Array {
    if (this.#lastSlot < 0) return new Uint32Array(0);
    return this.#ring[this.#lastSlot].subarray(0, this.#ringLength[this.#lastSlot]);
  }

  /**
   * Runs whole steps covering `ms` of simulated time. Remainders carry over,
   * so many short calls add up to the right number of steps. Returns the
   * number of steps run.
   */
  advance(ms: number): number {
    const total = this.#carryMs + ms;
    const steps = Math.max(0, Math.floor(total / this.dt + 1e-9));
    this.#carryMs = Math.max(0, total - steps * this.dt);
    for (let s = 0; s < steps; s++) this.step();
    return steps;
  }

  /** Back to rest at time 0, with the inputs reseeded. Wiring, inputs, rates, readouts, the partition and bias stay. */
  reset() {
    const state = this.#state;
    for (let i = 0; i < this.neurons; i++) {
      state[STRIDE * i + V] = 0;
      state[STRIDE * i + G] = 0;
      state[STRIDE * i + HOLD] = 0;
      state[STRIDE * i + ADAPT] = 0;
    }
    this.#inSet.fill(0);
    this.#activeCount = 0;
    this.#sorted = 0;
    this.#ringLength.fill(0);
    this.#withdrawnLength.fill(0);
    this.#lastSlot = -1;
    this.#carryMs = 0;
    this.stats.steps = 0;
    this.stats.spikes = 0;
    this.stats.events = 0;
    this.#readoutCounts.fill(0);
    this.#partCounts.fill(0);
    this.#tally.fill(0);
    this.#recording?.fill(0);
    this.#inputs.forEach((input, k) => {
      if (input.rates) {
        const source = new RatedPoissonInput(input.neurons, inputSeed(this.seed, k));
        source.setProbabilities(input.rates, this.dt / 1000);
        input.source = source;
      } else {
        const source = new PoissonInput(input.neurons, inputSeed(this.seed, k));
        source.setProbability((input.rate * this.dt) / 1000);
        input.source = source;
      }
    });
    this.#activateBiased();
  }

  /** Runs one step of dt. */
  step() {
    const slot = this.stats.steps % this.delaySteps;
    const state = this.#state;
    const inSet = this.#inSet;
    const active = this.#active;
    let count = this.#activeCount;

    // 1. Deliver the spikes from `delay` steps ago, which sit in this slot.
    const arriving = this.#ring[slot];
    const arrivingLength = this.#ringLength[slot];
    if (arrivingLength > 0) {
      const ptr = this.#ptr;
      const post = this.#post;
      const weight = this.#weight;
      const silent = this.#silent;
      let events = 0;
      for (let k = 0; k < arrivingLength; k++) {
        const pre = arriving[k];
        if (silent[pre] !== 0) continue;
        const start = ptr[pre];
        const end = ptr[pre + 1];
        events += end - start;
        for (let e = start; e < end; e++) {
          const j = post[e] | 0;
          state[(j << SHIFT) + G] += weight[e];
          if (inSet[j] === 0) {
            inSet[j] = 1;
            active[count++] = j;
          }
        }
      }
      this.stats.events += events;
    }
    // The withdrawals from then, as the spikes' loop with the sign reversed
    // (kept apart so the spikes' loop, the hottest in the engine, stays as it is).
    const withdrawn = this.#withdrawn[slot];
    const withdrawnLength = this.#withdrawnLength[slot];
    if (withdrawnLength > 0) {
      const ptr = this.#ptr;
      const post = this.#post;
      const weight = this.#weight;
      const silent = this.#silent;
      let events = 0;
      for (let k = 0; k < withdrawnLength; k++) {
        const pre = withdrawn[k];
        if (silent[pre] !== 0) continue;
        const start = ptr[pre];
        const end = ptr[pre + 1];
        events += end - start;
        for (let e = start; e < end; e++) {
          const j = post[e] | 0;
          state[(j << SHIFT) + G] -= weight[e];
          if (inSet[j] === 0) {
            inSet[j] = 1;
            active[count++] = j;
          }
        }
      }
      this.stats.events += events;
    }

    // 2. Update the active neurons. This step's spikes overwrite the slot just
    // delivered; room is made up front because a call inside the sweep would
    // stop V8 hoisting its typed-array loads out of the loop.
    const biased = this.#biased;
    let out = arriving.length >= count + biased.length ? arriving : this.#grow(slot, count + biased.length);
    const cleanup = this.stats.steps % this.cleanupInterval === this.cleanupInterval - 1;
    let fired: number;
    if (cleanup) {
      const result = this.#sweepResult;
      fired = sweepAndCleanup(
        active,
        count,
        this.#sorted,
        inSet,
        state,
        out,
        this.#leak,
        this.#decay,
        this.threshold,
        this.refractorySteps,
        this.#keepDrive,
        this.#adaptDecay,
        this.#adaptStep,
        this.epsilon,
        result,
      );
      count = result[0];
      this.#sorted = result[1];
      // The sweep runs several times faster in index order than in arrival
      // order, so re-sort once enough has been appended.
      if (count - this.#sorted > (count >>> 3) + 64) {
        this.#sort(active, count);
        this.#sorted = count;
      }
    } else {
      fired = sweep(active, count, state, out, this.#leak, this.#decay, this.threshold, this.refractorySteps, this.#keepDrive, this.#adaptDecay, this.#adaptStep);
    }
    if (biased.length > 0) {
      fired = sweepBiased(biased, state, this.#bias, out, fired, this.#leak, this.#decay, this.threshold, this.refractorySteps, this.#keepDrive, this.#adaptDecay, this.#adaptStep);
    }

    // 3. Poisson inputs; withdrawals go to their own slot, in ascending order.
    const inputs = this.#inputs;
    const picked = this.#scratch;
    const refractorySteps = this.refractorySteps;
    const resetDrive = this.resetDrive;
    const adaptStep = this.#adaptStep;
    let withdrawing = 0;
    for (let q = 0; q < inputs.length; q++) {
      const input = inputs[q];
      if (!input.on) continue;
      const m = input.source.sample(picked);
      if (input.withdraw) {
        let into = this.#withdrawn[slot];
        if (into.length < withdrawing + m) into = this.#growWithdrawn(slot, withdrawing + m);
        for (let k = 0; k < m; k++) into[withdrawing++] = picked[k];
        continue;
      }
      if (out.length < fired + m) out = this.#grow(slot, fired + m);
      for (let k = 0; k < m; k++) {
        const i = picked[k];
        const o = i * STRIDE;
        if (state[o + HOLD] !== 0) continue;
        state[o + V] = 0;
        if (resetDrive) state[o + G] = 0;
        state[o + ADAPT] += adaptStep;
        state[o + HOLD] = refractorySteps;
        out[fired++] = i;
        if (inSet[i] === 0) {
          inSet[i] = 1;
          active[count++] = i;
        }
      }
    }
    this.#activeCount = count;
    if (withdrawing > 1) this.#sort(this.#withdrawn[slot], withdrawing);
    this.#withdrawnLength[slot] = withdrawing;

    if (fired > 1) this.#sort(out, fired);
    this.#ringLength[slot] = fired;
    this.#lastSlot = slot;
    this.stats.steps++;
    if (fired === 0) return;
    this.stats.spikes += fired;
    const recording = this.#recording;
    if (recording !== null) for (let k = 0; k < fired; k++) recording[out[k]]++;
    if (this.#readoutNames.length > 0) {
      if (this.#watchStale) this.#indexReadouts();
      const watched = this.#watched;
      const watchPtr = this.#watchPtr;
      const watchIds = this.#watchIds;
      const counts = this.#readoutCounts;
      for (let k = 0; k < fired; k++) {
        const i = out[k];
        if (watched[i] === 0) continue;
        for (let m = watchPtr[i], end = watchPtr[i + 1]; m < end; m++) counts[watchIds[m]]++;
      }
    }
    const partOf = this.#partOf;
    if (partOf !== null) {
      const counts = this.#partCounts;
      for (let k = 0; k < fired; k++) counts[partOf[out[k]]]++;
    }
    const tallyIndex = this.#tallyIndex;
    if (tallyIndex !== null) {
      const tally = this.#tally;
      for (let k = 0; k < fired; k++) {
        const t = tallyIndex[out[k]];
        if (t >= 0) tally[t]++;
      }
    }
  }

  // Makes room for `needed` withdrawals in a slot, keeping what is there.
  #growWithdrawn(slot: number, needed: number) {
    const old = this.#withdrawn[slot];
    const bigger = new Uint32Array(Math.min(this.neurons, Math.max(needed, old.length * 2)));
    bigger.set(old);
    this.#withdrawn[slot] = bigger;
    return bigger;
  }

  // Makes room for `needed` spikes in a slot, keeping what is there.
  #grow(slot: number, needed: number) {
    const old = this.#ring[slot];
    const bigger = new Uint32Array(Math.min(this.neurons, Math.max(needed, old.length * 2)));
    bigger.set(old);
    this.#ring[slot] = bigger;
    return bigger;
  }

  #activateBiased() {
    for (const i of this.#biased) this.#inSet[i] = 1;
  }

  #members(neurons: ArrayLike<number>, what: string) {
    // The usual case, indices already whole and unsigned, without a set and a comparator.
    if (neurons instanceof Uint32Array) {
      const sorted = neurons.slice().sort();
      let unique = 0;
      for (let k = 0; k < sorted.length; k++) if (k === 0 || sorted[k] !== sorted[k - 1]) sorted[unique++] = sorted[k];
      if (unique > 0 && sorted[unique - 1] >= this.neurons) throw new Error(`${what}: no neuron ${sorted.find((i) => i >= this.neurons)}`);
      return sorted.slice(0, unique);
    }
    const unique = [...new Set(Array.from(neurons))].sort((a, b) => a - b);
    for (const i of unique) if (!Number.isInteger(i) || i < 0 || i >= this.neurons) throw new Error(`${what}: no neuron ${i}`);
    return Uint32Array.from(unique);
  }

  // Sorts a[0..n) ascending without allocating: insertion sort when short,
  // otherwise LSD radix through the scratch buffer (free outside step 3).
  #sort(a: Uint32Array, n: number) {
    if (n < 48) {
      for (let k = 1; k < n; k++) {
        const x = a[k];
        let m = k - 1;
        while (m >= 0 && a[m] > x) {
          a[m + 1] = a[m];
          m--;
        }
        a[m + 1] = x;
      }
      return;
    }
    const bins = this.#bins;
    const mask = (1 << SORT_BITS) - 1;
    let from = a;
    let to = this.#scratch;
    for (let pass = 0; pass < this.#sortPasses; pass++) {
      const shift = pass * SORT_BITS;
      bins.fill(0);
      for (let k = 0; k < n; k++) bins[((from[k] >>> shift) & mask) + 1]++;
      for (let b = 0; b < mask + 1; b++) bins[b + 1] += bins[b];
      for (let k = 0; k < n; k++) to[bins[(from[k] >>> shift) & mask]++] = from[k];
      const swap = from;
      from = to;
      to = swap;
    }
    if (from !== a) a.set(from.subarray(0, n));
  }
}

// Step 2 of Simulation.step: updates active[0..count) and writes this step's
// spikes to `out`, returning how many. On cleanup steps sweepAndCleanup does
// the same and also drops neurons at rest, compacting the list. They are
// separate loops because V8 optimises each far better than one loop with a
// flag; the update itself must stay the same in both. It computes the
// integrated v before looking at the refractory count (a held neuron's v is 0,
// so this is harmless) which keeps the loop free of dependent branches; `| 0`
// tells V8 the index is a small integer.
function sweep(
  active: Uint32Array,
  count: number,
  state: Float32Array,
  out: Uint32Array,
  leak: number,
  decay: number,
  threshold: number,
  refractorySteps: number,
  keepDrive: number,
  adaptDecay: number,
  adaptStep: number,
) {
  let fired = 0;
  for (let k = 0; k < count; k++) {
    const i = active[k] | 0;
    const o = i << SHIFT;
    const v = state[o + V];
    const g = state[o + G];
    const hold = state[o + HOLD];
    const a = state[o + ADAPT];
    const next = v + leak * (g - a - v);
    const decayed = g * decay;
    state[o + G] = decayed;
    state[o + ADAPT] = a * adaptDecay;
    if (hold > 0) {
      state[o + HOLD] = hold - 1;
    } else if (next >= threshold) {
      state[o + V] = 0;
      // + 0 turns -0 into 0, so that a cleared drive is exactly 0.
      state[o + G] = decayed * keepDrive + 0;
      state[o + ADAPT] = a * adaptDecay + adaptStep;
      state[o + HOLD] = refractorySteps;
      out[fired++] = i;
    } else {
      state[o + V] = next;
    }
  }
  return fired;
}

// The same update for the biased neurons, appending their spikes to out[from..].
function sweepBiased(
  biased: Uint32Array,
  state: Float32Array,
  bias: Float32Array,
  out: Uint32Array,
  from: number,
  leak: number,
  decay: number,
  threshold: number,
  refractorySteps: number,
  keepDrive: number,
  adaptDecay: number,
  adaptStep: number,
) {
  let fired = from;
  for (let k = 0; k < biased.length; k++) {
    const i = biased[k] | 0;
    const o = i << SHIFT;
    const v = state[o + V];
    const g = state[o + G];
    const hold = state[o + HOLD];
    const a = state[o + ADAPT];
    const next = v + leak * (g + bias[i] - a - v);
    const decayed = g * decay;
    state[o + G] = decayed;
    state[o + ADAPT] = a * adaptDecay;
    if (hold > 0) {
      state[o + HOLD] = hold - 1;
    } else if (next >= threshold) {
      state[o + V] = 0;
      // + 0 turns -0 into 0, so that a cleared drive is exactly 0.
      state[o + G] = decayed * keepDrive + 0;
      state[o + ADAPT] = a * adaptDecay + adaptStep;
      state[o + HOLD] = refractorySteps;
      out[fired++] = i;
    } else {
      state[o + V] = next;
    }
  }
  return fired;
}

// result gets the new active count and the length of the list's sorted prefix.
function sweepAndCleanup(
  active: Uint32Array,
  count: number,
  sortedBefore: number,
  inSet: Uint8Array,
  state: Float32Array,
  out: Uint32Array,
  leak: number,
  decay: number,
  threshold: number,
  refractorySteps: number,
  keepDrive: number,
  adaptDecay: number,
  adaptStep: number,
  epsilon: number,
  result: Uint32Array,
) {
  let fired = 0;
  let kept = 0;
  let sorted = sortedBefore >= count ? -1 : 0;
  for (let k = 0; k < count; k++) {
    if (k === sortedBefore) sorted = kept;
    const i = active[k] | 0;
    const o = i << SHIFT;
    const v = state[o + V];
    const g = state[o + G];
    const hold = state[o + HOLD];
    const a = state[o + ADAPT];
    const next = v + leak * (g - a - v);
    const decayed = g * decay;
    state[o + G] = decayed;
    state[o + ADAPT] = a * adaptDecay;
    if (hold > 0) {
      state[o + HOLD] = hold - 1;
    } else if (next >= threshold) {
      state[o + V] = 0;
      // + 0 turns -0 into 0, so that a cleared drive is exactly 0.
      state[o + G] = decayed * keepDrive + 0;
      state[o + ADAPT] = a * adaptDecay + adaptStep;
      state[o + HOLD] = refractorySteps;
      out[fired++] = i;
    } else {
      state[o + V] = next;
    }
    // Compared as stored, in single precision, as the dense reference does.
    // The most active neurons fail the first test, so it goes first.
    if (
      Math.abs(state[o + V]) < epsilon &&
      Math.abs(state[o + G]) < epsilon &&
      state[o + HOLD] === 0 &&
      state[o + ADAPT] < epsilon
    ) {
      state[o + V] = 0;
      state[o + G] = 0;
      state[o + ADAPT] = 0;
      inSet[i] = 0;
    } else {
      active[kept++] = i;
    }
  }
  result[0] = kept;
  result[1] = sorted < 0 ? kept : sorted;
  return fired;
}

/**
 * Independent Bernoulli trials of probability p for each neuron each step
 * (a Poisson train of rate p / dt), drawn by skipping geometric gaps between
 * successes, so the cost is per spike rather than per neuron per step.
 */
export class PoissonInput {
  readonly neurons: Uint32Array;
  #random: () => number;
  #p = 0;
  #logMiss = 0;
  // Trials from the start of the next step to the next success.
  #next = Infinity;

  constructor(neurons: Uint32Array, seed: number) {
    this.neurons = neurons;
    this.#random = mulberry32(seed);
  }

  /**
   * The chance each neuron fires in a step. Changing it redraws the gap to the
   * next success, which is fair because the trials are memoryless.
   */
  setProbability(p: number) {
    this.#p = Math.min(1, Math.max(0, p));
    this.#logMiss = Math.log1p(-this.#p);
    this.#next = this.#gap();
  }

  /** Writes this step's firing neurons into `out`, in group order; returns how many. */
  sample(out: Uint32Array): number {
    const size = this.neurons.length;
    let at = this.#next;
    let n = 0;
    while (at < size) {
      out[n++] = this.neurons[at];
      at += 1 + this.#gap();
    }
    this.#next = at - size;
    return n;
  }

  #gap() {
    if (this.#p <= 0) return Infinity;
    if (this.#p >= 1) return 0;
    // 1 - random() is in (0, 1], so the log is finite.
    return Math.floor(Math.log(1 - this.#random()) / this.#logMiss);
  }
}

/**
 * Independent Bernoulli trials for each neuron each step, each neuron with a
 * probability of its own. Drawn by thinning: candidates come at the highest
 * probability, skipping geometric gaps as PoissonInput does, and each is kept
 * with its own probability over the highest. That costs one draw per
 * candidate, about (neurons × highest probability) a step, so it stays cheap
 * while most neurons are near the fastest or silent.
 */
export class RatedPoissonInput {
  readonly neurons: Uint32Array;
  #random: () => number;
  #p: Float64Array;
  #max = 0;
  #logMiss = 0;
  #next = Infinity;

  constructor(neurons: Uint32Array, seed: number) {
    this.neurons = neurons;
    this.#p = new Float64Array(neurons.length);
    this.#random = mulberry32(seed);
  }

  /** Each neuron's chance of firing in a step is its rate times `scale` (rates in Hz and the step in seconds), at most 1. */
  setProbabilities(rates: ArrayLike<number>, scale: number) {
    let max = 0;
    for (let k = 0; k < this.#p.length; k++) {
      const p = Math.min(1, Math.max(0, rates[k] * scale));
      this.#p[k] = p;
      if (p > max) max = p;
    }
    this.#max = max;
    this.#logMiss = Math.log1p(-max);
    this.#next = this.#gap();
  }

  /** Writes this step's firing neurons into `out`, in group order; returns how many. */
  sample(out: Uint32Array): number {
    const size = this.neurons.length;
    const p = this.#p;
    const max = this.#max;
    let at = this.#next;
    let n = 0;
    while (at < size) {
      if (this.#random() * max < p[at]) out[n++] = this.neurons[at];
      at += 1 + this.#gap();
    }
    this.#next = at - size;
    return n;
  }

  #gap() {
    if (this.#max <= 0) return Infinity;
    if (this.#max >= 1) return 0;
    return Math.floor(Math.log(1 - this.#random()) / this.#logMiss);
  }
}

/** The seed of input group `index` in a simulation seeded with `seed`. */
export function inputSeed(seed: number, index: number) {
  let x = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca77)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** A small seeded generator of uniform numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Per-neuron gain from each neuron's predicted transmitter: `table` maps NT
 * names as they appear in the connectome ("ACH", "GABA", "" for blank, ...) to
 * mV per synapse; anything missing gets `fallback`.
 */
export function gainByTransmitter(connectome: Connectome, table: Readonly<Record<string, number>>, fallback = 0): Float32Array {
  const { codes, table: names } = connectome.columns.nt;
  const byCode = Float32Array.from(names, (name) => table[name] ?? fallback);
  return Float32Array.from(codes, (code) => byCode[code]);
}
