// How the game talks to the brain, wherever it runs: a Web Worker running the
// TypeScript simulation in a browser, or native code on its own thread in the
// Apple TV app, where JavaScript is too slow for it.

import type { BrainEngine, BrainSenses, BrainState, EyeMap } from "@fly/brain";

export type BrainStatus = "loading" | "running" | "failed";

/** A running brain. Every method returns at once; the simulation happens elsewhere. */
export interface BrainDriver {
  readonly status: BrainStatus;
  /** What went wrong, when failed. */
  readonly error: string | null;
  /** Neurons and connected pairs, once running. */
  readonly neurons: number;
  readonly connections: number;
  /** Where the eyes' facets look, once running; null if this brain has no eyes. */
  readonly eyes: EyeMap | null;
  /** Which build of the brain runs, once running, for tests and measurements; a stand-in has none. */
  readonly engine?: BrainEngine | null;
  /** The brain's latest answer, or null before the first. */
  readonly state: BrainState | null;
  /**
   * Each region's smoothed firing rate, Hz, in the order of `REGIONS`
   * (`@fly/brain`), as of `state`: its `region.<id>` rate, for reading every
   * frame without allocating. Filled in place, so keep the reference; 0
   * before the first state, and for a region the brain doesn't report.
   */
  readonly regionRates: Float32Array;
  /** `performance.now()` when `state` arrived. */
  readonly stateAt: number;
  /**
   * Hands the brain what the body feels now, for the `dtMs` of fly time since
   * the last call. If the brain is still busy the time is added to its next
   * step, up to a limit; beyond that it is dropped, so a slow brain runs
   * slower than real time instead of falling further behind.
   */
  tick(dtMs: number, senses: BrainSenses): void;
  /**
   * What the fly's mushroom body has learned (`Brain.memory` in @fly/brain),
   * as bytes to keep with the fly: versioned and tied to the connectome, a
   * few bytes for each synapse that has changed. Resolves once the brain
   * answers, or null if it isn't running or stops first. A stand-in has none.
   */
  exportMemory?(): Promise<Uint8Array | null>;
  /**
   * Gives the brain back what `exportMemory` gave, from this fly's last run:
   * resolves true once it has taken it, false if it refused it (another
   * connectome, another version, damaged bytes) or isn't running, keeping
   * what it had. Given while it loads, it is taken as it starts.
   */
  importMemory?(memory: Uint8Array): Promise<boolean>;
  dispose(): void;
}

/**
 * The order the scalar senses are packed in for the native brain. `grounded` is 0 or 1; `hunger` and `thirst`, internal
 * state rather than senses, are 1 when the body keeps no account of them (BrainSenses.hunger, .thirst); the daily clock and sleep, touch where it lands and the legs are 0 when left out.
 * The temperature at each antenna (°C) is NaN when left out: no temperature felt.
 */
export const SENSE_ORDER = [
  "loomLeft",
  "loomRight",
  "touch",
  "bumpLeft",
  "bumpRight",
  "wind",
  "sweet",
  "grounded",
  "maleTaste",
  "hunger",
  "wingbeat",
  "clockMorning",
  "clockEvening",
  "clockSleep",
  "sleepPressure",
  "sleepDepth",
  "bitter",
  "water",
  "thirst",
  "temperatureLeft",
  "temperatureRight",
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
  "legsLeft",
  "legsRight",
] as const;
/** The order commands come back in from the native brain. */
export const COMMAND_ORDER = ["walk", "turn", "back", "escape", "wings", "groom", "feed", "sing", "lean"] as const;
/** After the commands in a native state: simulated ms, wall ms, spikes and active neurons of the last step, then one rate per `rateNames()` entry. */
export const STATE_STATS = ["simMs", "wallMs", "spikes", "active"] as const;

/**
 * `globalThis.__native.brain` in the Apple TV app. The host runs the C++
 * simulation (packages/brain-native) on its own thread and loads the
 * connectome bundled with the app.
 */
export interface NativeBrainBridge {
  /** Starts loading the brain. Call once. */
  start(seed: number): void;
  /** "loading" from before `start` until the brain is running. */
  status(): BrainStatus;
  /** What went wrong, or "" */
  error(): string;
  /** Valid once running. */
  neurons(): number;
  connections(): number;
  /** Facet directions of the left (0) or right (1) eye as x, y, z triples; empty when the brain has no eyes. */
  eyeDirections(side: 0 | 1): Float32Array;
  eyeAcceptance(): number;
  /** Names of the rates that follow the commands and stats in a state. */
  rateNames(): string[];
  /**
   * Queues `dtMs` of fly time under these senses (`scalars` in SENSE_ORDER;
   * then five odor strengths per antenna, left then right, in ODORANTS order;
   * the light arrays one value per facet, or null with the eyes shut).
   * Never blocks: the brain thread picks it up.
   */
  submit(dtMs: number, scalars: Float32Array, lightLeft: Float32Array | null, lightRight: Float32Array | null): void;
  /**
   * Copies the latest state into `out` (COMMAND_ORDER, STATE_STATS, then the
   * rates) and returns how many states the brain has produced so far, so the
   * caller can tell a new one from the one it already has. 0 means none yet.
   */
  read(out: Float32Array): number;
  /**
   * Another brain, a fly's own, on a thread of its own, from the same
   * connectome: started with `start` as this one is. Only the first brain's
   * bridge has it, and a host from before there could be several has none.
   */
  spawn?(): NativeBrainBridge;
  /** Stops a spawned brain's thread and frees it: its fly is gone. Not the first's, which the host keeps. */
  stop?(): void;
  /**
   * Asks the brain thread for what the brain has learned (fly_brain_memory),
   * between its steps; returns the request's number, for `memory`. A host
   * from before the brain learned has none of these four.
   */
  requestMemory?(): number;
  /** The bytes the brain thread wrote for request `request` or a later one, or null until it has. */
  memory?(request: number): Uint8Array | null;
  /** Hands the brain thread a memory to take back (fly_brain_remember) before its next step, even while it loads; returns the request's number. */
  remember?(memory: Uint8Array): number;
  /** For request `request`: null until the brain thread has dealt with it, then "" if it took the memory or why it didn't. */
  remembered?(request: number): string | null;
}
