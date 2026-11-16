import assert from "node:assert/strict";
import { test } from "node:test";
import { HUNGER, Hunger } from "../src/index.ts";

const close = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

test("hunger rises toward starved with its time constant, however the time is split", () => {
  const coarse = new Hunger();
  const fine = new Hunger();
  coarse.level = fine.level = 0;
  coarse.step(HUNGER.tau, 0);
  for (let t = 0; t < HUNGER.tau; t += 0.5) fine.step(0.5, 0);
  assert.ok(close(coarse.level, 1 - Math.exp(-1)), `${coarse.level}`);
  assert.ok(close(fine.level, coarse.level, 1e-9), `${fine.level} against ${coarse.level}`);
  coarse.step(100 * HUNGER.tau, 0);
  assert.equal(coarse.level, 1);
});

test("what is eaten feeds it by its sugar: a meal sates a starved fly, half as sweet feeds half as much", () => {
  const starved = new Hunger();
  starved.level = 1;
  starved.step(1e-9, HUNGER.meal);
  assert.ok(starved.level < 1e-6, `${starved.level}`);
  assert.ok(close(starved.fullness, 1, 1e-6));

  const a = new Hunger();
  const b = new Hunger();
  a.level = b.level = 1;
  // A whole lump of sugar against a whole lump of something half as sweet, eaten bite by bite.
  for (let k = 0; k < 60; k++) {
    a.step(0.1, (HUNGER.meal / 60) * 0.5);
    b.step(0.1, HUNGER.meal / 60);
  }
  assert.ok(a.level > b.level + 0.4, `${a.level} against ${b.level}`);
  assert.ok(a.fullness < b.fullness);
});

test("the crop empties by half in its half-life, and nothing leaves the 0 to 1 range", () => {
  const h = new Hunger();
  h.step(1e-9, 0.6 * HUNGER.meal);
  const full = h.fullness;
  h.step(HUNGER.cropHalfLife, 0);
  assert.ok(close(h.fullness, full / 2, 1e-6), `${h.fullness}`);
  h.step(1, 50);
  assert.equal(h.level, 0);
  assert.equal(h.fullness, 1);
  for (const dt of [0, -1, Number.NaN]) {
    const before: { level: number; fullness: number } = { level: h.level, fullness: h.fullness };
    h.step(dt, 1);
    assert.deepEqual({ level: h.level, fullness: h.fullness }, before, `dt ${dt} changes nothing`);
  }
});
