import assert from "node:assert/strict";
import { test } from "node:test";
import { Contacts, FLY_HEIGHT, FlyBody, MAX_SLOPE_COS, TOUCH_PARTS, createIntent, pressContacts } from "@fly/body";
import type { Forces } from "@fly/body";
import { World, createSurface, withPieces } from "@fly/world";
import type { Place, Vec3 } from "@fly/world";
import { Builder } from "../src/tools/build.ts";
import { AWAY, FINGER_HALF_WIDTH, FINGER_LENGTH, FINGER_THICKNESS, Finger, LIFT, RESTING_TOUCH, fingerHeight } from "../src/tools/finger.ts";

const DT = 1 / 60;
const bare: Place = { floor: { kind: "rect", hx: 500, hz: 500 }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 300 };
const still: Forces = { air: { x: 0, y: 0, z: 0 }, meal: null };

/** A fly at the middle facing +z, and a finger pointing at it. */
function setup(place: Place = bare) {
  const world = new World(place);
  const finger = new Finger(world);
  const body = new FlyBody(world, place.start);
  const pointer: Vec3 = { x: 0, y: 0, z: 0 };
  // It points at the fly: put down ahead of it, it lies from its tip back toward +z.
  const toward: Vec3 = body.position;
  const walk = createIntent();
  walk.live = true;
  const frame = (inHand = true, intent = walk) => {
    finger.update(DT, inHand, pointer, toward, [body]);
    body.step(intent, still, DT);
  };
  return { world, finger, body, pointer, walk, frame };
}

/** What the finger touches a fly with this frame. */
function touchOf(finger: Finger, body: FlyBody) {
  const contacts = new Contacts();
  finger.touch(body, contacts);
  return contacts;
}

/** Frames until a condition holds, at most `seconds` of them; whether it did. */
function until(frame: () => void, done: () => boolean, seconds: number) {
  for (let t = 0; t < seconds; t += DT) {
    if (done()) return true;
    frame();
  }
  return done();
}

test("its skin, as the fly feels it, is walkable everywhere: never steeper than the body can climb", () => {
  const world = new World(bare);
  const finger = new Finger(world);
  const pointer = { x: 0, y: 0, z: 0 };
  // Pointing at a fly far behind it (-z): it lies back toward +z.
  const fly = { x: 0, y: 0, z: -100 };
  finger.update(DT, true, pointer, fly, []);
  finger.use();
  for (let i = 0; i < 600; i++) finger.update(DT, true, pointer, fly, []);
  assert.equal(finger.tip.y, 0, "down on the table");
  const s = createSurface();
  for (let along = -FINGER_HALF_WIDTH + 0.01; along < FINGER_LENGTH; along += 0.25) {
    for (let lateral = -FINGER_HALF_WIDTH + 0.01; lateral < FINGER_HALF_WIDTH; lateral += 0.25) {
      const h = fingerHeight(along, lateral);
      if (h < 0) continue;
      // The finger lies from its tip back toward +z.
      world.surface(-lateral, along, s);
      assert.ok(Math.abs(s.y - h) < 1e-6, `${along}, ${lateral}: felt at ${s.y}, drawn at ${h}`);
      assert.ok(s.normal.y >= MAX_SLOPE_COS - 1e-9, `${along}, ${lateral}: too steep`);
    }
  }
});

test("it comes in from above, over where the hand is, and is lifted until put down; down, it rests on the table", () => {
  const { finger, frame, pointer } = setup();
  pointer.z = -60;
  frame();
  assert.equal(finger.state, "raised");
  assert.ok(Math.abs(finger.tip.y - AWAY) < 1, `came in at ${finger.tip.y}`);
  assert.ok(until(frame, () => Math.abs(finger.tip.y - LIFT) < 1e-6, 5), `lifted at ${finger.tip.y}`);
  finger.use();
  assert.ok(until(frame, () => finger.tip.y === 0, 5));
  assert.equal(finger.state, "down");
});

test("it never presses into the fly: lowered onto it, it rests on its back, and it is a light touch", () => {
  const { finger, frame, body, pointer } = setup();
  // Over the fly.
  pointer.z = -2;
  frame();
  finger.use();
  until(frame, () => false, 4);
  assert.ok(Math.abs(finger.tip.y - FLY_HEIGHT) < 1e-6, `rests at ${finger.tip.y}`);
  assert.equal(body.position.y, 0, "the fly is still on the table");
  assert.equal(touchOf(finger, body).strongest, RESTING_TOUCH);
  // Lifted off it, nothing.
  finger.use();
  until(frame, () => false, 1);
  assert.equal(touchOf(finger, body).count, 0);
});

