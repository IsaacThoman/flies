// What a cell type of one eye does to the commands, on top of the running brain:
//
//   node packages/brain/scripts/routes.ts --type Mi1 [--withdraw] [--rate 50] [--seeds 1,2,3]
//
// The brain runs with its eyes open on a steady grey scene (which, adapted to,
// drives nothing) and the visual background on, as it is at rest. After 3 s,
// every neuron of the type in one eye is driven at --rate for 5 s: firing, or
// with --withdraw, withdrawing its release (its targets get the opposite of
// its spikes, as L1's withdrawals under brightening are delivered: Seeing in
// the README). The drive is the last input added, so it leaves every other
// input's stream as it was, and each run is set against a control of the same
// seed without it. Each eye in turn, each seed:
//
//   turn toward   the mean turn command toward the driven eye's side, less the control's
//   DNa02         the driven eye's side's DNa02 and the other's, Hz, less the control's
//   walk          the mean walk command, less the control's
//   escape        the escape command's peak (the control's in brackets)
//
// --type takes a comma-separated list of exact types or a /regex/.
// docs/simulation.md (A light on the table) uses it for which of the eye's
// cells can steer the fly.

import { parseArgs } from "node:util";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    type: { type: "string" },
    withdraw: { type: "boolean", default: false },
    rate: { type: "string", default: "50" },
    seeds: { type: "string", default: "1,2,3" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
if (!values.type) throw new Error("--type is required, e.g. --type Mi1 or --type /^R7/");
const pattern = values.type.startsWith("/") ? new RegExp(values.type.slice(1, values.type.lastIndexOf("/"))) : null;
const listed = new Set(values.type.split(","));
const matches = (t: string) => (pattern ? pattern.test(t) : listed.has(t));
const rate = Number(values.rate);
const seeds = values.seeds.split(",").map(Number);
const c = readConnectomeFile(values.path);
const SETTLE_MS = 3000;
const DRIVE_MS = 5000;
const TICK = 100;

type Run = { turn: number; walk: number; escape: number; dna02: { left: number; right: number } };

function run(seed: number, side: "left" | "right" | null): Run {
  const brain = new FlyBrain(c, { seed });
  if (!brain.vision) throw new Error("this connectome has no eyes");
  const light = { left: new Float32Array(brain.vision.retina.left.facets).fill(0.5), right: new Float32Array(brain.vision.retina.right.facets).fill(0.5) };
  const neurons = side ? c.filter((i) => matches(c.columns.type.value(i)) && c.columns.side.value(i) === side) : null;
  if (neurons) {
    if (neurons.length === 0) throw new Error(`no ${values.type} in the ${side} eye`);
    brain.sim.addRatedInput("driven", neurons, { withdraw: values.withdraw });
  }
  const senses = { ...RESTING_SENSES, light };
  for (let t = 0; t < SETTLE_MS; t += TICK) brain.tick(TICK, senses);
  if (neurons) brain.sim.setRates("driven", new Float64Array(neurons.length).fill(rate));
  const out: Run = { turn: 0, walk: 0, escape: 0, dna02: { left: 0, right: 0 } };
  const ticks = DRIVE_MS / TICK;
  for (let t = 0; t < ticks; t++) {
    const { command } = brain.tick(TICK, senses);
    out.turn += command.turn / ticks;
    out.walk += command.walk / ticks;
    out.escape = Math.max(out.escape, command.escape);
    out.dna02.left += brain.rates["DNa02 left"] / ticks;
    out.dna02.right += brain.rates["DNa02 right"] / ticks;
  }
  return out;
}

const fixed = (n: number, digits = 3) => (n >= 0 ? "+" : "") + n.toFixed(digits);
const count = (side: "left" | "right") => c.filter((i) => matches(c.columns.type.value(i)) && c.columns.side.value(i) === side).length;
console.log(`${values.type}, ${values.withdraw ? "withdrawing" : "firing"} at ${rate} Hz for ${DRIVE_MS / 1000} s (${count("left")} left, ${count("right")} right), against a control of the same seed:`);
console.log("  eye    seed  turn toward  DNa02 that side, other   walk    escape (control)");
const controls = new Map(seeds.map((seed) => [seed, run(seed, null)]));
for (const side of ["left", "right"] as const) {
  const toward = side === "right" ? 1 : -1;
  const other = side === "right" ? "left" : "right";
  for (const seed of seeds) {
    const control = controls.get(seed)!;
    const driven = run(seed, side);
    console.log(
      `  ${side.padEnd(6)} ${String(seed).padStart(4)}  ${fixed((driven.turn - control.turn) * toward).padStart(11)}  ${fixed(driven.dna02[side] - control.dna02[side], 1).padStart(8)} ${fixed(driven.dna02[other] - control.dna02[other], 1).padStart(6)}  ${fixed(driven.walk - control.walk, 2).padStart(6)}  ${driven.escape.toFixed(2)} (${control.escape.toFixed(2)})`,
    );
  }
}
