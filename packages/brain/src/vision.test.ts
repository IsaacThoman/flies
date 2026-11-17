// The eyes' input stage: luminance per facet to rates of L1, L2 and L3, and
// of L1's withdrawals under brightening.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { EyeCells } from "./eyes.ts";
import { RETINA, Retina } from "./vision.ts";

// Two facets: the first with all three cells, the second with no L3.
const cells: EyeCells = {
  hex1: Uint8Array.from([18, 19]),
  hex2: Uint8Array.from([19, 19]),
  kind: new Uint8Array(2),
  l1: Int32Array.from([10, 11]),
  l2: Int32Array.from([20, 21]),
  l3: Int32Array.from([30, -1]),
};
// Rates by cell: L1 of facet 0, L1 of 1, L2 of 0, L2 of 1, L3 of 0.
const [L1, , L2, L2b, L3] = [0, 1, 2, 3, 4];

/** Holds a light for ms, in 10 ms steps; returns the rates and withdrawals at the end and whether the last step changed anything. */
function hold(retina: Retina, light: number[], ms: number) {
  let changed = false;
  for (let t = 0; t < ms; t += 10) changed = retina.step(10, light);
  return { rates: [...retina.rates], withdrawals: [...retina.withdrawals], changed };
}

test("the driven cells are each facet's L1s, then L2s, then L3s; the L1s are also the ones that withdraw", () => {
  const retina = new Retina(cells);
  assert.deepEqual([...retina.neurons], [10, 11, 20, 21, 30]);
  assert.deepEqual([...retina.l1], [10, 11]);
});

test("opening the eyes starts adapted: a steady scene drives nothing and passes nothing on", () => {
  const retina = new Retina(cells);
  assert.equal(retina.step(10, [0.3, 0.9]), false);
  assert.deepEqual(hold(retina, [0.3, 0.9], 5000), { rates: [0, 0, 0, 0, 0], withdrawals: [0, 0], changed: false });
});

test("darkening drives L1 and L2 transiently and L3 for longer, and withdraws nothing", () => {
  const retina = new Retina(cells);
  hold(retina, [1, 1], 1000);
  const onset = hold(retina, [0.2, 1], 10).rates;
  // Contrast about 0.76 of full darkening, in facet 0 only.
  assert.ok(onset[L1] > 0.5 * RETINA.maxRate && onset[L2] === onset[L1] && onset[L3] > 0.5 * RETINA.maxRate, `${onset}`);
  assert.equal(onset[L2b], 0);
  assert.deepEqual(retina.withdrawals, Float64Array.from([0, 0]));
  const later = hold(retina, [0.2, 1], 990).rates;
  // A second on, L1 and L2 have adapted to the new level (time constant 200 ms); L3 (2 s) has not.
  assert.ok(later[L1] < 0.02 * RETINA.maxRate, `L1 ${later[L1]}`);
  assert.ok(later[L3] > 0.3 * RETINA.maxRate, `L3 ${later[L3]}`);
  // Back to the light: the darkening's rates fall to 0 at once, and facet 0's L1 withdraws instead.
  const back = hold(retina, [1, 1], 10);
  assert.deepEqual(back.rates, [0, 0, 0, 0, 0]);
  assert.ok(back.withdrawals[0] > 0 && back.withdrawals[1] === 0, `${back.withdrawals}`);
  assert.equal(back.changed, true);
});

test("brightening withdraws L1's release, transiently, at the rate the same contrast of darkening fires it; L2 and L3 do nothing", () => {
  const retina = new Retina(cells);
  hold(retina, [0.5, 0.5], 3000);
  const onset = hold(retina, [0.75, 0.5], 10);
  assert.deepEqual(onset.rates, [0, 0, 0, 0, 0]);
  const darkening = new Retina(cells);
  hold(darkening, [0.5, 0.5], 3000);
  const mirror = hold(darkening, [0.25, 0.5], 10).rates[L1];
  assert.ok(onset.withdrawals[0] > 0.2 * RETINA.maxRate, `${onset.withdrawals}`);
  // The same formula; only the ambient level, moving toward the new light within the step, differs a little.
  assert.ok(Math.abs(onset.withdrawals[0] - mirror) < 0.01 * mirror, `${onset.withdrawals[0]} against ${mirror}`);
  assert.equal(onset.withdrawals[1], 0);
  // A white flash on black passes the ceiling; it is held there.
  const flash = new Retina(cells);
  hold(flash, [0, 0], 3000);
  assert.equal(hold(flash, [1, 0], 10).withdrawals[0], RETINA.maxRate);
  // L1 adapts as it does to darkening (200 ms), and once the scene is steady nothing is passed on.
  assert.ok(hold(retina, [0.75, 0.5], 990).withdrawals[0] < 0.02 * RETINA.maxRate);
  // Exactly nothing once the recent level has rounded to the light (some 37 time constants).
  hold(retina, [0.75, 0.5], 10_000);
  assert.equal(hold(retina, [0.75, 0.5], 10).changed, false);
  // withdraw 0 is the model without an ON pathway.
  const off = new Retina(cells, { ...RETINA, withdraw: 0 });
  hold(off, [0.5, 0.5], 3000);
  assert.deepEqual(hold(off, [1, 0.5], 10), { rates: [0, 0, 0, 0, 0], withdrawals: [0, 0], changed: false });
});

