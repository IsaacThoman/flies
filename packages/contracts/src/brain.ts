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
  dispose(): void;
}

/**
 * The order the scalar senses are packed in for the native brain. `grounded` is 0 or 1; `hunger`, internal
 * state rather than a sense, is 1 when the body keeps no account of it (BrainSenses.hunger); the daily clock and sleep after it are 0 when left out.
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
] as const;
/** The order commands come back in from the native brain. */
export const COMMAND_ORDER = ["walk", "turn", "back", "escape", "wings", "groom", "feed", "sing"] as const;
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
}
