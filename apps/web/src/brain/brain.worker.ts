// Runs the fly's brain off the render thread: builds it from the first "init"
// and answers each "tick" with exactly one "state", or an "error".

import { createBrain } from "@fly/brain";
import type { BrainRequest, BrainResponse } from "@fly/brain";
import { createBrainHost } from "./host.ts";

const post = (response: BrainResponse) => (self as unknown as Worker).postMessage(response);
const handle = createBrainHost((data) => createBrain(data, { seed: (Math.random() * 0x7fffffff) | 0 }), post);
self.onmessage = (event: MessageEvent<BrainRequest>) => handle(event.data);
