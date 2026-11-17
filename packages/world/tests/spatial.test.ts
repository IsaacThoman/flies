import assert from "node:assert/strict";
import { test } from "node:test";
import { mulberry32 } from "@fly/brain";
import { LAB, PICNIC, WINDOWSILL, World } from "../src/index.ts";
import type { RayHit } from "../src/index.ts";

const hit = (): RayHit => ({ point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, solid: -1, t: 0 });

test("short spatial queries match full rays across cell edges in every place", () => {
  const random = mulberry32(42);
  for (const place of [PICNIC, WINDOWSILL, LAB]) {
    const world = new World(place);
    const full = hit();
    const bounded = hit();
    for (let i = 0; i < 3000; i++) {
      const origin = { x: (random() * 2 - 1) * 400, y: random() * 700, z: (random() * 2 - 1) * 350 };
      const dir = { x: random() * 2 - 1, y: random() * 2 - 1, z: random() * 2 - 1 };
      const length = Math.hypot(dir.x, dir.y, dir.z);
      dir.x /= length;
      dir.y /= length;
      dir.z /= length;
      const distance = 0.1 + random() * 100;
      const all = world.raycast(origin, dir, full);
      const short = world.raycast(origin, dir, bounded, distance);
      const expected = all && all.t < distance;
      assert.equal(!!short, !!expected, JSON.stringify({ origin, dir, distance, full, bounded }));
      if (short && all) {
        assert.equal(short.solid, all.solid);
        assert.ok(Math.abs(short.t - all.t) < 1e-4);
      }
    }
  }
});

test("carrying to an empty place clears the old spatial cells", () => {
  const world = new World({ ...PICNIC, solids: [{ name: "pane", footprint: { kind: "box", x: -32, z: -32, hx: 0.5, hz: 40, angle: 0.3 }, top: { kind: "flat", y: 200 } }] });
  const origin = { x: -35, y: 10, z: -32 };
  const dir = { x: 1, y: 0, z: 0 };
  assert.ok(world.raycast(origin, dir, hit(), 6));
  world.load({ ...PICNIC, solids: [] });
  assert.equal(world.raycast(origin, dir, hit(), 6), null);
  assert.equal(world.heightAt(-32, -32), 0);
  assert.equal(world.wallNormal(-32, -32, 10, { x: 0, y: 0, z: 0 }), false);
});
