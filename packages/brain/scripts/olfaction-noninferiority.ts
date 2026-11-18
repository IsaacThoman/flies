// Gate 2 as amended (docs/olfaction-protocol.md, Amendment, 17 November 2026):
// does an odour pulse leave the commands any further from their course 60 s
// later than its matched bristle pulse does? The recovery follow-up's pinned
// trial (scripts/olfaction-controls.ts), run seed by seed: the control, every
// odour pulse and every bristle comparator, each compared with the control as
// it finishes, so only each pulse's summary is kept. One JSON a seed in --out;
// --reduce gives the decision.
//
//   node packages/brain/scripts/olfaction-noninferiority.ts --out <dir> --seeds 141
//   node packages/brain/scripts/olfaction-noninferiority.ts --out <dir> --reduce
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readConnectomeFile } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";
import { COMMANDS, GLOMERULI, RATES, SECONDS, SETTLE_SECONDS, matchedInputs, referenceLevels } from "./olfaction-controls-lib.ts";

const { values } = parseArgs({ options: { out: { type: "string" }, seeds: { type: "string", default: "" }, reduce: { type: "boolean", default: false } } });
assert(values.out);
const out = values.out;
const SEEDS = [141, 142, 143, 144, 145, 146, 147, 148];
const MARGIN = 0.05;
const T7 = 1.894578605;
// The recovery protocol's readout bounds: 0.05 times each decoder's scale, Hz.
const READOUT_BOUND: Record<string, number> = { DNg100: 2, "DNa02 left": 2, "DNa02 right": 2, MDN: 2, DNp01: 10, flight: 6, DNg12: 3, MN9: 2, pIP10: 2 };
type Pulse = { family: "odor" | "bristle"; glomerulus: string; rate: number; M: number; finalCommand: Record<string, number>; originalFails: boolean; latePopulationFailures: string[]; persistentCells: number; readoutFailures: string[]; lh: number };
type SeedRecord = { seed: number; pulses: Pulse[] };

