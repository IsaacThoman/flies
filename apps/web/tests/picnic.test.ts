// What the picnic draws on top of its world stays out of the fly's way: the
// lemonade lid's pressing and the straw's grommet are within half a
// millimetre of the lid the fly stands on, and the ring the jar left lies on
// bare enamel, clear of everything standing and of the napkin.

import assert from "node:assert/strict";
import { test } from "node:test";
import { DECOR, SOLIDS, TABLE_RADIUS, createPicnic } from "@fly/world";
import { GROMMET, JAR_RING, LID_PRESS } from "../src/places/picnic/table.ts";

const lemonade = SOLIDS.find((s) => s.name === "lemonade")!;
const lid = lemonade.footprint as { x: number; z: number; r: number };
const lidTop = (lemonade.top as { y: number }).y;

test("the lemonade lid is pressed within half a millimetre of flat where the fly stands on it", () => {
  const world = createPicnic();
  for (const [r, dy] of LID_PRESS) {
    if (r >= lid.r) continue;
    assert.ok(Math.abs(dy) < 0.5, `${dy} mm at ${r} mm from the middle`);
    assert.equal(world.heightAt(lid.x + r, lid.z), lidTop);
  }
  assert.ok(GROMMET.lift + GROMMET.tube < 0.5);
});

test("the ring the jar left lies on bare enamel, on the table and clear of everything on it", () => {
  const world = createPicnic();
  const { napkin } = DECOR;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    for (const r of [JAR_RING.r - 1, JAR_RING.r + 1]) {
      const x = JAR_RING.x + Math.cos(a) * r;
      const z = JAR_RING.z + Math.sin(a) * r;
      assert.ok(Math.hypot(x, z) < TABLE_RADIUS - 10);
      assert.equal(world.heightAt(x, z), 0, `under something at ${x.toFixed(0)}, ${z.toFixed(0)}`);
      const dx = x - napkin.x;
      const dz = z - napkin.z;
      const c = Math.cos(napkin.angle);
      const s = Math.sin(napkin.angle);
      assert.ok(Math.max(Math.abs(dx * c - dz * s), Math.abs(dx * s + dz * c)) > napkin.size / 2);
    }
  }
});
