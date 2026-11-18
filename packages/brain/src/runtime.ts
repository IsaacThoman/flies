// The running brain: the connectome at the operating point (params.ts), driven
// by the senses and the internal state (io.ts, state.ts), read out as
// commands. No Node APIs; it runs in the browser game's Web Worker.

import type { EyeColumn } from "./eye-columns.ts";
import { buildEyes } from "./eyes.ts";
import type { Eyes } from "./eyes.ts";
import { ConnectomeFormatError, loadConnectome } from "./format.ts";
import { SLEEP_EYES, backgroundRates, decode, hungerOf, regionRate, senseRates, smooth, stateOf, thirstOf, waterOutputGain, wire } from "./io.ts";
import type { Wiring } from "./io.ts";
import { Modulation } from "./modulation.ts";
import { ODORANTS, odorOf, ornRate, wireOlfaction } from "./olfaction.ts";
import type { OrnGroup } from "./olfaction.ts";
import { OPERATING_POINT, buildWeights } from "./params.ts";
import type { OperatingPoint } from "./params.ts";
import { REGIONS, REGION_RATE_NAMES, REGION_TAU, regionOf } from "./regions.ts";
import { Simulation } from "./sim.ts";
import { Thermoreceptors, temperatureOf } from "./thermo.ts";
import { InternalState, INTERNAL_STATE } from "./state.ts";
import type { InternalStateParameters } from "./state.ts";
import { RETINA, Retina, VISION_STAGES, stageName } from "./vision.ts";
import type { RetinaParameters } from "./vision.ts";
import type { Brain, BrainSenses, BrainState, EyeMap } from "./types.ts";

/** A group of touch regions as the simulation drives it: each neuron's rate, and each region's. */
type Regional = { group: Wiring["senses"][number]; rates: Float64Array; felt: Float64Array };

export type BrainOptions = {
  /** Seeds the Poisson inputs and the internal state. Default 1. */
  seed?: number;
  /** For experiments; the defaults are the documented operating point. */
  operatingPoint?: OperatingPoint;
  internalState?: InternalStateParameters;
  retina?: RetinaParameters;
  /** Turn the internal state's background drive off (it is on by default). */
  spontaneous?: boolean;
  /**
   * For experiments: the olfactory receptor neurons fire at their recorded
   * resting rates (off by default: in this model those rates drive the
   * antennal lobe's broad local neurons to saturation; README, Smell).
   */
  restingSmell?: boolean;
  /** The eyes' columns (eye-columns.ts by default), for tests on a synthetic connectome. */
  eyeColumns?: { readonly right: readonly EyeColumn[]; readonly left: readonly EyeColumn[] };
};

/** Smoothing time constant, ms, of the vision.<stage> rates. */
export const VISION_TAU = 100;

/** Longest stretch, ms, simulated with the same input rates and before the readouts are smoothed. */
export const CHUNK_MS = 10;
/** Longest tick accepted, ms. */
export const MAX_TICK_MS = 1000;

/** A brain built on an already loaded connectome, with access to its parts (for scripts and tests). */
export class FlyBrain implements Brain {
  readonly neurons: number;
  readonly connections: number;
  readonly eyes: EyeMap | null;
  /** Each eye's columns and cells, and its input stage; null without eyes. */
  readonly vision: (Eyes & { retina: { left: Retina; right: Retina } }) | null;
  readonly sim: Simulation;
  readonly wiring: Wiring;
  readonly state: InternalState;
  /** Slow neuromodulation (modulation.ts): every modulatory neuron's level, and what its receptors do. */
  readonly modulation: Modulation;
  readonly spontaneous: boolean;
  /** Whether the olfactory receptor neurons fire at rest (BrainOptions.restingSmell). */
  readonly restingSmell: boolean;
  /** Each neuron's region, an index into REGIONS. */
  readonly regions: Uint8Array;
  /** Smoothed mean rate of each readout group, Hz. */
  readonly rates: Record<string, number> = {};
  #counts: Record<string, number> = {};
  #vision: { name: string; size: number }[] = [];
  #regionSizes = new Uint32Array(REGIONS.length);
  // The groups of touch regions, each one input of a rate per neuron, and each region's rate last set.
  #regional: Regional[] = [];
  #regionCounts = new Uint32Array(REGIONS.length);
  // The output gain groups of the receptors that change release, by route.
  #release: { route: number; name: string }[] = [];
  // The water neurons' input, whose output gain thirst sets.
  #water = "";
  /** Every glomerulus's receptor neurons, side by side (olfaction.ts). */
  readonly smell: readonly OrnGroup[];
  #odor = new Float64Array(2 * ODORANTS.length);
  /** The eyes' gain last set (SLEEP_EYES), and each eye's rates and L1's withdrawals scaled by it. */
  #eyeGain = 1;
  #gained: Record<"left" | "right", { rates: Float64Array; withdrawals: Float64Array }> | null = null;
  /** What each antenna's thermoreceptors have adapted to. */
  readonly thermoreceptors = new Thermoreceptors();
  #thermoRates = { heating: 0, cooling: 0 };

