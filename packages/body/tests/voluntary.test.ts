// The voluntary take-off (behavior.ts, VOLUNTARY_WALK): a body stand-in that
// takes a walking fly into the air now and then, and only while the brain
// walks it.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainCommand } from "@fly/brain";
import { World } from "@fly/world";
import { Behavior, CRUISE_HOLD, FLIGHT_HOLD, FLIGHT_WINGS, FlyBody, VOLUNTARY_RAISE, VOLUNTARY_STRENGTH, VOLUNTARY_WALK } from "../src/index.ts";
import { checkBody, places, still } from "../../../scripts/fuzz/body.ts";
import type { PlaceId } from "../../../scripts/fuzz/body.ts";

const DT = 1 / 60;
const command = (c: Partial<BrainCommand> = {}): BrainCommand => ({ walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, ...c });
const WALK = command({ walk: 0.6 });

/** Seconds of walking, on its feet throughout, before each voluntary take-off over `seconds`. */
function spans(b: Behavior, c: BrainCommand, seconds: number) {
  const out: number[] = [];
  let since = 0;
  for (let t = 0; t < seconds; t += DT) {
    since += DT;
    if (b.update(c, 0, true, DT).takeOff !== null) {
      out.push(since);
      since = 0;
    }
  }
  return out;
}

test("walking, it takes off of its own accord now and then, about once every VOLUNTARY_WALK seconds of walking", () => {
  const all: number[] = [];
  for (let seed = 1; seed <= 20; seed++) all.push(...spans(new Behavior(seed), WALK, 600));
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  assert.ok(all.length > 300, `${all.length} take-offs in 200 minutes of walking`);
  assert.ok(Math.abs(mean - VOLUNTARY_WALK) < VOLUNTARY_WALK * 0.15, `every ${mean.toFixed(1)} s`);
  assert.ok(Math.min(...all) < VOLUNTARY_WALK / 4 && Math.max(...all) > VOLUNTARY_WALK * 2, "at random, not on a beat");
});

test("not while the brain keeps it still, feeding, singing or backing, and never asleep", () => {
  for (const c of [command(), command({ walk: 0.25 }), command({ walk: 0.6, feed: 0.5 }), command({ walk: 0.6, sing: 0.6 }), command({ back: 0.8 }), command({ turn: 0.8 })]) {
    assert.deepEqual(spans(new Behavior(), c, 600), [], JSON.stringify(c));
  }
});

test("the wings come up first, and a brain that stops walking then keeps it on the ground", () => {
  // Just over WALK_ON, so the smoothed command falls under WALK_OFF soon after the brain stops.
  const walk = command({ walk: 0.35 });
  const b = new Behavior();
  let raised = 0;
  let t = 0;
  for (; t < 1000; t += DT) {
    const intent = b.update(walk, 0, true, DT);
    if (intent.takeOff !== null) break;
    if (intent.wingPose > 0) raised += DT;
  }
  assert.ok(Math.abs(raised - VOLUNTARY_RAISE) < 2 * DT, `raised for ${raised.toFixed(3)} s`);

  // Again, but the brain stops walking as they come up.
  const c = new Behavior();
  while (c.update(walk, 0, true, DT).wingPose === 0);
  for (let s = 0; s < 1; s += DT) assert.equal(c.update(command(), 0, true, DT).takeOff, null);
  assert.equal(c.intent.wingPose, 0, "folded again");
});

test("it is the body's, said so, gentle, and replays the same from the same seed", () => {
  const b = new Behavior(7);
  let intent = b.update(WALK, 0, true, DT);
  while (intent.takeOff === null) intent = b.update(WALK, 0, true, DT);
  assert.equal(intent.voluntary, true);
  assert.equal(intent.takeOff, VOLUNTARY_STRENGTH);
  assert.deepEqual(spans(new Behavior(7), WALK, 300), spans(new Behavior(7), WALK, 300));
  assert.notDeepEqual(spans(new Behavior(7), WALK, 300), spans(new Behavior(8), WALK, 300));
  // The giant fiber's is not.
  const e = new Behavior();
  e.update(command(), 0, true, DT);
  const escape = e.update(command({ escape: 0.6 }), 0, true, DT);
  assert.ok(escape.takeOff !== null && !escape.voluntary);
});

/** Walks from the place's start until it takes off of its own accord, then flies until it lands. */
function voluntaryFlight(id: PlaceId, seed: number, turn: number) {
  const world = new World(places[id]);
  const body = new FlyBody(world, world.place.start);
  const b = new Behavior(seed);
  let walked = 0;
  for (; walked < 600; walked += DT) {
    const intent = b.update(command({ walk: 0.6, turn }), 0, body.onFeet, DT);
    body.step(intent, still, DT);
    checkBody(body, world);
    if (intent.takeOff !== null) break;
  }
  assert.equal(body.mode, "airborne", `${id}: took off`);
  let air = 0;
  let floor = Infinity;
  for (; air < 15 && !body.onFeet; air += DT) {
    const intent = b.update(command({ wings: 0.1, turn }), 0, body.onFeet, DT);
    floor = Math.min(floor, intent.reflex || Infinity);
    body.step(intent, still, DT);
    checkBody(body, world);
  }
  return { body, air, floor };
}

test("a voluntary flight is held up longer than an escape's, and comes down on its feet in every place", () => {
  for (const id of Object.keys(places) as PlaceId[]) {
    for (const [seed, turn] of [[1, 0], [2, 0.3], [3, -0.5]] as const) {
      const { body, air } = voluntaryFlight(id, seed, turn);
      assert.ok(body.onFeet, `${id}, seed ${seed}: still in the air after ${air.toFixed(1)} s`);
      // Flights that meet nothing are held for CRUISE_HOLD; some come down on something sooner.
      if (id === "picnic" && turn === 0) assert.ok(air > FLIGHT_HOLD + 1, `${id}: ${air.toFixed(2)} s`);
    }
  }
});

test("in the air from a voluntary take-off the reflex holds flight power for CRUISE_HOLD", () => {
  const b = new Behavior(3);
  let intent = b.update(WALK, 0, true, DT);
  while (intent.takeOff === null) intent = b.update(WALK, 0, true, DT);
  let held = 0;
  for (let t = 0; t < CRUISE_HOLD + 1; t += DT) if (b.update(command(), 0, false, DT).reflex === FLIGHT_WINGS) held += DT;
  assert.ok(Math.abs(held - CRUISE_HOLD) < 3 * DT, `held for ${held.toFixed(2)} s`);
  // Down again, the next flight off a ledge is held as long as before.
  b.update(command(), 0, true, DT);
  held = 0;
  for (let t = 0; t < CRUISE_HOLD + 1; t += DT) if (b.update(command(), 0, false, DT).reflex === FLIGHT_WINGS) held += DT;
  assert.ok(Math.abs(held - FLIGHT_HOLD) < 3 * DT, `off a ledge, held for ${held.toFixed(2)} s`);
});
