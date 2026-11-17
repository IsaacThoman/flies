import assert from "node:assert/strict";
import { test } from "node:test";
import { THIRST, THIRST_START, Thirst } from "../src/index.ts";

const close = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

test("thirst rises toward thirsty with its time constant, however the time is split, and starts two dry hours in", () => {
  assert.ok(close(new Thirst().level, 1 - Math.exp(-120 / THIRST.tau)));
  assert.ok(close(THIRST_START, 0.283, 1e-3));
  const coarse = new Thirst();
  const fine = new Thirst();
  coarse.level = fine.level = 0;
  coarse.step(THIRST.tau, 0);
  for (let t = 0; t < THIRST.tau; t += 0.5) fine.step(0.5, 0);
  assert.ok(close(coarse.level, 1 - Math.exp(-1)), `${coarse.level}`);
  assert.ok(close(fine.level, coarse.level, 1e-9));
  coarse.step(100 * THIRST.tau, 0);
  assert.equal(coarse.level, 1);
});

test("what it drinks quenches it by its water, and nothing leaves the 0 to 1 range", () => {
  const t = new Thirst();
  t.level = 1;
  t.step(1e-9, THIRST.draught);
  assert.ok(t.level < 1e-6, `${t.level}`);
  t.level = 1;
  t.step(1e-9, THIRST.draught / 2);
  assert.ok(close(t.level, 0.5, 1e-6));
  t.step(1, 50);
  assert.equal(t.level, 0);
  for (const dt of [0, -1, Number.NaN]) {
    t.step(dt, 1);
    assert.equal(t.level, 0, `dt ${dt} changes nothing`);
  }
});

test("away, it grows no thirstier than a new fly, and one that left thirstier stays so", () => {
  const t = new Thirst();
  t.level = 0;
  t.away(24 * 3600);
  assert.equal(t.level, THIRST_START);
  t.level = 0.9;
  t.away(3600);
  assert.ok(t.level >= 0.9);
  const short = new Thirst();
  short.level = 0;
  short.away(10);
  assert.ok(close(short.level, -Math.expm1(-10 / THIRST.tau)));
  short.away(-5);
  short.away(Number.NaN);
  assert.ok(close(short.level, -Math.expm1(-10 / THIRST.tau)));
});
