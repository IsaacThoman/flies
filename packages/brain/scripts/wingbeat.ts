// The campaniform sensilla: which are the legs' load sensors (`grounded`) and
// which the wings' and halteres' strain sensors (`wingbeat`), and what each
// does to the flight motor neurons.
//
//   node packages/brain/scripts/wingbeat.ts [--seconds 60] [--seeds 1,2,3] [--rate 100] [--path connectome.bin] [--anatomy anatomy.bin]
//
// With the anatomy (FlyEM's annotations, `npm run brain:fetch`), it first
// counts the campaniform sensilla by entry nerve and checks io.ts's
// LEG_CAMPANIFORM: every one entering by a leg nerve is that type, and that
// type enters by no other nerve. Then, seeds --seeds:
//
//   (a) rest for --seconds, standing and in the air (`grounded` false): the
//       share of time walking (the diagnostic observer), the mean `wings`
//       and the network's spikes a second;
//   (b) `wingbeat` held at 0.25, 0.5 and 1 for 3 s in the air: `wings`' mean
//       and peak, then its mean over the second after 2 s back at 0;
//   (c) the loop the body closes: in the air, `wingbeat` set each tick to
//       the wings' drive (the brain's `wings` smoothed as the body smooths
//       it), from a take-off's 0.62, for 5 s, without the body's floor
//       (packages/body/src/behavior.ts, TARSAL_ONSET), and with it: the
//       brain's own `wings` each second.
//
// --rate sets `wingbeat`'s rate at full strength for (b) and (c), for
// comparing it with io.ts's WINGBEAT_RATE.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadAnatomy } from "../src/anatomy.ts";
import { loadConnectome } from "../src/format.ts";
import { LEG_CAMPANIFORM } from "../src/io.ts";
import { DEFAULT_CONNECTOME_PATH } from "../src/node.ts";
import { BehaviorObserver } from "../src/observer.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    seconds: { type: "string", default: "60" },
    seeds: { type: "string", default: "1,2,3" },
    rate: { type: "string" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
    anatomy: { type: "string", default: fileURLToPath(new URL("../data/anatomy.bin", import.meta.url)) },
  },
});
const seconds = Number(values.seconds);
const seeds = values.seeds.split(",").map(Number);
const bytes = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const data = bytes(values.path);
const connectome = loadConnectome(data);
const TICK = 10;

const anatomy = existsSync(values.anatomy) ? await loadAnatomy(bytes(values.anatomy), data) : null;
if (anatomy) {
  const byNerve = new Map<string, number>();
  let wrong = 0;
  for (const i of connectome.find({ subClass: "campaniform_sensilla" })) {
    const nerve = anatomy.columns.entryNerve.value(i) || "(none)";
    byNerve.set(nerve, (byNerve.get(nerve) ?? 0) + 1);
    const leg = /^(Pro|Meso|Meta)LN$/.test(nerve);
    const legType = connectome.columns.type.value(i) === LEG_CAMPANIFORM;
    if (leg !== legType && !(legType && nerve === "(none)")) wrong++;
  }
  console.log(`Campaniform sensilla by entry nerve: ${[...byNerve].map(([n, k]) => `${n} ${k}`).join(", ")}`);
  console.log(`${LEG_CAMPANIFORM}: ${wrong === 0 ? "every one by a leg nerve (or none), and every leg nerve's is one" : `${wrong} NOT as io.ts says`}`);
} else console.log(`(no anatomy at ${values.anatomy}: the leg sensors are not checked against their nerves)`);

const brain = (seed: number) => {
  const b = new FlyBrain(connectome, { seed });
  if (values.rate) b.wiring.senses.find((s) => s.spec.sense === "wingbeat")!.maxRate = Number(values.rate);
  return b;
};
const AIR: BrainSenses = { ...RESTING_SENSES, grounded: false };
const f = (n: number, digits = 2) => n.toFixed(digits);
console.log(`\nSeeds ${seeds.join(", ")}; wingbeat at full strength: ${brain(1).wiring.senses.find((s) => s.spec.sense === "wingbeat")!.maxRate} Hz.`);

console.log(`\n(a) At rest for ${seconds} s: walking, mean wings, spikes/s`);
for (const [name, senses] of [
  ["standing", RESTING_SENSES],
  ["in the air", AIR],
] as const) {
  const rows = seeds.map((seed) => {
    const b = brain(seed);
    const observer = new BehaviorObserver();
    let wings = 0;
    let spikes = 0;
    const n = (seconds * 1000) / TICK;
    for (let k = 0; k < n; k++) {
      const { command, stats } = b.tick(TICK, senses);
      observer.observe(command, TICK / 1000);
      wings += command.wings / n;
      spikes += stats.spikes / seconds;
    }
    return `${f((observer.tally.walking / seconds) * 100, 0)}% ${f(wings, 3)} ${f(spikes / 1000, 0)}k`;
  });
  console.log(`  ${name.padEnd(12)}${rows.join("   ")}`);
}

console.log("\n(b) wingbeat held for 3 s in the air: wings mean / peak, then the mean over the second after 2 s at 0");
for (const level of [0.25, 0.5, 1]) {
  const rows = seeds.map((seed) => {
    const b = brain(seed);
    for (let t = 0; t < 2000; t += TICK) b.tick(TICK, AIR);
    let mean = 0;
    let peak = 0;
    for (let t = 0; t < 3000; t += TICK) {
      const { wings } = b.tick(TICK, { ...AIR, wingbeat: level }).command;
      mean += wings / (3000 / TICK);
      peak = Math.max(peak, wings);
    }
    let after = 0;
    for (let t = 0; t < 3000; t += TICK) {
      const { wings } = b.tick(TICK, AIR).command;
      if (t >= 2000) after += wings / (1000 / TICK);
    }
    return `${f(mean)} / ${f(peak)}, ${f(after)}`;
  });
  console.log(`  ${String(level).padEnd(6)}${rows.join("   ")}`);
}

console.log("\n(c) The loop in the air from a take-off's 0.62: the brain's own wings at 0.5, 1, 2, 3, 4 and 5 s");
const SMOOTHING = 12;
const FLIGHT_WINGS = 0.62;
for (const floor of [false, true]) {
  const rows = seeds.map((seed) => {
    const b = brain(seed);
    for (let t = 0; t < 2000; t += TICK) b.tick(TICK, RESTING_SENSES);
    let smoothed = FLIGHT_WINGS;
    const at: number[] = [];
    for (let t = TICK; t <= 5000; t += TICK) {
      const drive = floor ? Math.max(smoothed, FLIGHT_WINGS) : smoothed;
      const { wings } = b.tick(TICK, { ...AIR, wingbeat: drive }).command;
      smoothed += (wings - smoothed) * (1 - Math.exp(-SMOOTHING * (TICK / 1000)));
      if (t === 500 || t % 1000 === 0) at.push(wings);
    }
    return at.map((w) => f(w)).join(" ");
  });
  console.log(`  ${(floor ? "with the floor" : "without").padEnd(16)}${rows.join("   ")}`);
}
