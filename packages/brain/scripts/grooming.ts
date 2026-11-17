// Whether dust on the body reaches the neurons that command grooming, and in
// what order: the README's "Touch → grooming of the body, wings or legs"
// (What it does and doesn't reproduce).
//
//   node packages/brain/scripts/grooming.ts [--seeds 1,2,3] [--rate 50] [--seconds 60] [--part all|wiring|regions|pairs|assay]
//
// Needs the anatomy sidecar (`npm run brain:fetch`): the packed wiring doesn't
// say which nerve a sensory neuron enters the cord by, and that is what tells
// the body's bristles apart by region.
//
// The bristles of each region, the mechanosensory neurons dust on it would
// deflect:
//   eyes         the interommatidial bristles (BM_InOm)
//   antennae     the bristles entering by the antennal nerve (BM: the
//                antenna's and the front of the head's, which nothing in the
//                data splits further)
//   ventral head the proboscis', vibrissae's, maxillary palps' and haustellum's (BM_Taste, BM_Vib, BM_MaPa, BM_Hau)
//   back of head the occiput's and postorbital's (BM_vOcci_vPoOr, BM_Vt_PoOc)
//   notum        tactile neurons of the posterior dorsal mesothoracic and dorsal
//                prothoracic nerves: the notum's microchaetae (SNta02/SNta09)
//                and macrochaetae (SNta05, 10, 12, 13), and SNta33
//   wings        tactile neurons of the anterior dorsal mesothoracic nerve: the
//                wing margin's bristles (SNta04, 06, 07, 11, 14, 18; Marin et al. 2024)
//   abdomen      sensory neurons of the abdominal nerves of no known modality:
//                its bristles are among them, unnamed (chemosensory and
//                proprioceptive types left out)
//   legs         tactile neurons of the leg nerves
//
// Each driven at --rate Hz per neuron, from rest standing (the visual
// background on, `grounded`), after 2 s settling, for 2 s (and, to compare, a
// push on either antenna and wind, the senses at 1): the mean rate of the
// head-grooming descending neurons the `groom` command reads (DNg12_a to
// _c) and the other DNg12 types, the antennal-grooming descending neurons aDN1
// and aDN2 (DNg62, DNge078; Hampel et al. 2015), DNg11 (front-leg rubbing;
// Guo, Zhang & Simpson 2022), the thorax-grooming command neurons MGT
// (INXXX216; Yoshikawa, Tang & Simpson 2024, the left one being MANC 21453),
// UMGT1, which inhibits them (IN12B002, below), and MDN (backing).
//
// 50 Hz is a bristle neuron's mean rate over half a second of deflection:
// about 13 spikes in the first 60 ms and then 25 Hz while held (Tuthill &
// Wilson 2016, Cell 164:1046, Figure 2A, counted from the raster). Grains of
// dust shift as the fly moves, so its bristles are deflected afresh, not held.
//
// Parts: wiring (which regions synapse onto MGT, and its largest inhibitory
// input), regions (each alone), pairs (each region with each other, to see
// what suppresses what), assay (every region dusted at once and held, the
// grooming commands over --seconds: Seeds et al. 2014's dusting assay).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { POSE_FLOOR } from "@fly/body";
import { loadAnatomy } from "../src/anatomy.ts";
import { loadConnectome } from "../src/format.ts";
import { DEFAULT_CONNECTOME_PATH } from "../src/node.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";
import type { BrainSenses } from "../src/types.ts";

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "1,2,3" },
    rate: { type: "string", default: "50" },
    seconds: { type: "string", default: "60" },
    part: { type: "string", default: "all" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
    anatomy: { type: "string", default: fileURLToPath(new URL("../data/anatomy.bin", import.meta.url)) },
  },
});
const seeds = values.seeds.split(",").map(Number);
const rate = Number(values.rate);
const part = values.part;
const bytes = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
if (!existsSync(values.anatomy)) throw new Error(`No anatomy at ${values.anatomy}: run npm run brain:fetch (the regions are told apart by entry nerve)`);
const data = bytes(values.path);
const c = loadConnectome(data);
const anatomy = await loadAnatomy(bytes(values.anatomy), data);
const nerve = (i: number) => anatomy.columns.entryNerve.value(i);
const type = (i: number) => c.columns.type.value(i);
const tactile = (i: number) => c.columns.superClass.value(i) === "vnc_sensory" && c.columns.class.value(i) === "mechanosensory_tactile";

