// What thirst does, measured on the real connectome (README, Thirst):
//
//   node packages/brain/scripts/thirst.ts [--seeds 20] [--path connectome.bin]
//
// (a) water held for 3 s after 2 s of rest, alone and with sugar, at thirst 0
//     (just drunk), 0.5 and 1 (thirsty, the brain as it was before thirst):
//     MN9's mean rate and `feed`'s, over seeds 1 to 3;
// (b) why water extends nothing: the water neurons alone for 1 s from
//     silence at 100 and 200 Hz, at the operating point and with synaptic
//     saturation off, MN9's rate and the excitation and inhibition reaching
//     it, against the sugar neurons'; and the water neurons' output gain
//     raised past anything thirst sets (1.5 to 5);
// (c) a drinking test: in how many of --seeds flies the body starts to feed
//     (Behavior's FEED_ON) within 1 s of water touching, at each thirst;
// (d) a drink from one dropped drop of water, as the game drinks it
//     (EAT_RATE, its taste fading as it runs out), thirsty and just drunk,
//     with thirst held and falling as it drinks (@fly/body's Thirst): how long
//     the fly drinks before it stops for a second, and how much;
// (e) sugar is fed on as before at the thirst a fly starts with: hunger.ts's
//     meal on a lump of sugar with thirst sent and left out, spike for spike;
// (f) what resetting the water neurons' output gain costs, which a tick does
//     whenever thirst has changed.
//
// Runs are deterministic for a seed. It takes about five minutes.

import { parseArgs } from "node:util";
import { Behavior, THIRST as BODY_THIRST, THIRST_START, Thirst } from "@fly/body";
import { EAT_RATE } from "@fly/world";
import { WATER_TYPES } from "../src/io.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { OPERATING_POINT, buildWeights } from "../src/params.ts";
import { FlyBrain } from "../src/runtime.ts";
import { Simulation } from "../src/sim.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "20" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
const connectome = readConnectomeFile(values.path);
const TICK = 16;
const THIRSTS = [0, 0.5, 1];
const pad = (s: string | number, n: number) => String(s).padEnd(n);

const rested = (seed: number, thirst: number) => {
  const b = new FlyBrain(connectome, { seed });
  for (let t = 0; t < 2000; t += TICK) b.tick(TICK, { ...RESTING_SENSES, thirst });
  return b;
};

console.log(`Thirst: ${connectome.neurons.toLocaleString("en-US")} neurons`);

// (a)
console.log("\n(a) Held for 3 s after 2 s of rest: MN9's mean rate, Hz, and feed's mean, seeds 1 to 3.");
console.log(`    ${pad("", 20)}${THIRSTS.map((h) => pad(`thirst ${h}`, 22)).join("")}`);
const conditions: { name: string; senses: Partial<BrainSenses> }[] = [
  { name: "water 1", senses: { water: 1 } },
  { name: "water 0.5", senses: { water: 0.5 } },
  { name: "sugar 1", senses: { sweet: 1 } },
  { name: "sugar 1, water 1", senses: { sweet: 1, water: 1 } },
  { name: "sugar 0.6, water 1", senses: { sweet: 0.6, water: 1 } },
];
for (const { name, senses } of conditions) {
  const cells = THIRSTS.map((thirst) => {
    let mn9 = 0;
    let feed = 0;
    let n = 0;
    for (const seed of [1, 2, 3]) {
      const b = rested(seed, thirst);
      for (let t = 0; t < 3000; t += TICK) {
        const { command, stats } = b.tick(TICK, { ...RESTING_SENSES, ...senses, thirst });
        mn9 += stats.rates.MN9;
        feed += command.feed;
        n++;
      }
    }
    return pad(`${(mn9 / n).toFixed(1)} Hz, feed ${(feed / n).toFixed(2)}`, 22);
  });
  console.log(`    ${pad(name, 20)}${cells.join("")}`);
}

