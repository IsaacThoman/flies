// The brain in a browser: packages/brain in a Web Worker, fed the packed
// connectome. At most one tick is with the worker at a time; fly time that
// passes while it is busy goes out with the next tick, up to MAX_TICK_MS, and
// beyond that is dropped, so a slow brain runs slower than real time instead
// of falling further behind.

import { REGION_RATE_NAMES } from "@fly/brain";
import type { BrainRequest, BrainResponse, BrainSenses, BrainState, EyeMap } from "@fly/brain";
import type { BrainDriver, BrainStatus } from "@fly/contracts";
import { BrainLoadError } from "./download.ts";
import type { LoadFailure } from "./download.ts";

export type BrainWorkerPort = {
  post(request: BrainRequest, transfer?: Transferable[]): void;
  terminate(): void;
};
export type BrainWorkerFactory = (onMessage: (response: BrainResponse) => void, onError: (message: string) => void) => BrainWorkerPort;

/** Most fly time one tick covers, ms. */
export const MAX_TICK_MS = 100;
/** A tick unanswered for this long while the game runs means the brain has stalled. */
export const STALL_MS = 2000;
/** Building the brain may take a while, but not this long. */
export const LOAD_TIMEOUT_MS = 30_000;
/**
 * The most of the time between two frames that counts toward a stall or the
 * build's timeout: a longer gap is the page hidden or the computer asleep,
 * when nothing was waiting on the brain.
 */
export const MAX_WAIT_STEP_MS = 250;

/** Where the connectome comes from (download.ts), as the loading screen follows it. */
export interface BrainSource {
  load(onProgress: () => void): Promise<ArrayBuffer>;
  /** Forgets a kept copy the brain couldn't be built from. */
  discard(): Promise<void>;
  readonly received: number;
  readonly total: number;
  readonly from: "cache" | "network" | null;
  readonly storageFull: boolean;
}

/** Why the brain isn't running: a load failure, or the brain itself crashing or stalling. */
export type BrainFailure = LoadFailure | "brain";

const DAMAGED = /damaged|incomplete|isn't the fly's brain|longer than|Corrupt connectome|Truncated connectome|Not a connectome/;

function failureOf(message: string, building: boolean): BrainFailure {
  if (/DecompressionStream|Worker is not defined|module worker/i.test(message)) return "unsupported";
  if (/allocation failed|out of memory|Invalid array buffer length/i.test(message)) return "memory";
  return building && DAMAGED.test(message) ? "damaged" : "brain";
}

export class WorkerBrainDriver implements BrainDriver {
  status: BrainStatus = "loading";
  error: string | null = null;
  /** Why it failed, for the loading screen. */
  failure: BrainFailure | null = null;
  neurons = 0;
  connections = 0;
  eyes: EyeMap | null = null;
  state: BrainState | null = null;
  stateAt = 0;
  readonly regionRates = new Float32Array(REGION_RATE_NAMES.length);
  readonly source: BrainSource;
  /** "download" while the connectome arrives, "build" while the worker wires it up. */
  phase: "download" | "build" | "done" = "download";
  #createWorker: BrainWorkerFactory;
  #worker: BrainWorkerPort | null = null;
  #now: () => number;
  /** Each load gets its own number, so a late answer from one that was given up on is ignored. */
  #attempt = 0;
  #lastTickAt = -1;
  #buildingMs = 0;
  #waitedMs = 0;
  #inFlight = false;
  #pendingMs = 0;
  #disposed = false;

  constructor({ createWorker, source, now = () => performance.now() }: { createWorker: BrainWorkerFactory; source: BrainSource; now?: () => number }) {
    this.#createWorker = createWorker;
    this.source = source;
    this.#now = now;
    this.#start();
  }

  /** How much of the connectome has arrived, 0 to 1. */
  get progress() {
    const { received, total } = this.source;
    return this.phase === "download" ? (total > 0 ? Math.min(1, received / total) : 0) : 1;
  }

