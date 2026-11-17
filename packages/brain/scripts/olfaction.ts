// Offline assay: exact annotated sensory populations, never command-selected inputs.
// See docs/olfaction-protocol.md. JSON goes to stdout; progress goes to stderr.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { compressionRegistry, CompressionType, tableFromIPC } from "apache-arrow";
import lz4 from "lz4js";
import { loadAnatomy } from "../src/anatomy.ts";
import { loadConnectome } from "../src/format.ts";
import { ANNOTATION_SHA256, ANNOTATION_URL } from "../src/pack-anatomy.ts";
import { OPERATING_POINT } from "../src/params.ts";
import { REGIONS } from "../src/regions.ts";
import { FlyBrain } from "../src/runtime.ts";
import { RESTING_SENSES } from "../src/types.ts";

const { values } = parseArgs({ options: {
  part: { type: "string", default: "audit" },
  path: { type: "string", default: "packages/brain/data/connectome.bin" },
  anatomy: { type: "string", default: "packages/brain/data/anatomy.bin" },
  annotations: { type: "string", default: "packages/brain/data/annotations.feather" },
  seeds: { type: "string", default: "1,2,3" },
} });
assert(["audit", "simulate"].includes(values.part), "--part audit|simulate");
const bytes = (path: string) => Uint8Array.from(readFileSync(path)).buffer;
const hash = (data: ArrayBuffer) => createHash("sha256").update(new Uint8Array(data)).digest("hex");
const data = bytes(values.path);
assert.equal(hash(data), "51c97031b39f93c04a683f16683d88f15d291f1e1062694fc0a215e23c3b895c");
const c = loadConnectome(data);
const anatomyData = bytes(values.anatomy);
const anatomy = await loadAnatomy(anatomyData, data);
const annotationData = bytes(values.annotations);
assert.equal(hash(annotationData), ANNOTATION_SHA256);
compressionRegistry.set(CompressionType.LZ4_FRAME, { decode: (b) => lz4.decompress(b) });
const annotations = tableFromIPC(annotationData);
const type = (i: number) => c.columns.type.value(i);
const cls = (i: number) => c.columns.class.value(i);
const sc = (i: number) => c.columns.superClass.value(i);
const selected = ["DM1", "VA2", "DA2", "V", "DM5"];
const orn = c.find({ superClass: "cb_sensory", class: "olfactory" });
const groups = new Map<string, Uint32Array>();
for (const t of [...new Set([...orn].map(type))].sort()) groups.set(t, c.find({ superClass: "cb_sensory", class: "olfactory", type: t }));
const normalSide = (side: unknown) => side === "L" ? "left" : side === "R" ? "right" : side === "M" ? "midline" : side ?? "";
const rows = new Map<number, Record<string, unknown>>();
for (const row of annotations) {
  const id = Number(row.bodyId);
  assert(!rows.has(id), `duplicate bodyId ${id}`);
  rows.set(id, row.toJSON());
}
const mismatches: { bodyId: number; field: string; packed: unknown; annotation: unknown }[] = [];
for (const i of orn) {
  const row = rows.get(c.rootId[i]);
  assert(row, `missing bodyId ${c.rootId[i]}`);
  for (const [field, a, b] of [
    ["type", type(i), row.type ?? ""], ["class", cls(i), row.class ?? ""],
    ["superClass", sc(i), row.superclass ?? ""],
    ["rootSide", anatomy.columns.rootSide.value(i), normalSide(row.rootSide)],
    ["entryNerve", anatomy.columns.entryNerve.value(i), row.entryNerve ?? ""],
  ] as const) if (a !== b) mismatches.push({ bodyId: c.rootId[i], field, packed: a, annotation: b });
}
assert.equal(mismatches.length, 0, JSON.stringify(mismatches));
for (const g of selected) assert(groups.get(`ORN_${g}`)?.length, `no ${g} input`);
const provenance = { connectomeSha256: hash(data), anatomySha256: hash(anatomyData), annotationSha256: hash(annotationData),
  annotationURL: ANNOTATION_URL, annotationRows: annotations.numRows,
  attribution: "FlyEM male CNS connectome, Janelia Research Campus (CC-BY 4.0)" };
const tally = (ns: Iterable<number>, value: (i: number) => string) => {
  const out: Record<string, number> = {};
  for (const i of ns) { const key = value(i); out[key] = (out[key] ?? 0) + 1; }
  return out;
};