// (b)
console.log("\n(b) Why water extends nothing.");
const { wiring } = new FlyBrain(connectome, { seed: 1 });
const water = Array.from(wiring.senses.find((g) => g.spec.sense === "water")!.neurons);
const sugarNeurons = wiring.senses.find((g) => g.spec.sense === "sweet")!.neurons;
const mn9 = connectome.find({ type: "MN9" });
const isMn9 = new Uint8Array(connectome.neurons);
for (const i of mn9) isMn9[i] = 1;
// Each set alone for 1 s from silence: MN9's rate, and the excitation and inhibition reaching it (mV/s of drive), as taste.ts (c).
const driven = (name: string, neurons: ArrayLike<number>) => {
  for (const saturation of [OPERATING_POINT.saturation, 0]) {
    const weights = buildWeights(connectome, { ...OPERATING_POINT, saturation });
    for (const rate of [100, 200]) {
      const sim = new Simulation(weights.network, { ...OPERATING_POINT.neuron, gain: weights.gain, seed: 1 });
      sim.addInput(name, neurons, rate);
      sim.setRecording(true);
      sim.advance(1000);
      const spikes = sim.recording!;
      let excitation = 0;
      let inhibition = 0;
      for (let i = 0; i < connectome.neurons; i++) {
        if (spikes[i] === 0) continue;
        for (let e = weights.network.ptr[i]; e < weights.network.ptr[i + 1]; e++) {
          if (!isMn9[weights.network.post[e]]) continue;
          const drive = (spikes[i] * weights.network.count[e] * weights.gain[i]) / mn9.length;
          if (drive > 0) excitation += drive;
          else inhibition -= drive;
        }
      }
      let fired = 0;
      for (const i of mn9) fired += spikes[i];
      const label = saturation > 0 ? `saturation ${saturation}` : "no saturation";
      console.log(`    ${name.padEnd(30)} ${label.padEnd(16)} ${String(rate).padStart(3)} Hz: MN9 ${(fired / mn9.length).toFixed(1)} Hz, excitation ${excitation.toFixed(0)}, inhibition ${inhibition.toFixed(0)}`);
    }
  }
};
driven(`water (${WATER_TYPES.join(", ")})`, water);
driven("sugar (all of sweet's)", sugarNeurons);
for (const gain of [1.5, 2, 3, 5]) {
  const cells: string[] = [];
  for (const sweet of [0, 1]) {
    const rates: string[] = [];
    for (const seed of [1, 2, 3]) {
      const b = rested(seed, 1);
      // A second gain on the same neurons, past what thirst sets: the brain's own stays at 1 (thirst 1).
      b.sim.addOutputGain("water raised", water);
      b.sim.setOutputGain("water raised", gain);
      let sum = 0;
      let n = 0;
      for (let t = 0; t < 3000; t += TICK) {
        sum += b.tick(TICK, { ...RESTING_SENSES, water: 1, sweet, thirst: 1 }).stats.rates.MN9;
        n++;
      }
      rates.push((sum / n).toFixed(1));
    }
    cells.push(`${sweet ? "with sugar 1" : "alone"} ${rates.join(", ")} Hz`);
  }
  console.log(`    water 1 with its output gain at ${gain}: MN9 ${cells.join("; ")}`);
}

// (c)
const seeds = Number(values.seeds);
console.log(`\n(c) Drinking: of ${seeds} flies (seeds 1 to ${seeds}), how many start to feed within 1 s of water.`);
console.log(`    ${pad("water", 8)}${THIRSTS.map((h) => pad(`thirst ${h}`, 12)).join("")}`);
for (const amount of [0.5, 1]) {
  const cells = THIRSTS.map((thirst) => {
    let extended = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const b = rested(seed, thirst);
      const body = new Behavior();
      for (let t = 0; t < 1000; t += TICK) {
        if (body.update(b.tick(TICK, { ...RESTING_SENSES, water: amount, thirst }).command, 0, true, TICK / 1000).feeding) {
          extended++;
          break;
        }
      }
    }
    return pad(`${extended}/${seeds}`, 12);
  });
  console.log(`    ${pad(amount, 8)}${cells.join("")}`);
}

