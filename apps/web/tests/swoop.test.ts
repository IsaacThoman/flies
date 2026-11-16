import assert from "node:assert/strict";
import { test } from "node:test";
import { Pantry, World } from "@fly/world";
import type { Place, Vec3 } from "@fly/world";
import { Hands, SWOOP_BEARING, TOOLS } from "../src/tools/hands.ts";

const bare: Place = { floor: { kind: "rect", hx: 500, hz: 500 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };

/** Throws the ball at a fly standing at the middle facing +z, and follows it through its swoop. */
function swoop(place: Place) {
  const world = new World(place);
  const hands = new Hands(world);
  const fly = { position: { x: 0, y: 0, z: 0 }, yaw: 0, onFeet: true };
  const pantry = new Pantry(world);
  hands.tool = TOOLS.findIndex((t) => t.id === "swoop");
  const eye: Vec3 = { x: 0, y: 5, z: -10 };
  hands.update(0.5, { use: false, holding: false, eye }, fly, pantry);
  hands.update(0, { use: true, holding: true, eye }, fly, pantry);
  const path: Vec3[] = [];
  while (hands.ball.active) {
    path.push({ ...hands.ball.position });
    hands.update(1 / 60, { use: false, holding: false, eye }, fly, pantry);
  }
  return { hands, path, world };
}

test("the ball dives in low from the fly's front-right when nothing stands in its way", () => {
  const { hands, path } = swoop(bare);
  assert.equal(hands.ball.from.y, hands.pointer.y + 70);
  const bearing = Math.atan2(hands.ball.from.x - hands.pointer.x, hands.ball.from.z - hands.pointer.z);
  assert.ok(Math.abs(bearing + SWOOP_BEARING) < 1e-9, "from ahead and to the right");
  assert.ok(path.length > 60);
});

test("the ball comes in over something standing in its way, and veers away clear of it, never passing through", () => {
  // A tall jar between the fly and where the ball would come from, and another where it would leave by.
  const a = -SWOOP_BEARING;
  const place: Place = {
    ...bare,
    solids: [
      { name: "jar", footprint: { kind: "circle", x: Math.sin(a) * 160, z: Math.cos(a) * 160, r: 40 }, top: { kind: "flat", y: 120 } },
      { name: "jar", footprint: { kind: "circle", x: Math.sin(a) * 80 + Math.cos(a) * 64, z: Math.cos(a) * 80 - Math.sin(a) * 64, r: 30 }, top: { kind: "flat", y: 220 } },
    ],
  };
  const { hands, path, world } = swoop(place);
  assert.ok(hands.ball.from.y > 120, "starts higher");
  for (const p of path) assert.ok(world.heightAt(p.x, p.z) <= p.y, `the ball's middle went into the jar at ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}`);
});