  /** Starts again after a failure: what has arrived is kept, and a download carries on from where it stopped. */
  retry() {
    if (this.status !== "failed" || this.#disposed) return;
    // Damage found only as the brain was built got past the checks a part is kept on (no digest to check against, here): forget what was kept.
    const discard = this.failure === "damaged" && this.phase === "build";
    this.status = "loading";
    this.error = null;
    this.failure = null;
    this.phase = "download";
    this.state = null;
    this.eyes = null;
    if (discard) void this.source.discard().then(() => this.#start());
    else this.#start();
  }

  #start() {
    const attempt = ++this.#attempt;
    this.#buildingMs = 0;
    this.source.load(() => {}).then(
      (data) => {
        if (this.#disposed || attempt !== this.#attempt || this.status !== "loading") return;
        this.phase = "build";
        try {
          this.#worker = this.#createWorker(
            (response) => attempt === this.#attempt && this.#receive(response),
            (message) => attempt === this.#attempt && this.#fail(message),
          );
          this.#worker.post({ type: "init", data }, [data]);
        } catch (error) {
          this.#fail(error instanceof Error ? error.message : String(error), "unsupported");
        }
      },
      (error: unknown) => {
        if (attempt !== this.#attempt) return;
        if (error instanceof BrainLoadError) this.#fail(error.message, error.kind);
        else this.#fail(error instanceof Error ? error.message : "Couldn't read the fly brain's data.", "download");
      },
    );
  }

  tick(dtMs: number, senses: BrainSenses): void {
    const now = this.#now();
    const waited = this.#lastTickAt < 0 ? 0 : Math.min(MAX_WAIT_STEP_MS, Math.max(0, now - this.#lastTickAt));
    this.#lastTickAt = now;
    if (this.status === "loading") {
      if (!this.#worker) return;
      this.#buildingMs += waited;
      if (this.#buildingMs > LOAD_TIMEOUT_MS) this.#fail("The fly's brain took too long to start.", "brain");
      return;
    }
    if (this.status !== "running" || !this.#worker) return;
    this.#pendingMs = Math.min(this.#pendingMs + Math.max(0, Number.isFinite(dtMs) ? dtMs : 0), MAX_TICK_MS);
    if (this.#inFlight) {
      this.#waitedMs += waited;
      if (this.#waitedMs > STALL_MS) this.#fail("The fly's brain stopped responding.", "brain");
      return;
    }
    if (this.#pendingMs <= 0) return;
    this.#inFlight = true;
    this.#waitedMs = 0;
    const dt = this.#pendingMs;
    this.#pendingMs = 0;
    const { light, ...scalars } = senses;
    // Copied: the caller reuses its senses and light arrays every frame.
    const sent: BrainSenses = light ? { ...scalars, light: { left: Float32Array.from(light.left), right: Float32Array.from(light.right) } } : { ...scalars };
    this.#worker.post({ type: "tick", dtMs: dt, senses: sent });
  }

  dispose(): void {
    this.#disposed = true;
    this.#worker?.terminate();
    this.#worker = null;
    this.#inFlight = false;
  }

  #receive(response: BrainResponse) {
    if (this.#disposed) return;
    switch (response.type) {
      case "ready":
        if (this.status !== "loading") return;
        this.neurons = response.neurons;
        this.connections = response.connections;
        this.eyes = response.eyes;
        this.status = "running";
        this.phase = "done";
        break;
      case "state":
        if (!this.#inFlight) return;
        this.#inFlight = false;
        this.state = response.state;
        this.stateAt = this.#now();
        for (let r = 0; r < REGION_RATE_NAMES.length; r++) this.regionRates[r] = response.state.stats.rates[REGION_RATE_NAMES[r]] ?? 0;
        break;
      case "error":
        this.#fail(response.message);
        break;
    }
  }

  #fail(message: string, failure: BrainFailure = failureOf(message, this.phase === "build")) {
    if (this.#disposed) return;
    this.#worker?.terminate();
    this.#worker = null;
    this.#inFlight = false;
    this.#pendingMs = 0;
    this.status = "failed";
    this.error = message;
    this.failure = failure;
  }
}
