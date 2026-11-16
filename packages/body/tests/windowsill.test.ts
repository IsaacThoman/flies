// Walking on the windowsill: up onto the banana from its tip, and over the
// fruit bowl's rim into it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { FRUIT_BOWL, World, WINDOWSILL, bananaAt } from "@fly/world";
import { FlyBody, createIntent } from "../src/index.ts";
import type { Forces } from "../src/index.ts";

const DT = 1 / 60;
const still: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };

test("walking, it climbs onto the banana's back from its tip", () => {
  const a = bananaAt(0, { x: 0, z: 0 });
  const b = bananaAt(0.08, { x: 0, z: 0 });
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const body = new FlyBody(new World(WINDOWSILL), { x: a.x - Math.sin(yaw) * 8, z: a.z - Math.cos(yaw) * 8, yaw });
  let peak = 0;
  for (let t = 0; t < 5; t += DT) {
    body.step({ ...createIntent(), live: true, walking: true, speed: 6 }, still, DT);
    peak = Math.max(peak, body.position.y);
    assert.notEqual(body.mode, "airborne", "never falls");
  }
  assert.ok(peak > 8, `reached ${peak.toFixed(1)} mm`);
});

test("walking, it climbs the fruit bowl's side, over its rim and down inside", () => {
  const body = new FlyBody(new World(WINDOWSILL), { x: FRUIT_BOWL.x + FRUIT_BOWL.r + 4, z: FRUIT_BOWL.z + 10, yaw: -Math.PI / 2 });
  let peak = 0;
  for (let t = 0; t < 8; t += DT) {
    body.step({ ...createIntent(), live: true, walking: true, speed: 6 }, still, DT);
    peak = Math.max(peak, body.position.y);
    assert.notEqual(body.mode, "airborne", "never falls");
  }
  assert.ok(peak > 25, "over the rim");
  assert.ok(body.position.y < 10, `inside, at ${body.position.y.toFixed(1)} mm`);
});
