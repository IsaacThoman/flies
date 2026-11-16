// Picks the brain for where the game runs: the host's native brain on the
// Apple TV, otherwise packages/brain in a Web Worker, fed the connectome the
// build put beside the page (download.ts).

import type { BrainDriver } from "@fly/contracts";
import { BrainDownload } from "./download.ts";
import type { BrainFile } from "./download.ts";
import { NativeBrainDriver, nativeBridge } from "./native-driver.ts";
import { WorkerBrainDriver } from "./worker-driver.ts";
import type { BrainWorkerFactory } from "./worker-driver.ts";

// Set by the web build and its dev server (vite.config.ts); not by the Apple TV's, which has its own brain.
declare const __FLY_BRAIN__: BrainFile | null | undefined;

/** The connectome the build serves, or null when it was built without one. */
export const BRAIN_FILE: BrainFile | null = typeof __FLY_BRAIN__ === "undefined" ? null : __FLY_BRAIN__;

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

export function createBrainDriver(): BrainDriver {
  const bridge = nativeBridge();
  if (bridge) return new NativeBrainDriver(bridge, { seed: (Math.random() * 0x7fffffff) | 0 });
  const source = BRAIN_FILE
    ? new BrainDownload(BRAIN_FILE, document.baseURI, {
        fetch: (...args) => fetch(...args),
        caches: typeof caches === "undefined" ? null : caches,
        subtle: globalThis.crypto?.subtle ?? null,
        online: () => navigator.onLine !== false,
      })
    : missing;
  return new WorkerBrainDriver({ createWorker, source });
}
