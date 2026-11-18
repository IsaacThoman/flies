// Isolates the render-thread cost of sending senses: both versions serialize
// through structuredClone, as a worker's postMessage does before returning.
import assert from "node:assert/strict";
import { Session } from "node:inspector";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { RESTING_SENSES } from "@fly/brain";
import type { BrainResponse, BrainState } from "@fly/brain";
import { WorkerBrainDriver } from "../apps/web/src/brain/worker-driver.ts";
import type { BrainWorkerFactory } from "../apps/web/src/brain/worker-driver.ts";
import { distribution } from "./webPerf.ts";
import { withHeavySlot } from "./heavySlot.ts";

const root = path.join(import.meta.dirname, "..");
const { values } = parseArgs({ options: { baseline: { type: "string", default: "origin/dev" }, out: { type: "string" }, allocations: { type: "boolean", default: false } } });
const revision = execFileSync("git", ["rev-parse", values.baseline], { encoding: "utf8" }).trim();
const temp = mkdtempSync(path.join(tmpdir(), "fly-worker-cost-"));
try {
  const file = "apps/web/src/brain/worker-driver.ts";
  const source = execFileSync("git", ["show", `${revision}:${file}`], { encoding: "utf8" })
    .replaceAll('"@fly/brain"', JSON.stringify(path.join(root, "packages/brain/src/index.ts")))
    .replaceAll('"./download.ts"', JSON.stringify(path.join(root, "apps/web/src/brain/download.ts")));
  writeFileSync(path.join(temp, "driver.ts"), source);
  const { WorkerBrainDriver: Reference } = await import(pathToFileURL(path.join(temp, "driver.ts")).href) as { WorkerBrainDriver: typeof WorkerBrainDriver };
  const run = async (Driver: typeof WorkerBrainDriver, facets: number) => {
    let reply: (response: BrainResponse) => void = () => {};
    const state: BrainState = { command: { walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, lean: 0 }, stats: { simMs: 16, wallMs: 0, spikes: 0, active: 0, rates: {} } };
    let checksum = 0;
    const createWorker: BrainWorkerFactory = onMessage => {
      reply = onMessage;
      return { terminate() {}, post(request) {
        const copy = structuredClone(request);
        if (copy.type === "tick") { checksum += copy.senses.light?.left[0] ?? copy.senses.sweet; reply({ type: "state", state }); }
      } };
    };
    const driver = new Driver({ createWorker, now: () => 0, source: { received: 1, total: 1, from: "cache", storageFull: false, load: async () => ({ data: new ArrayBuffer(1), module: null }), discard: async () => {} } });
    await new Promise<void>(resolve => setImmediate(resolve));
    reply({ type: "ready", neurons: 1, connections: 1, eyes: null, engine: "wasm" });
    const senses = { ...RESTING_SENSES, sweet: 0.25, ...(facets ? { light: { left: new Float32Array(facets).fill(0.25), right: new Float32Array(facets).fill(0.5) } } : {}) };
    const start = process.threadCpuUsage();
    for (let i = 0; i < 10_000; i++) driver.tick(16, senses);
    const used = process.threadCpuUsage(start);
    assert.equal(checksum, 2500);
    driver.dispose();
    return (used.user + used.system) / 10_000;
  };
  const report: unknown[] = [];
  await withHeavySlot(async () => {
    for (const facets of [0, 1000, 4600]) {
      const samples: [number[], number[]] = [[], []];
      for (let round = -2; round < 9; round++) for (const variant of round % 2 ? [1, 0] : [0, 1]) {
        const cost = await run(variant ? WorkerBrainDriver : Reference, facets);
        if (round >= 0) samples[variant].push(cost);
      }
      const allocationProfiles: unknown[] = [];
      if (values.allocations && facets === 1000) {
        const session = new Session();
        session.connect();
        const post = (method: string, params: object = {}) => new Promise<object | undefined>((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
        try {
          for (const Driver of [Reference, WorkerBrainDriver]) {
            await post("HeapProfiler.startSampling", { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
            await run(Driver, facets);
            allocationProfiles.push(await post("HeapProfiler.stopSampling"));
          }
        } finally { session.disconnect(); }
      }
      report.push({ facets, unit: "thread CPU microseconds/tick", reference: revision, node: process.version, variants: samples.map(distribution), allocationProfiles, allocationNote: "Sampled JS allocations include collected objects, exclude external ArrayBuffer backing; separate from CPU timing." });
    }
  });
  const output = JSON.stringify(report, null, 2);
  if (values.out) writeFileSync(values.out, output);
  console.log(output);
} finally { rmSync(temp, { recursive: true, force: true }); }