test("moved onto the fly it touches it fully, and the fly is not inside it", () => {
  const { finger, frame, body, pointer } = setup();
  pointer.z = -40;
  frame();
  finger.use();
  until(frame, () => finger.tip.y === 0, 5);
  let touched = 0;
  const still = createIntent();
  for (let t = 0; t < 3; t += DT) {
    pointer.z = Math.min(0, pointer.z + 30 * DT);
    frame(true, still);
    touched = Math.max(touched, touchOf(finger, body).strongest);
    assert.ok(body.position.y <= finger.tip.y + 1e-9 || finger.isFinger(body.surface.solid), `the fly at ${body.position.y} is in the finger at ${finger.tip.y}`);
  }
  assert.equal(touched, 1);
});

test("a fly walks up onto the finger where it lies, and is carried with it, staying on, and can walk off where it is set down", () => {
  const { finger, frame, body, pointer, walk } = setup();
  // Down just ahead of the fly, lying back toward +z: the fly walks straight up its tip.
  pointer.z = 12;
  frame();
  finger.use();
  const rest = createIntent();
  rest.live = true;
  assert.ok(until(() => frame(true, rest), () => finger.tip.y === 0, 5));
  walk.speed = 8;
  walk.walking = true;
  assert.ok(until(() => frame(true, walk), () => finger.isFinger(body.surface.solid) && body.position.y > FINGER_THICKNESS * 0.8, 6), `got to ${body.position.z.toFixed(2)}, ${body.position.y.toFixed(2)}`);
  // Stopped on it, lifted and carried 60 mm to the side, and turned with the hand.
  const before = { ...body.position };
  finger.use();
  until(() => frame(true, rest), () => finger.tip.y >= LIFT - 1e-6, 3);
  assert.ok(finger.carries(body), "carried");
  assert.ok(Math.abs(body.position.y - before.y - LIFT) < 1e-6, `lifted with it to ${body.position.y}`);
  for (let t = 0; t < 2; t += DT) {
    pointer.x += 30 * DT;
    frame(true, rest);
    assert.equal(body.mode === "airborne", false, "it stays on");
  }
  until(() => frame(true, rest), () => finger.speed < 1e-3, 2);
  assert.ok(Math.abs(body.position.x - before.x - pointer.x) < 0.5, `carried to ${body.position.x}`);
  assert.ok(finger.isFinger(body.surface.solid));
  // Set down there, and it walks off the end of it.
  finger.use();
  until(() => frame(true, rest), () => finger.tip.y === 0, 3);
  walk.speed = 8;
  assert.ok(until(() => frame(true, walk), () => body.surface.solid === -1 && body.onFeet, 12), `still at ${body.position.x}, ${body.position.y}, ${body.position.z}`);
});

test("put away with the fly on it, it sets down and stays until the fly is off it, then goes", () => {
  const { finger, frame, body, pointer, walk } = setup();
  pointer.z = 12;
  frame();
  finger.use();
  const rest = createIntent();
  rest.live = true;
  until(() => frame(true, rest), () => finger.tip.y === 0, 5);
  walk.speed = 8;
  walk.walking = true;
  until(() => frame(true, walk), () => finger.isFinger(body.surface.solid) && body.position.y > FINGER_THICKNESS * 0.8, 6);
  finger.use();
  until(() => frame(true, rest), () => finger.tip.y >= LIFT - 1e-6, 3);
  // Another tool: it comes down with the fly on it, and waits.
  until(() => frame(false, rest), () => false, 3);
  assert.equal(finger.tip.y, 0);
  assert.ok(finger.present && finger.carries(body));
  // Off it, it lifts away and is gone.
  assert.ok(until(() => frame(false, walk), () => !finger.present, 20), "it went");
});

test("a fly standing beside a still finger isn't touched by it", () => {
  const { finger, frame, body, pointer } = setup();
  pointer.z = FINGER_HALF_WIDTH + 1.8;
  frame();
  finger.use();
  const rest = createIntent();
  until(() => frame(true, rest), () => finger.tip.y === 0, 5);
  until(() => frame(true, rest), () => false, 0.5);
  assert.equal(touchOf(finger, body).count, 0);
});

test("put down over a wall of the kit, however it lies under it, it rests on the wall and never comes down into it", () => {
  // A wall 1.5 mm thick across the finger's length, between where a coarse look would find it.
  for (const z of [17, 21.3, 26.7, 33]) {
    const { world, finger, frame, pointer } = setup(withPieces(bare, [{ kind: "wall", x: 0, z, turns: 0, y: 0 }]));
    pointer.z = 12;
    frame();
    finger.use();
    until(frame, () => false, 4);
    const wall = world.solids.findIndex((s) => s.name === "wall");
    assert.ok(Math.abs(finger.tip.y - 3) < 1e-6, `wall at ${z}: the finger's underside at ${finger.tip.y}`);
    assert.ok(wall >= 0 && wall < world.movingFrom);
  }
});

