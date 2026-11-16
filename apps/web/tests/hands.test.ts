import assert from "node:assert/strict";
import { test } from "node:test";
import { Pantry, World } from "@fly/world";
import type { Place } from "@fly/world";
import { DINER } from "../../../packages/world/tests/diner.ts";
import { Audio } from "../src/audio/sounds.ts";
import type { Sound } from "../src/audio/sounds.ts";
import { Hands, TOOLS } from "../src/tools/hands.ts";

const bare: Place = { floor: { kind: "rect", hx: 500, hz: 500 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };

function setup() {
  const world = new World(bare);
  const hands = new Hands(world);
  const pantry = new Pantry(world);
  const fly = { position: { x: 0, y: 0, z: 0 }, yaw: 0, onFeet: true };
  const eye = { x: 0, y: 5, z: -10 };
  const audio = new Audio();
  const sounds: { sound: Sound; volume: number }[] = [];
  audio.play = (sound, volume = 1) => {
    sounds.push({ sound, volume });
  };
  const update = (dt: number, use = false) => hands.update(dt, { use, holding: use, eye }, fly, pantry);
  return { hands, audio, sounds, update };
}

for (const [tool, sound] of [["feed", "drop"], ["swoop", "swoop"]] as const) {
  test(`a Select press with ${tool} reaches sound playback once in the same frame`, () => {
    const { hands, audio, sounds, update } = setup();
    hands.tool = TOOLS.findIndex((t) => t.id === tool);
    // Input uses the tool before the frame's regular update and reactions.
    update(0, true);
    update(1 / 60);
    audio.tools(hands.events);
    assert.deepEqual(sounds, [{ sound, volume: 1 }]);
    hands.clearEvents();

    // The pause menu skips updates; it must not leave an event to replay on resume.
    hands.clearEvents();
    audio.tools(hands.events);
    update(1 / 60);
    audio.tools(hands.events);
    assert.deepEqual(sounds, [{ sound, volume: 1 }]);
  });
}

test("food landing reaches sound playback once across updates in the same frame", () => {
  const { hands, audio, sounds, update } = setup();
  update(0, true);
  hands.clearEvents();
  update(0.2);
  update(0);
  audio.tools(hands.events);
  assert.deepEqual(sounds, [{ sound: "land", volume: 0.6 }]);
  hands.clearEvents();
  audio.tools(hands.events);
  assert.deepEqual(sounds, [{ sound: "land", volume: 0.6 }]);
});

test("throwing while the ball is still active is blocked without replaying the swoop sound", () => {
  const { hands, audio, sounds, update } = setup();
  hands.tool = TOOLS.findIndex((t) => t.id === "swoop");
  update(0, true);
  update(1 / 60);
  audio.tools(hands.events);
  hands.clearEvents();
  update(0, true);
  assert.equal(hands.events.blocked, true);
  update(1 / 60);
  audio.tools(hands.events);
  assert.deepEqual(sounds, [{ sound: "swoop", volume: 1 }]);
});

test("frame end clears every hands event even when a pause skips the regular update", () => {
  const { hands, update } = setup();
  update(0, true);
  update(0.2);
  hands.stepTool(1);
  update(0, true);
  hands.stepTool(-1);
  hands.stepVariant(1);
  hands.stepVariant(-1);
  hands.stepVariant(-1);
  assert.deepEqual(hands.events, { dropped: "sugar", landed: "sugar", swooped: true, toolChanged: true, variantChanged: true, blocked: true });
  hands.clearEvents();
  assert.deepEqual(hands.events, { dropped: null, landed: null, swooped: false, toolChanged: false, variantChanged: false, blocked: false });
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