test("after any change the eye falls quiet again, exactly: no level is left a rounding error short of the light", () => {
  for (const [from, to] of [
    [0.5, 0.25],
    [0.5, 0.75],
    [0.3, 0.9],
    [1, 0.2],
  ]) {
    const retina = new Retina(cells);
    hold(retina, [from, from], 1000);
    hold(retina, [to, to], 100_000);
    assert.deepEqual(hold(retina, [to, to], 10), { rates: [0, 0, 0, 0, 0], withdrawals: [0, 0], changed: false }, `${from} to ${to}`);
  }
});

test("the response is to contrast: the same fractional dimming at any ambient level gives the same rate (above the floor)", () => {
  const at = (level: number) => {
    const retina = new Retina(cells, { ...RETINA, floor: 0 });
    hold(retina, [level, level], 3000);
    return hold(retina, [level / 2, level], 10).rates[L1];
  };
  assert.ok(Math.abs(at(1) - at(0.1)) < 1e-9);
  // With the floor, a dim scene's changes count for less.
  const retina = new Retina(cells);
  hold(retina, [0.02, 0.02], 3000);
  assert.ok(hold(retina, [0.01, 0.02], 10).rates[L1] < 0.3 * RETINA.maxRate * 0.5);
});

test("skipping steps of unchanging light is exact", () => {
  // A tonic rate turns the skipping off, so the two retinas step the same light in different ways.
  const skipping = new Retina(cells);
  const stepping = new Retina(cells, { ...RETINA, tonic: 1e-300 });
  const sequence: [number[], number][] = [
    [[0.5, 0.5], 500],
    [[0.9, 0.5], 700],
    [[0.9, 0.5], 3000],
    [[0.4, 0.2], 300],
    [[0.8, 0.6], 400],
    [[0.8, 0.6], 2500],
  ];
  for (const [light, ms] of sequence) {
    const a = hold(skipping, light, ms);
    const b = hold(stepping, light, ms);
    for (let n = 0; n < a.rates.length; n++) assert.ok(Math.abs(a.rates[n] - b.rates[n]) < 1e-9, `${light} cell ${n}: ${a.rates[n]} vs ${b.rates[n]}`);
    for (let n = 0; n < a.withdrawals.length; n++) assert.ok(Math.abs(a.withdrawals[n] - b.withdrawals[n]) < 1e-9, `${light} L1 ${n}: ${a.withdrawals[n]} vs ${b.withdrawals[n]}`);
  }
});

test("shut eyes drive nothing, and reopen adapted; nonsense light is clamped and a wrong length refused", () => {
  const retina = new Retina(cells);
  hold(retina, [1, 1], 100);
  hold(retina, [0, 1], 10);
  assert.ok(retina.rates[L1] > 0);
  hold(retina, [1, 1], 10);
  assert.ok(retina.withdrawals[0] > 0);
  assert.equal(retina.step(10, null), true);
  assert.deepEqual([...retina.rates], [0, 0, 0, 0, 0]);
  assert.deepEqual([...retina.withdrawals], [0, 0]);
  assert.equal(retina.step(10, null), false);
  assert.deepEqual(hold(retina, [0, 0.5], 10).rates, [0, 0, 0, 0, 0]);
  const clamped = new Retina(cells);
  hold(clamped, [5, Number.NaN], 100);
  assert.deepEqual(hold(clamped, [1, -3], 10).rates, [0, 0, 0, 0, 0]);
  assert.throws(() => retina.step(10, [1]), /2 facets, but the light gives 1/);
});
