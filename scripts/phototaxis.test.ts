import assert from "node:assert/strict";
import { test } from "node:test";
import { SCENES, bearing, coverage, facetLuminance, lightPosition, summarise } from "./phototaxis.ts";
import type { Trial } from "./phototaxis.ts";

const eye = { x: 0, y: 0.6, z: 0 };

test("the light stands on the side the fly is told, square to where it starts facing", () => {
  assert.ok(Math.abs(bearing({ x: 0, z: 0 }, 0, lightPosition("right", 30)) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(bearing({ x: 0, z: 0 }, 0, lightPosition("left", 30)) + Math.PI / 2) < 1e-9);
  // Turned a quarter to its left (yaw grows leftward), the light on its right is behind it.
  assert.ok(Math.abs(Math.abs(bearing({ x: 0, z: 0 }, Math.PI / 2, lightPosition("right", 30))) - Math.PI) < 1e-9);
});

test("a facet looking at the light sees it, one looking away the scene", () => {
  const on = { kind: "bulb" as const, at: lightPosition("right", 30) };
  // Head frame: x right, y ahead, z up. The bulb's middle is 4 mm up, 30 mm to the right.
  const d = Math.hypot(30, 4 - eye.y);
  // At 30 mm the bulb is a little smaller than a facet's cone, so it nearly fills it.
  assert.ok(facetLuminance(30 / d, 0, (4 - eye.y) / d, eye, 0, "dusk", on) > 0.95);
  assert.equal(facetLuminance(-1, 0, 0.01, eye, 0, "dusk", on), SCENES.dusk.sky);
  assert.equal(facetLuminance(-1, 0, 0.01, eye, 0, "dusk", null), SCENES.dusk.sky);
  // The table under the light is lit, the table away from it isn't.
  const down = Math.hypot(30, eye.y);
  assert.ok(facetLuminance(30 / down, 0, -eye.y / down, eye, 0, "night", on) > SCENES.night.floor + 0.5);
  assert.ok(Math.abs(facetLuminance(-30 / down, 0, -eye.y / down, eye, 0, "night", on) - SCENES.night.floor) < 1e-3);
});

test("a facet's cone is covered in proportion to the disc's area within it", () => {
  assert.equal(coverage(0, 0.2, 0.05), 1);
  assert.equal(coverage(0.3, 0.2, 0.05), 0);
  assert.ok(Math.abs(coverage(0, 0.025, 0.05) - 0.25) < 1e-9);
  assert.ok(coverage(0.2, 0.2, 0.05) > 0.4 && coverage(0.2, 0.2, 0.05) < 0.6);
});

test("the summary pairs each lit trial with the unlit one of its seed, side and setup", () => {
  const trial = (light: Trial["light"], seed: number, side: Trial["side"], endMm: number): Trial => ({
    seed, light, side, scene: "dusk", distanceMm: 30, seconds: 60, laminaHz: 0, turnTowardOnset: 0, turnToward: light === "off" ? 0 : 0.1, yawToward: 0, facing: 0,
    startMm: 30, endMm, minMm: endMm, meanLastMinuteMm: endMm, near: 0, pathMm: 0, walking: 0, takeOffs: 0, maxEscape: 0,
  });
  const summary = summarise([trial("bulb", 1, "right", 20), trial("off", 1, "right", 40), trial("bulb", 1, "left", 60), trial("off", 1, "left", 40), trial("off", 2, "right", 0)]);
  const bulb = summary["bulb, dusk, 30 mm"];
  assert.equal(bulb.endMm.pairs, 2);
  assert.equal(bulb.endMm.difference, 0);
  // Nearer is the light's way for a distance.
  assert.equal(bulb.endMm.lightWay, 1);
  assert.ok(Math.abs(bulb.turnToward.difference - 0.1) < 1e-12);
  assert.equal(bulb.turnToward.lightWay, 2);
});