// (d)
/** Drinks from a drop of water until it stops for a second, or for 20 s if it never starts: seconds drinking, amount drunk. */
const drink = (seed: number, start: number, fixed: boolean) => {
  const b = rested(seed, start);
  const body = new Behavior();
  const thirst = new Thirst();
  thirst.level = start;
  let amount = 1;
  let drinking = 0;
  let since = 0;
  for (let t = 0; t < 20_000 && since < 1000; t += TICK) {
    const intent = body.update(b.tick(TICK, { ...RESTING_SENSES, water: Math.min(1, amount * 4), thirst: thirst.level }).command, 0, true, TICK / 1000);
    let sip = 0;
    if (intent.feeding && amount > 0) {
      sip = Math.min(amount, EAT_RATE * intent.feed * (TICK / 1000));
      amount -= sip;
      drinking += TICK;
      since = 0;
    } else if (drinking > 0) {
      since += TICK;
    }
    if (!fixed) thirst.step(TICK / 1000, sip);
  }
  return { seconds: drinking / 1000, drunk: 1 - amount };
};
console.log(`\n(d) A drink from one drop of water (EAT_RATE ${EAT_RATE}/s at feed 1), until it stops for a second (20 s if it never starts); seeds 1 to 3.`);
console.log(`    One drop is a full drink (@fly/body THIRST.draught ${BODY_THIRST.draught}).`);
for (const fixed of [true, false]) {
  for (const start of [0, 1]) {
    const runs = [1, 2, 3].map((seed) => drink(seed, start, fixed));
    console.log(`    thirst ${start}${fixed ? " held" : " falling as it drinks"}: ${runs.map((r) => `${r.seconds.toFixed(1)} s, ${(100 * r.drunk).toFixed(0)}%`).join("; ")}`);
  }
}

// (e)
console.log(`\n(e) Sugar at the thirst a fly starts with (${THIRST_START.toFixed(3)}) and with thirst left out: a meal on a lump, as hunger.ts (c) at hunger 1, seeds 1 to 3.`);
for (const seed of [1, 2, 3]) {
  const meal = (thirst: number | undefined) => {
    const b = new FlyBrain(connectome, { seed });
    const body = new Behavior();
    const spikes: number[] = [];
    let amount = 1;
    for (let t = 0; t < 2000; t += TICK) b.tick(TICK, { ...RESTING_SENSES, thirst });
    for (let t = 0; t < 20_000; t += TICK) {
      const state = b.tick(TICK, { ...RESTING_SENSES, sweet: Math.min(1, amount * 4), thirst });
      spikes.push(state.stats.spikes);
      const intent = body.update(state.command, 0, true, TICK / 1000);
      if (intent.feeding && amount > 0) amount -= Math.min(amount, EAT_RATE * intent.feed * (TICK / 1000));
    }
    return { spikes, eaten: 1 - amount };
  };
  const sent = meal(THIRST_START);
  const without = meal(undefined);
  const same = sent.spikes.length === without.spikes.length && sent.spikes.every((s, i) => s === without.spikes[i]);
  console.log(`    seed ${seed}: eaten ${(100 * sent.eaten).toFixed(0)}% with thirst, ${(100 * without.eaten).toFixed(0)}% without; ${same ? "spike for spike the same" : "DIFFERENT"}`);
}

// (f)
console.log("\n(f) Cost: resetting the water neurons' output gain, as a tick does whenever thirst has changed (every frame in the game).");
{
  const b = rested(1, 1);
  const name = b.wiring.senses.find((group) => group.spec.sense === "water")!.spec.name;
  const calls = 100_000;
  const times: number[] = [];
  for (let k = 0; k < 3; k++) {
    const started = performance.now();
    for (let i = 0; i < calls; i++) b.sim.setOutputGain(name, 0.75 + (i % 2) * 0.2);
    times.push(((performance.now() - started) / calls) * 1000);
  }
  let edges = 0;
  const { network } = buildWeights(connectome, OPERATING_POINT);
  for (const i of water) edges += network.ptr[i + 1] - network.ptr[i];
  console.log(`    ${edges.toLocaleString("en-US")} connections; ${times.map((t) => t.toFixed(2)).join(", ")} µs a time (three runs of ${calls.toLocaleString("en-US")})`);
}
