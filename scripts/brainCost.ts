// Calibrated CPU cost of both engines on the same seed and connectome.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { FlyBrain } from "../packages/brain/src/runtime.ts";
import { readConnectomeFile, DEFAULT_CONNECTOME_PATH } from "../packages/brain/src/node.ts";
import { RESTING_SENSES } from "../packages/brain/src/types.ts";
import type { Brain, BrainSenses } from "../packages/brain/src/types.ts";
import { WasmBrainModule } from "../packages/brain-native/wasm/brain.ts";
import { distribution } from "./webPerf.ts";
import { withHeavySlot } from "./heavySlot.ts";

const { values } = parseArgs({ options: { out: { type: "string" } } });
await withHeavySlot(async () => {
  const { CpuMeter } = await import("./cpuBudget.ts");
  const connectome = readConnectomeFile();
  const raw = readFileSync(DEFAULT_CONNECTOME_PATH);
  const wasmBytes = readFileSync(new URL("../packages/brain-native/wasm/fly-brain.wasm", import.meta.url));
  const module = await WebAssembly.compile(wasmBytes);
  const make = async (engine: string): Promise<Brain> => {
    if (engine === "typescript") return new FlyBrain(connectome, { seed: 1 });
    const wasm = await WasmBrainModule.instantiate(module);
    wasm.connectomeSpace(raw.length).set(raw);
    return wasm.create(1);
  };
  const full: BrainSenses = { ...RESTING_SENSES, loomLeft: 1, loomRight: 1, touch: 1, bumpLeft: 1, bumpRight: 1, wind: 1, sweet: 1, grounded: false, maleTaste: 1, wingbeat: 1, legsLeft: 1, legsRight: 1 };
  const report: unknown[] = [];
  const fingerprints: string[] = [];
  for (const engine of ["typescript", "wasm"]) {
    const samples: { rest: number; full: number; rawRest: number; rawFull: number }[] = [];
    for (let run = 0; run < 5; run++) {
      const brain = await make(engine);
      const cost = (senses: BrainSenses) => {
        for (let t = 0; t < 1008; t += 16) brain.tick(16, senses);
        const meter = new CpuMeter();
        for (let t = 0; t < 2048; t += 16) { brain.tick(16, senses); if ((t / 16) % 16 === 15) meter.lap(); }
        return [meter.ms / 2048, meter.rawMs / 2048];
      };
      const [rest, rawRest] = cost(RESTING_SENSES);
      const [busy, rawFull] = cost(full);
      samples.push({ rest, full: busy, rawRest, rawFull });
    }
    const fingerprint = createHash("sha256");
    const brain = await make(engine);
    for (let i = 0; i < 128; i++) {
      const s = brain.tick(16, i < 64 ? RESTING_SENSES : full);
      fingerprint.update(JSON.stringify({ command: Object.values(s.command).map(Math.fround), spikes: s.stats.spikes, active: s.stats.active, simMs: s.stats.simMs, rates: Object.entries(s.stats.rates).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, Math.fround(v)]) }));
    }
    const digest = fingerprint.digest("hex");
    fingerprints.push(digest);
    report.push({ engine, seed: 1, unit: "M5 Pro calibrated CPU seconds/simulated second", rest: distribution(samples.map(s => s.rest)), full: distribution(samples.map(s => s.full)), samples, fingerprint: digest });
  }
  assert.equal(fingerprints[0], fingerprints[1], "same commands, spikes, active neurons, time and float32 rates on both engines");
  const output = JSON.stringify({ wasmSha256: createHash("sha256").update(wasmBytes).digest("hex"), report }, null, 2);
  if (values.out) writeFileSync(values.out, output);
  console.log(output);
});
