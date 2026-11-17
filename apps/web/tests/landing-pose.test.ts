import assert from "node:assert/strict";
import { test } from "node:test";
import { landingExtension } from "../src/fly-view.ts";

test("landing pose anticipates nearby descending contact without extending on ascent", () => {
  assert.equal(landingExtension(5, 100), 0);
  assert.equal(landingExtension(40, -100), 0);
  assert.equal(landingExtension(-1, -100), 0);
  assert.equal(landingExtension(20, -100), 0);
  assert.ok(landingExtension(10, -100) > 0);
  assert.equal(landingExtension(2, -100), 1);
  assert.ok(landingExtension(10, -200) > landingExtension(10, -100));
});

test("approach animation reads body state without sensing another surface", async () => {
  const THREE = await import("three");
  const { FlyBody, createIntent } = await import("@fly/body");
  const { createPicnic } = await import("@fly/world");
  const { FlyView } = await import("../src/fly-view.ts");
  const world = createPicnic();
  const body = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
  const view = new FlyView(new THREE.Group(), world, false);
  body.mode = "airborne";
  body.position.y = 10;
  body.velocity.y = -100;
  world.surface = () => { throw new Error("animation must not sense another surface"); };
  view.update(body, createIntent(), false, 0, 1 / 60);
  assert.ok(Math.abs((view.pose.landing ?? 0) - 0.5) < 1e-9);
  view.model.dispose();
});
