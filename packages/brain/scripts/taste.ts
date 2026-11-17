// The mouth's taste: which neurons each taste sense drives, what they are, and
// what each does to the proboscis motor neuron MN9 (README, Senses).
//
//   node packages/brain/scripts/taste.ts [--seeds 1,2,3] [--flywire <annotations.tsv>] [--path connectome.bin]
//
// (a) What each of `sweet`, `bitter` and `water` drives: its types, their
//     neurons and subclasses here. With FlyWire's neuron annotations (release
//     v3.2.0, checked against its SHA-256; the README says where to get them),
//     it also checks each labellar type against the putative taste FlyWire
//     gives it after Tastekin et al. (cell_sub_class), and fails if one is
//     not what io.ts says it is.
// (b) From rest (2 s), each condition for 3 s at hunger 1: MN9's mean rate
//     and `feed`'s, over the seeds. The tastes at full strength, alone and
//     together; the labellum's sugar neurons alone at 100 and 200 Hz; and,
//     to compare, the nine types `sweet` drove when they were chosen by what
//     they do (README, Senses).
// (c) Why the labellum's sugar neurons alone do so little: LB3b and LB3c at
//     100 and 200 Hz for 1 s from silence, at the operating point and with
//     synaptic saturation off (Shiu et al.'s model has none), MN9's rate and
//     the excitation and inhibition reaching it.
//
// Runs are deterministic for a seed. It takes a few minutes.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { BITTER_TYPES, SWEET_TYPES, WATER_TYPES } from "../src/io.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { OPERATING_POINT, buildWeights } from "../src/params.ts";
import { FlyBrain } from "../src/runtime.ts";
import { Simulation } from "../src/sim.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

/** FlyWire's neuron annotations, release v3.2.0 (flyconnectome/flywire_annotations, supplemental_files). */
const FLYWIRE_URL = "https://raw.githubusercontent.com/flyconnectome/flywire_annotations/v3.2.0/supplemental_files/Supplemental_file1_neuron_annotations.tsv";
const FLYWIRE_SHA256 = "b214970b55d2fbe0853bba536fdcb9e28730f4eb7ab06f600491df795da683cd";
/** The putative tastes FlyWire gives the labellar types each sense drives. */
const LABELLAR_TASTES: Record<string, readonly string[]> = { sweet: ["sugar", "sugar/low_salt"], bitter: ["bitter"], water: ["water"] };
/** What `sweet` drove when it was chosen by what it does: greedily, for raising MN9 most. */
const CHOSEN_BY_FUNCTION = ["dorsal_tpGRN", "LB3d", "PhG9", "LB3c", "LB2a", "LB4a", "LB3b", "PhG1c", "PhG3"];

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "1,2,3" },
    flywire: { type: "string" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
const seeds = values.seeds.split(",").map(Number);
const connectome = readConnectomeFile(values.path);
const mouth = (types: readonly string[]) => connectome.find({ superClass: "cb_sensory", class: "gustatory", type: [...types] });
const SENSE_TYPES = { sweet: SWEET_TYPES, bitter: BITTER_TYPES, water: WATER_TYPES } as const;

// (a)
console.log("(a) What each taste drives");
for (const [sense, types] of Object.entries(SENSE_TYPES)) {
  const parts = types.map((type) => {
    const neurons = mouth([type]);
    const subClasses = new Set([...neurons].map((i) => connectome.columns.subClass.value(i)));
    return `${type} ${neurons.length} (${[...subClasses].join(", ")})`;
  });
  console.log(`    ${sense.padEnd(7)}${mouth(types).length} neurons: ${parts.join("; ")}`);
}
if (values.flywire && existsSync(values.flywire)) {
  const bytes = readFileSync(values.flywire);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== FLYWIRE_SHA256) throw new Error(`${values.flywire} is not FlyWire's annotations v3.2.0 (SHA-256 ${sha})`);
  const lines = bytes.toString("utf8").split("\n");
  const header = lines[0].split("\t");
  const column = (name: string) => header.indexOf(name);
  const [typeAt, tasteAt, subAt] = [column("cell_type"), column("cell_sub_class"), column("cell_class")];
  const tastes = new Map<string, Map<string, number>>();
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    if (cells[subAt] !== "gustatory") continue;
    const counts = tastes.get(cells[typeAt]) ?? new Map<string, number>();
    counts.set(cells[tasteAt], (counts.get(cells[tasteAt]) ?? 0) + 1);
    tastes.set(cells[typeAt], counts);
  }
  let wrong = 0;
  for (const [sense, types] of Object.entries(SENSE_TYPES)) {
    for (const type of types.filter((t) => t.startsWith("LB"))) {
      const counts = tastes.get(type);
      const given = counts ? [...counts].map(([taste, n]) => `${taste} ${n}`).join(", ") : "not in FlyWire";
      const ok = counts !== undefined && [...counts.keys()].every((taste) => LABELLAR_TASTES[sense].includes(taste));
      if (!ok) wrong++;
      console.log(`    FlyWire's ${type}: ${given}${ok ? "" : `  NOT ${sense}`}`);
    }
  }
  if (wrong > 0) throw new Error(`${wrong} labellar types are not what io.ts says they are`);
} else {
  console.log(`    (no FlyWire annotations given: --flywire <file>, from ${FLYWIRE_URL})`);
}