test("no piece of the kit is built into the fingertip or onto it; beside it, or under it lifted high enough, one is", () => {
  const { world, finger, frame, pointer } = setup();
  const builder = new Builder(world, {}, () => {});
  builder.enter("bare", bare);
  builder.keepOut = (piece) => finger.blocks(piece);
  pointer.z = 40;
  frame();
  finger.use();
  until(frame, () => finger.tip.y === 0, 5);
  const fly = [{ x: 0, y: 0, z: 0 }];
  const at = (x: number, z: number) => builder.point("tile-blue", { x, y: 0, z }, false, fly[0], fly, []).ok;
  assert.equal(at(0, 40), false, "under its tip");
  assert.equal(at(0, 60), false, "under its length");
  assert.equal(at(0, 20), true, "in front of it");
  assert.equal(at(30, 50), true, "beside it");
  // Lifted, a tile (0.5 mm) goes under it, and the finger comes down onto the tile.
  finger.use();
  until(frame, () => finger.tip.y >= LIFT - 1e-6, 3);
  assert.equal(at(0, 50), true, "under it lifted");
  assert.ok(builder.use("tile-blue"));
  finger.use();
  until(frame, () => false, 3);
  assert.ok(Math.abs(finger.tip.y - 0.5) < 1e-6, `it rests on the tile at ${finger.tip.y}`);
});

test("pieces built or taken away while a fly stands on the finger don't drop it: it is still carried", () => {
  const { world, finger, frame, body, pointer, walk } = setup();
  const builder = new Builder(world, {}, () => {});
  builder.enter("bare", bare);
  builder.keepOut = (piece) => finger.blocks(piece);
  pointer.z = 12;
  frame();
  finger.use();
  const rest = createIntent();
  rest.live = true;
  until(() => frame(true, rest), () => finger.tip.y === 0, 5);
  walk.speed = 8;
  walk.walking = true;
  assert.ok(until(() => frame(true, walk), () => finger.carries(body) || (finger.isFinger(body.surface.solid) && body.position.y > FINGER_THICKNESS * 0.8), 6));
  // A tile elsewhere: the world is loaded again, the finger's solids after it.
  const fly = [body.position];
  assert.ok(builder.point("tile-red", { x: -60, y: 0, z: 0 }, false, body.position, fly, []).ok);
  assert.ok(builder.use("tile-red"));
  finger.use();
  until(() => frame(true, rest), () => finger.tip.y >= LIFT - 1e-6, 3);
  assert.ok(finger.carries(body), "still on it");
  for (let t = 0; t < 1; t += DT) {
    pointer.x += 20 * DT;
    frame(true, rest);
  }
  assert.ok(finger.carries(body) && body.onFeet, "carried");
});

test("against a tall rounded thing it rests on what is under it, no higher than it rides up over, and never climbs it", () => {
  // A dome 300 mm high whose flank the finger's length lies over.
  const hill: Place = { ...bare, solids: [{ name: "hill", footprint: { kind: "circle", x: 40, z: 40, r: 40 }, top: { kind: "dome", base: 0, height: 300, power: 1 } }] };
  const { finger, frame, pointer } = setup(hill);
  pointer.z = 30;
  frame();
  finger.use();
  until(frame, () => false, 10);
  assert.ok(finger.tip.y <= 60 + 1e-6, `it climbed to ${finger.tip.y}`);
  assert.ok(finger.tip.y > 0, "resting on the flank where it lies over it");
});

test("a hand said to be on the finger itself doesn't lift it by its own height", () => {
  const { world, finger, frame, pointer } = setup();
  pointer.z = 30;
  frame();
  finger.use();
  for (let t = 0; t < 5; t += DT) {
    // As if the hand were found on what is there, the finger included.
    pointer.y = world.heightAt(pointer.x, pointer.z);
    frame();
  }
  assert.equal(finger.tip.y, 0, `it rose to ${finger.tip.y}`);
});

test("a fly carried with its feet a hair off the skin is still standing on it, not under it: the finger doesn't lift itself off it", () => {
  const { finger, frame, body, pointer } = setup();
  pointer.z = 12;
  frame();
  finger.use();
  const rest = createIntent();
  rest.live = true;
  until(() => frame(true, rest), () => finger.tip.y === 0, 5);
  body.place(0, 14, 0, FINGER_THICKNESS + 1);
  finger.use();
  for (let t = 0; t < 3; t += DT) {
    // Its feet a little below the skin, as a step can leave them.
    body.position.y -= 0.2;
    pointer.x += 10 * DT;
    frame(true, rest);
  }
  assert.ok(Math.abs(finger.tip.y - LIFT) < 1e-6, `the finger at ${finger.tip.y}`);
  assert.ok(finger.carries(body));
});

