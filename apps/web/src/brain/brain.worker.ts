// Runs the fly's brain off the render thread: unpacks the connectome from the
// first "init" (as it travels, wire.ts), builds the brain from it, and answers
// each "tick" with exactly one "state", or an "error".

import { createBrain } from "@fly/brain";
import type { BrainRequest, BrainResponse } from "@fly/brain";
import { createBrainHost } from "./host.ts";
import { unpackConnectome } from "./wire.ts";

const post = (response: BrainResponse) => (self as unknown as Worker).postMessage(response);
const handle = createBrainHost((data) => createBrain(data, { seed: (Math.random() * 0x7fffffff) | 0 }), post);
self.onmessage = (event: MessageEvent<BrainRequest>) => {
  const request = event.data;
  // No tick comes before the brain says it is ready, so nothing waits behind the unpacking.
  if (request.type === "init") {
    unpackConnectome(request.data).then(
      (data) => handle({ type: "init", data }),
      (error: unknown) => post({ type: "error", message: error instanceof Error ? error.message : String(error) }),
    );
  } else handle(request);
};
