// Smell (olfaction.ts): the table, the groups, each group's rate and the
// completeness of the left antenna's nerve without the real data; with it
// (skipped without; `npm run brain:fetch`), that every olfactory neuron is in a
// group, that without odour nothing changes, and that odour at one antenna
// turns the fly toward it (docs/olfaction-gates-protocol.md, Part C).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { loadConnectome } from "./format.ts";
import { DEFAULT_CONNECTOME_PATH, readConnectomeFile } from "./node.ts";
import { ODORANTS, UNTYPED_RATE, odorOf, ornRate, wireOlfaction } from "./olfaction.ts";
import type { OrnGroup } from "./olfaction.ts";
import { ORN_TABLE } from "./orn-table.ts";
import { OPERATING_POINT, ORN_UNCORRECTED, completenessFactors } from "./params.ts";
import { FlyBrain } from "./runtime.ts";
import { bufferOf, packSynthetic } from "./test-helpers.ts";
import { RESTING_SENSES } from "./types.ts";
import type { BrainSenses } from "./types.ts";

const skip = existsSync(DEFAULT_CONNECTOME_PATH) ? false : `no ${DEFAULT_CONNECTOME_PATH}; run npm run brain:fetch`;

test("the table: every glomerulus once, a source for each spontaneous rate but the median's, an answer for each odorant", () => {
  assert.equal(new Set(ORN_TABLE.map((row) => row[0])).size, ORN_TABLE.length);
  for (const [glomerulus, , source, spontaneous, answers] of ORN_TABLE) {
    assert.equal(answers.length, ODORANTS.length, glomerulus);
    assert.ok(spontaneous >= 0, glomerulus);
    if (!source) assert.equal(spontaneous, UNTYPED_RATE, glomerulus);
  }
  // Hallem & Carlson 2006, Table S1, as the table has it: Or22a (DM2) at rest and to ethyl acetate, isoamyl acetate.
  const dm2 = ORN_TABLE.find((row) => row[0] === "DM2")!;
  assert.deepEqual([dm2[3], dm2[4][0], dm2[4][3]], [4, 53, 232]);
  // CO2 is V's (de Bruyne et al. 2001).
  const v = ORN_TABLE.find((row) => row[0] === "V")!;
  assert.ok(v[4][4] > 200);
});

test("odour strength is held to 0..1 per antenna, and what is left out or not a number is none", () => {
  const into = new Float64Array(2 * ODORANTS.length);
  odorOf({ ...RESTING_SENSES, odor: { left: [0.5, 2, -1, Number.NaN], right: [1, 0, 0, 0, 0.25] } }, into);
  assert.deepEqual([...into], [0.5, 1, 0, 0, 0, 1, 0, 0, 0, 0.25]);
  odorOf(RESTING_SENSES, into);
  assert.ok(into.every((x) => x === 0));
});

test("a group fires at its answers on its own antenna's odour, the unknown side at the mean, never below silence; at rest only if asked", () => {
  const group = (side: OrnGroup["side"]): OrnGroup => ({ name: side, glomerulus: "X", side, neurons: new Uint32Array(1), spontaneous: 10, answers: Float64Array.from([100, -30, 0, 0, 50]) });
  const odor = new Float64Array([1, 0, 0, 0, 0, 0, 1, 0, 0, 1]);
  assert.equal(ornRate(group("left"), odor, false), 100);
  assert.equal(ornRate(group("right"), odor, false), -30 + 50);
  assert.equal(ornRate(group("unknown"), odor, false), 50 - 15 + 25);
  assert.equal(ornRate(group("right"), odor, true), 10 - 30 + 50);
  assert.equal(ornRate(group("left"), new Float64Array(10), true), 10);
  assert.equal(ornRate(group("right"), new Float64Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 0]), false), 0);
});

test("each glomerulus's neurons are grouped by antenna, and the less completely traced side of each counts the other's synapses", () => {
  const orn = (type: string, side: string) => ({ type, superClass: "cb_sensory", class: "olfactory", side, nt: "ACH" });
  const c = loadConnectome(
    bufferOf(
      packSynthetic(
        [orn("ORN_DM1", "left"), orn("ORN_DM1", "right"), orn("ORN_DM1", ""), orn("ORN_VA1v", "left"), orn("ORN_VA1v", "right"), orn("", "left"), { type: "DM1_lPN", superClass: "cb_intrinsic", class: "ALPN", side: "left", nt: "ACH" }],
        [
          [0, 6, 10],
          [1, 6, 30],
          [2, 6, 5],
          [3, 6, 10],
          [4, 6, 40],
          [5, 6, 3],
        ],
      ),
    ),
  );
  const groups = wireOlfaction(c);
  assert.deepEqual(groups.map((g) => [g.name, [...g.neurons]]), [
    ["smell DM1 left", [0]],
    ["smell DM1 right", [1]],
    ["smell DM1 unknown", [2]],
    ["smell VA1v left", [3]],
    ["smell VA1v right", [4]],
    ["smell untyped left", [5]],
  ]);
  assert.equal(groups.at(-1)!.spontaneous, UNTYPED_RATE);
  // DM1's left counts 3 times; VA1v's sides reach partners too unalike to correct (params.ts).
  assert.ok(ORN_UNCORRECTED.includes("VA1v"));
  assert.deepEqual([...completenessFactors(c, OPERATING_POINT.completeness)], [[0, 3]]);
});

const connectome = skip ? undefined : readConnectomeFile();

test("on the real connectome every olfactory neuron is in one group, every labelled glomerulus is in the table, none is read", { skip }, () => {
  const groups = wireOlfaction(connectome!);
  const all = connectome!.find({ superClass: "cb_sensory", class: "olfactory" });
  const grouped = groups.flatMap((g) => [...g.neurons]);
  assert.equal(grouped.length, all.length);
  assert.equal(new Set(grouped).size, all.length);
  const labelled = new Set([...all].map((i) => connectome!.columns.type.value(i)).filter((t) => t.startsWith("ORN_")));
  assert.deepEqual([...labelled].sort(), ORN_TABLE.map((row) => `ORN_${row[0]}`).sort());
  new FlyBrain(connectome!, { seed: 1 });
});

test("odour at one antenna turns the fly toward it, either side alike", { skip }, () => {
  // Part C's P1 on two of its seeds: ethyl acetate at full strength at one antenna for 5 s after 20 s of rest.
  const turn = (seed: number, side: "left" | "right") => {
    const b = new FlyBrain(connectome!, { seed });
    const senses: BrainSenses = { ...RESTING_SENSES, hunger: 1 };
    for (let t = 0; t < 20_000; t += 20) b.tick(20, senses);
    const one = [1, 0, 0, 0, 0];
    const none = [0, 0, 0, 0, 0];
    const smelling = { ...senses, odor: side === "left" ? { left: one, right: none } : { left: none, right: one } };
    let sum = 0;
    for (let t = 0; t < 5000; t += 20) sum += b.tick(20, smelling).command.turn / 250;
    return sum;
  };
  for (const seed of [41, 42]) {
    const toward = (turn(seed, "right") - turn(seed, "left")) / 2;
    assert.ok(toward > 0.02, `seed ${seed}: turns toward by ${toward}`);
  }
});