if (!values.reduce) {
  const c = readConnectomeFile();
  const { inputs } = matchedInputs(c);
  const populations: [string, Uint32Array][] = [
    ...GLOMERULI.map((g): [string, Uint32Array] => [`ORN_${g}`, inputs.get(`odor.${g}`)!]),
    ["ALPN", c.find({ class: "ALPN" })], ["LH", c.find({ superClass: "cb_intrinsic", type: /^LH/ })],
    ["KC", c.find({ class: "Kenyon_Cell" })], ["MBON", c.find({ class: "MBON" })], ["DN", c.find({ superClass: "descending_neuron" })],
  ];
  const lh = populations.find(([name]) => name === "LH")![1];
  const senses = { ...RESTING_SENSES, hunger: 1, clockMorning: 0, clockEvening: 0, clockSleep: 0, sleepPressure: 0, sleepDepth: 0 };
  // One run: each second's commands and readouts, the late blocks' population rates and per-cell counts, and the LH's rate over the pulse.
  const run = (seed: number, stimulus: string | null, rate: number) => {
    const b = new FlyBrain(c, { seed, spontaneous: false });
    const levels = referenceLevels(seed);
    for (const { spec, maxRate } of b.wiring.background) b.sim.setRate(spec.name, maxRate * levels[spec.side]);
    for (const [name, ns] of inputs) b.sim.addInput(`study.${name}`, ns);
    for (let tick = 0; tick < SETTLE_SECONDS * 100; tick++) b.tick(10, senses);
    b.sim.setRecording(true);
    const late = new Uint32Array(3 * c.neurons);
    const lateHz = [0, 1, 2].map(() => Object.fromEntries(populations.map(([name]) => [name, 0])));
    const commands: Record<string, number>[] = [];
    const lateReadouts: Record<string, number> = {};
    let lhSpikes = 0;
    for (let second = 0; second < SECONDS; second++) {
      for (const name of inputs.keys()) b.sim.setRate(`study.${name}`, name === stimulus && second >= 2 && second < 7 ? rate : 0);
      b.sim.recording!.fill(0);
      const command: Record<string, number> = {};
      for (let tick = 0; tick < 100; tick++) {
        const s = b.tick(10, senses);
        for (const [k, v] of Object.entries(s.command)) command[k] = (command[k] ?? 0) + v / 100;
        if (second >= SECONDS - 5) for (const { spec } of b.wiring.readouts) lateReadouts[spec.name] = (lateReadouts[spec.name] ?? 0) + s.stats.rates[spec.name] / 500;
      }
      commands.push(command);
      const recording = b.sim.recording!;
      if (second >= 2 && second < 7) for (const i of lh) lhSpikes += recording[i];
      if (second >= 52) {
        const block = Math.floor((second - 52) / 5);
        for (let i = 0; i < c.neurons; i++) late[block * c.neurons + i] += recording[i];
        for (const [name, ns] of populations) lateHz[block][name] += [...ns].reduce((n, i) => n + recording[i], 0) / ns.length / 5;
      }
    }
    return { commands, late, lateHz, lateReadouts, lh: lhSpikes / lh.length / 5 };
  };
  mkdirSync(out, { recursive: true });
  for (const seed of values.seeds.split(",").filter(Boolean).map(Number)) {
    assert(SEEDS.includes(seed), `seed ${seed} isn't one of the amendment's`);
    const path = join(out, `${seed}.json`);
    if (existsSync(path)) continue;
    console.error(seed, "control");
    const control = run(seed, null, 0);
    const pulses: Pulse[] = [];
    for (const family of ["odor", "bristle"] as const) {
      for (const glomerulus of GLOMERULI) {
        for (const rate of RATES) {
          console.error(seed, family, glomerulus, rate);
          const r = run(seed, `${family}.${glomerulus}`, rate);
          for (let s = 0; s < 2; s++) assert.deepEqual(r.commands[s], control.commands[s], "a pulse's run differs from the control before the pulse");
          const finalCommand = Object.fromEntries(COMMANDS.map((k) => [k, r.commands[SECONDS - 1][k] - control.commands[SECONDS - 1][k]]));
          const M = Math.max(...COMMANDS.map((k) => Math.abs(finalCommand[k])));
          const latePopulationFailures = [0, 1, 2].flatMap((block) => populations.filter(([name]) => Math.abs(r.lateHz[block][name] - control.lateHz[block][name]) > 1).map(([name]) => `${name}@${block}`));
          let persistentCells = 0;
          for (let i = 0; i < c.neurons; i++) {
            if ([0, 1, 2].every((block) => Math.abs(r.late[block * c.neurons + i] - control.late[block * c.neurons + i]) / 5 >= 20)) persistentCells++;
          }
          const readoutFailures = Object.keys(READOUT_BOUND).filter((name) => Math.abs(r.lateReadouts[name] - control.lateReadouts[name]) > READOUT_BOUND[name]);
          pulses.push({ family, glomerulus, rate, M, finalCommand, originalFails: M > 0.05, latePopulationFailures, persistentCells, readoutFailures, lh: r.lh - control.lh });
        }
      }
    }
    const record: SeedRecord = { seed, pulses };
    writeFileSync(`${path}.part`, JSON.stringify(record));
    renameSync(`${path}.part`, path);
  }
} else {
  const records: SeedRecord[] = readdirSync(out).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(out, f), "utf8")));
  assert.deepEqual(records.map((r) => r.seed).sort((a, b) => a - b), SEEDS, "the amendment's eight seeds, all of them");
  const perSeed = records
    .toSorted((a, b) => a.seed - b.seed)
    .map(({ seed, pulses }) => {
      const odor = pulses.filter((p) => p.family === "odor");
      const D = odor.map((p) => p.M - pulses.find((q) => q.family === "bristle" && q.glomerulus === p.glomerulus && q.rate === p.rate)!.M);
      assert.equal(D.length, 25);
      const lhRises = GLOMERULI.every((g) => {
        const lh = RATES.map((rate) => odor.find((p) => p.glomerulus === g && p.rate === rate)!.lh);
        return lh.every((x, k) => k === 0 || x > lh[k - 1]);
      });
      return {
        seed,
        d: D.reduce((a, b) => a + b, 0) / D.length,
        odorFailsOriginal: odor.filter((p) => p.originalFails).length,
        bristleFailsOriginal: pulses.filter((p) => p.family === "bristle" && p.originalFails).length,
        odorLateFailures: odor.filter((p) => p.latePopulationFailures.length > 0).length,
        odorPersistent: odor.filter((p) => p.persistentCells > 0).length,
        odorReadoutFailures: odor.filter((p) => p.readoutFailures.length > 0).length,
        lhRises,
      };
    });
  const d = perSeed.map((s) => s.d);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / (d.length - 1));
  const upper = mean + (T7 * sd) / Math.sqrt(d.length);
  const nonInferior = upper < MARGIN;
  const checks = perSeed.every((s) => s.odorLateFailures === 0 && s.odorPersistent === 0 && s.odorReadoutFailures === 0 && s.lhRises);
  console.log(JSON.stringify({ margin: MARGIN, mean, sd, upper, nonInferior, checks, passes: nonInferior && checks, perSeed }, null, 2));
}
