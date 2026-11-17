// The thermoreceptors' stand-in transduction against what Budelli et al.
// (2019) recorded from the arista, and how it adapts.

import assert from "node:assert/strict";
import { test } from "node:test";
import { THERMO, Thermoreceptors, coolingRate, heatingRate, temperatureOf } from "./thermo.ts";
import { RESTING_SENSES } from "./types.ts";

const close = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

test("adapted, the cooling cells fire the same at any temperature and the heating cells faster the warmer, as recorded", () => {
  for (const t of [16, 20, 25, 30, 31]) assert.ok(close(3 * coolingRate(t, t), 97));
  // 17 ± 3, 37 ± 6 and 74 ± 17 Hz for the arista's three at 20, 25 and 30 °C; a Q10 of 4.4 gives 17.6, 37 and 77.6.
  assert.ok(close(3 * heatingRate(25, 25), 37));
  assert.ok(Math.abs(3 * heatingRate(20, 20) - 17) < 3);
  assert.ok(Math.abs(3 * heatingRate(30, 30) - 74) < 17);
  // Only measured over 20 to 30 °C: the steady rate stays at its ends beyond.
  assert.equal(heatingRate(10, 10), heatingRate(20, 20));
  assert.equal(heatingRate(40, 40), heatingRate(30, 30));
});

test("a change moves them as recorded: cooling cells double after 0.1 °C of cooling and triple after 0.2, warming silences them; heating cells triple after 2.75 °C of warming", () => {
  const steady = THERMO.coolingRate;
  assert.ok(close(coolingRate(24.9, 25), 2 * steady));
  assert.ok(close(coolingRate(24.8, 25), 3 * steady));
  assert.ok(close(coolingRate(20, 25), 3 * steady), "no more than three times however far");
  assert.equal(coolingRate(25.1, 25), 0);
  assert.ok(close(heatingRate(27.75, 25), 3 * heatingRate(27.75, 27.75)));
  assert.equal(heatingRate(25 - 2.75 / 2, 25), 0);
});

test("each antenna adapts over a second: warmed by 5 °C, its cooling cells fall silent for 3.9 s; left out, it feels nothing and starts again adapted", () => {
  const receptors = new Thermoreceptors();
  const rates = { heating: 0, cooling: 0 };
  receptors.step("left", 25, 10, rates);
  assert.ok(close(rates.cooling, THERMO.coolingRate), "a first temperature is one it has adapted to");
  let silent = 0;
  for (let t = 0; t < 10_000; t += 10) {
    receptors.step("left", 30, 10, rates);
    if (rates.cooling === 0) silent += 10;
  }
  assert.ok(Math.abs(silent - THERMO.adaptMs * Math.log(50)) <= 10, `silent for ${silent} ms`);
  assert.ok(close(rates.cooling, THERMO.coolingRate, 0.1), "adapted again");
  assert.ok(Number.isNaN(receptors.adapted.right), "the other antenna felt nothing");
  receptors.step("left", Number.NaN, 10, rates);
  assert.deepEqual(rates, { heating: 0, cooling: 0 });
  assert.ok(Number.isNaN(receptors.adapted.left));
  receptors.step("left", 18, 10, rates);
  assert.ok(close(rates.cooling, THERMO.coolingRate));
});

test("adapting is the same however the time is split", () => {
  const whole = new Thermoreceptors();
  const split = new Thermoreceptors();
  const rates = { heating: 0, cooling: 0 };
  whole.step("right", 20, 10, rates);
  split.step("right", 20, 10, rates);
  whole.step("right", 28, 700, rates);
  for (let k = 0; k < 7; k++) split.step("right", 28, 100, rates);
  assert.ok(close(whole.adapted.right, split.adapted.right, 1e-12));
});

test("the senses give a temperature, held between freezing and 50 °C, or none", () => {
  assert.ok(Number.isNaN(temperatureOf(RESTING_SENSES, "left")));
  assert.ok(Number.isNaN(temperatureOf({ ...RESTING_SENSES, temperatureRight: Number.NaN }, "right")));
  assert.equal(temperatureOf({ ...RESTING_SENSES, temperatureLeft: 31.5 }, "left"), 31.5);
  assert.equal(temperatureOf({ ...RESTING_SENSES, temperatureLeft: -40 }, "left"), 0);
  assert.equal(temperatureOf({ ...RESTING_SENSES, temperatureLeft: Number.POSITIVE_INFINITY }, "left"), 50);
});
