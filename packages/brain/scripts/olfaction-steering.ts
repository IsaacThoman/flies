// Gate 3 (docs/olfaction-gates-protocol.md, Part C): does odour at one
// antenna turn the fly toward it, or away? The brain alone, open loop, as the
// game runs it. JSON per run goes to --out; --reduce gives each condition's
// steering index by seed and the decision.
//
//   node packages/brain/scripts/olfaction-steering.ts --out <dir> --seeds 31,32
//   node packages/brain/scripts/olfaction-steering.ts --out <dir> --reduce
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readConnectomeFile } from "../src/node.ts";
import { ODORANTS } from "../src/olfaction.ts";
import type { Odorant } from "../src/olfaction.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({ options: { out: { type: "string" }, seeds: { type: "string", default: "41,42,43,44,45,46,47,48,49,50" }, reduce: { type: "boolean", default: false } } });
assert(values.out);
const out = values.out;
const SETTLE = 20;
const STIMULUS = 5;
const COMMANDS = ["walk", "turn", "back", "escape", "wings", "groom", "feed", "sing"] as const;
type Side = Partial<Record<Odorant, number>>;
// The left column of the protocol's table: what the antenna given more gets, and the other.
type Condition = { name: string; more: Side; less: Side; dm1?: number; prediction: "toward" | "away" | null };
const CONDITIONS: Condition[] = [
  { name: "P1", more: { ethylAcetate: 1 }, less: {}, prediction: "toward" },
  { name: "S1", more: { co2: 1 }, less: {}, prediction: "away" },
  { name: "S2", more: { ethylAcetate: 0.25 }, less: {}, prediction: "toward" },
  { name: "S3", more: { ethylAcetate: 1 }, less: { ethylAcetate: 0.5 }, prediction: "toward" },
  { name: "S4", more: {}, less: {}, dm1: 100, prediction: "toward" },
  { name: "S5", more: { isoamylAcetate: 1 }, less: {}, prediction: null },
];
type Run = { seed: number; condition: string; mirrored: boolean; command: Record<string, number> };
const array = (side: Side) => ODORANTS.map((o) => side[o] ?? 0);

if (!values.reduce) {
  const c = readConnectomeFile();
  const dm1 = { left: c.find({ superClass: "cb_sensory", class: "olfactory", type: "ORN_DM1", side: "left" }), right: c.find({ superClass: "cb_sensory", class: "olfactory", type: "ORN_DM1", side: "right" }) };
  const base: BrainSenses = { ...RESTING_SENSES, hunger: 1, clockMorning: 0, clockEvening: 0, clockSleep: 0, sleepPressure: 0, sleepDepth: 0 };
  mkdirSync(out, { recursive: true });
  for (const seed of values.seeds.split(",").map(Number)) {
    const runs = [{ condition: null as Condition | null, mirrored: false }, ...CONDITIONS.flatMap((condition) => [false, true].map((mirrored) => ({ condition, mirrored })))];
    for (const { condition, mirrored } of runs) {
      const name = condition ? `${seed}-${condition.name}-${mirrored ? "mirrored" : "written"}` : `${seed}-control`;
      const path = join(out, `${name}.json`);
      if (existsSync(path)) continue;
      console.error(name);
      const b = new FlyBrain(c, { seed });
      // Every run has both groups, so every stream is the same until the stimulus.
      b.sim.addInput("steer DM1 left", dm1.left);
      b.sim.addInput("steer DM1 right", dm1.right);
      for (let t = 0; t < SETTLE * 100; t++) b.tick(10, base);
      const senses = { ...base };
      if (condition) {
        const [left, right] = mirrored ? [condition.less, condition.more] : [condition.more, condition.less];
        senses.odor = { left: array(left), right: array(right) };
        if (condition.dm1) b.sim.setRate(`steer DM1 ${mirrored ? "right" : "left"}`, condition.dm1);
      }
      const command: Record<string, number> = Object.fromEntries(COMMANDS.map((k) => [k, 0]));
      for (let t = 0; t < STIMULUS * 100; t++) {
        const s = b.tick(10, senses);
        for (const k of COMMANDS) command[k] += s.command[k] / (STIMULUS * 100);
      }
      const run: Run = { seed, condition: condition?.name ?? "control", mirrored, command };
      writeFileSync(`${path}.part`, JSON.stringify(run));
      renameSync(`${path}.part`, path);
    }
  }
} else {
  const runs: Run[] = readdirSync(out).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(out, f), "utf8")));
  const seeds = [...new Set(runs.map((r) => r.seed))].sort((a, b) => a - b);
  // Seeds 31-40 on the model with resting firing, 41-50 on the one without (protocol, Amendment 1).
  assert(["31,32,33,34,35,36,37,38,39,40", "41,42,43,44,45,46,47,48,49,50"].includes(seeds.join(",")), "Part C runs seeds 31-40 or 41-50");
  // Two-sided 95% t quantile with 9 degrees of freedom.
  const T9 = 2.2621571627409915;
  const result = CONDITIONS.map((condition) => {
    const bySeed = seeds.map((seed) => {
      const get = (mirrored: boolean) => runs.find((r) => r.seed === seed && r.condition === condition.name && r.mirrored === mirrored);
      const written = get(false), mirrored = get(true), control = runs.find((r) => r.seed === seed && r.condition === "control");
      assert(written && mirrored && control, `seed ${seed} ${condition.name} incomplete`);
      const index = (mirrored.command.turn - written.command.turn) / 2;
      const others = Object.fromEntries(COMMANDS.map((k) => [k, (written.command[k] + mirrored.command[k]) / 2 - control.command[k]]));
      return { seed, T: index, controlTurn: control.command.turn, written: written.command.turn, mirrored: mirrored.command.turn, meanChangeFromControl: others };
    });
    const t = bySeed.map((s) => s.T);
    const mean = t.reduce((a, b) => a + b, 0) / t.length;
    const sd = Math.sqrt(t.reduce((a, b) => a + (b - mean) ** 2, 0) / (t.length - 1));
    const ci = [mean - (T9 * sd) / Math.sqrt(t.length), mean + (T9 * sd) / Math.sqrt(t.length)];
    const sign = condition.prediction === "away" ? -1 : 1;
    const agreeing = t.filter((x) => sign * x > 0).length;
    const passes = condition.prediction ? agreeing >= 8 && sign * ci[0] > 0 && sign * ci[1] > 0 : null;
    return { condition: condition.name, more: condition.more, less: condition.less, dm1: condition.dm1 ?? 0, prediction: condition.prediction, mean, sd, ci, agreeing, passes, bySeed };
  });
  console.log(JSON.stringify({ gate3: result.find((r) => r.condition === "P1")!.passes, result }, null, 2));
}
