// The native regions (src/regions.cpp), built natively and as WebAssembly, against regions.ts: the ids in the
// same order, and every neuron in the same region, on the real connectome
// (skipped without it) and on a made-up one that puts every string the rules
// compare, and near misses of each, in the columns they read, on every side.
// The region rates themselves are compared with the rest of the brain's, tick
// by tick (synthetic.test.ts, connectome.test.ts).

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { loadConnectome } from "../../brain/src/format.ts";
import type { Connectome } from "../../brain/src/format.ts";
import { REGIONS, regionOf } from "../../brain/src/regions.ts";
import { packSynthetic } from "../../brain/src/test-helpers.ts";
import type { SyntheticNeuron } from "../../brain/src/test-helpers.ts";
import { BUILDS, CONNECTOME, harness, readBuffer, tempFile } from "./compare.ts";

/** The first neuron whose region differs, described, or null when none does. */
function compare(dir: string, connectome: Connectome, path: string): string | null {
  const [ready, line] = harness(dir, ["regions", path], "");
  assert.equal(ready, `ready ${REGIONS.map((r) => r.id).join("|")}`);
  const native = line.split(" ").map(Number);
  const expected = regionOf(connectome);
  assert.equal(native.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (native[i] === expected[i]) continue;
    const { superClass, class: klass, subClass, type, side } = connectome.columns;
    const what = [superClass, klass, subClass, type, side].map((column) => JSON.stringify(column.value(i))).join(" ");
    return `neuron ${i} (${what}): typescript ${REGIONS[expected[i]].id}, native ${REGIONS[native[i]]?.id ?? native[i]}`;
  }
  return null;
}

for (const target of BUILDS) {
  test(`on the real connectome every neuron is in the TypeScript's region (${target.name})`, { skip: target.skip || (existsSync(CONNECTOME) ? false : "no packages/brain/data/connectome.bin") }, () => {
    assert.equal(compare(target.dir(), loadConnectome(readBuffer(CONNECTOME)), CONNECTOME), null);
  });
}

for (const target of BUILDS) test(`every string the rules compare, and near misses, come out as in TypeScript (${target.name})`, { skip: target.skip }, () => {
  const rules = readFileSync(new URL("../../brain/src/regions.ts", import.meta.url), "utf8");
  const code = rules.slice(rules.indexOf("const INDEX"));
  const literals = [...new Set([...code.matchAll(/"([^"\n]+)"/g)].map((m) => m[1]))];
  const superClasses = [...new Set([...code.matchAll(/case "([^"]+)"/g)].map((m) => m[1]))].concat(["", "ol_intrinsic_x"]);
  // Near misses: one character more or fewer, another case, something in front, and strings that aren't ASCII.
  const types = [...new Set(literals.flatMap((s) => [s, `${s}1`, `${s}_x`, s.slice(0, -1), s.toLowerCase(), s.toUpperCase(), `x${s}`]))].concat(["", "Tmé", "é", "Ö-1", "JO-ü"]);
  const values = [...literals, ""];
  const sides = ["left", "right", "center", "", "Left"];
  const neurons: SyntheticNeuron[] = [];
  for (const superClass of superClasses) {
    for (const side of sides) {
      for (const type of types) neurons.push({ superClass, type, side });
      for (const value of values) neurons.push({ superClass, class: value, subClass: value, type: "JO-EV1", side });
      for (const value of values) neurons.push({ superClass, class: value, type: value === "" ? "" : "FB1", side });
    }
  }
  assert.ok(superClasses.length > 25 && literals.length > 150, `${superClasses.length} super classes, ${literals.length} strings`);
  const bytes = packSynthetic(neurons, []);
  const file = tempFile(bytes);
  try {
    assert.equal(compare(target.dir(), loadConnectome(bytes.slice().buffer), file.path), null);
  } finally {
    file.remove();
  }
});
