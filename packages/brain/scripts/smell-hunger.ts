// Hunger on smell (docs/smell-hunger-protocol.md): what sNPFR1 on the
// receptor neurons of DM1, DM4 and DM2 does, fed against starved, at the
// projection neurons, in steering toward ethyl acetate, in the Kenyon cells,
// and what it costs. "Without" holds its stand-in at the starved end, where
// the weights are as wired: the brain before it.
//
//   node packages/brain/scripts/smell-hunger.ts --part site [--seeds 1,2,3]
//   node packages/brain/scripts/smell-hunger.ts --part steering --out <dir> [--seeds 41,...] [--hunger 0]
//   node packages/brain/scripts/smell-hunger.ts --part steering --out <dir> --reduce
//   node packages/brain/scripts/smell-hunger.ts --part kc [--seeds 1,2,3]
//   node packages/brain/scripts/smell-hunger.ts --part cost
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { releaseName } from "../src/modulation.ts";
import { readConnectomeFile } from "../src/node.ts";
import { ODORANTS } from "../src/olfaction.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string" },
    seeds: { type: "string" },
    out: { type: "string" },
    hunger: { type: "string" },
    reduce: { type: "boolean", default: false },
  },
});
const part = values.part;
assert(part && ["site", "steering", "kc", "cost"].includes(part), "--part site, steering, kc or cost");
const seedsOf = (fallback: string) => (values.seeds ?? fallback).split(",").map(Number);
const ethylAcetate = (strength: number) => ODORANTS.map((o) => (o === "ethylAcetate" ? strength : 0));

/** The arms: hunger, and whether the receptor acts. At 0.5 and 1 it is fully engaged, so with and without are the same brain. */
type Arm = { hunger: number; receptor: boolean };
const ARMS: Arm[] = [
  { hunger: 0, receptor: true },
  { hunger: 0, receptor: false },
  { hunger: 0.5, receptor: true },
  { hunger: 1, receptor: true },
];
const armName = (arm: Arm) => `hunger ${arm.hunger}${arm.receptor ? "" : " without"}`;

function brainFor(c: ReturnType<typeof readConnectomeFile>, seed: number, arm: Arm): FlyBrain {
  const b = new FlyBrain(c, { seed });
  if (!arm.receptor) {
    const sNPF = b.modulation.standIns.find((s) => s.spec.name === "sNPF")!;
    sNPF.spec = { name: sNPF.spec.name, transmitter: sNPF.spec.transmitter, description: sNPF.spec.description, state: sNPF.spec.state, hours: [[0, 1]] };
  }
  return b;
}

