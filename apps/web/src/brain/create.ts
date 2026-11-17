// Picks the brain for where the game runs: the host's native brain on the
// Apple TV, otherwise one in a Web Worker, fed the connectome the build put
// beside the page (download.ts): packages/brain-native built as WebAssembly
// wherever the browser can run it, packages/brain's TypeScript elsewhere.
// Each fly this device lives has a brain of its own, made the same way: one
// worker each, or one native thread each.

import { wasmBrainSupported } from "@fly/brain-native";
import type { BrainDriver } from "@fly/contracts";
import { MAX_OWN } from "@fly/net";
import { BRAIN_MODULE_CACHE, BrainDownload, BrainFiles } from "./download.ts";
import type { BrainFile } from "./download.ts";
import { NativeBrainDriver, nativeBridge } from "./native-driver.ts";
import { WorkerBrainDriver } from "./worker-driver.ts";
import type { BrainSource, BrainWorkerFactory } from "./worker-driver.ts";

// Set by the web build and its dev server (vite.config.ts); not by the Apple TV's, which has its own brain.
declare const __FLY_BRAIN__: BrainFile | null | undefined;
declare const __FLY_BRAIN_MODULE__: BrainFile | null | undefined;

/** The connectome the build serves, or null when it was built without one. */
export const BRAIN_FILE: BrainFile | null = typeof __FLY_BRAIN__ === "undefined" ? null : __FLY_BRAIN__;
/** The WebAssembly brain the build serves (fly-brain.wasm), as one part. */
export const BRAIN_MODULE: BrainFile | null = typeof __FLY_BRAIN_MODULE__ === "undefined" ? null : __FLY_BRAIN_MODULE__;

/**
 * Which brain the worker runs: the WebAssembly one wherever this browser can
 * run it, the TypeScript one otherwise. `?brain=typescript` or `?brain=wasm`
 * in the page's address picks one, for tests and for comparing the two.
 */
export function workerEngine(search: string, supported = wasmBrainSupported()): "wasm" | "typescript" {
  const asked = new URLSearchParams(search).get("brain");
  if (asked === "wasm" || asked === "typescript") return asked;
  return supported ? "wasm" : "typescript";
}

const createWorker: BrainWorkerFactory = (onMessage, onError) => {
  if (typeof Worker === "undefined") throw new Error("This browser can't run the fly's brain in the background (Worker is not defined).");
  const worker = new Worker(new URL("./brain.worker.ts", import.meta.url), { type: "module", name: "fly-brain" });
  worker.onmessage = (event) => onMessage(event.data);
  worker.onmessageerror = () => onError("The fly's brain sent a message that couldn't be read.");
  worker.onerror = (event) => {
    event.preventDefault();
    onError(event.message || "The fly's brain crashed (perhaps this browser can't run a module worker).");
  };
  return {
    post: (request, transfer = []) => worker.postMessage(request, transfer),
    terminate: () => worker.terminate(),
  };
};

/** Where the brain file isn't in the build: says so when asked to load. */
const missing = {
  received: 0,
  total: 0,
  from: null,
  storageFull: false,
  load: () => Promise.reject(new Error("The fly's brain isn't installed here (connectome.bin is missing: npm run brain:fetch).")),
  discard: () => Promise.resolve(),
};

/**
 * A brain for the first fly, a way to make another for each fly after it where this device can
 * (null: one fly only), and how many flies it lives at most.
 */
export type Brains = { first: BrainDriver; another: (() => BrainDriver) | null; most: number };

/**
 * The most flies an Apple TV lives. Measured on an Apple TV 4K (A15): with three, its
 * screensaver keeps 58 to 60 fps in the lighter places; with four it falls to 54 (docs/apple-tv.md,
 * "Several flies on peev"). Each brain is on a thread of its own and none ran short; the cost is the frame.
 */
export const NATIVE_MOST = 3;

const seed = () => (Math.random() * 0x7fffffff) | 0;

export function createBrains(): Brains {
  const bridge = nativeBridge();
  if (bridge) {
    // An Apple TV host from before it could run more than one brain runs one fly.
    const spawn = bridge.spawn?.bind(bridge);
    return {
      first: new NativeBrainDriver(bridge, { seed: seed() }),
      another: spawn ? () => new NativeBrainDriver(spawn(), { seed: seed() }) : null,
      most: spawn ? NATIVE_MOST : 1,
    };
  }
  const env = {
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
    caches: typeof caches === "undefined" ? null : caches,
    subtle: globalThis.crypto?.subtle ?? null,
    online: () => navigator.onLine !== false,
  };
  const module = BRAIN_MODULE && workerEngine(location.search) === "wasm" ? new BrainDownload(BRAIN_MODULE, document.baseURI, env, BRAIN_MODULE_CACHE) : null;
  const source = BRAIN_FILE ? new InTurn(new BrainFiles(new BrainDownload(BRAIN_FILE, document.baseURI, env), module)) : missing;
  const worker = () => new WorkerBrainDriver({ createWorker, source });
  return { first: worker(), another: worker, most: MAX_OWN };
}

/**
 * One source for every fly's brain, loaded one brain at a time: each load
 * after the first finds the files kept from it (or fetches them again where
 * nothing can be kept), and none is downloaded twice at once.
 */
class InTurn implements BrainSource {
  readonly #source: BrainSource;
  #turn: Promise<unknown> = Promise.resolve();

  constructor(source: BrainSource) {
    this.#source = source;
  }

  get received() {
    return this.#source.received;
  }

  get total() {
    return this.#source.total;
  }

  get from() {
    return this.#source.from;
  }

  get storageFull() {
    return this.#source.storageFull;
  }

  load(onProgress: () => void) {
    const loaded = this.#turn.then(() => this.#source.load(onProgress));
    this.#turn = loaded.catch(() => {});
    return loaded;
  }

  discard() {
    return this.#source.discard();
  }
}
