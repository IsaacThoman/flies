// The generated table and receptor inputs, including sides absent from the real data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { loadConnectome } from "../../brain/src/format.ts";
import { ORN_TABLE } from "../../brain/src/orn-table.ts";
import { packSynthetic, syntheticConnectome } from "../../brain/src/test-helpers.ts";
import { ORN_TABLE_SOURCE, ornTableSource } from "../scripts/orn-table.ts";
import { BUILDS, firstDifference, native, scenario, tempFile, typescript } from "./compare.ts";

test("the native ORN table is generated from the reference", () => {
  assert.equal(readFileSync(ORN_TABLE_SOURCE, "utf8"), ornTableSource());
});

for (const target of BUILDS) {
  test(`all glomeruli, untyped ORNs and unknown sides match the reference (${target.name})`, { skip: target.skip }, () => {
    const base = syntheticConnectome();
    const c = loadConnectome(base.bytes.slice().buffer);
    const neurons = [...base.neurons];
    const edges: [number, number, number][] = [];
    for (let i = 0; i < c.neurons; i++) for (let e = c.ptr[i]; e < c.ptr[i + 1]; e++) edges.push([i, c.post[e], c.count[e]]);
    for (const type of [...ORN_TABLE.map(([g]) => `ORN_${g}`), ""]) {
      for (const side of ["left", "right", "unknown", ""]) {
        const i = neurons.length;
        neurons.push({ type, side, superClass: "cb_sensory", class: "olfactory", nt: "ACH", rootId: c.rootId[c.neurons - 1] + i - c.neurons + 1 });
        // Unequal sides exercise completeness, including its uncorrected types.
        edges.push([i, base.index["DNa02 left"][0], side === "left" ? 3 : 7]);
      }
    }
    const bytes = packSynthetic(neurons, edges);
    const ticks = scenario(1);
    const expected = typescript(bytes.slice().buffer, 3, ticks);
    const file = tempFile(bytes);
    try {
      const actual = native(target.dir(), file.path, 3, ticks);
      assert.equal(firstDifference(expected, actual, ticks), null);
    } finally {
      file.remove();
    }
  });
}