/** The parts a finger touches a fly on now, and how hard (packages/body/src/touch.ts). */
function partsOf(finger: Finger, body: FlyBody) {
  const out = new Float64Array(TOUCH_PARTS.length);
  pressContacts(body, touchOf(finger, body), out);
  const parts: Record<string, number> = {};
  TOUCH_PARTS.forEach((part, k) => {
    if (out[k] > 0) parts[part] = out[k];
  });
  return parts;
}

/** The fly at the middle facing +z, held still, and the finger lowered onto it: its tip's middle at (x, z), lying back from there away from `from`. */
function onto(x: number, z: number, from: Vec3) {
  const { finger, body, pointer } = setup();
  pointer.x = x;
  pointer.z = z;
  const away = from;
  finger.update(DT, true, pointer, away, [body]);
  finger.use();
  for (let t = 0; t < 3; t += DT) finger.update(DT, true, pointer, away, [body]);
  return { finger, body };
}

test("resting on its back, the finger presses flat on its notum, never its face", () => {
  // Lying across its back along x, its edge over the thorax just behind the head: the back is under it, the head isn't.
  const { finger, body } = onto(10, 0.8 - FINGER_HALF_WIDTH, { x: 300, y: 0, z: 0.8 - FINGER_HALF_WIDTH });
  assert.ok(Math.abs(finger.tip.y - FLY_HEIGHT) < 1e-6, `resting at ${finger.tip.y}`);
  const parts = partsOf(finger, body);
  assert.ok((parts.touchNotum ?? 0) > 0, JSON.stringify(parts));
  for (const face of ["touchEyeLeft", "touchEyeRight", "touchFrontLeft", "touchFrontRight", "touchOcciputLeft", "touchOcciputRight", "touchMouthpartsLeft", "touchMouthpartsRight"]) assert.equal(parts[face], undefined, `${face}: ${JSON.stringify(parts)}`);
  for (const value of Object.values(parts)) assert.ok(value <= RESTING_TOUCH + 1e-9);
});

test("its tip come down on the head presses that side's eye, front or occiput, and nothing on the other side or the back", () => {
  // The tip come in from its left (+x, facing +z), lying back that way, its round edge over the left of its head.
  const { finger, body } = onto(FINGER_HALF_WIDTH + 0.15, 1.05, { x: -300, y: 0, z: 1.05 });
  assert.ok(finger.tip.y >= FLY_HEIGHT - 1e-6, `it rests on the head, at ${finger.tip.y}, not through it`);
  const parts = partsOf(finger, body);
  const left = ["touchEyeLeft", "touchFrontLeft", "touchOcciputLeft"].filter((p) => (parts[p] ?? 0) > 0);
  assert.ok(left.length > 0, JSON.stringify(parts));
  for (const other of ["touchEyeRight", "touchFrontRight", "touchOcciputRight", "touchNotum", "touchWings", "touchAbdomen"]) assert.equal(parts[other], undefined, `${other}: ${JSON.stringify(parts)}`);
});

test("moved into its side along the table, the finger's edge presses where it meets it, fully", () => {
  const { finger, frame, body, pointer } = setup();
  pointer.x = -40;
  frame();
  finger.use();
  until(frame, () => finger.tip.y === 0, 5);
  let parts: Record<string, number> = {};
  const still = createIntent();
  for (let t = 0; t < 3 && Object.keys(parts).length === 0; t += DT) {
    // On until its flare is as high as the fly's body, and on into it.
    pointer.x = Math.min(-6, pointer.x + 60 * DT);
    frame(true, still);
    parts = partsOf(finger, body);
  }
  assert.ok(Object.keys(parts).length > 0, "touched");
  assert.ok(Object.values(parts).some((v) => v > RESTING_TOUCH), JSON.stringify(parts));
});

test("a fly in the air over its skin, landing on it or taking off, never lifts the finger", () => {
  const { finger, body, pointer } = setup();
  pointer.z = 12;
  const toward = { x: 0, y: 0, z: 0 };
  finger.update(DT, true, pointer, toward, [body]);
  finger.use();
  for (let t = 0; t < 3; t += DT) finger.update(DT, true, pointer, toward, [body]);
  assert.equal(finger.tip.y, 0);
  // Over its length, a little into its skin, in the air.
  body.place(0, 20, 0, FINGER_THICKNESS + 1);
  for (let t = 0; t < 2; t += DT) {
    body.mode = "airborne";
    body.position.y = finger.tip.y + fingerHeight(20 - 12, 0) - 0.3;
    finger.update(DT, true, pointer, toward, [body]);
  }
  assert.equal(finger.tip.y, 0, `the finger rose to ${finger.tip.y}`);
});