  constructor(connectome: ReturnType<typeof loadConnectome>, options: BrainOptions = {}) {
    const seed = options.seed ?? 1;
    const point = options.operatingPoint ?? OPERATING_POINT;
    this.neurons = connectome.neurons;
    this.connections = connectome.connections;
    this.wiring = wire(connectome);
    const weights = buildWeights(connectome, point);
    this.sim = new Simulation(weights.network, { ...point.neuron, gain: weights.gain, seed });
    for (const group of this.wiring.senses) {
      if (group.spec.afterEyes) continue;
      if (group.ends) {
        // A rate for each region: one input still, so every later input's stream is where it was.
        this.sim.addRatedInput(group.spec.name, group.neurons);
        this.#regional.push({ group, rates: new Float64Array(group.neurons.length), felt: new Float64Array(group.ends.length) });
      } else this.sim.addInput(group.spec.name, group.neurons);
    }
    for (const { spec, neurons } of this.wiring.background) this.sim.addInput(spec.name, neurons);
    // Thirst scales how strongly the water neurons' spikes reach their targets (io.ts, THIRST).
    for (const { spec, neurons } of this.wiring.senses) {
      if (spec.sense !== "water") continue;
      this.#water = spec.name;
      this.sim.addOutputGain(spec.name, neurons);
    }
    // Slow neuromodulation: the modulatory neurons' spikes are tallied one by
    // one, and its receptors set some neurons' release and some's excitability.
    this.modulation = new Modulation(connectome, {
      nt: weights.nt,
      senses: this.wiring.senses.map(({ spec, neurons }) => ({ sense: spec.sense, neurons })),
      excitability: this.wiring.excitability.map(({ spec, neurons }) => ({ state: spec.state, mV: spec.mV, neurons })),
    });
    this.sim.setTally(this.modulation.sources);
    this.modulation.routes.forEach((route, r) => {
      if (!route.factors || route.carriers.length === 0) return;
      const name = `release ${route.spec.receptor}`;
      this.sim.addOutputGain(name, route.carriers);
      this.#release.push({ route: r, name });
    });
    if (this.modulation.excitable.length > 0) this.sim.addExcitability("modulated", this.modulation.excitable);
    for (const { spec, neurons } of this.wiring.readouts) {
      this.sim.addReadout(spec.name, neurons);
      this.rates[spec.name] = 0;
    }
    // Every region is reported, after the readouts, whether or not it has neurons (an empty one stays at 0).
    this.regions = regionOf(connectome);
    for (let i = 0; i < this.regions.length; i++) this.#regionSizes[this.regions[i]]++;
    this.sim.setPartition(this.regions, REGIONS.length);
    for (const name of REGION_RATE_NAMES) this.rates[name] = 0;
    // The eyes come after every other input but the senses added since
    // (afterEyes), so their streams leave the others' as they were: with the eyes shut, the brain is the same.
    const eyes = buildEyes(connectome, options.eyeColumns);
    this.eyes = eyes?.map ?? null;
    this.vision = null;
    if (eyes) {
      const parameters = options.retina ?? RETINA;
      const retina = { left: new Retina(eyes.left, parameters), right: new Retina(eyes.right, parameters) };
      this.vision = { ...eyes, retina };
      const buffers = (r: Retina) => ({ rates: new Float64Array(r.rates.length), withdrawals: new Float64Array(r.withdrawals.length) });
      this.#gained = { left: buffers(retina.left), right: buffers(retina.right) };
      const read = new Set(this.wiring.readouts.flatMap((group) => [...group.neurons]));
      for (const side of ["left", "right"] as const) {
        for (const i of retina[side].neurons) if (read.has(i)) throw new Error(`Neuron ${i} is both driven by the ${side} eye and read`);
        this.sim.addRatedInput(`eye ${side}`, retina[side].neurons);
      }
      for (const side of ["left", "right"] as const) {
        for (const { stage, select } of VISION_STAGES) {
          const neurons = select === "lamina" ? retina[side].neurons : connectome.find({ ...select, side });
          if (neurons.length === 0) continue;
          this.sim.addReadout(stageName(stage, side), neurons);
          this.#vision.push({ name: stageName(stage, side), size: neurons.length });
          this.rates[stageName(stage, side)] = 0;
        }
      }
    }
    for (const { spec, neurons } of this.wiring.senses) if (spec.afterEyes) this.sim.addInput(spec.name, neurons);
    // After those, so they too leave every other input's stream as it was.
    for (const { spec, neurons } of this.wiring.state) this.sim.addInput(spec.name, neurons);
    // L1's withdrawals under brightening (vision.ts) last of all, so every other input's stream is as it was without them.
    if (this.vision) for (const side of ["left", "right"] as const) this.sim.addRatedInput(`eye ${side} withdrawn`, this.vision.retina[side].l1, { withdraw: true });
    // The thermoreceptors after even those: with no temperature felt, every stream is as it was before them.
    for (const { spec, neurons } of this.wiring.thermo) this.sim.addInput(spec.name, neurons);
    // The receptor neurons of smell after even those: with no odour (and no
    // resting firing) every stream is as it was before them.
    this.smell = wireOlfaction(connectome);
    this.restingSmell = options.restingSmell ?? false;
    const readouts = new Set(this.wiring.readouts.flatMap((group) => [...group.neurons]));
    for (const { name, neurons, spontaneous } of this.smell) {
      for (const i of neurons) if (readouts.has(i)) throw new Error(`Neuron ${i} is both driven by "${name}" and read`);
      this.sim.addInput(name, neurons, this.restingSmell ? spontaneous : 0);
    }
    // A separate stream from the Poisson inputs', which inputSeed derives from the same seed.
    this.state = new InternalState((seed ^ 0x5bd1e995) >>> 0, options.internalState ?? INTERNAL_STATE);
    this.spontaneous = options.spontaneous ?? true;
  }

