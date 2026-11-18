// What the recovery endpoint measures (docs/olfaction-gates-protocol.md, Part
// B): one forced spike in one neuron, against the recovery follow-up's pinned
// control, on its schedule. JSON per run goes to --out; --reduce compares the
// final-second command residuals with the follow-up's pinned odour pulses.
//
//   node packages/brain/scripts/olfaction-divergence.ts --out <dir> --seeds 21
//   node packages/brain/scripts/olfaction-divergence.ts --out <dir> --reduce --controls <olfaction-controls dir>
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readConnectomeFile } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";
import { COMMANDS, GLOMERULI, SECONDS, SETTLE_SECONDS, matchedInputs, referenceLevels } from "./olfaction-controls-lib.ts";
import type { RecordTrial } from "./olfaction-controls-lib.ts";

const { values } = parseArgs({ options: { out: { type: "string" }, seeds: { type: "string", default: "21,22,23" }, reduce: { type: "boolean", default: false }, controls: { type: "string" } } });
assert(values.out);
const out = values.out;
type Run = { seed: number; kick: string; bodyId: number; fired: number; command: Record<string, number>[] };

if (!values.reduce) {
  const c = readConnectomeFile();
  const { inputs } = matchedInputs(c);
  // The lowest body ID of each glomerulus's ORNs and of its matched bristle set.
  const kicks: { name: string; neuron: number }[] = [];
  for (const family of ["odor", "bristle"] as const) {
    for (const g of GLOMERULI) {
      const neuron = [...inputs.get(`${family}.${g}`)!].sort((a, b) => c.rootId[a] - c.rootId[b])[0];
      kicks.push({ name: `${family}.${g}`, neuron });
    }
  }
  const senses = { ...RESTING_SENSES, hunger: 1, clockMorning: 0, clockEvening: 0, clockSleep: 0, sleepPressure: 0, sleepDepth: 0 };
  mkdirSync(out, { recursive: true });
  for (const seed of values.seeds.split(",").map(Number)) {
    for (const kick of [{ name: "none", neuron: -1 }, ...kicks]) {
      const path = join(out, `${seed}-${kick.name}.json`);
      if (existsSync(path)) continue;
      console.error(seed, kick.name);
      const b = new FlyBrain(c, { seed, spontaneous: false });
      const levels = referenceLevels(seed);
      for (const { spec, maxRate } of b.wiring.background) b.sim.setRate(spec.name, maxRate * levels[spec.side]);
      // The follow-up's groups, at 0 throughout, then one group a candidate: every run has them all.
      for (const [name, ns] of inputs) b.sim.addInput(`study.${name}`, ns);
      for (const k of kicks) b.sim.addInput(`kick.${k.name}`, [k.neuron]);
      for (let tick = 0; tick < SETTLE_SECONDS * 100; tick++) b.tick(10, senses);
      b.sim.setRecording(true);
      const command: Record<string, number>[] = [];
      let fired = 0;
      for (let second = 0; second < SECONDS; second++) {
        const sum: Record<string, number> = {};
        const add = (dt: number) => {
          const s = b.tick(dt, senses);
          for (const k of COMMANDS) sum[k] = (sum[k] ?? 0) + (s.command[k] * dt) / 1000;
        };
        for (let tick = 0; tick < 100; tick++) {
          if (second === 2 && tick === 0) {
            // A 1 ms step at a rate that fires the one neuron in it, in every run alike.
            if (kick.neuron >= 0) b.sim.setRate(`kick.${kick.name}`, 1000);
            b.sim.recording!.fill(0);
            add(1);
            if (kick.neuron >= 0) {
              fired = b.sim.recording![kick.neuron];
              b.sim.setRate(`kick.${kick.name}`, 0);
            }
            add(9);
          } else add(10);
        }
        command.push(sum);
      }
      const run: Run = { seed, kick: kick.name, bodyId: kick.neuron >= 0 ? c.rootId[kick.neuron] : 0, fired, command };
      writeFileSync(`${path}.part`, JSON.stringify(run));
      renameSync(`${path}.part`, path);
    }
  }
} else {
  assert(values.controls, "--controls <the follow-up's directory on this model>");
  const runs: Run[] = readdirSync(out).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(out, f), "utf8")));
  const final = (r: { command: Record<string, number>[] }) => r.command[SECONDS - 1];
  const kicked: Record<string, number[]> = Object.fromEntries(COMMANDS.map((k) => [k, []]));
  const kicks = [];
  for (const run of runs.filter((r) => r.kick !== "none")) {
    const control = runs.find((r) => r.seed === run.seed && r.kick === "none");
    assert(control, `no control for seed ${run.seed}`);
    for (let s = 0; s < 2; s++) assert.deepEqual(run.command[s], control.command[s], "runs differ before the kick");
    const residual = Object.fromEntries(COMMANDS.map((k) => [k, final(run)[k] - final(control)[k]]));
    for (const k of COMMANDS) kicked[k].push(Math.abs(residual[k]));
    kicks.push({ seed: run.seed, kick: run.kick, bodyId: run.bodyId, fired: run.fired, residual, failsOriginal: COMMANDS.some((k) => Math.abs(residual[k]) > 0.05) });
  }
  assert.equal(kicks.length, 30, "Part B has ten kicks in each of seeds 21-23");
  // The follow-up's 75 pinned odour pulses on this model, against its pinned controls.
  const trials: RecordTrial[] = readdirSync(values.controls).filter((f) => /^pinned-(odor|none)-/.test(f) && f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(values.controls!, f), "utf8")));
  const pulsed: Record<string, number[]> = Object.fromEntries(COMMANDS.map((k) => [k, []]));
  let pulsesFailingOriginal = 0;
  for (const t of trials.filter((t) => t.family === "odor")) {
    const control = trials.find((u) => u.family === "none" && u.seed === t.seed);
    assert(control);
    const residual = COMMANDS.map((k) => Math.abs(t.bins[SECONDS - 1].command[k] - control.bins[SECONDS - 1].command[k]));
    COMMANDS.forEach((k, n) => pulsed[k].push(residual[n]));
    if (residual.some((r) => r > 0.05)) pulsesFailingOriginal++;
  }
  assert.equal(pulsed.walk.length, 75, "the follow-up's 75 pinned odour pulses");
  // One-sided Mann-Whitney U, pulses larger than kicks: normal approximation with tie correction.
  const test = (a: number[], b: number[]) => {
    const all = [...a.map((v) => ({ v, a: true })), ...b.map((v) => ({ v, a: false }))].sort((x, y) => x.v - y.v);
    const rank = new Float64Array(all.length);
    let ties = 0;
    for (let i = 0; i < all.length; ) {
      let j = i;
      while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
      for (let k = i; k <= j; k++) rank[k] = (i + j) / 2 + 1;
      const t = j - i + 1;
      ties += t * t * t - t;
      i = j + 1;
    }
    let r = 0;
    all.forEach((x, k) => {
      if (x.a) r += rank[k];
    });
    const n1 = a.length, n2 = b.length, n = n1 + n2;
    const u = r - (n1 * (n1 + 1)) / 2;
    const variance = ((n1 * n2) / 12) * (n + 1 - ties / (n * (n - 1)));
    if (variance <= 0) return { u, z: 0, p: 1, skipped: true };
    const z = (u - (n1 * n2) / 2) / Math.sqrt(variance);
    // Upper tail of the standard normal (Abramowitz & Stegun 7.1.26 via erfc).
    const erfc = (x: number) => {
      const t = 1 / (1 + 0.3275911 * x);
      return t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
    };
    const p = z >= 0 ? erfc(z / Math.SQRT2) / 2 : 1 - erfc(-z / Math.SQRT2) / 2;
    return { u, z, p, skipped: false };
  };
  const tests = Object.fromEntries(COMMANDS.map((k) => [k, test(pulsed[k], kicked[k])]));
  const failingKicks = kicks.filter((k) => k.failsOriginal).length;
  const larger = COMMANDS.filter((k) => !tests[k].skipped && tests[k].p < 0.05 / COMMANDS.length);
  console.log(JSON.stringify({
    kicks, failingKicks, originalEndpointUninformative: failingKicks >= 15,
    pulsesFailingOriginal,
    medians: Object.fromEntries(COMMANDS.map((k) => [k, { pulses: median(pulsed[k]), kicks: median(kicked[k]) }])),
    tests, pulsesLargerIn: larger,
  }, null, 2));
}

function median(x: number[]) {
  const s = x.toSorted((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
