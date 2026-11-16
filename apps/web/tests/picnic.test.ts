// What the picnic draws on top of its world stays out of the fly's way: the
// ring the jar left lies on bare enamel, clear of everything standing and of
// the napkin.

import assert from "node:assert/strict";
import { test } from "node:test";
import { DECOR, TABLE_RADIUS, createPicnic } from "@fly/world";
import { JAR_RING } from "../src/places/picnic/table.ts";

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
