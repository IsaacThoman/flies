// The worker's side of the brain protocol, apart from the worker so it can be
// tested in Node.

import type { Brain, BrainRequest, BrainResponse } from "@fly/brain";

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createBrainHost(create: (data: ArrayBuffer) => Brain, post: (response: BrainResponse) => void) {
  let brain: Brain | null = null;
  return (request: BrainRequest) => {
    try {
      if (request.type === "init") {
        if (brain) throw new Error("The brain is already running.");
        brain = create(request.data);
        post({ type: "ready", neurons: brain.neurons, connections: brain.connections, eyes: brain.eyes });
      } else if (request.type === "tick") {
        if (!brain) throw new Error("The brain hasn't been loaded.");
        post({ type: "state", state: brain.tick(request.dtMs, request.senses) });
      } else {
        throw new Error(`Unknown request: ${String((request as { type?: unknown }).type)}`);
      }
    } catch (error) {
      post({ type: "error", message: messageOf(error) });
    }
  };
}
