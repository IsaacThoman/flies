// What hunger does, measured on the real connectome (README, Hunger):
//
//   node packages/brain/scripts/hunger.ts [--seeds 20] [--path connectome.bin]
//
// (a) sugar at each strength, held for 3 s after 2 s of rest, at hunger 0
//     (just fed), 0.5 and 1 (starved, the brain as it was before hunger):
//     MN9's mean rate and `feed`'s, over seeds 1 to 3;
// (b) a proboscis extension test: in how many of --seeds flies the body
//     starts to feed (Behavior's FEED_ON) within 1 s of the sugar touching;
// (c) a meal on one dropped lump of sugar, eaten as the game eats it
//     (EAT_RATE, its taste fading as it runs out): how long the fly feeds
//     before it stops of its own accord, and how much it eats, at a fixed
//     hunger and with hunger falling as it eats (@fly/body's Hunger);
// (d) what slow neuromodulation's update costs, every chunk, and resetting the
//     sweet neurons' release, which it does whenever hunger has changed.
//
// Resting behaviour at a hunger is report.ts's section (c) with --hunger.
// Runs are deterministic for a seed. It takes about five minutes.

import { parseArgs } from "node:util";
import { Behavior, HUNGER as BODY_HUNGER, Hunger } from "@fly/body";
import { EAT_RATE } from "@fly/world";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "20" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
const connectome = readConnectomeFile(values.path);
const TICK = 16;
const HUNGERS = [0, 0.5, 1];
const STRENGTHS = [0.25, 0.4, 0.6, 0.8, 1];
const pad = (s: string | number, n: number) => String(s).padEnd(n);

const rested = (seed: number, hunger: number) => {
  const b = new FlyBrain(connectome, { seed });
  for (let t = 0; t < 2000; t += TICK) b.tick(TICK, { ...RESTING_SENSES, hunger });
  return b;
};

console.log(`Hunger: ${connectome.neurons.toLocaleString("en-US")} neurons`);

// (a)
console.log("\n(a) Sugar held for 3 s after 2 s of rest: MN9's mean rate, Hz, and feed's mean, seeds 1 to 3.");
console.log(`    ${pad("sugar", 8)}${HUNGERS.map((h) => pad(`hunger ${h}`, 22)).join("")}`);
for (const sweet of STRENGTHS) {
  const cells = HUNGERS.map((hunger) => {
    let mn9 = 0;
    let feed = 0;
    let n = 0;
    for (const seed of [1, 2, 3]) {
      const b = rested(seed, hunger);
      for (let t = 0; t < 3000; t += TICK) {
        const { command, stats } = b.tick(TICK, { ...RESTING_SENSES, sweet, hunger });
        mn9 += stats.rates.MN9;
        feed += command.feed;
        n++;
      }
    }
    return pad(`${(mn9 / n).toFixed(1)} Hz, feed ${(feed / n).toFixed(2)}`, 22);
  });
  console.log(`    ${pad(sweet, 8)}${cells.join("")}`);
}

// (b)
const seeds = Number(values.seeds);
console.log(`\n(b) Proboscis extension: of ${seeds} flies (seeds 1 to ${seeds}), how many start to feed within 1 s of the sugar.`);
console.log(`    ${pad("sugar", 8)}${HUNGERS.map((h) => pad(`hunger ${h}`, 12)).join("")}`);
for (const sweet of [0.25, 0.4, 0.6, 1]) {
  const cells = HUNGERS.map((hunger) => {
    let extended = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const b = rested(seed, hunger);
      const body = new Behavior();
      for (let t = 0; t < 1000; t += TICK) {
        if (body.update(b.tick(TICK, { ...RESTING_SENSES, sweet, hunger }).command, 0, true, TICK / 1000).feeding) {
          extended++;
          break;
        }
      }
    }
    return pad(`${extended}/${seeds}`, 12);
  });
  console.log(`    ${pad(sweet, 8)}${cells.join("")}`);
}

// (c)
/** Feeds on a lump of sugar until it stops for a second: seconds feeding, amount eaten. `fixed` holds hunger, else it falls as it eats. */
const meal = (seed: number, start: number, fixed: boolean) => {
  const b = rested(seed, start);
  const body = new Behavior();
  const hunger = new Hunger();
  hunger.level = start;
  let amount = 1;
  let feeding = 0;
  let since = 0;
  for (let t = 0; t < 120_000 && since < 1000; t += TICK) {
    const sweet = Math.min(1, amount * 4);
    const intent = body.update(b.tick(TICK, { ...RESTING_SENSES, sweet, hunger: hunger.level }).command, 0, true, TICK / 1000);
    let bite = 0;
    if (intent.feeding && amount > 0) {
      bite = Math.min(amount, EAT_RATE * intent.feed * (TICK / 1000));
      amount -= bite;
      feeding += TICK;
      since = 0;
    } else if (feeding > 0) {
      since += TICK;
    }
    if (!fixed) hunger.step(TICK / 1000, bite);
  }
  return { seconds: feeding / 1000, eaten: 1 - amount };
};
console.log(`\n(c) A meal on one lump of sugar (EAT_RATE ${EAT_RATE}/s at feed 1, tasting less as it runs out), until it stops for a second; seeds 1 to 3.`);
console.log(`    One lump is a full meal (@fly/body HUNGER.meal ${BODY_HUNGER.meal}).`);
for (const fixed of [true, false]) {
  for (const start of HUNGERS) {
    const runs = [1, 2, 3].map((seed) => meal(seed, start, fixed));
    const list = runs.map((r) => `${r.seconds.toFixed(1)} s, ${(100 * r.eaten).toFixed(0)}%`).join("; ");
    console.log(`    hunger ${start}${fixed ? " held" : " falling as it eats"}: ${list}`);
  }
}

// (d)
console.log("\n(d) Cost: slow neuromodulation's update, which runs every chunk (every 10 ms of fly time), and resetting the sweet neurons' release, which it does whenever hunger has changed (every frame in the game).");
{
  const b = rested(1, 1);
  const calls = 100_000;
  const time = (each: (i: number) => void) => {
    const times: number[] = [];
    for (let k = 0; k < 3; k++) {
      const started = performance.now();
      for (let i = 0; i < calls; i++) each(i);
      times.push(((performance.now() - started) / calls) * 1000);
    }
    return `${times.map((t) => t.toFixed(2)).join(", ")} µs a time (three runs of ${calls.toLocaleString("en-US")})`;
  };
  console.log(`    update: ${time(() => b.modulation.update(10))}`);
  const route = b.modulation.routes.find((r) => r.spec.receptor === "DopEcR")!;
  const factors = [new Float64Array(route.carriers.length).fill(0.75), new Float64Array(route.carriers.length).fill(0.95)];
  console.log(`    release: ${time((i) => b.sim.setOutputGains("release DopEcR", factors[i % 2]))}`);
}
