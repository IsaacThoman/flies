// The tarsal reflex (behavior.ts, TARSAL_ONSET): flight once the feet are off
// the ground, held for a while, then a glide down to a landing, with the
// brain's own wing drive and steering on top.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainCommand } from "@fly/brain";
import { World, createPicnic } from "@fly/world";
import type { Place } from "@fly/world";
import { Behavior, FLIGHT_FADE, FLIGHT_HOLD, FLIGHT_WINGS, FlyBody, LAND_WINGS, TARSAL_ONSET } from "../src/index.ts";
import type { Forces } from "../src/index.ts";

const DT = 1 / 60;
const command = (c: Partial<BrainCommand> = {}): BrainCommand => ({ walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, ...c });
const still: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
const open = (ceiling = 320): Place => ({ floor: { kind: "rect", hx: 600, hz: 600 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling });

type Flight = { air: number; distance: number; top: number; landed: boolean; lowest: number; highest: number; wings: number[] };

/** A take-off from where the body stands, then the brain's command `during` (once the giant fiber has fired) until it lands or `limit` s pass. */
function fly(world: World, start: { x: number; z: number; yaw: number }, during: BrainCommand, threat: Forces["threat"] = null, limit = 10): Flight {
  const behavior = new Behavior();
  const body = new FlyBody(world, start);
  const forces = { ...still, threat };
  // Armed, then the giant fiber fires: the brain's take-off.
  body.step(behavior.update(command(), 0, true, DT), forces, DT);
  body.step(behavior.update(command({ escape: 0.5 }), 0, true, DT), forces, DT);
  assert.equal(body.mode, "airborne", "it took off");
  const from = { ...body.position };
  const flight: Flight = { air: 0, distance: 0, top: 0, landed: false, lowest: Infinity, highest: -Infinity, wings: [] };
  for (let t = 0; t < limit && body.mode === "airborne"; t += DT) {
    const intent = behavior.update(during, 0, body.onFeet, DT);
    flight.wings.push(intent.wings);
    body.step(intent, forces, DT);
    flight.air += DT;
    flight.top = Math.max(flight.top, body.position.y - from.y);
    flight.lowest = Math.min(flight.lowest, body.position.y);
    flight.highest = Math.max(flight.highest, body.position.y);
    flight.landed ||= body.events.landed;
  }
  flight.distance = Math.hypot(body.position.x - from.x, body.position.z - from.z);
  return flight;
}

test("off its feet, the reflex holds the wings at flight power, then eases them down to a glide", () => {
  const b = new Behavior();
  b.update(command({ wings: 0.3 }), 0, true, DT);
  const at = (seconds: number) => {
    let wings = 0;
    for (let t = 0; t < seconds; t += DT) wings = b.update(command({ wings: 0.3 }), 0, false, DT).wings;
    return wings;
  };
  assert.ok(at(TARSAL_ONSET * 0.5) < 0.4, "not at once: a step down is over before the wings come up");
  assert.ok(Math.abs(at(TARSAL_ONSET + 0.2) - FLIGHT_WINGS) < 1e-9, "flight power");
  assert.ok(Math.abs(at(FLIGHT_HOLD + FLIGHT_FADE) - LAND_WINGS) < 1e-9, "a glide down after");
  assert.ok(Math.abs(at(5) - LAND_WINGS) < 1e-9, "until its feet touch");
  const landed = b.update(command({ wings: 0.3 }), 0, true, DT);
  assert.equal(landed.reflex, 0, "touching down ends it");
  assert.ok(landed.wings < 0.35, "the brain's own drive again");
});

test("the brain's own wing drive raises the floor, and its steering still turns it", () => {
  const b = new Behavior();
  b.update(command(), 0, true, DT);
  let intent = b.update(command(), 0, false, DT);
  for (let t = 0; t < 0.5; t += DT) intent = b.update(command({ wings: 0.9, turn: 0.5 }), 0, false, DT);
  assert.ok(intent.wings > 0.85, `wings ${intent.wings}`);
  assert.ok(intent.reflex > 0 && intent.reflex < intent.wings);
  assert.ok(intent.airYawRate < 0, "turning toward its right");
});

test("without a brain there is no reflex either: the fly does nothing at all", () => {
  const b = new Behavior();
  b.update(command(), 0, false, DT);
  for (let t = 0; t < 0.3; t += DT) b.update(command(), 0, false, DT);
  const stale = b.update(null, 0, false, DT);
  assert.equal(stale.wings, 0);
  assert.equal(stale.reflex, 0);
});

test("an escape becomes a flight: up for over a second, a few hundred millimetres away from the threat, and down on its feet", () => {
  const world = new World(open());
  const flight = fly(world, { x: 0, z: 0, yaw: 0 }, command({ wings: 0.35 }), { x: 20, y: 5, z: 15 });
  assert.ok(flight.landed, "it landed");
  assert.ok(flight.air > 1 && flight.air < 4, `${flight.air.toFixed(2)} s in the air`);
  assert.ok(flight.distance > 100 && flight.distance < 600, `${flight.distance.toFixed(0)} mm`);
  assert.ok(flight.top > 10 && flight.top < 120, `rose ${flight.top.toFixed(0)} mm`);
  assert.ok(flight.lowest >= 0, "never below the table");
});

test("the wings' own sensors feel the drive it flies with, and nothing from the step it lands in, its wings folded", () => {
  const world = new World(open());
  const body = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
  const behavior = new Behavior();
  body.step(behavior.update(command(), 0, true, DT), still, DT);
  assert.equal(body.wingbeat, 0, "standing, wings folded");
  body.step(behavior.update(command({ escape: 0.5 }), 0, true, DT), still, DT);
  let beat = 0;
  for (let t = 0; t < 10 && !body.onFeet; t += DT) {
    const intent = behavior.update(command({ wings: 0.3 }), 0, body.onFeet, DT);
    body.step(intent, still, DT);
    if (!body.onFeet) assert.equal(body.wingbeat, intent.wings);
    beat = Math.max(beat, body.wingbeat);
  }
  assert.ok(body.onFeet, "it landed");
  assert.ok(Math.abs(beat - FLIGHT_WINGS) < 1e-9, `beat as hard as the reflex holds them: ${beat}`);
  assert.equal(body.wingbeat, 0, "folded on landing (0.3 is under the pose's floor)");
  // On its feet they beat only as far as the pose opens them.
  body.step(behavior.update(command({ wings: 0.6 }), 0, true, 1), still, DT);
  assert.ok(Math.abs(body.wingbeat - 0.5) < 1e-4, `${body.wingbeat}`);
});

test("it flies away from the threat, not back past it", () => {
  const world = new World(open());
  const body = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
  const behavior = new Behavior();
  // The ball ahead and to its right, as the Swoop tool brings it in.
  const threat = { x: -28, y: 5, z: 22 };
  const forces = { ...still, threat };
  body.step(behavior.update(command(), 0, true, DT), forces, DT);
  body.step(behavior.update(command({ escape: 0.5 }), 0, true, DT), forces, DT);
  for (let t = 0; t < 1; t += DT) body.step(behavior.update(command({ wings: 0.35 }), 0, body.onFeet, DT), forces, DT);
  const away = body.position.x * -threat.x + body.position.z * -threat.z;
  assert.ok(away > 0, "further from where the threat was");
  assert.ok(Math.hypot(body.position.x - threat.x, body.position.z - threat.z) > 100, "well clear of it");
});

test("under a low ceiling, it stays below it and still comes down", () => {
  const world = new World(open(25));
  const flight = fly(world, { x: 0, z: 0, yaw: 0 }, command({ wings: 0.35 }));
  assert.ok(flight.landed);
  assert.ok(flight.highest < 60, `up to ${flight.highest.toFixed(0)} mm under a ceiling at 25`);
});

test("held up by the brain's own wing drive, it flies on past the reflex's hold", () => {
  const world = new World(open());
  const reflexOnly = fly(world, { x: 0, z: 0, yaw: 0 }, command({ wings: 0.3 }));
  const driven = fly(world, { x: 0, z: 0, yaw: 0 }, command({ wings: 0.7 }), null, 4);
  assert.ok(driven.air > reflexOnly.air + 1, `${driven.air.toFixed(1)} s against ${reflexOnly.air.toFixed(1)} s`);
});

test("walking off a ledge, its wings come up on the way down, and it lands", () => {
  const world = createPicnic();
  // Walking off something 16 mm high on the picnic table (motion.test.ts's ledge): a fall longer than the onset.
  const body = new FlyBody(world, { x: 112, z: 56, yaw: -Math.PI / 2 });
  const behavior = new Behavior();
  let flew = false;
  for (let t = 0; t < 3; t += DT) {
    const intent = behavior.update(command({ walk: 0.6 }), 0, body.onFeet, DT);
    flew ||= intent.reflex > 0;
    body.step(intent, still, DT);
  }
  assert.equal(body.onFeet, true);
  assert.equal(flew, true);
});
