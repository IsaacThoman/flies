import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KITCHEN,
  KITCHEN_GLASS,
  KITCHEN_PATCHES,
  Pantry,
  World,
} from "../src/index.ts";

test("the kitchen's orange juice is inside the tumbler, below its rim", () => {
  const world = new World(KITCHEN);
  const { x, z, r, juice, rim } = KITCHEN_GLASS;
  assert.equal(world.heightAt(x, z), juice);
  assert.equal(world.heightAt(x + r * 0.8, z), juice);
  assert.ok(world.heightAt(x + r * 0.96, z) > rim - 1);
  assert.equal(world.heightAt(x + r + 1, z), 0);
  const patch = KITCHEN_PATCHES.find((p) => p.y === juice)!;
  assert.equal(patch.name, "orange juice");
  const pantry = new Pantry(world, KITCHEN_PATCHES);
  assert.equal(pantry.touching(x, juice, z, 0)?.name, patch.name);
  assert.equal(pantry.touching(x, 3, z, 0), null);
});

test("the kitchen's board and ajar caddy have surfaces at their drawn heights", () => {
  const world = new World(KITCHEN);
  assert.equal(world.heightAt(81, 180), 14);
  assert.equal(world.heightAt(-369, -170, 151), 150);
  assert.ok(world.underside(-369, -170, 150) > 175);
  assert.ok(world.heightAt(-369, -170) > 179);
});

test("grape juice is on exposed fruit in the bowl's flat well", () => {
  const world = new World(KITCHEN);
  const patch = KITCHEN_PATCHES.find((p) => p.name === "grape juice")!;
  assert.equal(world.heightAt(patch.x, patch.z), 31);
  assert.equal(world.heightAt(patch.x, patch.z, 9), 9);
});

test("the peach has a flat feeding face and real air beneath its curved edge", () => {
  const world = new World(KITCHEN);
  assert.equal(world.heightAt(KITCHEN.start.x, KITCHEN.start.z), 40);
  assert.equal(world.heightAt(60, 158, 14), 14);
  assert.ok(world.underside(60, 158, 14) > 25);
});

test("peach juice tastes across its continuous cut face and at the fly's start", () => {
  const world = new World(KITCHEN);
  const pantry = new Pantry(world, KITCHEN_PATCHES);
  const patch = KITCHEN_PATCHES.find((p) => p.name === "peach juice" && !p.pool)!;
  for (let dx = -6; dx <= 6; dx++)
    for (let dz = -6; dz <= 6; dz++) {
      if (dx * dx + dz * dz > 36) continue;
      assert.equal(pantry.touching(patch.x + dx, 40, patch.z + dz, 0)?.name, "peach juice");
    }
  assert.equal(pantry.touching(KITCHEN.start.x, 40, KITCHEN.start.z, 0)?.name, "peach juice");
});

test("the honey jar has a curved shoulder with real clearance beneath its lid", () => {
  const world = new World(KITCHEN);
  const y = world.heightAt(389, 110, 107);
  assert.ok(y > 86 && y < 97);
  assert.equal(world.underside(389, 110, y), 108);
  assert.equal(world.heightAt(389, 110), 112);
});
