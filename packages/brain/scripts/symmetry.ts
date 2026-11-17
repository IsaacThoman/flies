// Left against right: where the model's two sides stop mirroring each other.
//
//   node packages/brain/scripts/symmetry.ts [--seeds 1,2,3] [--ms 5000] [--level 0.6] [--mute 0] [--path connectome.bin]
//
// (a) steering: each eye's visual background alone (io.ts BACKGROUND, at
//     --level of its balanced full rate, as behaviour.test.ts drives it), and
//     the same with only its LC10 neurons, then with each family of visual
//     projection neurons left out: each side's DNa02, Hz. With --mute n, each
//     of DNa02's n strongest inputs under the backgrounds silenced in turn (slow: 60 takes
//     about ten minutes). Then what reaches each DNa02 and what each eye's
//     neurons reach, synapses by side;
// (b) grooming: each side's head bristle neurons at touch's 50 Hz, the
//     untyped front-of-head `BM` alone and all of them (`BM*`): the
//     head-grooming DNg12 of each side, Hz;
// (c) transmitters: cell types whose two sides' predicted transmitters,
//     after params.ts's fixes, differ in sign or muting, weighted by synapses.
//
// Each run starts from rest with nothing else driven. The README's
// Symmetry bullet (What it does and doesn't reproduce) quotes it.

import { parseArgs } from "node:util";
import type { Connectome } from "../src/format.ts";
import { wire } from "../src/io.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "../src/node.ts";
import { OPERATING_POINT, buildWeights } from "../src/params.ts";
import { Simulation } from "../src/sim.ts";

const { values } = parseArgs({
  options: {
    seeds: { type: "string", default: "1,2,3" },
    ms: { type: "string", default: "5000" },
    level: { type: "string", default: "0.6" },
    mute: { type: "string", default: "0" },
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
  },
});
const seeds = values.seeds.split(",").map(Number);
const ms = Number(values.ms);
const c = readConnectomeFile(values.path);
const weights = buildWeights(c);
const wiring = wire(c);
const SIDES = ["left", "right"] as const;
const type = (i: number) => c.columns.type.value(i);
const side = (i: number) => c.columns.side.value(i);
const superClass = (i: number) => c.columns.superClass.value(i);

/** Mean rate, Hz, of each named group over --ms of these neurons driven at this rate, averaged over --seeds. */
function respond(driven: ArrayLike<number>, rateHz: number, groups: Record<string, ArrayLike<number>>, gain = weights.gain) {
  const out: Record<string, number> = Object.fromEntries(Object.keys(groups).map((k) => [k, 0]));
  for (const seed of seeds) {
    const sim = new Simulation(weights.network, { ...OPERATING_POINT.neuron, gain, seed });
    sim.addInput("driven", driven, rateHz);
    for (const [name, neurons] of Object.entries(groups)) sim.addReadout(name, neurons);
    sim.advance(ms);
    const spikes = sim.drainReadouts();
    for (const [name, neurons] of Object.entries(groups)) out[name] += (spikes[name] / neurons.length / (ms / 1000)) / seeds.length;
  }
  return out;
}
const hz = (n: number) => n.toFixed(1).padStart(6);

console.log(`(a) steering: each eye's background alone at ${values.level} of full strength, ${ms} ms, seeds ${values.seeds}; DNa02 left and right, Hz`);
const dna02 = { left: c.find({ type: "DNa02", side: "left" }), right: c.find({ type: "DNa02", side: "right" }) };
const background = Object.fromEntries(wiring.background.map((g) => [g.spec.side, g]));
const families: [string, RegExp | null][] = [
  ["all", null],
  ["only LC10", /^LC10/],
  ["without LC10", /^LC10/],
  ["without the other LCs", /^LC(?!10)/],
  ["without LPLC, LLPC, LPC", /^(LPLC|LLPC|LPC)/],
  ["without LT, LPT", /^(LT|LPT)/],
  ["without MeVP, MeTu", /^(MeVP|MeTu)/],
  ["without LoVP", /^LoVP/],
];
for (const [label, pattern] of families) {
  const cells = SIDES.map((s) => {
    const group = background[s];
    const neurons = pattern === null ? group.neurons : group.neurons.filter((i) => pattern.test(type(i)) === label.startsWith("only"));
    const r = respond(neurons, group.maxRate * Number(values.level), dna02);
    return `${s} eye ${hz(r.left)} ${hz(r.right)}`;
  });
  console.log(`  ${label.padEnd(26)} ${cells.join("   ")}`);
}

