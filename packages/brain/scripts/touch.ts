// Checks touch's regions against the nerves their neurons enter by (README,
// Senses): the packed wiring doesn't say which nerve a sensory neuron enters
// the cord by, so the body's regions are picked by type (io.ts, BODY_TOUCH),
// and this says how well the types stand for the nerves.
//
//   node packages/brain/scripts/touch.ts [--anatomy <anatomy.bin>]
//
// Needs the anatomy sidecar (`npm run brain:fetch`). For each region: its
// neurons by entry nerve and root side; then, for each nerve a region is
// meant to be, the tactile neurons entering by it that the region misses.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadAnatomy } from "../src/anatomy.ts";
import { loadConnectome } from "../src/format.ts";
import { wire } from "../src/io.ts";
import { DEFAULT_CONNECTOME_PATH } from "../src/node.ts";

const { values } = parseArgs({
  options: {
    path: { type: "string", default: DEFAULT_CONNECTOME_PATH },
    anatomy: { type: "string", default: fileURLToPath(new URL("../data/anatomy.bin", import.meta.url)) },
  },
});
if (!existsSync(values.anatomy)) throw new Error(`No anatomy at ${values.anatomy}: run npm run brain:fetch`);
const bytes = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const data = bytes(values.path);
const c = loadConnectome(data);
const anatomy = await loadAnatomy(bytes(values.anatomy), data);
const nerve = (i: number) => anatomy.columns.entryNerve.value(i) || "(none)";
const side = (i: number) => anatomy.columns.rootSide.value(i) || "(none)";
const tactile = (i: number) => /sensory/.test(c.columns.superClass.value(i)) && c.columns.class.value(i) === "mechanosensory_tactile";

// The nerves each body region is meant to be (grooming.ts sorts the bristles the same way).
const MEANT: Record<string, RegExp> = {
  touchNotum: /^(PDMN|DProN)$/,
  touchWings: /^(ADMN|DMetaN)$/,
  touchAbdomen: /^AbN/,
  touchLegs: /^(Pro|Meso|Meta)LN$/,
};

const tally = (neurons: Iterable<number>, key: (i: number) => string) => {
  const counts = new Map<string, number>();
  for (const i of neurons) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
};

for (const group of wire(c).senses) {
  if (!group.ends) continue;
  console.log(`${group.spec.name} (${group.neurons.length}):`);
  const inRegion = new Set<number>();
  group.spec.regions!.forEach((region, r) => {
    const neurons = [...group.neurons.subarray(r === 0 ? 0 : group.ends![r - 1], group.ends![r])];
    for (const i of neurons) inRegion.add(i);
    console.log(`  ${region.sense.padEnd(22)} ${String(neurons.length).padStart(5)}  by nerve: ${tally(neurons, nerve)};  root side: ${tally(neurons, side)}`);
    const meant = MEANT[region.sense];
    if (!meant) return;
    const astray = neurons.filter((i) => !meant.test(nerve(i)));
    if (astray.length) console.log(`  ${"".padEnd(28)} by another nerve: ${tally(astray, (i) => `${c.columns.type.value(i) || "(untyped)"} by ${nerve(i)}`)}`);
  });
  for (const [sense, meant] of Object.entries(MEANT)) {
    if (!group.spec.regions!.some((r) => r.sense === sense)) continue;
    const missed = c.filter((i) => meant.test(nerve(i)) && tactile(i) && !inRegion.has(i));
    if (missed.length) console.log(`  ${sense}'s nerves' tactile neurons in no region: ${tally(missed, (i) => `${c.columns.type.value(i) || "(untyped)"} by ${nerve(i)}`)}`);
  }
}
