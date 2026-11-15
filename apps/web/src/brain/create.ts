// Picks the brain for where the game runs: the host's native brain on the
// Apple TV, otherwise packages/brain in a Web Worker.

import type { BrainDriver } from "@fly/contracts";
import { NativeBrainDriver, nativeBridge } from "./native-driver.ts";
import { WorkerBrainDriver, fetchConnectome } from "./worker-driver.ts";
import type { BrainWorkerFactory } from "./worker-driver.ts";

/** Where the dev server and the production build serve the packed connectome. */
export const CONNECTOME_URL = "brain/connectome.bin";

const createWorker: BrainWorkerFactory = (onMessage, onError) => {
  const worker = new Worker(new URL("./brain.worker.ts", import.meta.url), { type: "module", name: "fly-brain" });
  worker.onmessage = (event) => onMessage(event.data);
  worker.onmessageerror = () => onError("The fly's brain sent a message that couldn't be read.");
  worker.onerror = (event) => {
    event.preventDefault();
    onError(event.message || "The fly's brain crashed.");
  };
  return {
    post: (request, transfer = []) => worker.postMessage(request, transfer),
    terminate: () => worker.terminate(),
  };
};

export function createBrainDriver(): BrainDriver {
  const bridge = nativeBridge();
  if (bridge) return new NativeBrainDriver(bridge, { seed: (Math.random() * 0x7fffffff) | 0 });
  return new WorkerBrainDriver({ createWorker, load: fetchConnectome(new URL(CONNECTOME_URL, document.baseURI).href) });
}
