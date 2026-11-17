import assert from "node:assert/strict";
import { test } from "node:test";
import { Pantry, TASTE_HEIGHT, World } from "../src/index.ts";
import type { FoodPatch, Solid } from "../src/index.ts";

function pantryOn(solids: Solid[], patches: FoodPatch[]) {
  const world = new World({ floor: { kind: "circle", r: 50 }, solids, patches, start: { x: 0, z: 0, yaw: 0 }, ceiling: 50 });
  return new Pantry(world, patches);
}

test("food follows its supporting dome both above and below its centre's height", () => {
  const dome: Solid = { name: "fruit", footprint: { kind: "circle", x: 0, z: 0, r: 10 }, top: { kind: "dome", base: 0, height: 10, power: 1 } };
  const pantry = pantryOn([dome], [{ name: "juice", x: 6, z: 0, r: 6, sweet: 0.8 }]);
  assert.equal(pantry.touching(0, 10, 0, 0), pantry.foods[0], "uphill");
  assert.equal(pantry.touching(8, 3.6, 0, 0), pantry.foods[0], "downhill");
  assert.equal(pantry.touching(8, 3.6 + TASTE_HEIGHT + 0.01, 0, 0), null, "too far above the local surface");
  assert.equal(pantry.touching(8, 3.5, 0, 0), null, "inside the fruit");
  assert.equal(pantry.touching(11, 0, 0, 0), null, "past the fruit, on the floor");
});

test("food does not taste through a thin slab between the floor and its top", () => {
  const slab: Solid = { name: "table", footprint: { kind: "circle", x: 0, z: 0, r: 10 }, bottom: 1.4, top: { kind: "flat", y: 1.6 } };
  for (const y of [0, 1.6]) {
    const pantry = pantryOn([slab], [{ name: "juice", x: 0, y, z: 0, r: 5, sweet: 1 }]);
    assert.equal(pantry.touching(0, y, 0, 0.3), pantry.foods[0]);
    assert.equal(pantry.touching(0, y === 0 ? 1.6 : 0, 0, 0.3), null, "the other layer");
    assert.equal(pantry.touching(0, 1.5, 0, 0.3), null, "inside the slab");
  }
});

test("another solid covering part of a patch hides the food there", () => {
  const cover: Solid = { name: "plate", footprint: { kind: "circle", x: 3, z: 0, r: 1 }, top: { kind: "flat", y: 0.5 } };
  const pantry = pantryOn([cover], [{ name: "juice", x: 0, z: 0, r: 5, sweet: 1 }]);
  assert.equal(pantry.touching(0, 0, 0, 0), pantry.foods[0]);
  assert.equal(pantry.touching(3, 0, 0, 0), null, "buried beneath the plate");
  assert.equal(pantry.touching(3, 0.25, 0, 0), null, "inside the plate");
  assert.equal(pantry.touching(3, 0.5, 0, 0), null, "standing on the plate");
});