// Each of DNa02's --mute strongest inputs under the eyes' backgrounds (by
// synapses × strength × rate, either eye) silenced in turn, the type on both
// sides: how far the gap between the two eyes moves.
const mute = Number(values.mute);
if (mute > 0) {
  const rate = new Float64Array(c.neurons);
  for (const s of SIDES) {
    const sim = new Simulation(weights.network, { ...OPERATING_POINT.neuron, gain: weights.gain, seed: seeds[0] });
    sim.addInput("driven", background[s].neurons, background[s].maxRate * Number(values.level));
    sim.setRecording(true);
    sim.advance(ms);
    const spikes = sim.recording!;
    for (let i = 0; i < c.neurons; i++) rate[i] = Math.max(rate[i], spikes[i] / (ms / 1000));
  }
  const targets = new Set([...dna02.left, ...dna02.right]);
  const strength = new Map<string, number>();
  for (let i = 0; i < c.neurons; i++) {
    if (!type(i) || weights.gain[i] === 0 || rate[i] === 0) continue;
    for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
      if (targets.has(c.post[e])) strength.set(type(i), (strength.get(type(i)) ?? 0) + weights.network.count[e] * Math.abs(weights.gain[i]) * rate[i]);
    }
  }
  const eyes = (gain: Float32Array) => SIDES.map((s) => respond(background[s].neurons, background[s].maxRate * Number(values.level), { dna02: dna02[s] }, gain).dna02);
  const [l0, r0] = eyes(weights.gain);
  console.log(`  each of DNa02's ${mute} strongest inputs silenced: left eye's DNa02, right eye's DNa02, the gap (${hz(l0)} ${hz(r0)} ${hz(l0 - r0)} with none)`);
  for (const [name] of [...strength].sort((a, b) => b[1] - a[1]).slice(0, mute)) {
    const gain = Float32Array.from(weights.gain, (g, i) => (type(i) === name ? 0 : g));
    const [l, r] = eyes(gain);
    console.log(`    ${name.padEnd(14)} ${hz(l)} ${hz(r)} ${hz(l - r)}`);
  }
}

/** Synapses from `from` onto `to`, by the presynaptic neurons' side. */
function synapses(from: (i: number) => boolean, to: ArrayLike<number>) {
  const target = new Set(Array.from(to));
  const out = { left: 0, right: 0 };
  for (let i = 0; i < c.neurons; i++) {
    if (!from(i)) continue;
    const s = side(i);
    if (s !== "left" && s !== "right") continue;
    for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) if (target.has(c.post[e])) out[s] += c.count[e];
  }
  return out;
}
for (const s of SIDES) {
  const all = synapses(() => true, dna02[s]);
  console.log(`  DNa02 ${s}: ${(all.left + all.right).toLocaleString("en-US")} input synapses`);
}
// Where each eye's synapses go, ipsilaterally, by the partners' super class: the
// right's are more complete for the central brain's own neurons than for its
// descending neurons.
const reach = (s: "left" | "right") => {
  const by = new Map<string, number>();
  for (const i of background[s].neurons) {
    for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
      const p = c.post[e];
      if (side(p) === s) by.set(superClass(p), (by.get(superClass(p)) ?? 0) + c.count[e]);
    }
  }
  return by;
};
const [eyeLeft, eyeRight] = [reach("left"), reach("right")];
console.log("  each eye's synapses onto its own side: left, right, right / left");
for (const sc of ["cb_intrinsic", "descending_neuron", "visual_projection", "ol_intrinsic"]) {
  console.log(`    ${sc.padEnd(20)} ${(eyeLeft.get(sc) ?? 0).toLocaleString("en-US").padStart(10)} ${(eyeRight.get(sc) ?? 0).toLocaleString("en-US").padStart(10)}  ${((eyeRight.get(sc) ?? 0) / (eyeLeft.get(sc) ?? 1)).toFixed(2)}`);
}

console.log(`\n(b) grooming: each side's head bristle neurons at 50 Hz, ${ms} ms; DNg12 left and right, Hz`);
const dng12 = Object.fromEntries(SIDES.map((s) => [s, c.find({ type: ["DNg12_a", "DNg12_b", "DNg12_c"], side: s })]));
for (const [label, pattern] of [["BM (front of head)", /^BM$/], ["all BM", /^BM/]] as const) {
  const cells = SIDES.map((s) => {
    const r = respond(c.find({ superClass: "cb_sensory", type: pattern, side: s }), 50, dng12);
    return `${s} ${hz(r.left)} ${hz(r.right)}`;
  });
  console.log(`  ${label.padEnd(20)} ${cells.join("   ")}`);
}

console.log("\n(c) cell types whose two sides' transmitters differ in sign or muting, after the fixes");
transmitterSides(c);

function transmitterSides(connectome: Connectome) {
  const sign = (i: number) => Math.sign(weights.gain[i]);
  const byType = new Map<string, { left: number[]; right: number[] }>();
  for (let i = 0; i < connectome.neurons; i++) {
    const t = type(i);
    const s = side(i);
    if (!t || (s !== "left" && s !== "right")) continue;
    const g = byType.get(t) ?? { left: [0, 0, 0], right: [0, 0, 0] };
    let out = 0;
    for (let e = connectome.ptr[i]; e < connectome.ptr[i + 1]; e++) out += connectome.count[e];
    g[s][sign(i) + 1] += out;
    byType.set(t, g);
  }
  let types = 0;
  let synapses = 0;
  for (const g of byType.values()) {
    const share = (v: number[]) => v.map((x) => x / (v[0] + v[1] + v[2] || 1));
    const [l, r] = [share(g.left), share(g.right)];
    if (l.reduce((d, x, k) => d + Math.abs(x - r[k]), 0) > 0.3 && g.left.some(Boolean) && g.right.some(Boolean)) {
      types++;
      synapses += g.left.reduce((a, b) => a + b) + g.right.reduce((a, b) => a + b);
    }
  }
  console.log(`  ${types} types, ${synapses.toLocaleString("en-US")} output synapses (a third or more of a side's synapses differ)`);
}
