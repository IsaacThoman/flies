import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrainCommand } from "@fly/brain";
import { BACK_SPEED, Behavior, COMMAND_STALE_MS, ESCAPE_ON, ESCAPE_REFRACTORY, SING_OFF, SING_ON, STANDING_TURN, TURN_RATE, WALK_SPEED } from "../src/index.ts";

const command = (c: Partial<BrainCommand> = {}): BrainCommand => ({ walk: 0, turn: 0, back: 0, escape: 0, wings: 0, groom: 0, feed: 0, sing: 0, lean: 0, ...c });
const DT = 1 / 60;

/** Holds a command for `seconds`. */
function hold(b: Behavior, c: BrainCommand, seconds: number, onFeet = true) {
  let intent = b.update(c, 0, onFeet, DT);
  for (let t = DT; t < seconds; t += DT) intent = b.update(c, 0, onFeet, DT);
  return intent;
}

test("without a fresh command the fly does nothing", () => {
  const b = new Behavior();
  assert.equal(b.update(null, 0, true, DT).live, false);
  hold(b, command({ walk: 1 }), 0.5);
  const stale = b.update(command({ walk: 1 }), COMMAND_STALE_MS + 1, true, DT);
  assert.equal(stale.live, false);
  assert.equal(stale.speed, 0);
});

test("walking starts above 0.3 and stops below 0.15, faster with more drive", () => {
  const b = new Behavior();
  assert.equal(hold(b, command({ walk: 0.25 }), 1).walking, false);
  const on = { ...hold(b, command({ walk: 0.35 }), 1) };
  assert.equal(on.walking, true);
  assert.equal(hold(b, command({ walk: 0.2 }), 1).walking, true, "hysteresis keeps it walking");
  assert.equal(hold(b, command({ walk: 0.1 }), 1).walking, false);
  const fast = hold(b, command({ walk: 1 }), 1);
  assert.ok(fast.speed > on.speed && fast.speed <= WALK_SPEED * 1.6 + 1e-9);
});

test("backing needs back to beat walk by a margin", () => {
  const b = new Behavior();
  assert.equal(hold(b, command({ back: 0.4, walk: 0.3 }), 1).backing, false);
  const backing = hold(b, command({ back: 0.6, walk: 0.1 }), 1);
  assert.equal(backing.backing, true);
  assert.ok(Math.abs(backing.speed + WALK_SPEED * BACK_SPEED) < 1e-9);
});

test("turn toward the fly's right is clockwise from above: negative yaw", () => {
  const b = new Behavior();
  const walking = hold(b, command({ walk: 0.6, turn: 1 }), 1);
  assert.ok(Math.abs(walking.yawRate + TURN_RATE) < 0.01);
  const standing = hold(new Behavior(), command({ turn: -1 }), 1);
  assert.ok(Math.abs(standing.yawRate - TURN_RATE * STANDING_TURN) < 0.01);
});

test("escape takes off once as it passes ESCAPE_ON, then must fall back and wait", () => {
  const b = new Behavior();
  hold(b, command(), 0.2);
  assert.equal(b.update(command({ escape: ESCAPE_ON - 0.01 }), 0, true, DT).takeOff, null, "just under");
  const first = b.update(command({ escape: 0.9 }), 0, true, DT);
  assert.ok(first.takeOff !== null && first.takeOff > 0.5);
  assert.equal(b.update(command({ escape: 0.9 }), 0, true, DT).takeOff, null, "held high: once");
  hold(b, command(), 0.2);
  assert.equal(b.update(command({ escape: 0.9 }), 0, true, DT).takeOff, null, "still refractory");
  hold(b, command(), ESCAPE_REFRACTORY);
  assert.notEqual(b.update(command({ escape: 0.9 }), 0, true, DT).takeOff, null);
});

test("no take-off from the air", () => {
  const b = new Behavior();
  hold(b, command(), 0.2, false);
  assert.equal(b.update(command({ escape: 1 }), 0, false, DT).takeOff, null);
});

test("wings and grooming below the floor are idling; a grooming bout lingers once on its feet", () => {
  const b = new Behavior();
  assert.equal(hold(b, command({ wings: 0.15, groom: 0.15 }), 1).wingPose, 0);
  assert.ok(hold(b, command({ groom: 0.6 }), 1).groom > 0.4);
  // In the air the bout waits.
  const flying = { ...hold(b, command(), 1, false) };
  assert.ok(flying.groom > 0.4);
  const landed = hold(b, command(), 0.5, true);
  assert.ok(landed.groom > 0.05 && landed.groom < flying.groom);
  assert.equal(hold(b, command(), 3, true).groom, 0);
});

test("feeding switches on above 0.15 and off below 0.05", () => {
  const b = new Behavior();
  assert.equal(hold(b, command({ feed: 0.1 }), 1).feeding, false);
  assert.equal(hold(b, command({ feed: 0.3 }), 1).feeding, true);
  assert.equal(hold(b, command({ feed: 0.08 }), 1).feeding, true);
  assert.equal(hold(b, command({ feed: 0.02 }), 1).feeding, false);
});

test("singing switches on past SING_ON and off below SING_OFF, only on its feet", () => {
  const b = new Behavior();
  assert.equal(hold(b, command({ sing: SING_ON - 0.05 }), 1).singing, false);
  assert.equal(hold(b, command({ sing: SING_ON + 0.05 }), 1).singing, true);
  assert.equal(hold(b, command({ sing: SING_OFF + 0.05 }), 1).singing, true, "hysteresis keeps it singing");
  assert.equal(hold(b, command({ sing: SING_OFF - 0.05 }), 1).singing, false);
  assert.equal(hold(new Behavior(), command({ sing: 1 }), 1, false).singing, false, "not in the air");
});