const REGIONS: Record<string, Uint32Array> = {
  eyes: c.find({ type: "BM_InOm" }),
  antennae: c.filter((i) => type(i) === "BM" && nerve(i) === "AN"),
  "ventral head": c.find({ type: ["BM_Taste", "BM_Vib", "BM_MaPa", "BM_Hau"] }),
  "back of head": c.find({ type: ["BM_vOcci_vPoOr", "BM_Vt_PoOc"] }),
  notum: c.filter((i) => tactile(i) && (nerve(i) === "PDMN" || nerve(i) === "DProN")),
  wings: c.filter((i) => tactile(i) && nerve(i) === "ADMN"),
  abdomen: c.filter((i) => /^(vnc_sensory|sensory_ascending)$/.test(c.columns.superClass.value(i)) && c.columns.class.value(i) === "unknown_sensory" && /^AbN/.test(nerve(i))),
  legs: c.filter((i) => tactile(i) && /^(Pro|Meso|Meta)LN$/.test(nerve(i))),
};
const HEAD = ["eyes", "antennae", "ventral head", "back of head"];
const BODY = ["notum", "wings", "abdomen", "legs"];
for (const [name, neurons] of Object.entries(REGIONS)) if (neurons.length === 0) throw new Error(`No neurons for ${name}`);

const READ: Record<string, Uint32Array> = {
  "DNg12 a-c": c.find({ type: ["DNg12_a", "DNg12_b", "DNg12_c"] }),
  "DNg12 d-h": c.find({ type: ["DNg12_d", "DNg12_e", "DNg12_f", "DNg12_g", "DNg12_h"] }),
  aDN1: c.find({ type: "DNg62" }),
  aDN2: c.find({ type: "DNge078" }),
  DNg11: c.find({ type: "DNg11" }),
  MGT: c.find({ type: "INXXX216" }),
  UMGT1: c.find({ type: "IN12B002" }),
  MDN: c.find({ type: "MDN" }),
};

const range = (xs: number[], digits = 1) => {
  const lo = Math.min(...xs).toFixed(digits);
  const hi = Math.max(...xs).toFixed(digits);
  return lo === hi ? lo : `${lo}–${hi}`;
};