if (part === "site" || part === "kc") {
  const c = readConnectomeFile();
  const groups: [string, Uint32Array][] =
    part === "site"
      ? ["DM1_lPN", "DM4_adPN", "DM4_vPN", "DM2_lPN", "VA3_adPN", "VM2_adPN"].map((type) => [type, c.find({ type })])
      : [
          ["KC", c.find({ class: "Kenyon_Cell" })],
          ["ALPN", c.find({ class: "ALPN" })],
          ["MBON", c.find({ class: "MBON" })],
        ];
  const strengths = part === "site" ? [1, 0.25] : [1];
  const rows: Record<string, unknown>[] = [];
  for (const seed of seedsOf("1,2,3")) {
    for (const arm of ARMS) {
      for (const strength of strengths) {
        const b = brainFor(c, seed, arm);
        const rest: BrainSenses = { ...RESTING_SENSES, hunger: arm.hunger };
        for (let t = 0; t < 2000; t += 10) b.tick(10, rest);
        b.sim.setRecording(true);
        b.sim.recording!.fill(0);
        const smelling = { ...rest, odor: { left: ethylAcetate(strength), right: ethylAcetate(strength) } };
        for (let t = 0; t < 2000; t += 10) b.tick(10, smelling);
        const spikes = b.sim.recording!;
        const row: Record<string, unknown> = { seed, arm: armName(arm), strength };
        for (const [group, neurons] of groups) {
          let total = 0;
          let firing = 0;
          for (const i of neurons) {
            total += spikes[i];
            if (spikes[i] > 0) firing++;
          }
          row[group] = part === "site" ? total / neurons.length / 2 : { meanHz: total / neurons.length / 2, firing, share: firing / neurons.length };
        }
        rows.push(row);
        console.error(seed, armName(arm), strength);
      }
    }
  }
  console.log(JSON.stringify(rows, null, 2));
} else if (part === "steering") {
  // The gate protocol's Part C (scripts/olfaction-steering.ts), for P1 and S2, by arm.
  assert(values.out, "--out <dir>");
  const out = values.out;
  const SETTLE = 20;
  const STIMULUS = 5;
  const CONDITIONS = [
    { name: "P1", strength: 1 },
    { name: "S2", strength: 0.25 },
  ];
  type Run = { seed: number; arm: string; condition: string; mirrored: boolean; turn: number; command: Record<string, number> };
  if (!values.reduce) {
    const c = readConnectomeFile();
    const dm1 = { left: c.find({ superClass: "cb_sensory", class: "olfactory", type: "ORN_DM1", side: "left" }), right: c.find({ superClass: "cb_sensory", class: "olfactory", type: "ORN_DM1", side: "right" }) };
    const arms = values.hunger === undefined ? ARMS : ARMS.filter((a) => values.hunger!.split(",").map(Number).includes(a.hunger));
    mkdirSync(out, { recursive: true });
    for (const seed of seedsOf("41,42,43,44,45,46,47,48,49,50")) {
      for (const arm of arms) {
        const base: BrainSenses = { ...RESTING_SENSES, hunger: arm.hunger, clockMorning: 0, clockEvening: 0, clockSleep: 0, sleepPressure: 0, sleepDepth: 0 };
        const runs = [{ condition: null as (typeof CONDITIONS)[number] | null, mirrored: false }, ...CONDITIONS.flatMap((condition) => [false, true].map((mirrored) => ({ condition, mirrored })))];
        for (const { condition, mirrored } of runs) {
          const name = `${seed}-${armName(arm).replaceAll(" ", "_")}-${condition ? `${condition.name}-${mirrored ? "mirrored" : "written"}` : "control"}`;
          const path = join(out, `${name}.json`);
          if (existsSync(path)) continue;
          console.error(name);
          const b = brainFor(c, seed, arm);
          // As olfaction-steering.ts: every run has both groups, so its streams are the gate's.
          b.sim.addInput("steer DM1 left", dm1.left);
          b.sim.addInput("steer DM1 right", dm1.right);
          for (let t = 0; t < SETTLE * 100; t++) b.tick(10, base);
          const senses = { ...base };
          if (condition) {
            const more = ethylAcetate(condition.strength);
            const none = ethylAcetate(0);
            senses.odor = mirrored ? { left: none, right: more } : { left: more, right: none };
          }
          const command: Record<string, number> = {};
          for (let t = 0; t < STIMULUS * 100; t++) {
            const s = b.tick(10, senses);
            for (const [k, v] of Object.entries(s.command)) if (typeof v === "number") command[k] = (command[k] ?? 0) + v / (STIMULUS * 100);
          }
          const run: Run = { seed, arm: armName(arm), condition: condition?.name ?? "control", mirrored, turn: command.turn, command };
          writeFileSync(`${path}.part`, JSON.stringify(run));
          renameSync(`${path}.part`, path);
        }
      }
    }
  } else {
    const runs: Run[] = readdirSync(out).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(out, f), "utf8")));
    const seeds = [...new Set(runs.map((r) => r.seed))].sort((a, b) => a - b);
    assert.equal(seeds.join(","), "41,42,43,44,45,46,47,48,49,50", "Part C's seeds");
    // Two-sided 95% t quantile with 9 degrees of freedom, as olfaction-steering.ts.
    const T9 = 2.2621571627409915;
    const judge = (values: number[], sign = 1) => {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
      const ci = [mean - (T9 * sd) / Math.sqrt(values.length), mean + (T9 * sd) / Math.sqrt(values.length)];
      const agreeing = values.filter((x) => sign * x > 0).length;
      return { mean, ci, agreeing, passes: agreeing >= 8 && sign * ci[0] > 0 && sign * ci[1] > 0, values };
    };
    const T = (arm: string, condition: string) =>
      seeds.map((seed) => {
        const get = (mirrored: boolean) => runs.find((r) => r.seed === seed && r.arm === arm && r.condition === condition && r.mirrored === mirrored);
        const written = get(false);
        const mirrored = get(true);
        assert(written && mirrored, `seed ${seed} ${arm} ${condition} incomplete`);
        return (mirrored.turn - written.turn) / 2;
      });
    const arms = [...new Set(runs.map((r) => r.arm))];
    const result: Record<string, unknown> = {};
    for (const { name } of CONDITIONS) {
      result[name] = Object.fromEntries(arms.map((arm) => [arm, judge(T(arm, name))]));
      if (arms.includes("hunger 0 without")) {
        const withIt = T("hunger 0", name);
        const without = T("hunger 0 without", name);
        result[`${name} D (with - without, hunger 0)`] = { lower: judge(withIt.map((t, k) => t - without[k]), -1), higher: judge(withIt.map((t, k) => t - without[k])) };
      }
    }
    console.log(JSON.stringify(result, null, 2));
  }
} else {
  // What rewriting the receptor neurons' release costs, as scripts/hunger.ts section d times DopEcR's.
  const c = readConnectomeFile();
  const b = new FlyBrain(c, { seed: 1 });
  const routes = b.modulation.routes.filter((r) => r.spec.receptor === "sNPFR1");
  let connections = 0;
  for (const route of routes) for (const i of route.carriers) connections += c.ptr[i + 1] - c.ptr[i];
  const time = (run: (i: number) => void) => {
    for (let i = 0; i < 200; i++) run(i);
    const n = 2000;
    const started = performance.now();
    for (let i = 0; i < n; i++) run(i);
    return `${(((performance.now() - started) / n) * 1000).toFixed(1)} µs`;
  };
  const fed = routes.map((r) => new Float64Array(r.carriers.length).fill(r.factors![0] * 0.7));
  const starved = routes.map((r) => new Float64Array(r.carriers.length).fill(1));
  console.log(`carriers ${routes.reduce((n, r) => n + r.carriers.length, 0)}, connections ${connections}`);
  console.log(`release, all three rewritten: ${time((i) => routes.forEach((r, k) => b.sim.setOutputGains(releaseName(r.spec), (i % 2 ? fed : starved)[k])))}`);
  console.log(`modulation update: ${time(() => b.modulation.update(10))}`);
}
