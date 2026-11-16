import { readFileSync } from "node:fs";
import { createBrain, REGIONS, REGION_RATE_NAMES } from "@fly/brain";
import type { Brain, BrainSenses, BrainState } from "@fly/brain";
import type { BrainDriver } from "@fly/contracts";
import { DEFAULT_CONNECTOME_PATH } from "../../packages/brain/src/node.ts";

/** Synchronous only for headless tests: the game keeps the brain off its frame thread. */
export class InProcessBrain implements BrainDriver {
  readonly status = "running";
  readonly error = null;
  readonly brain: Brain;
  readonly regionRates = new Float32Array(REGIONS.length);
  state: BrainState | null = null;
  stateAt = 0;

  constructor(data: ArrayBuffer, seed: number) {
    this.brain = createBrain(data, { seed });
  }

  get neurons() { return this.brain.neurons; }
  get connections() { return this.brain.connections; }
  get eyes() { return this.brain.eyes; }

  tick(dtMs: number, senses: BrainSenses) {
    this.state = this.brain.tick(dtMs, senses);
    this.stateAt = performance.now();
    for (let i = 0; i < this.regionRates.length; i++) this.regionRates[i] = this.state.stats.rates[REGION_RATE_NAMES[i]] ?? 0;
  }

  dispose() {}
}

export function brainData() {
  const bytes = readFileSync(DEFAULT_CONNECTOME_PATH);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
