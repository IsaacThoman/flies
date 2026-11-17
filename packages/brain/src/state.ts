// Internal state the connectome doesn't contain: how aroused the fly is, and
// how much there is to see on each side. Neither is a neuron in the data; both
// are stand-ins, and both act only by setting the background firing rate of
// the visual projection neurons of each eye (io.ts, BACKGROUND). Nothing here
// touches a neuron that is read out.
//
// Each is an Ornstein-Uhlenbeck process: it wanders around 0 with standard
// deviation 1 and forgets its past over `tau` seconds. An eye's background
// level is
//
//   logistic(arousal.weight × arousal + scene.weight × scene[eye] + bias
//            + hunger.weight × (hunger - 1) + sleep)
//
// from 0 to 1, multiplying that eye's maximum background rate.
//
// The hunger term is a stand-in too, for starvation-induced hyperactivity:
// starved flies walk more, through the fat body's adipokinetic hormone on
// octopaminergic neurons (Lee & Park 2004, Genetics 167: 311; Yang et al.
// 2015, PNAS 112: 5219; Yu et al. 2016, eLife 5: e15693). Neither the hormone
// nor octopamine's effects are in the model (octopamine's output is muted,
// params.ts), so hunger acts here, on the same background the arousal sets.
// It is 0 at hunger 1, where the brain is what it was before it had a hunger
// (io.ts, HUNGER), and lowers the background as the fly is fed. Its weight is
// the one fitted number here, to a tenth: it makes a just-fed fly walk at rest
// about 1/1.6 as much as a starved one (report.ts section c, 10 minutes, seeds
// 1 to 3: 1/1.52 to 1/1.59 at 0.9, 1/1.63 to 1/1.75 at 1), as Yu et al.
// measured: about 60% more locomotion in starved flies than fed ones (their
// Figure 1d).
//
// Sleep adds a term of its own inside the logistic (`sleep`): the clock's
// morning and evening oscillators raise arousal, and its push toward sleep,
// the homeostatic sleep pressure and how deeply the fly sleeps lower it, all
// as the body reports them (types.ts). In the fly the clock reaches sleep and
// wake mostly through peptides (PDF, DH31, CNMa among them) and the
// homeostat through modulated excitability, none of which the connectome
// has; driving the clock neurons and the sleep-promoting neurons that it does
// have reaches no command (README, Sleep and the daily rhythm). So this term
// stands for them: a made-up shift of arousal, labelled as such, that moves
// the spontaneous activity the background drives. The wandering arousal still
// crosses it, so sleep and waking come in bouts of the arousal's own making.
// Left out, it is 0 and the background is what it was.

import { mulberry32 } from "./sim.ts";

export const INTERNAL_STATE = {
  arousal: { tau: 10, weight: 1.6 },
  scene: { tau: 4, weight: 1.5 },
  bias: -1,
  hunger: { weight: 0.9 },
  // How far the clock's oscillators raise arousal, and its push toward sleep, sleep pressure and sleep depth lower it, at 1.
  sleep: { wake: 1, clock: 3.5, pressure: 4, depth: 4 },
} as const;

export type InternalStateParameters = {
  arousal: { tau: number; weight: number };
  scene: { tau: number; weight: number };
  bias: number;
  hunger: { weight: number };
  sleep: { wake: number; clock: number; pressure: number; depth: number };
};

/** A zero-mean, unit-variance Ornstein-Uhlenbeck process with time constant tau (s). */
export class Wander {
  value = 0;
  readonly tau: number;
  #normal: () => number;

  constructor(tau: number, normal: () => number) {
    this.tau = tau;
    this.#normal = normal;
  }

  /** Advances by dt seconds, exactly (the update is the process's own transition). */
  step(dt: number) {
    const keep = Math.exp(-dt / this.tau);
    this.value = this.value * keep + Math.sqrt(1 - keep * keep) * this.#normal();
    return this.value;
  }
}

/** Standard normal numbers from a seeded uniform generator (Box-Muller). */
export function normals(seed: number): () => number {
  const uniform = mulberry32(seed);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const out = spare;
      spare = null;
      return out;
    }
    const u = 1 - uniform();
    const v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

export class InternalState {
  readonly parameters: InternalStateParameters;
  readonly arousal: Wander;
  readonly scene: { left: Wander; right: Wander };
  /** How hungry the fly is, 0..1 (io.ts, hungerOf); set by the brain each tick. */
  hunger = 1;
  /** The sleep term: how far the clock, sleep pressure and sleep depth move arousal now (above 0 at the clock's peaks). */
  sleep = 0;

  constructor(seed: number, parameters: InternalStateParameters = INTERNAL_STATE) {
    this.parameters = parameters;
    const normal = normals(seed);
    this.arousal = new Wander(parameters.arousal.tau, normal);
    this.scene = { left: new Wander(parameters.scene.tau, normal), right: new Wander(parameters.scene.tau, normal) };
  }

  /** Advances by dt seconds. */
  step(dt: number) {
    this.arousal.step(dt);
    this.scene.left.step(dt);
    this.scene.right.step(dt);
  }

  /** Sets the sleep term from the clock's oscillators (the higher of the two), its push toward sleep, sleep pressure and sleep depth, each 0 to 1. */
  rest(wake: number, clockSleep: number, pressure: number, depth: number) {
    const { sleep } = this.parameters;
    this.sleep = sleep.wake * wake - (sleep.clock * clockSleep + sleep.pressure * pressure + sleep.depth * depth);
  }

  /** How sleepy the term makes it, 0 to 1: how far it lowers arousal against the clock's full push toward sleep. */
  sleepiness() {
    return Math.min(1, Math.max(0, -this.sleep / this.parameters.sleep.clock));
  }

  /** The background level of one eye, 0 to 1. */
  level(eye: "left" | "right") {
    const { arousal, scene, bias, hunger } = this.parameters;
    return logistic(arousal.weight * this.arousal.value + scene.weight * this.scene[eye].value + bias + hunger.weight * (this.hunger - 1) + this.sleep);
  }
}
