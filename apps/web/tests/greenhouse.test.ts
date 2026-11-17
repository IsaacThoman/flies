import assert from "node:assert/strict";
import { test } from "node:test";
import { GREENHOUSE, GREENHOUSE_SOLIDS, SAUCER, TRAY, World, inside, topHeight } from "@fly/world";
import { buildBench, solidGeometry } from "../src/places/greenhouse/set.ts";
import { NO_PRINTS } from "../src/scene/prints.ts";

test("greenhouse curved surfaces are sampled directly from their collision tops", () => {
  for (const solid of GREENHOUSE_SOLIDS) {
    if (solid.footprint.kind === "box") continue;
    const g = solidGeometry(solid, 24, 32), p = g.attributes.position;
    let topVertices = 0;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      assert.ok(inside(solid.footprint, x, z), solid.name);
      // Vertical sides also have vertices at the solid's bottom.
      if (Math.abs(y - (solid.bottom ?? 0)) < 1e-5) continue;
      assert.ok(Math.abs(y - topHeight(solid, x, z)) < 0.025, `${solid.name}: ${x},${y},${z}`);
      topVertices++;
    }
    assert.ok(topVertices > 100); g.dispose();
  }
});

test("greenhouse water and seedlings have exact supporting surfaces", () => {
  const world = new World(GREENHOUSE);
  assert.equal(world.heightAt(SAUCER.x, SAUCER.z), SAUCER.water);
  for (const s of GREENHOUSE_SOLIDS.filter(s => s.name === "seedling crown")) {
    assert.equal(s.bottom, TRAY.height);
    assert.ok(NO_PRINTS.has(s.name));
    assert.equal(world.underside(s.footprint.x, s.footprint.z, TRAY.height), TRAY.height);
  }
  assert.ok(NO_PRINTS.has("greenhouse leaves") && NO_PRINTS.has("water saucer"));
});

test("greenhouse detail builds in bounded steps and keeps its eyes available throughout", () => {
  const set = buildBench();
  assert.equal(set.seen.length, 1);
  const seen = set.seen[0];
  let steps = 0;
  while (set.more?.()) {
    assert.equal(set.seen[0], seen);
    assert.ok(++steps < 64);
  }
  assert.ok(steps > 10);
  assert.ok(set.group.children.length <= 6);
});
