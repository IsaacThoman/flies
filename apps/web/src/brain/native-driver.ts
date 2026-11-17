// The brain on the Apple TV: the native simulation the host runs on its own
// thread, behind `globalThis.__native.brain`. JavaScript there has no JIT, so
// this wrapper allocates nothing per frame: the senses go out through reused
// arrays, and each new state is decoded into the same objects.

import { REGION_RATE_NAMES } from "@fly/brain";
import type { BrainSenses, BrainState, EyeMap } from "@fly/brain";
import { COMMAND_ORDER, SENSE_ORDER, STATE_STATS } from "@fly/contracts";
import type { BrainDriver, BrainStatus, NativeBrainBridge } from "@fly/contracts";

/** Fly time handed over per frame is capped, as in the worker driver, ms. */
export const MAX_TICK_MS = 100;

export class NativeBrainDriver implements BrainDriver {
  status: BrainStatus = "loading";
  error: string | null = null;
  neurons = 0;
  connections = 0;
  eyes: EyeMap | null = null;
  engine: "native" | null = null;
  state: BrainState | null = null;
  stateAt = 0;
  readonly regionRates = new Float32Array(REGION_RATE_NAMES.length);
  readonly #bridge: NativeBrainBridge;
  readonly #now: () => number;
  readonly #scalars = new Float32Array(SENSE_ORDER.length);
  #lightLeft: Float32Array | null = null;
  #lightRight: Float32Array | null = null;
  #rateNames: string[] = [];
  // Where each region's rate is in a state, or -1 when the brain doesn't report it.
  readonly #regionAt = new Int32Array(REGION_RATE_NAMES.length).fill(-1);
  #out = new Float32Array(COMMAND_ORDER.length + STATE_STATS.length);
  #seen = 0;
  #decoded: BrainState = {
    command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0 },
    stats: { simMs: 0, wallMs: 0, spikes: 0, active: 0, rates: {} },
  };

  constructor(bridge: NativeBrainBridge, { seed = 1, now = () => performance.now() }: { seed?: number; now?: () => number } = {}) {
    this.#bridge = bridge;
    this.#now = now;
    try {
      bridge.start(seed);
    } catch (error) {
      this.#fail(error);
    }
  }

  tick(dtMs: number, senses: BrainSenses): void {
    if (this.status === "failed") return;
    const bridge = this.#bridge;
    try {
      if (this.status === "loading") {
        const status = bridge.status();
        if (status === "failed") {
          this.status = "failed";
          this.error = bridge.error() || "The fly's brain failed to start.";
          return;
        }
        if (status !== "running") return;
        this.#begin();
      }
      const s = this.#scalars;
      for (let i = 0; i < SENSE_ORDER.length; i++) {
        const name = SENSE_ORDER[i];
        s[i] = name === "grounded" ? (senses.grounded ? 1 : 0) : name === "hunger" ? (senses.hunger ?? 1) : (senses[name] ?? 0);
      }
      let left: Float32Array | null = null;
      let right: Float32Array | null = null;
      if (senses.light && this.#lightLeft && this.#lightRight) {
        copyInto(this.#lightLeft, senses.light.left);
        copyInto(this.#lightRight, senses.light.right);
        left = this.#lightLeft;
        right = this.#lightRight;
      }
      const dt = Math.min(MAX_TICK_MS, Math.max(0, Number.isFinite(dtMs) ? dtMs : 0));
      if (dt > 0) bridge.submit(dt, s, left, right);
      const count = bridge.read(this.#out);
      if (count > this.#seen) {
        this.#seen = count;
        this.#decode();
        this.state = this.#decoded;
        this.stateAt = this.#now();
      }
      if (bridge.status() === "failed") {
        this.status = "failed";
        this.error = bridge.error() || "The fly's brain stopped.";
      }
    } catch (error) {
      this.#fail(error);
    }
  }

  dispose(): void {
    // The host keeps the first brain's thread for the app's lifetime; another fly's goes with it.
    this.#bridge.stop?.();
    this.status = "failed";
    this.error = "Stopped.";
  }

  #begin() {
    const bridge = this.#bridge;
    this.neurons = bridge.neurons();
    this.connections = bridge.connections();
    this.#rateNames = bridge.rateNames();
    const first = COMMAND_ORDER.length + STATE_STATS.length;
    this.#out = new Float32Array(first + this.#rateNames.length);
    for (const name of this.#rateNames) this.#decoded.stats.rates[name] = 0;
    REGION_RATE_NAMES.forEach((name, r) => {
      const k = this.#rateNames.indexOf(name);
      this.#regionAt[r] = k < 0 ? -1 : first + k;
    });
    const left = bridge.eyeDirections(0);
    const right = bridge.eyeDirections(1);
    if (left.length > 0 && right.length > 0) {
      this.eyes = { left: { directions: left }, right: { directions: right }, acceptance: bridge.eyeAcceptance() };
      this.#lightLeft = new Float32Array(left.length / 3);
      this.#lightRight = new Float32Array(right.length / 3);
    }
    this.engine = "native";
    this.status = "running";
  }

  #decode() {
    const out = this.#out;
    const { command, stats } = this.#decoded;
    let i = 0;
    for (const name of COMMAND_ORDER) command[name] = out[i++];
    stats.simMs = out[i++];
    stats.wallMs = out[i++];
    stats.spikes = out[i++];
    stats.active = out[i++];
    for (const name of this.#rateNames) stats.rates[name] = out[i++];
    const regions = this.regionRates;
    const at = this.#regionAt;
    for (let r = 0; r < regions.length; r++) regions[r] = at[r] < 0 ? 0 : out[at[r]];
  }

  #fail(error: unknown) {
    this.status = "failed";
    this.error = error instanceof Error ? error.message : String(error);
  }
}

function copyInto(target: Float32Array, source: ArrayLike<number>) {
  const n = Math.min(target.length, source.length);
  for (let i = 0; i < n; i++) target[i] = source[i];
}

/** The host's brain, if this is the Apple TV app. */
export function nativeBridge(): NativeBrainBridge | null {
  const native = (globalThis as { __native?: { brain?: NativeBrainBridge } }).__native;
  return native?.brain ?? null;
}
