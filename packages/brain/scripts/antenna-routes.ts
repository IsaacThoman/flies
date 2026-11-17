// Whether a push on an antenna can reach backing (MDN) and steering (DNa02)
// through the wiring: every sensory neuron a push could plausibly excite,
// side by side, at the operating point. For the README's "A push on an
// antenna → backing away" (What it does and doesn't reproduce).
//
//   node packages/brain/scripts/antenna-routes.ts [--seeds 1,2,3] [--scale 1]
//
// The candidates, each antenna's own: Johnston's organ zones C and E (what
// `bumpLeft` and `bumpRight` drive), zone F (whose activation backs a fly
// away, Hampel et al. 2020, though it answered no push in their imaging), the
// sound zones A and B (a step's onset), all of Johnston's organ, and the
// mechanosensory bristles that enter by the antennal nerve (the male CNS's
// type `BM`, which FlyWire splits into the antenna's, the frontal head's, the
// ocelli's, the orbit's and the vibrissae's: no finer split is in the data).
// Johnston's organ at 100 Hz, the bristles at touch's head rate, 50 Hz;
// `--scale` multiplies both, to see how far from enough they are.
//
// Wiring: synapses from each group onto MDN and DNa02 of each side, directly
// and through one other neuron (each route counted by its weaker leg).
// Simulation: from rest standing (the visual background on, `grounded`),
// after 2 s settling, the group driven for 1 s: each readout's mean rate, and
// `back`'s peak and `turn`'s mean (positive toward the fly's right, away from
// a push on its left antenna).

import { parseArgs } from "node:util";
import type { NeuronQuery } from "../src/format.ts";
import { readConnectomeFile } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "1,2,3" },
    scale: { type: "string", default: "1" },
  },
});
const seeds = values.seeds.split(",").map(Number);
const scale = Number(values.scale);
const c = readConnectomeFile();

type Side = "left" | "right";
const SIDES: readonly Side[] = ["left", "right"];
const GROUPS: { name: string; query: NeuronQuery; rate: number }[] = [
  { name: "JO-C/E", query: { superClass: "cb_sensory", type: /^JO-[CE]/ }, rate: 100 },
  { name: "JO-F", query: { superClass: "cb_sensory", type: /^JO-F/ }, rate: 100 },
  { name: "JO-A/B", query: { superClass: "cb_sensory", type: /^JO-[AB]/ }, rate: 100 },
  { name: "all JO", query: { superClass: "cb_sensory", type: /^JO-/ }, rate: 100 },
  { name: "BM (AN)", query: { superClass: "cb_sensory", type: "BM" }, rate: 50 },
];
const group = (name: string, side: Side) => c.find({ ...GROUPS.find((g) => g.name === name)!.query, side });
const READ = {
  "MDN l": c.find({ type: "MDN", side: "left" }),
  "MDN r": c.find({ type: "MDN", side: "right" }),
  "DNa02 l": c.find({ type: "DNa02", side: "left" }),
  "DNa02 r": c.find({ type: "DNa02", side: "right" }),
  DNg12: c.find({ type: ["DNg12_a", "DNg12_b", "DNg12_c"] }),
};

function wiring() {
  console.log("Wiring: synapses onto each target, direct | through one neuron (sum over routes of the weaker leg), and the strongest such route");
  const targets = Object.entries(READ).filter(([name]) => name !== "DNg12");
  const into = new Map<number, Map<string, number>>();
  for (let p = 0; p < c.neurons; p++) {
    for (let e = c.ptr[p]; e < c.ptr[p + 1]; e++) {
      for (const [name, neurons] of targets) {
        if (!neurons.includes(c.post[e])) continue;
        const m = into.get(p) ?? new Map<string, number>();
        m.set(name, (m.get(name) ?? 0) + c.count[e]);
        into.set(p, m);
      }
    }
  }
  for (const { name } of GROUPS) {
    for (const side of SIDES) {
      const from = group(name, side);
      const direct = new Map<string, number>();
      const via = new Map<number, number>();
      for (const p of from) {
        for (let e = c.ptr[p]; e < c.ptr[p + 1]; e++) {
          const m = c.post[e];
          if (into.has(m)) via.set(m, (via.get(m) ?? 0) + c.count[e]);
          for (const [t, neurons] of targets) if (neurons.includes(m)) direct.set(t, (direct.get(t) ?? 0) + c.count[e]);
        }
      }
      const cells = targets.map(([t]) => {
        let sum = 0;
        let best = { syn: 0, label: "" };
        for (const [m, fromSyn] of via) {
          const onward = into.get(m)!.get(t) ?? 0;
          const route = Math.min(fromSyn, onward);
          sum += route;
          if (route > best.syn) best = { syn: route, label: `${c.columns.type.value(m) || "?"} ${c.columns.side.value(m)[0] ?? "?"} ${fromSyn}→${onward}` };
        }
        return `${t} ${direct.get(t) ?? 0} | ${sum}${best.syn ? ` (${best.label})` : ""}`;
      });
      console.log(`  ${`${name} ${side}`.padEnd(15)} ${String(from.length).padStart(4)} neurons  ${cells.join("   ")}`);
    }
  }
}

