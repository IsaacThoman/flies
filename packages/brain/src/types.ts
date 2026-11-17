// The contract between the fly brain and whatever body it drives.
//
// Left and right are the fly's own left and right. The body decides how its
// world maps onto them.

/**
 * What the body feels, each tick. Intensities run from 0 (nothing) to 1 (as
 * strong as it gets); the brain turns them into firing rates of the sensory
 * neurons that carry that sense in the fly.
 */
export type BrainSenses = {
  /** Something growing fast in the left or right eye: an approaching threat. */
  loomLeft: number;
  loomRight: number;
  /** Something touching the body: stroked, poked or held. */
  touch: number;
  /** The left or right antenna pressed against something. */
  bumpLeft: number;
  bumpRight: number;
  /** Air rushing past: carried quickly, thrown or falling. */
  wind: number;
  /** Something sweet on the mouthparts. */
  sweet: number;
  /** Standing on its feet, rather than held or in the air: the weight on its legs. */
  grounded: boolean;
  /**
   * What the eyes see: how bright each facet's patch of the world is, from 0
   * (black) to 1 (white), in the order of the brain's `eyes`. Leave it out and
   * the eyes are shut: the visual system gets no input.
   */
  light?: { left: ArrayLike<number>; right: ArrayLike<number> };
  /**
   * The front legs touching another male fly: the taste of his cuticle's
   * pheromones (7-tricosene) on the forelegs' taste bristles. Every other fly
   * this one meets is a male.
   */
  maleTaste: number;
  /**
   * How hungry it is, from 0 (just fed) to 1 (starved for a day), as the body
   * keeps account of it: internal state, not a sense. It sets how strongly
   * the sweet taste neurons pass on what they taste (dopamine does this on
   * their terminals in the fly) and adds to the made-up arousal (state.ts).
   * Leave it out, or anything not a number, and the brain is what it was
   * before it had a hunger: a hungry fly's, at 1.
   */
  hunger?: number;
  /**
   * How thirsty it is, from 0 (just drunk) to 1 (hours in dry air), as the
   * body keeps account of it: internal state, not a sense. It sets how
   * strongly the water taste neurons pass on what they taste, a stand-in for
   * the thirst signals that gate water drinking downstream of them in the fly
   * (io.ts, THIRST). Leave it out, or anything not a number, and the brain is
   * what it was before it had a thirst: a thirsty fly's, at 1.
   */
  thirst?: number;
  /**
   * How hard its own wings beat, from folded (0) to full flight power (1):
   * what the wings' and halteres' strain sensors feel of each stroke.
   */
  wingbeat: number;
  /** Something bitter on the mouthparts. */
  bitter: number;
  /** Water on the mouthparts: plain water, not a sugary or salty liquid. */
  water: number;
  /*
   * Internal state, not senses: the fly's daily clock and its need for
   * sleep, which the connectome can't supply (the clock is molecular and its
   * outputs are mostly peptides; README, Sleep and the daily rhythm). The body
   * works them out from the time of day and its own stillness. Each runs 0 to
   * 1; left out, 0: a rested fly with no clock, the brain as it ran before
   * them.
   */
  /** The morning oscillator, the M cells (s-LNv, l-LNv): up around dawn. */
  clockMorning?: number;
  /** The evening oscillator, the E cells (LNd, the 5th s-LNv): up around dusk. */
  clockEvening?: number;
  /** The clock's push toward sleep: whenever neither oscillator is up, most at night. */
  clockSleep?: number;
  /** Homeostatic sleep pressure: builds while it is awake and discharges while it sleeps. */
  sleepPressure?: number;
  /** How deeply it sleeps: 0 awake, rising to 1 over a bout's first quarter of an hour. */
  sleepDepth?: number;
  /**
   * The air's temperature at the left and right antenna's arista, °C: what
   * its heating and cooling cells feel (thermo.ts turns it into their
   * firing; the brain does the rest). A physical temperature, not a
   * judgement of it: the game sets what the world is, at each antenna, every
   * tick. Left out, or not a number, that antenna's thermoreceptors get no
   * input: the brain as it was before it had them.
   */
  temperatureLeft?: number;
  temperatureRight?: number;
};

/**
 * One compound eye as the model has it: a facet for every column of that
 * side's optic lobe. `directions` holds a unit vector per facet (x, y, z, one
 * after another), the way the facet looks out in the fly's head frame: x
 * toward the fly's right, y straight ahead, z up.
 */
export type Eye = { directions: Float32Array };

/** Both eyes, and how wide a cone each facet takes in (its half-angle, radians). */
export type EyeMap = { left: Eye; right: Eye; acceptance: number };

/**
 * What the brain wants the body to do, read from the descending and motor
 * neurons that command each action in the fly. All but `turn` run 0 to 1.
 */
export type BrainCommand = {
  /** Drive to walk forwards. */
  walk: number;
  /** Steering: -1 is hard toward the fly's left, 1 hard toward its right. */
  turn: number;
  /** Drive to walk backwards. */
  back: number;
  /** Escape take-off (the giant fiber). */
  escape: number;
  /** Flight: the wing power muscles. */
  wings: number;
  /** Grooming with the front legs. */
  groom: number;
  /** Feeding: extending the mouthparts. */
  feed: number;
  /** Courtship song: one wing out and vibrating (pIP10, the song command neuron). */
  sing: number;
};

export type BrainStats = {
  /** Simulated time covered by this tick, in ms. */
  simMs: number;
  /** Wall-clock time the tick took, in ms. */
  wallMs: number;
  /** Spikes fired during this tick. */
  spikes: number;
  /** Neurons with any activity at the end of the tick. */
  active: number;
  /**
   * Smoothed firing rate (Hz) of each group of neurons the brain reads from.
   * Groups named `vision.<stage>` follow what the eyes see inward, stage by
   * stage, for display; they don't feed any command.
   */
  rates: Record<string, number>;
};

export type BrainState = { command: BrainCommand; stats: BrainStats };

export interface Brain {
  /** Neurons and connected pairs in the loaded connectome. */
  readonly neurons: number;
  readonly connections: number;
  /** Where each facet of the eyes looks, or null when this brain has no eyes to drive. */
  readonly eyes: EyeMap | null;
  /** Advances the simulation by `dtMs` of fly time under these senses. */
  tick(dtMs: number, senses: BrainSenses): BrainState;
}

/** Which build of the brain runs: this TypeScript, or packages/brain-native's C++ as WebAssembly or native code. */
export type BrainEngine = "typescript" | "wasm" | "native";

/** Messages to the worker that runs the brain. */
export type BrainRequest =
  /**
   * The packed connectome (see format.ts), and the brain to build from it:
   * this one, or, given `module`, packages/brain-native built as WebAssembly
   * (its fly-brain.wasm), the same simulation compiled. Transferred, not copied.
   */
  | { type: "init"; data: ArrayBuffer; module?: ArrayBuffer }
  | { type: "tick"; dtMs: number; senses: BrainSenses };

/** Messages from the worker. Every "tick" gets exactly one "state". */
export type BrainResponse =
  | { type: "ready"; neurons: number; connections: number; eyes: EyeMap | null; engine: BrainEngine }
  | { type: "state"; state: BrainState }
  | { type: "error"; message: string };

export const RESTING_SENSES: BrainSenses = {
  loomLeft: 0,
  loomRight: 0,
  touch: 0,
  bumpLeft: 0,
  bumpRight: 0,
  wind: 0,
  sweet: 0,
  grounded: true,
  maleTaste: 0,
  wingbeat: 0,
  bitter: 0,
  water: 0,
};
