import assert from "node:assert/strict";
import { test } from "node:test";
import { SOLIDS, World, createPicnic } from "@fly/world";
import type { Food } from "@fly/world";
import { AIR_RADIUS, FlyBody, MOUTH_AHEAD, WALL_PATIENCE, createIntent } from "../src/index.ts";
import type { Forces, Intent } from "../src/index.ts";

const DT = 1 / 60;
const still: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
const intent = (i: Partial<Intent> = {}): Intent => ({ ...createIntent(), live: true, ...i });

function run(body: FlyBody, i: Intent, seconds: number, forces: Forces = still) {
  for (let t = 0; t < seconds; t += DT) body.step(i, forces, DT);
}

test("it walks the way it faces, at the speed asked", () => {
  const body = new FlyBody(createPicnic(), { x: 0, z: -150, yaw: Math.PI / 2 });
  run(body, intent({ speed: 10, walking: true }), 1);
  assert.ok(Math.abs(body.position.x - 10) < 0.2);
  assert.ok(Math.abs(body.position.z + 150) < 1e-6);
  assert.equal(body.mode, "walking");
});

test("it turns at the yaw rate asked", () => {
  const body = new FlyBody(createPicnic(), { x: 0, z: -150, yaw: 0 });
  run(body, intent({ yawRate: 1 }), 1);
  assert.ok(Math.abs(body.yaw - 1) < 0.03);
});

test("a wall stops it, and it slides along a wall it meets at a slant", () => {
  const world = createPicnic();
  const jam = SOLIDS.find((s) => s.name === "jam")!.footprint as { x: number; z: number; r: number };
  const head = new FlyBody(world, { x: jam.x - jam.r - 5, z: jam.z, yaw: Math.PI / 2 });
  run(head, intent({ speed: 10, walking: true }), 1.5);
  assert.ok(head.position.x < jam.x - jam.r + 0.5, "never inside");
  assert.equal(head.position.y, 0);
  assert.equal(head.blocked, true);
  const slant = new FlyBody(world, { x: jam.x - jam.r - 5, z: jam.z + 6, yaw: Math.PI / 2 - 0.5 });
  const z0 = slant.position.z;
  run(slant, intent({ speed: 10, walking: true }), 2);
  assert.ok(slant.position.z > z0 + 5, "slid round");
});

test("pressed against a wall it faces, the body turns it away after a while", () => {
  const world = createPicnic();
  const jam = SOLIDS.find((s) => s.name === "jam")!.footprint as { x: number; z: number; r: number };
  const body = new FlyBody(world, { x: jam.x - jam.r - 2, z: jam.z, yaw: Math.PI / 2 });
  run(body, intent({ speed: 10, walking: true }), WALL_PATIENCE + 1.5);
  assert.ok(Math.abs(Math.sin(body.yaw)) < 0.9, "no longer facing straight at it");
});

test("it doesn't walk off the table", () => {
  const body = new FlyBody(createPicnic(), { x: 0, z: -300, yaw: Math.PI });
  run(body, intent({ speed: 10, walking: true }), 5);
  assert.ok(Math.hypot(body.position.x, body.position.z) < 320);
  assert.equal(body.onFeet, true);
});

test("walking off a ledge it falls, and lands on what's below", () => {
  const world = createPicnic();
  const body = new FlyBody(world, { x: 112, z: 56, yaw: -Math.PI / 2 });
  assert.equal(body.position.y, 16);
  let fell = false;
  let landed = false;
  for (let t = 0; t < 3; t += DT) {
    body.step(intent({ speed: 10, walking: true }), still, DT);
    fell ||= body.mode === "airborne";
    landed ||= body.events.landed;
  }
  assert.ok(fell && landed);
  assert.ok(body.position.y < 1);
});

