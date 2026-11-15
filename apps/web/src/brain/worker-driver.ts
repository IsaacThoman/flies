// The brain in a browser: packages/brain in a Web Worker, fed the packed
// connectome. At most one tick is with the worker at a time; fly time that
// passes while it is busy goes out with the next tick, up to MAX_TICK_MS, and
// beyond that is dropped, so a slow brain runs slower than real time instead
// of falling further behind.

import type { BrainRequest, BrainResponse, BrainSenses, BrainState, EyeMap } from "@fly/brain";
import type { BrainDriver, BrainStatus } from "@fly/contracts";

export type BrainWorkerPort = {
  post(request: BrainRequest, transfer?: Transferable[]): void;
  terminate(): void;
};
export type BrainWorkerFactory = (onMessage: (response: BrainResponse) => void, onError: (message: string) => void) => BrainWorkerPort;

/** Most fly time one tick covers, ms. */
export const MAX_TICK_MS = 100;
/** A tick unanswered for this long means the brain has stalled. */
export const STALL_MS = 2000;
/** Building the brain may take a while, but not this long. */
export const LOAD_TIMEOUT_MS = 30_000;

export type ConnectomeLoader = (onProgress: (fraction: number) => void) => Promise<ArrayBuffer>;

export class WorkerBrainDriver implements BrainDriver {
  status: BrainStatus = "loading";
  error: string | null = null;
  neurons = 0;
  connections = 0;
  eyes: EyeMap | null = null;
  state: BrainState | null = null;
  stateAt = 0;
  /** How much of the connectome has arrived, 0 to 1, while loading; then 1. */
  progress = 0;
  /** "download" while the connectome arrives, "build" while the worker wires it up. */
  phase: "download" | "build" | "done" = "download";
  #worker: BrainWorkerPort | null = null;
  #now: () => number;
  #loadingSince: number;
  #inFlight = false;
  #sentAt = 0;
  #pendingMs = 0;
  #disposed = false;

  constructor({ createWorker, load, now = () => performance.now() }: { createWorker: BrainWorkerFactory; load: ConnectomeLoader; now?: () => number }) {
    this.#now = now;
    this.#loadingSince = now();
    load((fraction) => {
      if (this.status === "loading") this.progress = Math.max(0, Math.min(1, fraction));
    }).then(
      (data) => {
        if (this.#disposed || this.status !== "loading") return;
        this.progress = 1;
        this.phase = "build";
        try {
          this.#worker = createWorker(
            (response) => this.#receive(response),
            (message) => this.#fail(message),
          );
          this.#loadingSince = this.#now();
          this.#worker.post({ type: "init", data }, [data]);
        } catch (error) {
          this.#fail(error instanceof Error ? error.message : String(error));
        }
      },
      (error: unknown) => this.#fail(error instanceof Error ? error.message : "Couldn't read the fly brain's data."),
    );
  }

  tick(dtMs: number, senses: BrainSenses): void {
    const now = this.#now();
    if (this.status === "loading") {
      if (this.#worker && now - this.#loadingSince > LOAD_TIMEOUT_MS) this.#fail("The fly's brain took too long to start.");
      return;
    }
    if (this.status !== "running" || !this.#worker) return;
    this.#pendingMs = Math.min(this.#pendingMs + Math.max(0, Number.isFinite(dtMs) ? dtMs : 0), MAX_TICK_MS);
    if (this.#inFlight) {
      if (now - this.#sentAt > STALL_MS) this.#fail("The fly's brain stopped responding.");
      return;
    }
    if (this.#pendingMs <= 0) return;
    this.#inFlight = true;
    this.#sentAt = now;
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
        break;
      case "error":
        this.#fail(response.message);
        break;
    }
  }

  #fail(message: string) {
    if (this.#disposed) return;
    this.#worker?.terminate();
    this.#worker = null;
    this.#inFlight = false;
    this.status = "failed";
    this.error = message;
  }
}

/** Fetches the packed connectome, reporting how much has arrived. */
export function fetchConnectome(url: string): ConnectomeLoader {
  return async (onProgress) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(response.status === 404 ? "The fly's brain isn't installed here (connectome.bin is missing: npm run brain:fetch)." : `Couldn't fetch the fly's brain (${response.status}).`);
    }
    const total = Number(response.headers.get("content-length")) || 0;
    if (!response.body || !total) {
      const data = await response.arrayBuffer();
      onProgress(1);
      return data;
    }
    const bytes = new Uint8Array(total);
    const reader = response.body.getReader();
    let at = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (at + value.length > total) throw new Error("The fly's brain arrived longer than announced.");
      bytes.set(value, at);
      at += value.length;
      onProgress(at / total);
    }
    if (at !== total) throw new Error("The fly's brain arrived incomplete.");
    return bytes.buffer;
  };
}
