// The model's update, in M5 Pro CPU time (scripts/cpuBudget.ts says why, and
// why npm test runs this alone). Without a JIT, as on the TV, model.test.ts
// runs it in V8's interpreter.

import assert from "node:assert/strict";
import { test } from "node:test";
import { CpuMeter, median } from "../../../scripts/cpuBudget.ts";
import { createFly } from "../src/index.ts";
import { pose } from "./helpers.ts";

const DT = 1 / 60;
const SAMPLES = 5;

test("update is quick with a JIT", () => {
  const fly = createFly();
  const poses = [pose({ speed: 3, turn: 1 }), pose({ groom: 1 }), pose({ feed: 1, wings: 0.5 }), pose({ airborne: true, wings: 1, pitch: 0.4, roll: 0.3 })];
  for (let i = 0; i < 20000; i++) fly.update(poses[(i >> 6) & 3], DT);
  const samples = Array.from({ length: SAMPLES }, () => {
    const meter = new CpuMeter();
    for (let i = 0; i < 5000; i++) {
      fly.update(poses[(i >> 6) & 3], DT);
      if (i % 500 === 499) meter.lap();
    }
    return { micros: meter.ms / 5, rawMicros: meter.rawMs / 5 };
  });
  const micros = median(samples.map((s) => s.micros));
  const rawMicros = median(samples.map((s) => s.rawMicros));
  console.log(`  update: ${micros.toFixed(2)} M5 Pro CPU µs (${rawMicros.toFixed(2)} here) in Node with its JIT; median of ${SAMPLES}`);
  // 2.4 to 2.9 µs on an M5 Pro.
  assert.ok(micros < 4.4, `${micros.toFixed(2)} M5 Pro CPU µs per update; budget 4.4`);
});
