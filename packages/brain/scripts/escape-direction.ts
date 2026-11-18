// Which way it would jump: whether the looming-sensitive descending neurons
// carry where a loom is, before the giant fiber takes the fly off.
//
//   node packages/brain/scripts/escape-direction.ts [--seeds 1,2,3,4,5,6] [--only <regex>] [--path connectome.bin]
//
// A dark disc looms (half-size over speed 40 ms, src/stimuli.ts) from each
// direction of DIRECTIONS, with the eyes open, after 1 s of the steady white
// ground; and, with the eyes shut, the hand-wired looming input (`loomLeft`,
// `loomRight` at 1) on each side and both. For each it records the spikes of
// the giant fiber (DNp01), DNp02, DNp04 and DNp11 of each side in the 200 ms
// before `escape` first reaches the body's take-off threshold (0.4,
// packages/body/src/behavior.ts ESCAPE_ON), or before contact if it never
// does; and over the whole loom up to that point.
//
// It prints each neuron's rate, the forward-backward index of each side
// (DNp11 minus DNp02, Hz: Dombrovski et al. 2023 find DNp11 drives forward
// shifts and take-offs and DNp02 backward ones), then evaluates the criteria
// the README fixes beforehand (Which way it jumps).

import { parseArgs } from "node:util";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { facetAngles, loom, render } from "../src/stimuli.ts";
import type { Stimulus } from "../src/stimuli.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "1,2,3,4,5,6" },
    only: { type: "string" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});

const TICK = 10;
const ESCAPE_ON = 0.4;
const WINDOW_MS = 200;
const LV = 0.04;
/** Azimuth (degrees toward the right, 0 ahead) and elevation of each loom. */
export const DIRECTIONS = {
  front: [0, 0],
  behind: [180, 0],
  left: [-90, 0],
  right: [90, 0],
  above: [0, 90],
  "left eye, front": [-30, 0],
  "left eye, rear": [-130, 0],
  "right eye, front": [30, 0],
  "right eye, rear": [130, 0],
} as const;
const PULSES = { "pulse left": { loomLeft: 1 }, "pulse right": { loomRight: 1 }, "pulse both": { loomLeft: 1, loomRight: 1 } } as const;
const TYPES = ["DNp01", "DNp02", "DNp04", "DNp11"] as const;
const SIDES = ["left", "right"] as const;
type Key = `${(typeof TYPES)[number]} ${(typeof SIDES)[number]}`;
const KEYS = TYPES.flatMap((t) => SIDES.map((s) => `${t} ${s}` as Key));

type Run = {
  /** ms from the loom's start at which escape first reached ESCAPE_ON, or null. */
  crossed: number | null;
  /** Mean rate per neuron, Hz, in the WINDOW_MS before the crossing (or contact), and over the whole loom to then. */
  window: Record<Key, number>;
  whole: Record<Key, number>;
  escapePeak: number;
};

const connectome = readConnectomeFile(values.path);
const groups = Object.fromEntries(KEYS.map((k) => [k, connectome.find({ type: k.split(" ")[0], side: k.split(" ")[1] })])) as Record<Key, Uint32Array>;

function run(seed: number, stimulus: Stimulus | null, pulse: Partial<BrainSenses> | null): Run {
  const brain = new FlyBrain(connectome, { seed });
  const eyes = stimulus !== null;
  const angles = eyes ? facetAngles(brain.eyes!) : null;
  const light = angles ? { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) } : null;
  const ground = () => 1;
  const senses = (t: number, live: boolean): BrainSenses => {
    if (!light) return live ? { ...RESTING_SENSES, ...pulse } : RESTING_SENSES;
    render(live ? stimulus!.scene : ground, t / 1000, angles!, light);
    return { ...RESTING_SENSES, light };
  };
  for (let t = 0; t < 1000; t += TICK) brain.tick(TICK, senses(0, false));
  brain.sim.setRecording(true);
  const recording = brain.sim.recording!;
  // Per tick, each group's total spike count so far.
  const totals: number[][] = [];
  const count = () => KEYS.map((k) => groups[k].reduce((a, i) => a + recording[i], 0));
  totals.push(count());
  // The loom reaches contact at `contact` ms; the pulse is held 300 ms.
  const contact = stimulus ? Math.round((LV / Math.tan((2.5 * Math.PI) / 180)) * 1000) : 300;
  const end = stimulus ? stimulus.seconds * 1000 : 300;
  let crossed: number | null = null;
  let escapePeak = 0;
  for (let t = 0; t < end && crossed === null; t += TICK) {
    const { command } = brain.tick(TICK, senses(t, true));
    totals.push(count());
    escapePeak = Math.max(escapePeak, command.escape);
    if (command.escape >= ESCAPE_ON) crossed = t + TICK;
  }
  const stop = crossed ?? Math.min(contact, end);
  const at = (ms: number) => totals[Math.min(totals.length - 1, Math.round(ms / TICK))];
  const rates = (from: number, to: number) =>
    Object.fromEntries(KEYS.map((k, j) => [k, (at(to)[j] - at(from)[j]) / groups[k].length / ((to - from) / 1000)])) as Record<Key, number>;
  return { crossed, window: rates(Math.max(0, stop - WINDOW_MS), stop), whole: rates(0, stop), escapePeak };
}