test("a take-off goes up and away from the threat; without wings it comes back down", () => {
  const body = new FlyBody(createPicnic(), { x: 0, z: -150, yaw: 0 });
  body.step(intent({ takeOff: 1 }), { ...still, threat: { x: 20, y: 5, z: -150 } }, DT);
  assert.equal(body.mode, "airborne");
  assert.ok(body.velocity.y > 0 && body.velocity.x < 0);
  let top = 0;
  for (let t = 0; t < 4 && body.mode === "airborne"; t += DT) {
    body.step(intent(), still, DT);
    top = Math.max(top, body.position.y);
  }
  assert.ok(top > 5, `rose ${top}`);
  assert.equal(body.mode, "standing");
  assert.ok(body.position.x < -5);
});

test("a take-off with the wings beating climbs well clear of the table", () => {
  const body = new FlyBody(createPicnic(), { x: 0, z: -150, yaw: 0 });
  body.step(intent({ takeOff: 1 }), still, DT);
  run(body, intent({ wings: 0.8 }), 0.35);
  assert.ok(body.position.y > 60, `climbed ${body.position.y}`);
});

test("its wings hold it up in proportion to their drive", () => {
  const world = new World([], 300);
  const flap = (wings: number) => {
    const body = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
    body.step(intent({ takeOff: 0 }), still, DT);
    run(body, intent({ wings }), 0.6);
    return body.position.y;
  };
  assert.ok(flap(0.9) > flap(0.5));
  assert.ok(flap(0.9) > 40);
});

test("in the air it is drawn back toward the table", () => {
  const body = new FlyBody(new World([], 300), { x: 0, z: 0, yaw: Math.PI / 2 });
  body.step(intent({ takeOff: 1 }), still, DT);
  run(body, intent({ wings: 0.62, airYawRate: 0 }), 8);
  assert.ok(Math.hypot(body.position.x, body.position.z) < AIR_RADIUS + 20);
});

test("it lands on top of a perch it comes down on", () => {
  const world = createPicnic();
  const body = new FlyBody(world, { x: 126, z: 61, yaw: 0 });
  body.position.y = 60;
  body.mode = "airborne";
  run(body, intent(), 2);
  assert.equal(body.onFeet, true);
  assert.equal(body.position.y, 32);
});

test("with food to eat, the body brings its mouth to it", () => {
  const body = new FlyBody(new World([], 300), { x: 0, z: 0, yaw: 0 });
  const meal: Food = { id: 1, kind: "sugar", name: "Sugar", x: 1.5, y: 0, z: 2.5, r: 1.6, sweet: 1, amount: 1 };
  run(body, intent({ feeding: true, feed: 0.5 }), 2, { ...still, meal });
  const mouth = body.point(MOUTH_AHEAD, 0, 0, { x: 0, y: 0, z: 0 });
  assert.ok(Math.hypot(mouth.x - meal.x, mouth.z - meal.z) < meal.r, `mouth ${JSON.stringify(mouth)}`);
});

test("walking, it climbs into the lemonade's saucer, over the rim and down to the pool", () => {
  const world = createPicnic();
  const saucer = SOLIDS.find((s) => s.name === "saucer")!.footprint as { x: number; z: number; r: number };
  // From outside, facing the jar.
  const body = new FlyBody(world, { x: saucer.x + saucer.r + 4, z: saucer.z, yaw: -Math.PI / 2 });
  let peak = 0;
  for (let t = 0; t < 4; t += DT) {
    body.step(intent({ speed: 6, walking: true }), still, DT);
    peak = Math.max(peak, body.position.y);
    assert.notEqual(body.mode, "airborne", "never falls");
  }
  assert.ok(peak > 3.5, "over the rim");
  assert.ok(Math.abs(body.position.y - 0.8) < 1e-6, `in the moat at ${body.position.y}`);
});

test("walking, it climbs the whole strawberry to the top", () => {
  const world = createPicnic();
  const berry = SOLIDS.find((s) => s.name === "strawberry")!.footprint as { x: number; z: number; rx: number };
  const body = new FlyBody(world, { x: berry.x - 30, z: berry.z, yaw: Math.PI / 2 });
  let peak = 0;
  for (let t = 0; t < 8; t += DT) {
    body.step(intent({ speed: 8, walking: true }), still, DT);
    peak = Math.max(peak, body.position.y);
  }
  assert.ok(peak > 20, `reached ${peak.toFixed(1)} mm`);
});
