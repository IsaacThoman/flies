// The lab bench's things to climb and explore, walked by the body as the brain would walk it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { AGAR_DISH, FORCEPS, LAB_SOLIDS, NOTEBOOK, at, createLab } from "@fly/world";
import { FlyBody, createIntent } from "../src/index.ts";
import type { Forces, Intent } from "../src/index.ts";

const DT = 1 / 60;
const still: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
const walk: Intent = { ...createIntent(), live: true, walking: true, speed: 6 };
/** The yaw that faces along a footprint's own u axis (turned by `angle`). */
const along = (angle: number) => Math.atan2(Math.cos(angle), -Math.sin(angle));

test("at the lab bench, a walking fly steps up onto the notebook and across its pages", () => {
  const start = at(NOTEBOOK, -NOTEBOOK.hx - 4, 20);
  const body = new FlyBody(createLab(), { ...start, yaw: along(NOTEBOOK.angle) });
  for (let t = 0; t < 4; t += DT) {
    body.step(walk, still, DT);
    assert.notEqual(body.mode, "airborne");
  }
  assert.equal(body.position.y, NOTEBOOK.thick, "on the page");
});

test("it can walk along an arm of the forceps", () => {
  const spread = Math.atan2(FORCEPS.open / 2, FORCEPS.length);
  const a = FORCEPS.angle + spread;
  const body = new FlyBody(createLab(), { x: FORCEPS.x - Math.cos(a) * 4, z: FORCEPS.z + Math.sin(a) * 4, yaw: along(a) });
  for (let t = 0; t < 4; t += DT) body.step(walk, still, DT);
  assert.equal(body.position.y, FORCEPS.thick, "on the steel");
});

test("it can climb the crumpled wipe", () => {
  const wipe = LAB_SOLIDS.find((s) => s.name === "wipe")!.footprint as { x: number; z: number; rx: number };
  const body = new FlyBody(createLab(), { x: wipe.x + wipe.rx + 4, z: wipe.z, yaw: -Math.PI / 2 });
  let peak = 0;
  for (let t = 0; t < 8; t += DT) {
    body.step({ ...walk, speed: 8 }, still, DT);
    peak = Math.max(peak, body.position.y);
  }
  assert.ok(peak > 12, `reached ${peak.toFixed(1)} mm`);
});

test("a fly on the grape agar can walk off over the dish's rim and come down on the bench", () => {
  const body = new FlyBody(createLab(), { x: AGAR_DISH.x, z: AGAR_DISH.z, yaw: Math.PI / 2 });
  assert.equal(body.position.y, AGAR_DISH.agar);
  let fell = false;
  for (let t = 0; t < 14 && !(fell && body.mode !== "airborne"); t += DT) {
    body.step(walk, still, DT);
    if (body.mode === "airborne") fell = true;
  }
  assert.ok(fell, "it went over the edge");
  assert.equal(body.position.y, 0, "and stands on the bench");
});