const SETTLE_MS = 2000;
const DRIVE_MS = 1000;
const REST: BrainSenses = { loomLeft: 0, loomRight: 0, touch: 0, bumpLeft: 0, bumpRight: 0, wind: 0, sweet: 0, grounded: true, maleTaste: 0, wingbeat: 0 };

function simulate(label: string, driven: { name: string; side: Side }[]) {
  const means: Record<string, number[]> = {};
  const back: number[] = [];
  const turn: number[] = [];
  const groom: number[] = [];
  for (const seed of seeds) {
    const brain = new FlyBrain(c, { seed });
    driven.forEach(({ name, side }, k) => brain.sim.addInput(`candidate ${k}`, group(name, side), 0));
    for (let t = 0; t < SETTLE_MS; t += 10) brain.tick(10, REST);
    driven.forEach(({ name }, k) => brain.sim.setRate(`candidate ${k}`, GROUPS.find((g) => g.name === name)!.rate * scale));
    brain.sim.setRecording(true);
    let peakBack = 0;
    let peakGroom = 0;
    let sumTurn = 0;
    let ticks = 0;
    for (let t = 0; t < DRIVE_MS; t += 10) {
      const { command } = brain.tick(10, REST);
      peakBack = Math.max(peakBack, command.back);
      peakGroom = Math.max(peakGroom, command.groom);
      sumTurn += command.turn;
      ticks++;
    }
    const spikes = brain.sim.recording!;
    for (const [name, neurons] of Object.entries(READ)) {
      let n = 0;
      for (const i of neurons) n += spikes[i];
      (means[name] ??= []).push((n / neurons.length / DRIVE_MS) * 1000);
    }
    back.push(peakBack);
    turn.push(sumTurn / ticks);
    groom.push(peakGroom);
  }
  const range = (xs: number[], digits: number) => {
    const lo = Math.min(...xs).toFixed(digits);
    const hi = Math.max(...xs).toFixed(digits);
    return lo === hi ? lo : `${lo}–${hi}`;
  };
  const rates = Object.entries(means).map(([name, xs]) => `${name} ${range(xs, 1)}`);
  console.log(`  ${label.padEnd(26)} ${rates.join("  ")} Hz | back peak ${range(back, 2)}, turn mean ${range(turn, 2)}, groom peak ${range(groom, 2)}`);
}

wiring();
console.log(`\nSimulation: from rest standing, each driven for ${DRIVE_MS} ms (Johnston's organ at ${100 * scale} Hz, bristles at ${50 * scale} Hz), seeds ${seeds.join(", ")}; ranges over seeds`);
simulate("rest", []);
for (const { name } of GROUPS) for (const side of SIDES) simulate(`${name} ${side}`, [{ name, side }]);
for (const side of SIDES) simulate(`all JO + BM (AN) ${side}`, [{ name: "all JO", side }, { name: "BM (AN)", side }]);
simulate("JO-C/E both", [{ name: "JO-C/E", side: "left" }, { name: "JO-C/E", side: "right" }]);
simulate("JO-C/E + JO-F both", SIDES.flatMap((side) => [{ name: "JO-C/E", side }, { name: "JO-F", side }]));
simulate("all JO + BM (AN) both", SIDES.flatMap((side) => [{ name: "all JO", side }, { name: "BM (AN)", side }]));
