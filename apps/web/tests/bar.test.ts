// The bar's clock: behind the bar, out of the fly's reach, facing the counter,
// and low enough that its whole face shows over the counter's back edge to a
// fly standing on it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { BAR, BAR_TOP } from "@fly/world";
import { DIAL } from "../src/places/bar/room.ts";

test("the clock hangs behind the bar, beyond the counter's edge, facing the counter with twelve at the top", () => {
  const { centre, up, right, radius } = DIAL;
  // Its case reaches a third of a radius past the dial.
  assert.ok(centre.z + radius * 1.4 < -BAR_TOP.hz - 300, "well beyond the counter's back edge, where a fly is drawn back before it gets there");
  assert.ok(centre.y + radius * 1.4 < BAR.ceiling, "below the fly's ceiling, so within the shots");
  assert.deepEqual([up.x, up.y, up.z], [0, 1, 0]);
  // It faces three × twelve: toward the counter.
  assert.ok(right.x * up.y - right.y * up.x > 0.99);
});

test("a fly standing on the counter sees the clock's whole face over the counter's back edge", () => {
  // The fly's eyes, and the wallpaper's camera, are a millimetre or two above the counter.
  const eye = 2;
  const bottom = DIAL.centre.y - DIAL.radius;
  // From anywhere across the counter: the back edge runs its whole length, so only how far back the fly stands matters.
  for (let z = -BAR_TOP.hz + 30; z <= BAR_TOP.hz; z += 30) {
    const t = (z + BAR_TOP.hz) / (z - DIAL.centre.z);
    assert.ok(eye + (bottom - eye) * t > 0, `the face's foot is hidden from z = ${z}`);
  }
});
