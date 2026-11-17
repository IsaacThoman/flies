import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConnectome } from "../src/format.ts";
import { packSynthetic } from "../src/test-helpers.ts";
import { COMMANDS, GLOMERULI, effectiveTolerance, matchedInputs, percentile95, referenceLevels, validateCalibrationContexts } from "../scripts/olfaction-controls-lib.ts";

test("the 20-sample drift percentile excludes only the largest observation", () => {
  assert.equal(percentile95(Array.from({ length: 20 }, (_, i) => 20 - i)), 19);
  assert.throws(() => percentile95([]));
  assert.throws(() => percentile95([NaN]));
});

test("an unqualified drift envelope always uses the strict bound", () => {
  assert.equal(effectiveTolerance({ qualified: false, tolerances: { turn: 0.5 } }, "turn"), 0.05);
  assert.equal(effectiveTolerance({ qualified: true, tolerances: { turn: 0.08 } }, "turn"), 0.08);
});

test("calibration validation rejects edited thresholds and missing seeds", () => {
  const profile = () => ({ qualified: true, tolerances: Object.fromEntries(COMMANDS.map((k) => [k, 0.05])),
    drift: Array.from({ length: 20 }, (_, i) => ({ seed: i + 101, ...Object.fromEntries(COMMANDS.map((k) => [k, 0])) })) });
  const contexts = { pinned: profile(), wandering: profile() };
  validateCalibrationContexts(contexts);
  contexts.pinned.tolerances.turn = 0.08;
  assert.throws(() => validateCalibrationContexts(contexts));
  contexts.pinned = profile(); contexts.wandering.drift.pop();
  assert.throws(() => validateCalibrationContexts(contexts));
});

test("background matching depends only on the exogenous seed, not a response", () => {
  assert.deepEqual(referenceLevels(21), referenceLevels(21));
  assert.notDeepEqual(referenceLevels(21), referenceLevels(22));
  for (const value of Object.values(referenceLevels(23))) assert(value > 0 && value < 1);
});

test("bristle matching preserves group size and uses weight then body-ID ties", () => {
  const neurons = [
    ...GLOMERULI.map((g) => ({ type: `ORN_${g}`, superClass: "cb_sensory", class: "olfactory", nt: "ACH" })),
    { type: "BM_a", superClass: "cb_sensory", class: "mechanosensory", nt: "ACH" },
    { type: "BM_b", superClass: "cb_sensory", class: "mechanosensory", nt: "ACH" },
    { type: "target", superClass: "cb_intrinsic", nt: "ACH" },
  ];
  const packed = packSynthetic(neurons, [...GLOMERULI.map((_, i): [number, number, number] => [i, 7, 10]), [5, 7, 10], [6, 7, 10]]);
  const c = loadConnectome(Uint8Array.from(packed).buffer);
  const found = matchedInputs(c);
  for (const g of GLOMERULI) {
    assert.deepEqual([...found.inputs.get(`bristle.${g}`)!], [5]);
    assert.equal(found.matching[g].ratio, 1);
    assert.equal(found.matching[g].count, 1);
  }
});
