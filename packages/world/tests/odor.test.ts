import assert from "node:assert/strict";
import { test } from "node:test";
import { ODORANTS, OdorField, STILL_DRAUGHT } from "@fly/world";

const at = (field: OdorField, x: number, z: number) => field.at(x, 0, z, new Float64Array(ODORANTS.length));

test("a food's smell is whole at its edge, carried downwind, faint upwind and alike either side of the wind", () => {
  const field = new OdorField([{ x: 0, y: 0, z: 0, r: 2, emits: [1, 0.5, 0, 0, 0] }], STILL_DRAUGHT);
  assert.deepEqual([...at(field, 1, 0)], [1, 0.5, 0, 0, 0]);
  assert.equal(at(field, 2, 0)[0], 1);
  // Straight downwind it falls as r0 / r; upwind and across, the wind takes it away too.
  assert.ok(Math.abs(at(field, 10, 0)[0] - 0.2) < 1e-12);
  assert.ok(at(field, -10, 0)[0] < 1e-6);
  const across = at(field, 0, 10)[0];
  assert.ok(Math.abs(across - 0.2 * Math.exp((-STILL_DRAUGHT.speed * 10) / (2 * STILL_DRAUGHT.diffusion))) < 1e-15);
  assert.equal(at(field, 5, 3)[0], at(field, 5, -3)[0]);
});

test("foods' smells add, held to 1, and nothing smells of what nothing gives off", () => {
  const source = (x: number) => ({ x, y: 0, z: 0, r: 1, emits: [0.8, 0, 0, 0, 0] });
  const field = new OdorField([source(0), source(0.5)], STILL_DRAUGHT);
  const here = at(field, 0.2, 0);
  assert.equal(here[0], 1);
  assert.deepEqual([...here.slice(1)], [0, 0, 0, 0]);
  assert.ok([...at(new OdorField([], STILL_DRAUGHT), 0, 0)].every((x) => x === 0));
});