function wiring() {
  console.log("Bristles by region:");
  for (const [name, neurons] of Object.entries(REGIONS)) {
    const types = new Map<string, number>();
    for (const i of neurons) types.set(type(i) || "(untyped)", (types.get(type(i) || "(untyped)") ?? 0) + 1);
    const top = [...types].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${t} ${n}`);
    console.log(`  ${name.padEnd(13)} ${String(neurons.length).padStart(5)}  ${top.join(", ")}${types.size > 6 ? ", ..." : ""}`);
  }
  const mgt = new Set(READ.MGT);
  const into = new Map<number, number>();
  for (let p = 0; p < c.neurons; p++) for (let e = c.ptr[p]; e < c.ptr[p + 1]; e++) if (mgt.has(c.post[e])) into.set(p, (into.get(p) ?? 0) + c.count[e]);
  const total = [...into.values()].reduce((a, b) => a + b, 0);
  console.log(`\nMGT (INXXX216, ${READ.MGT.length} neurons) takes ${total} synapses. From each region's bristles:`);
  for (const [name, neurons] of Object.entries(REGIONS)) {
    let n = 0;
    let synapses = 0;
    const types = new Map<string, number>();
    for (const i of neurons) {
      const s = into.get(i) ?? 0;
      if (s === 0) continue;
      n++;
      synapses += s;
      types.set(type(i), (types.get(type(i)) ?? 0) + s);
    }
    if (synapses) console.log(`  ${name.padEnd(13)} ${n} neurons, ${synapses} synapses (${[...types].sort((a, b) => b[1] - a[1]).map(([t, s]) => `${t} ${s}`).join(", ")})`);
  }
  const inhibitory = [...into].filter(([p]) => /GABA|GLUT/.test(c.columns.nt.value(p)) && c.columns.superClass.value(p) === "vnc_intrinsic").sort((a, b) => b[1] - a[1]);
  const [first] = inhibitory;
  console.log(`  its largest inhibitory interneuron input: ${type(first[0])} (${c.columns.nt.value(first[0])}), ${first[1]} synapses from one neuron`);
}

/** Each readout's mean rate, Hz, over 2 s with these regions' bristles at `hz` (and these senses), after 2 s at rest standing. */
function drive(regions: readonly string[], hz: number, seed: number, felt: Partial<BrainSenses> = {}): Record<string, number> {
  const brain = new FlyBrain(c, { seed });
  regions.forEach((name, k) => brain.sim.addInput(`dust ${k}`, REGIONS[name], 0));
  for (let t = 0; t < 2000; t += 10) brain.tick(10, RESTING_SENSES);
  regions.forEach((_, k) => brain.sim.setRate(`dust ${k}`, hz));
  brain.sim.setRecording(true);
  const senses = { ...RESTING_SENSES, ...felt };
  for (let t = 0; t < 2000; t += 10) brain.tick(10, senses);
  const spikes = brain.sim.recording!;
  const out: Record<string, number> = {};
  for (const [name, neurons] of Object.entries(READ)) {
    let n = 0;
    for (const i of neurons) n += spikes[i];
    out[name] = n / neurons.length / 2;
  }
  return out;
}

function row(label: string, regions: readonly string[], felt: Partial<BrainSenses> = {}) {
  const runs = seeds.map((seed) => drive(regions, rate, seed, felt));
  const cells = Object.keys(READ).map((name) => `${name} ${range(runs.map((r) => r[name]))}`);
  console.log(`  ${label.padEnd(27)} ${cells.join("  ")}`);
}

function assay() {
  const seconds = Number(values.seconds);
  const all = [...HEAD, ...BODY];
  console.log(`\nDusted all over (every region at ${rate} Hz), held for ${seconds} s from rest standing; each 10 s: mean groom, aDN1, aDN2, MGT (Hz), back, and the share of time groom is past the pose floor (${POSE_FLOOR})`);
  for (const seed of seeds) {
    const brain = new FlyBrain(c, { seed });
    all.forEach((name, k) => brain.sim.addInput(`dust ${k}`, REGIONS[name], 0));
    for (let t = 0; t < 2000; t += 10) brain.tick(10, RESTING_SENSES);
    all.forEach((_, k) => brain.sim.setRate(`dust ${k}`, rate));
    const bins: string[] = [];
    for (let bin = 0; bin < seconds / 10; bin++) {
      brain.sim.setRecording(true);
      let groom = 0;
      let back = 0;
      let shown = 0;
      for (let t = 0; t < 10000; t += 10) {
        const { command } = brain.tick(10, RESTING_SENSES);
        groom += command.groom / 1000;
        back += command.back / 1000;
        if (command.groom > POSE_FLOOR) shown++;
      }
      const spikes = brain.sim.recording!;
      const hz = (neurons: Uint32Array) => {
        let n = 0;
        for (const i of neurons) n += spikes[i];
        return (n / neurons.length / 10).toFixed(1);
      };
      bins.push(`${bin * 10}–${bin * 10 + 10} s groom ${groom.toFixed(2)} aDN ${hz(READ.aDN1)}/${hz(READ.aDN2)} MGT ${hz(READ.MGT)} back ${back.toFixed(2)} shown ${((shown / 1000) * 100).toFixed(0)}%`);
    }
    console.log(`  seed ${seed}: ${bins.join(" | ")}`);
  }
}

if (part === "all" || part === "wiring") wiring();
if (part === "all" || part === "regions") {
  console.log(`\nEach region's bristles at ${rate} Hz for 2 s from rest standing, mean Hz over seeds ${seeds.join(", ")}:`);
  row("rest", []);
  for (const name of Object.keys(REGIONS)) row(name, [name]);
  row("the whole head", HEAD);
  row("the whole body", BODY);
  row("everywhere", [...HEAD, ...BODY]);
  // What the game sends to make it groom, for comparison: the senses at full strength.
  row("a push on the left antenna", [], { bumpLeft: 1 });
  row("a push on the right antenna", [], { bumpRight: 1 });
  row("wind", [], { wind: 1 });
}
if (part === "all" || part === "pairs") {
  console.log(`\nPairs: each head region with each other region, at ${rate} Hz:`);
  for (const a of ["eyes", "antennae"]) for (const b of Object.keys(REGIONS)) if (a !== b && !(a === "antennae" && b === "eyes")) row(`${a} + ${b}`, [a, b]);
  row("notum + legs", ["notum", "legs"]);
  row("notum + abdomen", ["notum", "abdomen"]);
}
if (part === "all" || part === "assay") assay();
