// Wall time per simulated second of the TypeScript brain and the native one,
// on the real connectome, in the same regimes (tools/bench.cpp's: at rest
// standing, then every sense at full strength, then at rest again; 16 ms
// ticks; a simulated second untimed before each):
//
//   node packages/brain-native/scripts/bench.ts [--seconds 10] [--seed 1]
//
// Single-threaded both. The native build is build.sh's release build.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createBrain } from "../../brain/src/runtime.ts";
import { RESTING_SENSES } from "../../brain/src/types.ts";
import type { Brain, BrainSenses } from "../../brain/src/types.ts";
import { CONNECTOME, build, readBuffer } from "../tests/compare.ts";

const { values } = parseArgs({ options: { seconds: { type: "string", default: "10" }, seed: { type: "string", default: "1" } } });
const seconds = Number(values.seconds);
const seed = Number(values.seed);

function regime(brain: Brain, label: string, senses: BrainSenses) {
  for (let t = 0; t < 1000; t += 16) brain.tick(16, senses);
  let wall = 0;
  let sim = 0;
  let active = 0;
  let spikes = 0;
  let ticks = 0;
  while (sim < seconds * 1000) {
    const { stats } = brain.tick(16, senses);
    wall += stats.wallMs;
    sim += stats.simMs;
    active += stats.active;
    spikes += stats.spikes;
    ticks++;
  }
  console.log(label);
  console.log(`  wall per simulated second  ${(wall / sim).toFixed(4)} s (${((wall / sim) * 16).toFixed(3)} ms per 16 ms tick)`);
  console.log(`  active neurons             ${Math.round(active / ticks)} mean`);
  console.log(`  spikes per second          ${Math.round(spikes / (sim / 1000))}`);
}

console.log("TypeScript (Node, V8)");
const data = readBuffer(CONNECTOME);
const started = performance.now();
const brain = createBrain(data, { seed });
console.log(`built in ${(performance.now() - started).toFixed(0)} ms`);
regime(brain, "at rest (standing)", RESTING_SENSES);
regime(brain, "every sense at full strength", { loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, grounded: true });
regime(brain, "at rest again", RESTING_SENSES);
const memory = process.memoryUsage();
console.log(`resident memory ${(memory.rss / 2 ** 20).toFixed(1)} MB (array buffers ${(memory.arrayBuffers / 2 ** 20).toFixed(1)} MB)`);

console.log("\nNative (build.sh release)");
const result = spawnSync(join(build(), "fly-brain-bench"), [CONNECTOME, String(seconds), String(seed)], { encoding: "utf8" });
process.stdout.write(result.stdout + result.stderr);
