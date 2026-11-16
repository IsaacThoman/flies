// The worker's side of the brain protocol, apart from the worker so it can be
// tested in Node.

import type { Brain, BrainEngine, BrainRequest, BrainResponse } from "@fly/brain";

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Builds the brain an "init" asks for; the worker unpacks the connectome and, given a module, starts it. */
export type BrainFactory = (request: Extract<BrainRequest, { type: "init" }>) => Promise<{ brain: Brain; engine: BrainEngine }>;

export function createBrainHost(create: BrainFactory, post: (response: BrainResponse) => void) {
  let brain: Brain | null = null;
  let building = false;
  return (request: BrainRequest) => {
    try {
      if (request.type === "init") {
        if (brain || building) throw new Error("The brain is already running.");
        building = true;
        // No tick comes before the brain says it is ready, so nothing waits behind the building.
        create(request).then(
          (built) => {
            brain = built.brain;
            post({ type: "ready", neurons: brain.neurons, connections: brain.connections, eyes: brain.eyes, engine: built.engine });
          },
          (error: unknown) => post({ type: "error", message: messageOf(error) }),
        );
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