  tick(dtMs: number, senses: BrainSenses): BrainState {
    if (!(dtMs >= 0 && dtMs <= MAX_TICK_MS)) throw new Error(`tick takes 0 to ${MAX_TICK_MS} ms, not ${dtMs}`);
    const started = performance.now();
    const spikesBefore = this.sim.stats.spikes;
    const timeBefore = this.sim.time;
    // Checked before anything moves, so a bad picture leaves the brain as it was.
    if (senses.light && this.vision) {
      for (const side of ["left", "right"] as const) {
        const facets = this.vision.retina[side].facets;
        if (senses.light[side]?.length !== facets) throw new Error(`The ${side} eye has ${facets} facets, but the light gives ${senses.light[side]?.length}`);
      }
    }
    for (const [name, rate] of senseRates(this.wiring, senses)) this.sim.setRate(name, rate);
    for (const regional of this.#regional) this.#touch(regional, senses);
    odorOf(senses, this.#odor);
    for (const group of this.smell) this.sim.setRate(group.name, ornRate(group, this.#odor, this.restingSmell));
    const hunger = hungerOf(senses);
    this.modulation.setState(senses, hunger, stateOf);
    this.modulation.update(0);
    this.#modulate();
    this.state.hunger = hunger;
    this.sim.setOutputGain(this.#water, waterOutputGain(thirstOf(senses)));
    for (const { spec, maxRate } of this.wiring.state) this.sim.setRate(spec.name, maxRate * stateOf(senses, spec.state));
    this.state.rest(
      Math.max(stateOf(senses, "clockMorning"), stateOf(senses, "clockEvening")),
      stateOf(senses, "clockSleep"),
      stateOf(senses, "sleepPressure"),
      stateOf(senses, "sleepDepth"),
    );
    const eyeGain = 1 - SLEEP_EYES * this.state.sleepiness();
    const temperature = { left: temperatureOf(senses, "left"), right: temperatureOf(senses, "right") };
    let left = dtMs;
    while (left > 1e-9) {
      const chunk = Math.min(CHUNK_MS, left);
      left -= chunk;
      if (this.spontaneous) {
        this.state.step(chunk / 1000);
        const level = { left: this.state.level("left"), right: this.state.level("right") };
        for (const [name, rate] of backgroundRates(this.wiring, level)) this.sim.setRate(name, rate);
      }
      if (this.vision) {
        for (const side of ["left", "right"] as const) {
          const retina = this.vision.retina[side];
          const changed = retina.step(chunk, senses.light ? senses.light[side] : null);
          if (!changed && eyeGain === this.#eyeGain) continue;
          if (eyeGain === 1) {
            this.sim.setRates(`eye ${side}`, retina.rates);
            this.sim.setRates(`eye ${side} withdrawn`, retina.withdrawals);
          } else {
            // Sleepiness lowers the lamina's input whichever way the light changes.
            const gained = this.#gained![side];
            for (let n = 0; n < gained.rates.length; n++) gained.rates[n] = retina.rates[n] * eyeGain;
            for (let n = 0; n < gained.withdrawals.length; n++) gained.withdrawals[n] = retina.withdrawals[n] * eyeGain;
            this.sim.setRates(`eye ${side}`, gained.rates);
            this.sim.setRates(`eye ${side} withdrawn`, gained.withdrawals);
          }
        }
        this.#eyeGain = eyeGain;
      }
      this.#feelTemperature(temperature, chunk);
      const before = this.sim.time;
      this.sim.advance(chunk);
      const ran = this.sim.time - before;
      if (ran <= 0) continue;
      this.sim.drainTally(this.modulation.counts);
      this.modulation.update(ran);
      this.#modulate();
      this.sim.drainReadouts(this.#counts);
      for (const { spec, neurons } of this.wiring.readouts) {
        const hz = (this.#counts[spec.name] / neurons.length / ran) * 1000;
        this.rates[spec.name] = smooth(this.rates[spec.name], hz, ran, spec.tau);
      }
      this.sim.drainPartition(this.#regionCounts);
      for (let r = 0; r < REGIONS.length; r++) {
        const size = this.#regionSizes[r];
        if (size === 0) continue;
        const name = REGION_RATE_NAMES[r];
        this.rates[name] = smooth(this.rates[name], (this.#regionCounts[r] / size / ran) * 1000, ran, REGION_TAU);
      }
      for (const { name, size } of this.#vision) {
        this.rates[name] = smooth(this.rates[name], (this.#counts[name] / size / ran) * 1000, ran, VISION_TAU);
      }
    }
    return {
      command: decode(this.rates),
      stats: {
        simMs: this.sim.time - timeBefore,
        wallMs: performance.now() - started,
        spikes: this.sim.stats.spikes - spikesBefore,
        active: this.sim.active,
        rates: { ...this.rates },
      },
    };
  }

  /** Sets each antenna's heating and cooling cells' rates for the next `ms`, and adapts them that much further (thermo.ts). */
  #feelTemperature(temperature: { left: number; right: number }, ms: number) {
    const rates = this.#thermoRates;
    for (const side of ["left", "right"] as const) {
      this.thermoreceptors.step(side, temperature[side], ms, rates);
      for (const { spec } of this.wiring.thermo) if (spec.side === side) this.sim.setRate(spec.name, rates[spec.cell]);
    }
  }

  // Sets a group of regions' rates, where any region's has changed: setting them redraws the input's next spike, so only then.
  #touch({ group, rates, felt }: Regional, senses: BrainSenses) {
    const { ends, spec } = group;
    let changed = false;
    for (let r = 0; r < ends!.length; r++) {
      const rate = regionRate(group, spec.regions![r], senses);
      if (rate === felt[r]) continue;
      felt[r] = rate;
      changed = true;
      rates.fill(rate, r === 0 ? 0 : ends![r - 1], ends![r]);
    }
    if (changed) this.sim.setRates(spec.name, rates);
  }

  // Hands what the receptors do now to the simulation: release factors and excitability.
  #modulate() {
    for (const { route, name } of this.#release) this.sim.setOutputGains(name, this.modulation.routes[route].factors!);
    if (this.modulation.excitable.length > 0) this.sim.setExcitability("modulated", this.modulation.bias);
  }
}

/** Builds a running brain from a packed connectome. */
export function createBrain(data: ArrayBuffer, options: { seed?: number } = {}): Brain {
  if (!(data instanceof ArrayBuffer)) throw new ConnectomeFormatError("The brain needs the packed connectome as an ArrayBuffer");
  const seed = options.seed ?? 1;
  if (!Number.isInteger(seed)) throw new Error(`The seed must be a whole number, not ${seed}`);
  return new FlyBrain(loadConnectome(data), { seed });
}
