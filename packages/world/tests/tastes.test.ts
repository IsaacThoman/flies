import assert from "node:assert/strict";
import { test } from "node:test";
import { CAFFEINE_SPIKES, CONTENTS, FOODS, FOUND_TASTES, SUGAR_SPIKES, TASTES, WORLDS, WATER_SIGNAL, mix, mixtureSpikes, otherTastes, solution, tastesOf } from "../src/index.ts";
import type { Tastes } from "../src/index.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("one sugar alone gives the sugar neuron's recorded answer at each recorded concentration", () => {
  for (const sugar of ["sucrose", "glucose", "fructose"] as const) {
    SUGAR_SPIKES.mM.forEach((mM, i) => near(mixtureSpikes({ [sugar]: mM }), SUGAR_SPIKES[sugar][i], 1e-3));
    // Past the last recording it holds; below the first it falls straight to none.
    near(mixtureSpikes({ [sugar]: 3000 }), SUGAR_SPIKES[sugar][4], 1e-3);
    near(mixtureSpikes({ [sugar]: 5 }), SUGAR_SPIKES[sugar][0] / 2, 1e-3);
  }
  // Between two recordings, half way on a log scale is half way between them.
  near(mixtureSpikes({ sucrose: Math.sqrt(100 * 300) }), (69 + 75) / 2, 1e-3);
});

test("sugars mixed add as much of one standing in for another", () => {
  // 100 mM of glucose gives what 30 mM of sucrose about does (47 spikes/s against 47.5): together, more than either, as each
  // stands in for its share of the other at the answer they give together (73 mM of sucrose alone gives it, 169 of glucose).
  const both = mixtureSpikes({ sucrose: 30, glucose: 100 });
  near(both, 63.5, 0.1);
  near(30 / 73 + 100 / 169, 1, 0.01);
});

test("a food's solution is its sugar dissolved in its own water, saturating where it holds too little", () => {
  // A raspberry: 2.35 g of fructose in 85.75 g of water and the 4.41 g of sugar's volume.
  const r = solution(CONTENTS.raspberry);
  near(r.mM.fructose, (2.35 / 180.16) / ((85.75 + 0.63 * 4.41) / 1000) * 1000, 1e-6);
  near(r.sugar, (r.mM.sucrose + r.mM.glucose + r.mM.fructose) / 1000);
  // Sugar dissolves to 2 g a gram of water: a lump's film, honey's and dried juice are each that saturated solution.
  const saturated = (2 / 342.3) / ((1 + 0.63 * 2) / 1000) * 1000;
  near(solution(CONTENTS.sugar).mM.sucrose, saturated, 1e-6);
  near(solution(CONTENTS.mints).mM.sucrose, saturated, 1e-6);
  near(solution({ water: 0, sucrose: 10 }).mM.sucrose, saturated, 1e-6);
  // Espresso's caffeine, about 10.9 mM; sugared, the same caffeine in the water with as much sugar as it dissolves.
  near(solution(CONTENTS.espresso).mM.caffeine, (212 / 194.19) / (97.8 / 1000), 1e-6);
  near(solution(mix([100, CONTENTS.espresso], [300, CONTENTS.sugar])).mM.caffeine, (212 / 194.19) / ((97.8 + 0.63 * 2 * 97.8) / 1000), 0.01);
});

test("sweet is the sugar neuron's answer over the most any sugar drove it to", () => {
  const most = Math.max(...SUGAR_SPIKES.sucrose, ...SUGAR_SPIKES.glucose, ...SUGAR_SPIKES.fructose);
  assert.equal(tastesOf({ water: 100 }).sweet, 0);
  // A lump of sugar: sucrose past 1 M, where it holds at 82.
  assert.equal(TASTES.sugar.sweet, Math.round((82 / most) * 100) / 100);
  // Honey's glucose is past 1 M too: all the neuron gives.
  assert.equal(TASTES.honey.sweet, 1);
  // A raspberry's 4.4 g of sugar in 100 g, mostly fructose and glucose at 120 to 150 mM.
  assert.equal(TASTES.raspberry.sweet, Math.round((mixtureSpikes(solution(CONTENTS.raspberry).mM) / most) * 100) / 100);
  assert.ok(TASTES.raspberry.sweet < TASTES.orange.sweet, "an orange has twice a raspberry's sugar");
});

test("bitter is caffeine's recorded answer over 10 mM's, and nothing below what was recorded", () => {
  assert.equal(TASTES.espresso.bitter, 1);
  assert.equal(tastesOf({ water: 100, caffeine: (1 / 1000) * 194.19 * 100 }).bitter, Math.round((CAFFEINE_SPIKES.spikes[0] / 43) * 100) / 100);
  // Cola's 0.5 mM and cake's 0.7 are below the lowest recording: not known, none assumed.
  assert.equal(TASTES.cola.bitter, 0);
  assert.equal(TASTES.cake.bitter, 0);
  // The sugared espresso's caffeine, about 4.9 mM, between 3 and 10 mM's answers.
  const b = TASTES.sugaredEspresso.bitter;
  assert.ok(b > 32 / 43 && b < 1, `${b}`);
});

test("water is the water neurons' recorded answer to the food's sugar, and none past 1 M", () => {
  assert.equal(TASTES.water.water, 1);
  assert.equal(tastesOf({ water: 100, glucose: 2.7 }).water, 1, "0.15 M answers as water does");
  near(tastesOf({ water: 100, sucrose: 0.5 * 34.23 / (1 - 0.63 * 0.5 * 0.3423) }).water, Math.round((WATER_SIGNAL.signal[2] / WATER_SIGNAL.signal[0]) * 100) / 100, 0.011);
  for (const k of ["sugar", "honey", "jam", "syrup", "ketchup", "mints"] as const) assert.equal(TASTES[k].water, 0, k);
});

const same = (a: Tastes, b: Tastes) => a.sweet === b.sweet && a.water === b.water && a.bitter === b.bitter;

test("every food anywhere tastes as some food's contents make it, none set by hand", () => {
  const derived = Object.values(TASTES);
  for (const [kind, spec] of Object.entries(FOODS)) assert.ok(derived.some((t) => same(t, { sweet: spec.sweet, water: spec.water, bitter: spec.bitter })), `Feed's ${kind}`);
  for (const [id, place] of Object.entries(WORLDS)) {
    for (const p of place.patches) assert.ok(derived.some((t) => same(t, { sweet: p.sweet, water: p.water ?? 0, bitter: p.bitter ?? 0 })), `${id}'s ${p.name}`);
  }
  for (const [name, t] of Object.entries(FOUND_TASTES)) {
    assert.ok(derived.includes(t), name);
    // Found food crosses a room as its name and sweetness: every device rebuilds the rest from the name.
    assert.deepEqual(otherTastes([], 0, "found", name), { water: t.water, bitter: t.bitter });
  }
  assert.deepEqual(otherTastes([], 0, "found", "something new"), { water: 0, bitter: 0 });
});
