import assert from "node:assert/strict";
import { test } from "node:test";
import { Pantry, World } from "@fly/world";
import type { Place } from "@fly/world";
import { DINER } from "../../../packages/world/tests/diner.ts";
import { FEATHER_REACH, FEATHER_REST, PUFF_RADIUS, PUFF_SPEED, Hands, TOOLS } from "../src/tools/hands.ts";

const bare: Place = { floor: { kind: "rect", hx: 500, hz: 500 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };

function setup() {
  const world = new World(bare);
  const hands = new Hands(world);
  const pantry = new Pantry(world);
  const fly = { position: { x: 0, y: 0, z: 0 }, yaw: 0, onFeet: true };
  const eye = { x: 0, y: 5, z: -10 };
  const update = (dt: number, use = false) => hands.update(dt, { use, holding: use, eye }, fly, pantry);
  return { hands, update };
}

for (const [tool, event, value] of [["feed", "dropped", "sugar"], ["swoop", "swooped", true]] as const) {
  test(`a Select press with ${tool} leaves one event for the frame's reactions`, () => {
    const { hands, update } = setup();
    hands.tool = TOOLS.findIndex((t) => t.id === tool);
    // Input uses the tool before the frame's regular update and reactions.
    update(0, true);
    assert.equal(hands.events[event], value);
    update(1 / 60);
    assert.equal(hands.events[event], value, "the regular update preserves the press for haptics");
    hands.clearEvents();
    update(1 / 60);
    assert.equal(hands.events[event], tool === "feed" ? null : false, "the next frame does not repeat it");
  });
}

test("food landing leaves one event across updates in the same frame", () => {
  const { hands, update } = setup();
  update(0, true);
  hands.clearEvents();
  update(0.2);
  assert.equal(hands.events.landed, "sugar");
  update(0);
  assert.equal(hands.events.landed, "sugar", "the landing stays until the frame's reactions");
  assert.equal(hands.events.dropped, null);
  hands.clearEvents();
  update(1 / 60);
  assert.equal(hands.events.landed, null, "the next frame does not repeat it");
});

test("throwing while the ball is still active is blocked without another swoop event", () => {
  const { hands, update } = setup();
  hands.tool = TOOLS.findIndex((t) => t.id === "swoop");
  update(0, true);
  update(1 / 60);
  assert.equal(hands.events.swooped, true);
  assert.equal(hands.events.blocked, false);
  hands.clearEvents();
  update(0, true);
  assert.equal(hands.events.blocked, true);
  update(1 / 60);
  assert.equal(hands.events.blocked, true, "the refusal stays until the frame's reactions");
  assert.equal(hands.events.swooped, false);
  hands.clearEvents();
  update(1 / 60);
  assert.equal(hands.events.blocked, false, "the next frame does not repeat it");
  assert.equal(hands.events.swooped, false);
});

test("frame end clears every hands event even when a pause skips the regular update", () => {
  const { hands, update } = setup();
  update(0, true);
  update(0.2);
  hands.chooseTool(TOOLS.findIndex((t) => t.id === "swoop"));
  update(0, true);
  hands.chooseTool(0);
  hands.stepVariant(1);
  hands.stepVariant(-1);
  hands.stepVariant(-1);
  assert.deepEqual(hands.events, { dropped: "sugar", landed: "sugar", swooped: true, built: false, toolChanged: true, variantChanged: true, blocked: true });
  hands.clearEvents();
  assert.deepEqual(hands.events, { dropped: null, landed: null, swooped: false, built: false, toolChanged: false, variantChanged: false, blocked: false });
});

test("food dropped where the pointer is under a table falls from under its top onto the floor there", () => {
  const world = new World(DINER);
  const hands = new Hands(world);
  const pantry = new Pantry(world);
  const fly = { position: { x: -50, y: 0, z: 20 }, yaw: 0, onFeet: true };
  const eye = { x: -50, y: 3, z: 0 };
  hands.tool = TOOLS.findIndex((t) => t.id === "feed");
  hands.movePointer({ x: -50, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  hands.update(0, { use: true, holding: true, eye }, fly, pantry);
  const falling = hands.falling[0];
  assert.ok(falling.y < 72 && falling.floor === 0, `falls from ${falling.y} to ${falling.floor}`);
  for (let i = 0; i < 60; i++) hands.update(1 / 60, { use: false, holding: false, eye }, fly, pantry);
  assert.equal(pantry.foods.length, 1);
  assert.equal(pantry.foods[0].y, 0);
});

test("food lands on what is under it, and the hands say where and which way it faces, for its ripple", () => {
  const place: Place = { ...bare, solids: [{ name: "pot", footprint: { kind: "circle", x: 0, z: 30, r: 10 }, top: { kind: "flat", y: 12 } }] };
  const world = new World(place);
  const hands = new Hands(world);
  const pantry = new Pantry(world);
  const fly = { position: { x: 0, y: 0, z: 0 }, yaw: 0, onFeet: true };
  const eye = { x: 0, y: 5, z: -10 };
  hands.following = false;
  hands.pointer.x = 2;
  hands.pointer.y = 12;
  hands.pointer.z = 31;
  hands.update(0, { use: true, holding: true, eye }, fly, pantry);
  hands.clearEvents();
  let landed = false;
  for (let i = 0; i < 60 && !landed; i++) {
    hands.update(1 / 60, { use: false, holding: false, eye }, fly, pantry);
    landed = hands.events.landed === "sugar";
    hands.clearEvents();
  }
  assert.ok(landed);
  assert.deepEqual(hands.landedAt, { x: 2, y: 12, z: 31 });
  assert.deepEqual(hands.landedNormal, { x: 0, y: 1, z: 0 });
});


test("the feather reaches another fly at the pointer, resting and stroking, but not beyond reach or off its feet", () => {
  const { hands, update } = setup();
  hands.tool = TOOLS.findIndex((t) => t.id === "feather");
  hands.movePointer({ x: 25, y: 0, z: 30 }, { x: 0, y: 1, z: 0 });
  const other = { position: { x: 25 + FEATHER_REACH / 2, y: 0, z: 30 }, onFeet: true };
  const air = { x: 0, y: 0, z: 0 };
  update(0);
  assert.equal(hands.stroke, 0, "the followed fly is far from the pointer");
  assert.equal(hands.reach(other, air), FEATHER_REST);
  update(0, true);
  assert.equal(hands.reach(other, air), 1);
  assert.deepEqual(air, { x: 0, y: 0, z: 0 });
  assert.equal(hands.reach({ ...other, onFeet: false }, air), 0);
  other.position.x = 25 + FEATHER_REACH + 0.1;
  assert.equal(hands.reach(other, air), 0);
});

for (const [variant, speed] of Object.entries(PUFF_SPEED)) {
  test(`a ${variant} puff adds air at another fly and leaves a fly outside the puff alone`, () => {
    const { hands, update } = setup();
    hands.tool = TOOLS.findIndex((t) => t.id === "blow");
    hands.variants[hands.tool] = hands.current.variants.findIndex((v) => v.id === variant);
    hands.movePointer({ x: 30, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    update(0, true);
    const air = { x: 2, y: 3, z: 4 };
    const other = { position: { x: 30 + PUFF_RADIUS / 2, y: 0, z: 0 }, onFeet: false };
    assert.equal(hands.reach(other, air), 0);
    assert.deepEqual(air, { x: 2 + hands.puffDirection.x * speed / 2, y: 3 + hands.puffDirection.y * speed / 2, z: 4 + hands.puffDirection.z * speed / 2 });
    const far = { x: 2, y: 3, z: 4 };
    other.position.x = 30 + PUFF_RADIUS;
    hands.reach(other, far);
    assert.deepEqual(far, { x: 2, y: 3, z: 4 });
    update(0);
    hands.reach({ ...other, position: hands.pointer }, far);
    assert.deepEqual(far, { x: 2, y: 3, z: 4 }, "releasing stops the puff");
  });
}

for (const kind of ["coffee", "laced"] as const) {
  test(`Feed drops ${kind} through the usual kind controls, and it lands as that kind`, () => {
    const world = new World(bare);
    const hands = new Hands(world);
    const pantry = new Pantry(world);
    hands.variants[0] = TOOLS[0].variants.findIndex((v) => v.id === kind);
    assert.ok(hands.variants[0] >= 0);
    const fly = { position: { x: 0, y: 0, z: 0 }, yaw: 0, onFeet: true };
    const eye = { x: 0, y: 5, z: -10 };
    hands.update(0, { use: true, holding: true, eye }, fly, pantry);
    assert.equal(hands.events.dropped, kind);
    hands.update(1, { use: false, holding: false, eye }, fly, pantry);
    assert.deepEqual(pantry.foods.map((f) => f.kind), [kind]);
  });
}

test("Feed's Clear dropped kind removes offerings and falling food, leaving patches and finds", () => {
  const world = new World(bare);
  const hands = new Hands(world);
  const pantry = new Pantry(world, [{ name: "jam", x: 0, z: 0, r: 3, sweet: 1 }]);
  const patch = pantry.foods[0];
  const found = pantry.add("crumb", 0, 0, 1, 0.8);
  pantry.drop("honey", 0, 0);
  pantry.drop("water", 10, 0);
  hands.falling.push({ kind: "sugar", x: 0, z: 0, y: 10, floor: 0, vy: 0 });
  hands.variants[0] = TOOLS[0].variants.findIndex((v) => v.id === "clear");
  assert.ok(hands.variants[0] >= 0, "clear is selectable through the usual kind controls");
  const fly = { position: { x: 0, y: 0, z: 0 }, yaw: 0, onFeet: true };
  const eye = { x: 0, y: 5, z: 10 };
  hands.update(0, { use: true, holding: true, eye }, fly, pantry);
  hands.update(1, { use: false, holding: false, eye }, fly, pantry);
  assert.deepEqual(pantry.foods, [patch, found]);
  assert.equal(hands.falling.length, 0);
  assert.equal(hands.events.dropped, null, "clear never tries to drop a food kind");
  assert.equal(hands.events.landed, null);
  hands.update(0, { use: true, holding: true, eye }, fly, pantry);
  assert.deepEqual(pantry.foods, [patch, found], "clearing an empty table is harmless");
});
