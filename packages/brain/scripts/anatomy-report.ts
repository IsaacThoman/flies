// Reproduce the README's measured coverage and soma envelopes from the shipped pair.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { anatomicalPosition, cordSegments, loadAnatomy } from "../src/anatomy.ts";
import { loadConnectome } from "../src/format.ts";
import { DEFAULT_CONNECTOME_PATH } from "../src/node.ts";

const wiring = Uint8Array.from(readFileSync(DEFAULT_CONNECTOME_PATH)).buffer;
const c = loadConnectome(wiring);
const a = await loadAnatomy(Uint8Array.from(readFileSync(join(dirname(DEFAULT_CONNECTOME_PATH), "anatomy.bin"))).buffer, wiring);
console.log("| Super class | Neurons | Soma | Fibre only | Segment | Entry nerve | Root side |\n|---|---:|---:|---:|---:|---:|---:|");
for (const sc of c.columns.superClass.table) {
  const ids = c.find({ superClass: sc });
  if (!ids.length) continue;
  const count = (test: (i: number) => boolean) => ids.filter(test).length;
  console.log(`| ${sc} | ${ids.length} | ${count((i) => a.positionKind[i] === 1)} | ${count((i) => a.positionKind[i] === 2)} | ${count((i) => !!a.segment(i))} | ${count((i) => !!a.columns.entryNerve.value(i))} | ${count((i) => !!a.columns.rootSide.value(i))} |`);
}
console.log("\n| Soma envelope | Positioned | Left x (µm) | Dorsal y (µm) | Anterior z (µm) |\n|---|---:|---:|---:|---:|");
const envelope = (name: string, ids: Uint32Array) => {
  const points = Array.from(ids, (i) => a.position(i)).filter((p) => p !== null).map((p) => anatomicalPosition(p));
  if (!points.length) return;
  const range = (k: number) => `${points.reduce((v, p) => Math.min(v, p[k]), Infinity).toFixed(1)}…${points.reduce((v, p) => Math.max(v, p[k]), -Infinity).toFixed(1)}`;
  console.log(`| ${name} | ${points.length} | ${range(0)} | ${range(1)} | ${range(2)} |`);
};
envelope("Central brain (cb_intrinsic)", c.find({ superClass: "cb_intrinsic" }));
envelope("Brain incl. optic lobes (head-resident super classes)", c.find({ superClass: /^(cb_|ol_|visual_|descending_neuron$)/ }));
for (const side of ["left", "right"]) envelope(`Optic lobe ${side} (ol_intrinsic)`, c.find({ superClass: "ol_intrinsic", side }));
envelope("Neck-projecting classes (somata, NOT neck tissue)", c.find({ superClass: ["descending_neuron", "ascending_neuron", "sensory_descending"] }));
envelope("Cord (vnc_* and ascending_neuron)", c.find({ superClass: /^(vnc_|ascending_neuron$)/ }));
for (const segment of a.columns.neuromere.table) if (segment) envelope(segment, c.filter((i) => a.segment(i) === segment));
console.log("\n| Interneuron segment | Left | Right | Midline | No side |\n|---|---:|---:|---:|---:|");
const groups = cordSegments(c, a);
for (const segment of [...new Set(groups.map((g) => g.segment))]) {
  console.log(`| ${segment || "Unknown"} | ${["left", "right", "midline", ""].map((side) => groups.find((g) => g.segment === segment && g.side === side)?.neurons.length ?? 0).join(" | ")} |`);
}
