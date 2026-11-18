// How odours reach the mushroom body: for each of the world's odorants and
// fermenting fruit's mixture (all five), at full strength at both antennae
// for 2 s after 2 s of rest, how many of the Kenyon cells fire and how fast,
// against the same seconds with no odour. Descriptive (README, Smell): real
// Kenyon cells answer an odour sparsely, about 5-10% of them (Turner et al.
// 2008, J Neurophysiol 99: 734; Honegger et al. 2011, J Neurosci 31: 11772).
//
//   node packages/brain/scripts/olfaction-kc.ts [--seeds 1,2,3]
import { parseArgs } from "node:util";
import { readConnectomeFile } from "../src/node.ts";
import { ODORANTS } from "../src/olfaction.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1,2,3" } } });
const c = readConnectomeFile();
const groups: [string, Uint32Array][] = [
  ["KC", c.find({ class: "Kenyon_Cell" })],
  ["ALPN", c.find({ class: "ALPN" })],
  ["MBON", c.find({ class: "MBON" })],
];
const odours: [string, number[]][] = [["none", ODORANTS.map(() => 0)], ...ODORANTS.map((o, k): [string, number[]] => [o, ODORANTS.map((_, j) => (j === k ? 1 : 0))]), ["fermenting fruit", ODORANTS.map(() => 1)]];
const rows: Record<string, unknown>[] = [];
for (const seed of values.seeds.split(",").map(Number)) {
  for (const [name, strengths] of odours) {
    const b = new FlyBrain(c, { seed });
    const rest: BrainSenses = { ...RESTING_SENSES, hunger: 1 };
    for (let t = 0; t < 2000; t += 10) b.tick(10, rest);
    b.sim.setRecording(true);
    b.sim.recording!.fill(0);
    const smelling = { ...rest, odor: { left: strengths, right: strengths } };
    for (let t = 0; t < 2000; t += 10) b.tick(10, smelling);
    const spikes = b.sim.recording!;
    const row: Record<string, unknown> = { seed, odour: name };
    for (const [group, neurons] of groups) {
      let total = 0;
      let firing = 0;
      for (const i of neurons) {
        total += spikes[i];
        if (spikes[i] > 0) firing++;
      }
      row[group] = { meanHz: total / neurons.length / 2, firing, share: firing / neurons.length };
    }
    rows.push(row);
    console.error(seed, name);
  }
}
console.log(JSON.stringify(rows, null, 2));
