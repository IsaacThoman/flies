// Slow neuromodulation, measured on the real connectome (README, Slow
// neuromodulation):
//
//   node packages/brain/scripts/modulation.ts [--part census|levels|sleep|restless] [--seeds 1,2,3] [--seconds 60] [--path connectome.bin]
//
// census: the modulatory neurons by transmitter, what params.ts's fixes made
//   of them, each receptor's carriers and where their transmitter comes from;
// levels: each modulatory type's level at rest, averaged over a minute, seed 1;
// sleep: the dorsal fan-shaped body's sleep-promoting neurons at sleep
//   pressure 0, 0.5 and 1, and its dopaminergic neurons driven at 10 Hz for 10
//   minutes and left for 30: Dop1R2 engaging and letting go, the sleep
//   neurons' rate, and walking (the internal state's sleep term left out, so
//   that only the fan-shaped body differs);
// restless: a diagnostic, not the model. A release raised 1.5 fold on every
//   partner of each group of the gnathal ganglia's octopaminergic neurons,
//   with learning off, and how much the fly walks at rest over a minute: whether octopamine
//   from them could reach walking at all (README, Hunger).

import { parseArgs } from "node:util";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { MODULATORS } from "../src/modulation.ts";
import { TRANSMITTER_FIXES, transmitters } from "../src/params.ts";
import { INTERNAL_STATE } from "../src/state.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    part: { type: "string" },
    seeds: { type: "string", default: "1,2,3" },
    seconds: { type: "string", default: "60" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
const connectome = readConnectomeFile(values.path);
const seeds = values.seeds!.split(",").map(Number);
const parts = values.part ? [values.part] : ["census", "levels", "sleep", "restless"];
const TICK = 16;
const restlessMs = Number(values.seconds) * 1000;
if (!Number.isFinite(restlessMs) || restlessMs <= 0) throw new Error("seconds must be positive and finite");
const type = (i: number) => connectome.columns.type.value(i);

if (parts.includes("census")) {
  const brain = new FlyBrain(connectome);
  const m = brain.modulation;
  const { changed } = transmitters(connectome, TRANSMITTER_FIXES);
  console.log("(census) Modulatory neurons, by transmitter after the fixes:");
  for (const t of MODULATORS) console.log(`    ${t}: ${m.transmitters.filter((x) => x === t).length}`);
  TRANSMITTER_FIXES.forEach((fix, k) => console.log(`    fix ${k + 1}: ${changed[k]} neurons (${fix.nt})`));
  for (const route of m.routes) {
    const from = "standIn" in route.spec.from ? `the stand-in ${route.spec.from.standIn}` : `${route.spec.transmitter} through ${route.from!.length} connections from ${new Set(route.from).size} neurons`;
    console.log(`    ${route.spec.receptor}: ${route.carriers.length} carriers, from ${from}`);
  }
  console.log(`    excitability set on ${m.excitable.length} neurons`);
}

/** Runs a brain at these senses for `ms`, calling `each` after every tick. */
const run = (brain: FlyBrain, senses: BrainSenses, ms: number, each?: () => void) => {
  let walking = 0;
  let ticks = 0;
  for (let t = 0; t < ms; t += TICK) {
    if (brain.tick(TICK, senses).command.walk > 0.2) walking++;
    ticks++;
    each?.();
  }
  return walking / ticks;
};

if (parts.includes("levels")) {
  const brain = new FlyBrain(connectome, { seed: 1 });
  const m = brain.modulation;
  const mean = new Float64Array(m.sources.length);
  let ticks = 0;
  run(brain, RESTING_SENSES, 60_000, () => {
    for (let k = 0; k < mean.length; k++) mean[k] += m.level[k];
    ticks++;
  });
  const byType = new Map<string, { sum: number; n: number; nt: string }>();
  m.sources.forEach((i, k) => {
    const key = type(i) || "(no type)";
    const e = byType.get(key) ?? { sum: 0, n: 0, nt: m.transmitters[k] };
    e.sum += mean[k] / ticks;
    e.n++;
    byType.set(key, e);
  });
  const rows = [...byType].map(([t, e]) => ({ t, level: e.sum / e.n, n: e.n, nt: e.nt })).filter((r) => r.level >= 0.1).sort((a, b) => b.level - a.level);
  console.log(`\n(levels) At rest over a minute, seed 1: ${rows.length} modulatory types at 0.1 Hz or more (of ${byType.size}), mean level, Hz:`);
  for (const r of rows) console.log(`    ${r.t.padEnd(14)} ${r.nt.padEnd(4)} ×${String(r.n).padEnd(3)} ${r.level.toFixed(2)}`);
}

if (parts.includes("sleep")) {
  console.log("\n(sleep) The dorsal fan-shaped body, seed 1, the sleep term left out (spikes per neuron per second; walking share):");
  // The sleep term reads sleepPressure too; with its weight 0 only the fan-shaped body hears it.
  const internalState = { ...INTERNAL_STATE, sleep: { ...INTERNAL_STATE.sleep, pressure: 0 } };
  for (const pressure of [0, 0.5, 1]) {
    const brain = new FlyBrain(connectome, { seed: 1, internalState });
    const sleepers = brain.wiring.excitability[0].neurons;
    brain.sim.setRecording(true);
    const walking = run(brain, { ...RESTING_SENSES, sleepPressure: pressure }, 60_000);
    let spikes = 0;
    for (const i of sleepers) spikes += brain.sim.recording![i];
    console.log(`    pressure ${pressure}: sleep-promoting neurons ${(spikes / sleepers.length / 60).toFixed(3)} Hz, walking ${(100 * walking).toFixed(1)}%`);
  }
  for (const drive of [0, 10]) {
    const brain = new FlyBrain(connectome, { seed: 1, internalState });
    const route = brain.modulation.routes.find((r) => r.spec.receptor === "Dop1R2")!;
    const dopaminergic = brain.modulation.sources.filter((_, k) => route.from!.includes(k));
    brain.sim.addInput("dFB dopamine", dopaminergic, 0);
    const sleepers = brain.wiring.excitability[0].neurons;
    const mean = (a: Float64Array) => a.reduce((s, x) => s + x, 0) / a.length;
    const report: string[] = [];
    for (const [minutes, rate] of [
      [10, drive],
      [30, 0],
    ]) {
      brain.sim.setRate("dFB dopamine", rate);
      brain.sim.setRecording(true);
      const walking = run(brain, { ...RESTING_SENSES, sleepPressure: 1 }, minutes * 60_000);
      let spikes = 0;
      for (const i of sleepers) spikes += brain.sim.recording![i];
      report.push(`${minutes} min at ${rate} Hz: Dop1R2 engaged ${mean(route.engaged).toFixed(2)}, sleep-promoting neurons ${(spikes / sleepers.length / (minutes * 60)).toFixed(3)} Hz, walking ${(100 * walking).toFixed(1)}%`);
    }
    console.log(`    pressure 1, its dopaminergic neurons driven at ${drive} Hz for 10 minutes, then left: ${report.join("; then ")}`);
  }
}

if (parts.includes("restless")) {
  const { nt } = transmitters(connectome, TRANSMITTER_FIXES);
  const groups: [string, RegExp][] = [
    ["none", /^$/],
    ["OA-VL1, OA-VL2 (DNd02, DNd03)", /^DNd0[23]$/],
    ["OA-VPM3, OA-VPM4", /^OA-VPM[34]$/],
    ["OA-VUMa1 to 8", /^OA-VUMa/],
  ];
  console.log(`\n(restless) Diagnostic: every partner's release 1.5 fold, seeds ${seeds.join(", ")}, learning off, walking at rest over ${values.seconds} seconds:`);
  for (const [name, pattern] of groups) {
    const shares = seeds.map((seed) => {
      // This release probe owns KC outputs too; plasticity cannot also rewrite those weights.
      const brain = new FlyBrain(connectome, { seed, learning: false });
      if (name !== "none") {
        const partners = new Set<number>();
        for (const i of connectome.filter((j) => pattern.test(type(j)))) {
          for (let e = connectome.ptr[i]; e < connectome.ptr[i + 1]; e++) {
            const j = connectome.post[e];
            if (!(MODULATORS as readonly string[]).includes(nt[j])) partners.add(j);
          }
        }
        brain.sim.addOutputGain("probe", [...partners]);
        brain.sim.setOutputGains("probe", new Float64Array(brain.sim.outputGainMembers("probe").length).fill(1.5));
      }
      return run(brain, RESTING_SENSES, restlessMs);
    });
    console.log(`    ${name.padEnd(32)} ${shares.map((s) => `${(100 * s).toFixed(1)}%`).join(", ")}`);
  }
}
