import assert from "node:assert/strict";
import { test } from "node:test";
import { World, createSurface } from "@fly/world";
import type { Place, RayHit, Solid } from "@fly/world";

const bare: Place = { floor: { kind: "rect", hx: 500, hz: 500 }, solids: [{ name: "jar", footprint: { kind: "circle", x: 100, z: 0, r: 20 }, top: { kind: "flat", y: 60 } }], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };
const hit = (): RayHit => ({ point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, solid: -1, t: 0 });

function slab(): Solid {
  return { name: "slab", footprint: { kind: "circle", x: 0, z: 0, r: 5 }, top: { kind: "flat", y: 3 }, bottom: 1 };
}

test("a moving solid comes after the place's own, and every query meets it where it is moved to", () => {
  const world = new World(bare);
  const moving = slab();
  world.addMoving([moving]);
  assert.equal(world.movingFrom, 1);
  assert.equal(world.solids[1], moving);
  const s = createSurface();
  assert.equal(world.surface(0, 0, s).y, 3);
  assert.equal(world.surface(0, 0, s).solid, 1);
  assert.equal(world.underside(0, 0, 0), 1);
  assert.equal(world.solidAt(0, 2, 0), 1);
  // Moved: it is where it went, not where it was, however far (it is filed in no cell).
  const version = world.version;
  (moving.footprint as { x: number }).x = 300;
  world.moved();
  assert.ok(world.version > version);
  assert.equal(world.heightAt(0, 0), 0);
  assert.equal(world.heightAt(300, 0), 3);
  assert.equal(world.raycast({ x: 300, y: 50, z: 0 }, { x: 0, y: -1, z: 0 }, hit())?.solid, 1);
  assert.equal(world.gather(300, 0, 1, 0, 10), 1);
  assert.ok(world.wallNormal(296, 0, 2, { x: 0, y: 0, z: 0 }));
});

test("out of the world, nothing meets it; and it stays in the world through a change of place", () => {
  const world = new World(bare);
  const moving = slab();
  world.addMoving([moving]);
  world.movingPresent = false;
  const version = world.version;
  assert.equal(world.heightAt(0, 0), 0);
  assert.equal(world.raycast({ x: 0, y: 50, z: 0 }, { x: 0, y: -1, z: 0 }, hit())?.solid, -1);
  assert.equal(world.solidAt(0, 2, 0), -1);
  world.movingPresent = true;
  assert.ok(world.version > version, "putting it back changes the world");
  world.load({ ...bare, solids: [] });
  assert.equal(world.movingFrom, 0);
  assert.equal(world.solids[0], moving);
  assert.equal(world.heightAt(0, 0), 3);
  // The place's own solids are still found by their grid.
  world.load(bare);
  assert.equal(world.heightAt(100, 0), 60);
});
