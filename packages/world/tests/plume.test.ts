import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_ODOR, ODORANTS, PLUME, TASTES, smellAt } from "../src/index.ts";
import type { OdorSource } from "../src/index.ts";

const STILL = { x: 0, y: 0, z: 0 };
const out = () => new Float64Array(ODORANTS.length);
const source = (over: Partial<OdorSource> = {}): OdorSource => ({ x: 0, y: 0, z: 0, r: 2, amount: 1, odor: TASTES.flyFood.odor, ...over });

test("in still air a food smells as diffusion spreads it: full at its edge, its radius over the distance beyond", () => {
  const s = [source()];
  assert.deepEqual([...smellAt(s, STILL, 1, 0, 0, out())], [1, 1, 1, 1, 1]);
  assert.ok(Math.abs(smellAt(s, STILL, 8, 0, 0, out())[0] - 0.25) < 1e-12);
  // Every way alike, up and down too.
  assert.equal(smellAt(s, STILL, 0, 0, -8, out())[2], smellAt(s, STILL, 0, 8, 0, out())[2]);
});

test("wind carries it downwind and narrows it: as strong along the wind as in still air, weaker across it, almost none upwind", () => {
  const wind = { x: 0, y: 0, z: 20 };
  const s = [source()];
  const down = smellAt(s, wind, 0, 0, 12, out())[0];
  const across = smellAt(s, wind, 5, 0, 12, out())[0];
  const up = smellAt(s, wind, 0, 0, -12, out())[0];
  assert.ok(Math.abs(down - 2 / 12) < 1e-12);
  // U/2D = 1 per mm: r − x = 1 mm off the axis there, so e⁻¹ less, over 13 mm.
  assert.ok(Math.abs(across - (2 / 13) * Math.exp(-(13 - 12))) < 1e-12);
  assert.equal(up, 0);
});

test("each odorant as its food gives it off, sources add, and what is less than the floor is none", () => {
  const banana = source({ odor: TASTES.banana.odor });
  const vinegar = source({ x: 4, odor: TASTES.ketchup.odor });
  const at = smellAt([banana, vinegar], STILL, 2, 3, 0, out());
  const d = Math.hypot(2, 3);
  assert.ok(Math.abs(at[3] - 2 / d) < 1e-12);
  assert.ok(Math.abs(at[1] - 2 / d) < 1e-12);
  assert.ok(Math.abs(at[0] - 0.2 / d) < 1e-12);
  assert.equal(at[4], 0);
  // Ripe fruit's trace is gone a little way off: 0.1 × 2/r under the floor past 20 mm.
  const fruit = [source({ odor: TASTES.strawberry.odor })];
  assert.ok(smellAt(fruit, STILL, 19, 0, 0, out())[0] > 0);
  assert.equal(smellAt(fruit, STILL, 21, 0, 0, out())[0], 0);
  assert.ok(PLUME.floor > 0);
  // Never more than 1 however much is near.
  assert.deepEqual([...smellAt([source(), source(), source()], STILL, 3, 0, 0, out())], [1, 1, 1, 1, 1]);
});

test("food that smells of nothing, has none, or is eaten up gives off nothing; one fades over its last quarter", () => {
  assert.deepEqual([...smellAt([source({ odor: NO_ODOR }), source({ odor: undefined }), source({ amount: 0 })], STILL, 1, 0, 0, out())], [0, 0, 0, 0, 0]);
  assert.equal(smellAt([source({ amount: 0.125 })], STILL, 1, 0, 0, out())[0], 0.5);
});
