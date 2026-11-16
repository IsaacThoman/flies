// What reaches the song command neuron pIP10: the senses a male meets
// another fly with, and, to compare, what would drive it in the fly.
//
//   node packages/brain/scripts/song.ts [--seconds 3] [--seeds 1,2,3] [--path connectome.bin] [--anatomy anatomy.bin]
//
// From rest (2 s), each condition for --seconds, and the mean rate (Hz) over
// it of pIP10, of P1 (the pC1_1 to pC1_19 types; pC1x apart) and of the
// neurons between: the foreleg taste relays (PPN1, which is AN05B102a, and
// AN05B023), the mAL inhibitory neurons, and the song circuit in the cord
// (dPR1, TN1a, vPR6, vPR9), with the `sing` command's peak. Conditions:
//
//   - rest;
//   - `maleTaste` at full strength (io.ts: the front legs' LgLG1a and LgAG1
//     at 50 Hz), and the same neurons at 100 Hz;
//   - another fly seen through the eyes: a dark fly-sized ellipse ahead,
//     swaying, at 3, 5 and 10 mm;
//   - to compare, things the senses don't do: the front legs' female-pheromone
//     taste neurons (LgLG1b, and LgLG5 and LgLG8, Tastekin et al. 2025's
//     ppk23+ ppk25+ candidates) at 50 Hz, LC10a of both eyes at 30 Hz, and P1
//     itself at 30 Hz.
//
// With --anatomy (FlyEM's annotations, `npm run brain:fetch`), it first checks
// io.ts's FORELEG_MALE_TASTE: every LgLG1a and LgAG1 entering through a front
// leg's nerve (ProLN), and nothing else.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadAnatomy } from "../src/anatomy.ts";
import { loadConnectome } from "../src/format.ts";
import { FORELEG_MALE_TASTE } from "../src/io.ts";
import { DEFAULT_CONNECTOME_PATH } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { facetAngles, render } from "../src/stimuli.ts";
import type { Scene } from "../src/stimuli.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    seconds: { type: "string", default: "3" },
    seeds: { type: "string", default: "1,2,3" },
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
const typeOf = (i: number) => connectome.columns.type.value(i);
const types = (pattern: RegExp, side?: string) => connectome.filter((i) => pattern.test(typeOf(i)) && (!side || connectome.columns.side.value(i) === side));

const anatomy = existsSync(values.anatomy) ? await loadAnatomy(bytes(values.anatomy), data) : null;
/** The front legs' neurons of a type, by their nerve (ProLN); none without the anatomy. */
const foreleg = (pattern: RegExp) => (anatomy ? connectome.filter((i) => pattern.test(typeOf(i)) && anatomy.columns.entryNerve.value(i) === "ProLN") : new Uint32Array(0));
if (anatomy) {
  for (const type of ["LgLG1a", "LgAG1"] as const) {
    const found = [...foreleg(new RegExp(`^${type}$`))].map((i) => connectome.rootId[i]).sort((a, b) => a - b);
    const listed = [...FORELEG_MALE_TASTE[type]].sort((a, b) => a - b);
    console.log(`${type} of the front legs (ProLN): ${found.length}, ${found.join() === listed.join() ? "as io.ts lists them" : "NOT as io.ts lists them"}`);
  }
} else console.log(`(no anatomy at ${values.anatomy}: the front legs' root IDs are not checked, and the female-pheromone types are left out)`);
const maleTaste = new Set<number>([...FORELEG_MALE_TASTE.LgLG1a, ...FORELEG_MALE_TASTE.LgAG1]);

const WATCH: [string, Uint32Array][] = [
  ["pIP10", types(/^pIP10$/)],
  ["P1", types(/^pC1_\d/)],
  ["PPN1", types(/^AN05B102a$/)],
  ["AN05B023", types(/^AN05B023/)],
  ["mAL", types(/^mAL/)],
  ["dPR1", types(/^dPR1$/)],
  ["TN1a", types(/^TN1a/)],
  ["vPR6", types(/^vPR6$/)],
  ["vPR9", types(/^vPR9/)],
];

/** A fly seen ahead: a dark ellipse 2.5 mm long and 1 mm tall at `d` mm, swaying 20 degrees each way once a second. */
const seen = (d: number): Scene => {
  const wide = (Math.atan(1.25 / d) * 180) / Math.PI;
  const tall = (Math.atan(0.5 / d) * 180) / Math.PI;
  return (t, az, el) => {
    const x = (az - 20 * Math.sin(2 * Math.PI * t)) / wide;
    const y = el / tall;
    return x * x + y * y <= 1 ? 0.05 : 1;
  };
};

type Condition = { name: string; senses?: Partial<BrainSenses>; drive?: [Uint32Array, number]; scene?: Scene };
const conditions: Condition[] = [
  { name: "rest" },
  { name: "maleTaste 1 (50 Hz)", senses: { maleTaste: 1 } },
  { name: "the same neurons at 100 Hz", drive: [connectome.filter((i) => maleTaste.has(connectome.rootId[i])), 100] },
  { name: "a fly seen 3 mm ahead", scene: seen(3) },
  { name: "a fly seen 5 mm ahead", scene: seen(5) },
  { name: "a fly seen 10 mm ahead", scene: seen(10) },
  ...(anatomy
    ? [
        { name: "front legs' LgLG1b at 50 Hz", drive: [foreleg(/^LgLG1b$/), 50] as [Uint32Array, number] },
        { name: "front legs' LgLG5, LgLG8 at 50 Hz", drive: [foreleg(/^LgLG[58]$/), 50] as [Uint32Array, number] },
      ]
    : []),
  { name: "LC10a, both eyes, at 30 Hz", drive: [types(/^LC10a$/), 30] },
  { name: "P1 at 30 Hz", drive: [types(/^pC1_\d/), 30] },
];

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`\nMean rate (Hz) over ${seconds} s after 2 s of rest, seeds ${seeds.join(", ")} (mean of the seeds; peak sing the highest)`);
console.log(`${pad("", 36)}${WATCH.map(([name]) => pad(name, 10)).join("")}sing peak`);
for (const condition of conditions) {
  const sums = new Float64Array(WATCH.length);
  let peak = 0;
  for (const seed of seeds) {
    const brain = new FlyBrain(connectome, { seed });
    const angles = facetAngles(brain.eyes!);
    const light = { left: new Float32Array(angles.left.az.length), right: new Float32Array(angles.right.az.length) };
    const steady: Scene = () => 1;
    if (condition.drive) brain.sim.addInput("drive", condition.drive[0]);
    const tick = (scene: Scene | undefined, t: number, extra: Partial<BrainSenses> = {}) => {
      if (scene) render(scene, t, angles, light);
      return brain.tick(10, { ...RESTING_SENSES, ...extra, ...(scene ? { light } : {}) });
    };
    for (let t = 0; t < 2000; t += 10) tick(condition.scene && steady, 0);
    if (condition.drive) brain.sim.setRate("drive", condition.drive[1]);
    brain.sim.setRecording(true);
    for (let t = 0; t < seconds * 1000; t += 10) peak = Math.max(peak, tick(condition.scene, t / 1000, condition.senses).command.sing);
    const spikes = brain.sim.recording!;
    WATCH.forEach(([, neurons], k) => {
      let n = 0;
      for (const i of neurons) n += spikes[i];
      sums[k] += n / neurons.length / seconds;
    });
  }
  console.log(`${pad(condition.name, 36)}${WATCH.map((_, k) => pad((sums[k] / seeds.length).toFixed(2), 10)).join("")}${peak.toFixed(2)}`);
}