// Each stage contains only cells with a direct edge from the preceding stage.
// Edge sums are not multiplied across paths, and do not imply transmitted spikes.
function edges(from: Iterable<number>, accepts: (i: number) => boolean) {
  const targets = new Set<number>();
  const byType: Record<string, number> = {};
  let synapses = 0, pairs = 0;
  for (const i of from) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) {
    const j = c.post[e];
    if (!accepts(j)) continue;
    targets.add(j); synapses += c.count[e]; pairs++;
    byType[type(j)] = (byType[type(j)] ?? 0) + c.count[e];
  }
  return { targets, summary: { synapses, pairs, targetNeurons: targets.size,
    targetTypes: Object.fromEntries(Object.entries(byType).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) } };
}
const isDN = (i: number) => sc(i) === "descending_neuron";
const isLH = (i: number) => sc(i) === "cb_intrinsic" && /^LH/.test(type(i));
const wiring = (g: string) => {
  const pn = edges(groups.get(`ORN_${g}`)!, (i) => cls(i) === "ALPN");
  const lh = edges(pn.targets, isLH);
  const kc = edges(pn.targets, (i) => cls(i) === "Kenyon_Cell");
  const mbon = edges(kc.targets, (i) => cls(i) === "MBON");
  const lhDN = edges(lh.targets, isDN);
  const mbDN = edges(mbon.targets, isDN);
  const lhRelay = edges(lh.targets, (i) => sc(i) === "cb_intrinsic" && !isLH(i));
  const mbRelay = edges(mbon.targets, (i) => sc(i) === "cb_intrinsic" && cls(i) !== "MBON");
  return { glomerulus: g, ornPN: pn.summary, pnLH: lh.summary, pnKC: kc.summary,
    kcMBON: mbon.summary, lhDN: lhDN.summary, mbonDN: mbDN.summary,
    lhRelay: lhRelay.summary, lhRelayDN: edges(lhRelay.targets, isDN).summary,
    mbonRelay: mbRelay.summary, mbonRelayDN: edges(mbRelay.targets, isDN).summary };
};
if (values.part === "audit") {
  console.log(JSON.stringify({ provenance, schema: annotations.schema.fields.map((f) => f.name),
    olfactoryNeurons: orn.length, mismatches, inventory: [...groups].map(([t, ns]) => ({ type: t, neurons: ns.length,
      rootSides: tally(ns, (i) => anatomy.columns.rootSide.value(i)),
      packedSides: tally(ns, (i) => c.columns.side.value(i)),
      entryNerves: tally(ns, (i) => anatomy.columns.entryNerve.value(i)),
      receptorTypes: tally(ns, (i) => String(rows.get(c.rootId[i])!.receptorType ?? "")),
      bodyIds: [...ns].map((i) => c.rootId[i]),
    })), wiring: selected.map(wiring) }, null, 2));
} else {
  const seeds = values.seeds.split(",").map(Number);
  assert(seeds.length > 0 && seeds.every((s) => Number.isSafeInteger(s) && s > 0));
  const watch: [string, Uint32Array][] = [
    ...selected.map((g): [string, Uint32Array] => [`ORN_${g}`, groups.get(`ORN_${g}`)!]),
    ["ALPN", c.find({ class: "ALPN" })], ["LH", c.filter(isLH)],
    ["KC", c.find({ class: "Kenyon_Cell" })], ["MBON", c.find({ class: "MBON" })],
    ["DN", c.filter(isDN)],
  ];
  const trials = [];
  const conditions = [{ glomerulus: "control", rate: 0 }, ...selected.flatMap((glomerulus) => [10, 25, 50, 100, 200].map((rate) => ({ glomerulus, rate })))];
  for (const seed of seeds) for (const condition of conditions) {
    console.error(`seed ${seed}, ${condition.glomerulus}, ${condition.rate}`);
    const brain = new FlyBrain(c, { seed });
    const read = new Set(brain.wiring.readouts.flatMap((g) => [...g.neurons]));
    for (const g of selected) {
      const ns = groups.get(`ORN_${g}`)!;
      for (const i of ns) assert(!read.has(i), `input/readout overlap ${c.rootId[i]}`);
      brain.sim.addInput(`olfaction.${g}`, ns);
    }
    brain.sim.setRecording(true);
    const bins = [];
    for (let second = 0; second < 12; second++) {
      for (const g of selected) brain.sim.setRate(`olfaction.${g}`, second >= 2 && second < 7 && condition.glomerulus === g ? condition.rate : 0);
      brain.sim.recording!.fill(0);
      const command: Record<string, number> = {}, peak: Record<string, number> = {};
      const readouts: Record<string, number> = {};
      const regionPeak: Record<string, number> = {};
      let maxActive = 0, spikes = 0;
      for (let t = 0; t < 1000; t += 10) {
        const state = brain.tick(10, RESTING_SENSES);
        for (const [k, v] of Object.entries(state.command)) {
          command[k] = (command[k] ?? 0) + v / 100;
          peak[k] = Math.max(peak[k] ?? -Infinity, Math.abs(v));
        }
        for (const { spec } of brain.wiring.readouts) readouts[spec.name] = (readouts[spec.name] ?? 0) + state.stats.rates[spec.name] / 100;
        for (const r of REGIONS) if (/^(antennal-lobe|mushroom-body|lateral-horn|descending)-/.test(r.id)) {
          regionPeak[r.id] = Math.max(regionPeak[r.id] ?? 0, state.stats.rates[`region.${r.id}`]);
        }
        maxActive = Math.max(maxActive, state.stats.active); spikes += state.stats.spikes;
      }
      const hz = Object.fromEntries(watch.map(([name, ns]) => {
        let count = 0; for (const i of ns) count += brain.sim.recording![i];
        return [name, count / ns.length];
      }));
      bins.push({ second, command, peak, readouts, hz, regionPeak, maxActive, spikes });
    }
    trials.push({ seed, ...condition, bins });
  }
  console.log(JSON.stringify({ provenance, operatingPoint: OPERATING_POINT,
    populationSizes: Object.fromEntries(watch.map(([name, ns]) => [name, ns.length])), trials }, null, 2));
}