const seeds = values.seeds.split(",").map(Number);
const only = values.only ? new RegExp(values.only) : null;
const conditions: [string, () => (seed: number) => Run][] = [
  ...Object.entries(DIRECTIONS).map(([name, [az, el]]) => [name, () => (seed: number) => run(seed, loom(name, az, el, LV), null)] as [string, () => (seed: number) => Run]),
  ...Object.entries(PULSES).map(([name, pulse]) => [name, () => (seed: number) => run(seed, null, pulse)] as [string, () => (seed: number) => Run]),
];
const results = new Map<string, Run[]>();
for (const [name, make] of conditions) {
  if (only && !only.test(name)) continue;
  const go = make();
  results.set(name, seeds.map((seed) => go(seed)));
}

const f = (x: number, d = 1) => x.toFixed(d);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / Math.max(1, xs.length - 1));
const range = (xs: number[], d = 1) => `${f(Math.min(...xs), d)} to ${f(Math.max(...xs), d)}`;
/** Forward-backward index of a side, Hz: DNp11 minus DNp02. Positive is forward. */
const index = (r: Record<Key, number>, side: "left" | "right" | "both"): number =>
  side === "both" ? index(r, "left") + index(r, "right") : r[`DNp11 ${side}`] - r[`DNp02 ${side}`];

console.log(`Seeds ${seeds.join(", ")}. Rates per neuron (Hz), range over seeds, in the ${WINDOW_MS} ms before escape reached ${ESCAPE_ON} (or contact).`);
for (const [name, runs] of results) {
  const crossed = runs.map((r) => r.crossed);
  console.log(`\n${name}: crossed ${crossed.map((c) => (c === null ? "never" : `${c} ms`)).join(", ")}; escape peak ${range(runs.map((r) => r.escapePeak), 2)}`);
  for (const k of KEYS) console.log(`  ${k.padEnd(13)}${range(runs.map((r) => r.window[k])).padStart(16)}   whole loom ${range(runs.map((r) => r.whole[k]))}`);
  for (const side of ["left", "right", "both"] as const) {
    const xs = runs.map((r) => index(r.window, side));
    console.log(`  DNp11 - DNp02, ${side.padEnd(6)}${xs.map((x) => f(x)).join(" ").padStart(40)}   mean ${f(mean(xs))}, sd ${f(sd(xs))}`);
  }
}

/** A difference across seeds passes when it has the published sign in every seed and its mean is more than twice its spread. */
function test(label: string, a: string, b: string, side: "left" | "right" | "both") {
  const ra = results.get(a);
  const rb = results.get(b);
  if (!ra || !rb) return null;
  const d = ra.map((r, k) => index(r.window, side) - index(rb[k].window, side));
  const pass = d.every((x) => x > 0) && mean(d) > 2 * sd(d);
  console.log(`  ${label.padEnd(52)}${d.map((x) => f(x)).join(" ").padStart(40)}   mean ${f(mean(d))}, sd ${f(sd(d))}: ${pass ? "PASS" : "FAIL"}`);
  return pass;
}
/** The index's own sign, for a readout read without a fitted offset: backward (< 0) from the front, forward (> 0) from behind, in 5 of 6 seeds. */
function sign(label: string, name: string, want: 1 | -1) {
  const runs = results.get(name);
  if (!runs) return null;
  const xs = runs.map((r) => index(r.window, "both"));
  const right = xs.filter((x) => Math.sign(x) === want).length;
  const pass = right >= Math.ceil((5 / 6) * xs.length);
  console.log(`  ${label.padEnd(52)}${xs.map((x) => f(x)).join(" ").padStart(40)}   ${right} of ${xs.length}: ${pass ? "PASS" : "FAIL"}`);
  return pass;
}
console.log("\nCriteria (README, Which way it jumps): index differences, rear minus front, by seed");
const i = test("(i) right eye: rear (130) minus front (30), right side", "right eye, rear", "right eye, front", "right");
const ii = test("(i) left eye: rear (-130) minus front (-30), left side", "left eye, rear", "left eye, front", "left");
const iii = test("(ii) behind minus front, both sides", "behind", "front", "both");
const iv = sign("(iii) front: the index's sign is backward", "front", -1);
const v = sign("(iii) behind: the index's sign is forward", "behind", 1);
console.log("\nReported, not a criterion: each side's four types together, right minus left (Hz), by seed");
for (const name of ["left", "right", "pulse left", "pulse right"]) {
  const runs = results.get(name);
  if (!runs) continue;
  const total = (r: Record<Key, number>, side: "left" | "right") => TYPES.reduce((a, t) => a + r[`${t} ${side}`], 0);
  console.log(`  ${name.padEnd(52)}${runs.map((r) => f(total(r.window, "right") - total(r.window, "left"))).join(" ").padStart(40)}`);
}
if ([i, ii, iii, iv, v].every((x) => x !== null)) {
  const ap = i && ii && iii;
  console.log(`\nForward-backward carried: ${ap ? "yes" : i || ii ? "on one eye only" : "no"}; readable as a sign without an offset: ${ap && iv && v ? "yes" : "no"}.`);
}
