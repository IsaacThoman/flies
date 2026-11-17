// What the brain costs on the real connectome (skipped without it: npm run
// brain:fetch), in M5 Pro CPU time (scripts/cpuBudget.ts says why, and why npm
// test runs this alone).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { CpuMeter, measureBudget, median, scaleCpuMs } from "../../../scripts/cpuBudget.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "./node.ts";
import { FlyBrain } from "./runtime.ts";
import { RESTING_SENSES } from "./types.ts";
import type { BrainSenses } from "./types.ts";

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : `no ${DEFAULT_CONNECTOME_PATH}; run npm run brain:pack`;
const connectome = skip ? undefined : readConnectomeFile();
const TICK = 16;
const FULL: BrainSenses = { loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, grounded: false, maleTaste: 1, wingbeat: 1, bitter: 1, water: 1 };
const SAMPLES = 5;

const run = (b: FlyBrain, ms: number, senses: BrainSenses, meter?: CpuMeter) => {
  for (let t = 0; t < ms; t += TICK) {
    b.tick(TICK, senses);
    // About 25 M5 Pro milliseconds a lap at rest.
    if (meter && (t / TICK) % 16 === 15) meter.lap();
  }
};

/** M5 Pro CPU seconds per simulated second over 2 s under these senses, after 1 s of them. */
const cost = (b: FlyBrain, senses: BrainSenses) => {
  run(b, 1000, senses);
  const meter = new CpuMeter();
  run(b, 2048, senses, meter);
  return { ms: meter.ms / 2048, rawMs: meter.rawMs / 2048, references: meter.references };
};

test("it builds and runs within its cost bounds", { skip }, async (t) => {
  // A process's first few builds take up to 1.5x as long as later ones while the
  // JIT and the heap warm up, which spread the first attempt's build samples past
  // what measureBudget accepts: as many brains as there are samples are built and
  // run unmeasured first, as the fly's update budget warms its update.
  for (let i = 0; i < SAMPLES; i++) run(new FlyBrain(connectome!, { seed: 1 }), 1000, RESTING_SENSES);
  // Each sample is a new brain with the same seed through the same senses, so
  // they all do the same work and differ only in the machine's noise.
  const samples = await measureBudget(t, () => {
    const measured = Array.from({ length: SAMPLES }, () => {
      const meter = new CpuMeter();
      const b = new FlyBrain(connectome!, { seed: 1 });
      meter.lap();
      const rest = cost(b, RESTING_SENSES);
      const full = cost(b, FULL);
      // The build is one lap, so its two references alone would let one outlier halve or double it.
      const references = [...meter.references, ...rest.references, ...full.references];
      return { build: { ms: scaleCpuMs(meter.rawMs, references), rawMs: meter.rawMs }, rest, full, references };
    });
    return { value: measured, references: measured.flatMap((s) => s.references), samples: (["build", "rest", "full"] as const).map((key) => measured.map((s) => s[key].ms)) };
  });
  if (!samples) return;
  const of = (key: "build" | "rest" | "full") => ({ ms: median(samples.map((s) => s[key].ms)), rawMs: median(samples.map((s) => s[key].rawMs)) });
  const built = of("build");
  const rest = of("rest");
  const full = of("full");
  console.log(`  M5 Pro CPU (here): build ${built.ms.toFixed(0)} ms (${built.rawMs.toFixed(0)}), rest ${rest.ms.toFixed(3)} s/s (${rest.rawMs.toFixed(3)}), everything at once ${full.ms.toFixed(3)} s/s (${full.rawMs.toFixed(3)}); median of ${SAMPLES}`);
  // On an M5 Pro: build 0.15 s, rest 0.095 s/s and everything at once 0.28 s/s before touch landed anywhere, a quarter more
  // since (packages/brain/README.md, Cost, aims for 0.15 and 0.5).
  assert.ok(built.ms < 250, `built in ${built.ms.toFixed(0)} M5 Pro CPU ms; budget 250`);
  assert.ok(rest.ms < 0.16, `${rest.ms.toFixed(3)} M5 Pro CPU s per simulated second at rest; budget 0.16`);
  assert.ok(full.ms < 0.5, `${full.ms.toFixed(3)} M5 Pro CPU s per simulated second with everything at once; budget 0.5`);
});
