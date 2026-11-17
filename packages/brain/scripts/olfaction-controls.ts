// Offline controlled recovery assay. No runtime/default sense is added.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readConnectomeFile } from "../src/node.ts";
import { ANNOTATION_SHA256, ANNOTATION_URL } from "../src/pack-anatomy.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";
import { GLOMERULI, RATES, SECONDS, SETTLE_SECONDS, matchedInputs, referenceLevels, validateCalibrationContexts } from "./olfaction-controls-lib.ts";
import type { Bin, Context, Family, RecordTrial } from "./olfaction-controls-lib.ts";

const { values } = parseArgs({ options: {
  context: { type: "string" }, family: { type: "string", default: "none" }, seeds: { type: "string" },
  out: { type: "string" }, calibration: { type: "string" }, minutes: { type: "string", default: "8" },
} });
assert(values.out && values.seeds && (values.context === "pinned" || values.context === "wandering"));
assert(["none", "odor", "bristle"].includes(values.family));
const context = values.context as Context, family = values.family as Family;
const seeds = values.seeds.split(",").map(Number);
assert(seeds.every((n) => Number.isSafeInteger(n) && n > 0));
const budget = Number(values.minutes) * 60000;
assert(budget > 0 && budget <= 8 * 60000);
const calibrationSeeds = seeds.every((s) => s >= 101 && s <= 120);
assert(calibrationSeeds || seeds.every((s) => [21, 22, 23].includes(s)));
assert(!calibrationSeeds || family === "none");
assert(calibrationSeeds || values.calibration, "held-out runs require the locked calibration file");
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const assay = sha(readFileSync(new URL(import.meta.url), "utf8") + readFileSync(new URL("./olfaction-controls-lib.ts", import.meta.url), "utf8") + readFileSync(new URL("../../../docs/olfaction-recovery-protocol.md", import.meta.url), "utf8"));
const analysisSha256 = sha(readFileSync(new URL("./olfaction-controls-summary.ts", import.meta.url)));
const annotation = { url: ANNOTATION_URL, sha256: sha(readFileSync(new URL("../data/annotations.feather", import.meta.url))) };
assert.equal(annotation.sha256, ANNOTATION_SHA256);
const model = Object.fromEntries(["runtime", "sim", "io", "params", "state", "regions", "eyes", "vision", "eye-columns"].map((name) => [name, sha(readFileSync(new URL(`../src/${name}.ts`, import.meta.url)))]));
const connectome = sha(readFileSync(new URL("../data/connectome.bin", import.meta.url)));
assert.equal(connectome, "51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c");
const calibration = values.calibration ? sha(readFileSync(values.calibration)) : null;
if (values.calibration) {
  const locked = JSON.parse(readFileSync(values.calibration, "utf8"));
  assert.equal(locked.version, "recovery-v2"); assert.equal(locked.analysisSha256, analysisSha256);
  validateCalibrationContexts(locked.contexts);
  assert.deepEqual(locked.model, model); assert.equal(locked.connectome, connectome); assert.equal(locked.assay, assay);
}
const c = readConnectomeFile();
const { inputs, matching, degree } = matchedInputs(c);
mkdirSync(values.out, { recursive: true });
const populations: [string, Uint32Array][] = [
  ...GLOMERULI.map((g): [string, Uint32Array] => [`ORN_${g}`, inputs.get(`odor.${g}`)!]),
  ["ALPN", c.find({ class: "ALPN" })], ["LH", c.find({ superClass: "cb_intrinsic", type: /^LH/ })],
  ["KC", c.find({ class: "Kenyon_Cell" })], ["MBON", c.find({ class: "MBON" })], ["DN", c.find({ superClass: "descending_neuron" })],
];
const conditions = family === "none" ? [{ glomerulus: "none", rate: 0 }] : GLOMERULI.flatMap((glomerulus) => (context === "pinned" ? [...RATES] : [100]).map((rate) => ({ glomerulus, rate })));
const senses = { ...RESTING_SENSES, hunger: 1, clockMorning: 0, clockEvening: 0, clockSleep: 0, sleepPressure: 0, sleepDepth: 0 };
const started = performance.now();
for (const seed of seeds) for (const condition of conditions) {
  const stem = `${context}-${family}-${seed}-${condition.glomerulus}-${condition.rate}`;
  const path = join(values.out, `${stem}.json`);
  if (existsSync(path)) {
    const prior: RecordTrial = JSON.parse(readFileSync(path, "utf8"));
    assert.deepEqual(prior.model, model); assert.equal(prior.calibration, calibration); assert.equal(prior.assay, assay);
    assert.equal(prior.bins.length, SECONDS);
    assert.equal(sha(readFileSync(join(values.out, prior.cellsFile))), prior.cellsSha256);
    continue;
  }
  if (performance.now() - started >= budget) { console.error("Batch limit reached; rerun the same command to resume."); process.exit(75); }
  console.error(stem);
  const b = new FlyBrain(c, { seed, spontaneous: context === "wandering" });
  const backgroundLevels = referenceLevels(seed);
  if (context === "pinned") for (const { spec, maxRate } of b.wiring.background) b.sim.setRate(spec.name, maxRate * backgroundLevels[spec.side]);
  const read = new Set(b.wiring.readouts.flatMap((g) => [...g.neurons]));
  for (const [name, ns] of inputs) {
    for (const i of ns) assert(!read.has(i));
    b.sim.addInput(`study.${name}`, ns);
  }
  const selected = family === "none" ? new Uint32Array(0) : inputs.get(`${family}.${condition.glomerulus}`)!;
  const late = new Uint32Array(3 * c.neurons);
  const bins: Bin[] = [];
  for (let tick = 0; tick < SETTLE_SECONDS * 100; tick++) b.tick(10, senses);
  b.sim.setRecording(true);
  for (let second = 0; second < SECONDS; second++) {
    for (const name of inputs.keys()) b.sim.setRate(`study.${name}`, name === `${family}.${condition.glomerulus}` && second >= 2 && second < 7 ? condition.rate : 0);
    b.sim.recording!.fill(0);
    const command: Record<string, number> = {}, readouts: Record<string, number> = {};
    for (let tick = 0; tick < 100; tick++) {
      const s = b.tick(10, senses);
      for (const [k, v] of Object.entries(s.command)) command[k] = (command[k] ?? 0) + v / 100;
      for (const { spec } of b.wiring.readouts) readouts[spec.name] = (readouts[spec.name] ?? 0) + s.stats.rates[spec.name] / 100;
    }
    const recording = b.sim.recording!;
    const hz = Object.fromEntries(populations.map(([name, ns]) => [name, [...ns].reduce((n, i) => n + recording[i], 0) / ns.length]));
    if (second >= 52) {
      const block = Math.floor((second - 52) / 5);
      for (let i = 0; i < c.neurons; i++) late[block * c.neurons + i] += recording[i];
    }
    bins.push({ second, command, readouts, hz,
      state: [b.state.arousal.value, b.state.scene.left.value, b.state.scene.right.value, b.state.hunger, b.state.sleep],
      drivenSpikes: [...selected].reduce((sum, i) => sum + recording[i], 0),
      weightedSpikes: [...selected].reduce((sum, i) => sum + recording[i] * degree[i], 0) });
  }
  assert(late.every((n) => n <= 65535));
  const cells = Uint16Array.from(late);
  const cellBytes = new Uint8Array(cells.buffer);
  const result: RecordTrial = { version: "recovery-v2", assay, model, connectome, seed, context, family, ...condition, calibration,
    annotation, analysisSha256, matching, backgroundLevels, bins, cellsFile: `${stem}.bin`, cellsSha256: sha(cellBytes) };
  const cellPath = join(values.out, result.cellsFile);
  writeFileSync(`${cellPath}.part`, cellBytes); renameSync(`${cellPath}.part`, cellPath);
  writeFileSync(`${path}.part`, JSON.stringify(result)); renameSync(`${path}.part`, path);
}