// (b)
type Condition = { name: string; senses?: Partial<BrainSenses>; drive?: [Uint32Array, number] };
const conditions: Condition[] = [
  { name: "rest" },
  { name: "sweet 1", senses: { sweet: 1 } },
  { name: "sweet 1, hunger 0", senses: { sweet: 1, hunger: 0 } },
  { name: "LB3b, LB3c at 100 Hz", drive: [mouth(["LB3b", "LB3c"]), 100] },
  { name: "LB3b, LB3c at 200 Hz", drive: [mouth(["LB3b", "LB3c"]), 200] },
  { name: "chosen by function, at 100 Hz", drive: [mouth(CHOSEN_BY_FUNCTION), 100] },
  { name: "bitter 1", senses: { bitter: 1 } },
  { name: "sweet 1, bitter 0.1", senses: { sweet: 1, bitter: 0.1 } },
  { name: "sweet 1, bitter 0.25", senses: { sweet: 1, bitter: 0.25 } },
  { name: "sweet 1, bitter 0.5", senses: { sweet: 1, bitter: 0.5 } },
  { name: "sweet 1, bitter 1", senses: { sweet: 1, bitter: 1 } },
  { name: "water 1", senses: { water: 1 } },
  { name: "sweet 1, water 1", senses: { sweet: 1, water: 1 } },
];
console.log(`\n(b) From 2 s of rest, 3 s of each at hunger 1: MN9's mean rate, Hz, and feed's mean, seeds ${seeds.join(", ")}`);
for (const condition of conditions) {
  const cells = seeds.map((seed) => {
    const brain = new FlyBrain(connectome, { seed });
    if (condition.drive) brain.sim.addInput("drive", condition.drive[0]);
    for (let t = 0; t < 2000; t += 16) brain.tick(16, RESTING_SENSES);
    if (condition.drive) brain.sim.setRate("drive", condition.drive[1]);
    let mn9 = 0;
    let feed = 0;
    let n = 0;
    for (let t = 0; t < 3000; t += 16) {
      const { command, stats } = brain.tick(16, { ...RESTING_SENSES, ...condition.senses });
      mn9 += stats.rates.MN9;
      feed += command.feed;
      n++;
    }
    return `${(mn9 / n).toFixed(1)} Hz ${(feed / n).toFixed(2)}`;
  });
  console.log(`    ${condition.name.padEnd(32)}${cells.map((c) => c.padEnd(15)).join("")}`);
}

// (c)
console.log("\n(c) LB3b and LB3c alone for 1 s from silence, seed 1: MN9's rate, and the excitation and inhibition reaching it (mV/s of drive)");
const sugar = mouth(["LB3b", "LB3c"]);
const mn9 = connectome.find({ type: "MN9" });
const isMn9 = new Uint8Array(connectome.neurons);
for (const i of mn9) isMn9[i] = 1;
for (const saturation of [OPERATING_POINT.saturation, 0]) {
  const weights = buildWeights(connectome, { ...OPERATING_POINT, saturation });
  for (const rate of [100, 200]) {
    const sim = new Simulation(weights.network, { ...OPERATING_POINT.neuron, gain: weights.gain, seed: 1 });
    sim.addInput("sugar", sugar, rate);
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
    console.log(`    ${label.padEnd(16)} ${String(rate).padStart(3)} Hz: MN9 ${(fired / mn9.length).toFixed(1)} Hz, excitation ${excitation.toFixed(0)}, inhibition ${inhibition.toFixed(0)}`);
  }
}
