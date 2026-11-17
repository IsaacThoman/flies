import assert from "node:assert/strict";
import { test } from "node:test";
import { PATCHES, Pantry, SOLIDS, World, createPicnic } from "@fly/world";
import { ANTENNA_AHEAD, FLY_LENGTH, FlyBody, HEAD_AHEAD, LOOM_DECAY, LOOM_HOLD, SenseTracker, WIND_FULL_SPEED, createIntent } from "../src/index.ts";
import type { Intent, Looming, SenseInput } from "../src/index.ts";

/** A bare round table this wide, with nothing on it. */
const openTable = (r: number) => new World({ floor: { kind: "circle", r }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 320 });

const DT = 1 / 60;
const world = createPicnic();
const pantry = new Pantry(world, PATCHES);

function input(body: FlyBody, extra: Partial<SenseInput> = {}): SenseInput {
  return { dt: DT, body, world, pantry, looming: [], stroke: 0, air: { x: 0, y: 0, z: 0 }, eyesOpen: false, proboscis: 0, ...extra };
}

/** A ball flying straight at the fly's head from `from`, at `speed` mm/s. */
function approach(tracker: SenseTracker, body: FlyBody, from: { x: number; y: number; z: number }, speed: number, seconds: number, eyesOpen = false) {
  const head = body.point(0.42, 0.3, 0, { x: 0, y: 0, z: 0 });
  const d = Math.hypot(from.x - head.x, from.y - head.y, from.z - head.z);
  const ball: Looming = { id: 1, position: { ...from }, r: 30 };
  let peak = { left: 0, right: 0 };
  for (let t = 0; t < seconds; t += DT) {
    const k = Math.min(1, (speed * t) / (d - 40));
    ball.position.x = from.x + (head.x - from.x) * k;
    ball.position.y = from.y + (head.y - from.y) * k;
    ball.position.z = from.z + (head.z - from.z) * k;
    const s = tracker.update(input(body, { looming: [ball], eyesOpen }));
    peak = { left: Math.max(peak.left, s.loomLeft), right: Math.max(peak.right, s.loomRight) };
  }
  return peak;
}

test("something rushing at it from its left looms in the left eye", () => {
  // Facing +z: its left is +x.
  const body = new FlyBody(world, { x: 0, z: -150, yaw: 0 });
  const peak = approach(new SenseTracker(), body, { x: 300, y: 60, z: -150 }, 900, 0.4);
  assert.ok(peak.left > 0.5, `left ${peak.left}`);
  assert.equal(peak.right, 0);
  const right = approach(new SenseTracker(), body, { x: -300, y: 60, z: -150 }, 900, 0.4);
  assert.ok(right.right > 0.5 && right.left === 0);
});

test("straight ahead looms in both eyes; slow approach doesn't loom", () => {
  const body = new FlyBody(world, { x: 0, z: -150, yaw: 0 });
  const ahead = approach(new SenseTracker(), body, { x: 0, y: 20, z: 150 }, 900, 0.4);
  assert.ok(ahead.left > 0.5 && ahead.right > 0.5);
  const slow = approach(new SenseTracker(), body, { x: 300, y: 60, z: -150 }, 60, 1);
  assert.equal(slow.left, 0);
});

test("a loom holds briefly then fades; with the eyes open there is no hand-wired looming", () => {
  const body = new FlyBody(world, { x: 0, z: -150, yaw: 0 });
  const tracker = new SenseTracker();
  approach(tracker, body, { x: 300, y: 60, z: -150 }, 900, 0.4);
  let s = tracker.update(input(body));
  for (let t = 0; t < LOOM_HOLD + LOOM_DECAY + 0.05; t += DT) s = tracker.update(input(body));
  assert.equal(s.loomLeft, 0);
  const open = approach(new SenseTracker(), body, { x: 300, y: 60, z: -150 }, 900, 0.4, true);
  assert.equal(open.left + open.right, 0);
});

/** Walks `body` forward until it is pushing against what it faces (bounded). */
function walkInto(body: FlyBody) {
  const walk: Intent = { ...createIntent(), live: true, walking: true, speed: 10 };
  for (let t = 0; t < 3 && !body.blocked; t += DT) body.step(walk, { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null }, DT);
  assert.ok(body.blocked, "it walked into it");
}

test("standing at a wall, its forelegs hold its antennae off it; walking into the wall pushes them in", () => {
  const jam = SOLIDS.find((s) => s.name === "jam")!.footprint as { x: number; z: number; r: number };
  // Where a walk into the jar's side ends: its head at the glass, its forelegs' tarsi against it.
  const at = jam.x - jam.r - HEAD_AHEAD * FLY_LENGTH - 0.01;
  const standing = new FlyBody(world, { x: at, z: jam.z, yaw: Math.PI / 2 });
  const held = new SenseTracker().update(input(standing));
  assert.equal(held.bumpLeft + held.bumpRight, 0);
  // Walking into it straight on: both antennae.
  const square = new FlyBody(world, { x: at - 2, z: jam.z, yaw: Math.PI / 2 });
  walkInto(square);
  const pushed = new SenseTracker().update(input(square));
  assert.equal(pushed.bumpLeft, 1);
  assert.equal(pushed.bumpRight, 1);
  // Facing away from it, nothing.
  const away = new FlyBody(world, { x: at, z: jam.z, yaw: -Math.PI / 2 });
  const t = new SenseTracker().update(input(away));
  assert.equal(t.bumpLeft + t.bumpRight, 0);
});

test("standing still, it feels a stem between its forelegs on its antennae, and nothing past the table's edge", () => {
  // A stem 0.8 mm across, just ahead of its head: between its antennae's tips, short of its forelegs' tarsi.
  const ahead = (HEAD_AHEAD + ANTENNA_AHEAD) * FLY_LENGTH;
  const stem = new World({ floor: { kind: "circle", r: 100 }, solids: [{ name: "stem", footprint: { kind: "circle", x: 0, z: ahead, r: 0.4 }, top: { kind: "flat", y: 20 } }], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 320 });
  const body = new FlyBody(stem, { x: 0, z: 0, yaw: 0 });
  const tracker = new SenseTracker();
  let s = tracker.update({ ...input(body), world: stem });
  for (let k = 0; k < 600; k++) s = tracker.update({ ...input(body), world: stem });
  assert.equal(s.bumpLeft, 1, "held as long as it touches");
  assert.equal(s.bumpRight, 1);
  // At the edge of a bare table, facing out: its antennae are over the drop, touching nothing.
  const table = openTable(50);
  const edge = new FlyBody(table, { x: 0, z: 50 - HEAD_AHEAD * FLY_LENGTH - 0.01, yaw: 0 });
  walkInto(edge);
  const out = new SenseTracker().update({ ...input(edge), world: table });
  assert.equal(out.bumpLeft + out.bumpRight, 0);
});

test("it tastes sugar with its feet and its mouth, only while on its feet", () => {
  const honey = PATCHES.find((p) => p.name === "honey")!;
  const body = new FlyBody(world, { x: honey.x, z: honey.z, yaw: 0 });
  const tracker = new SenseTracker();
  const s = tracker.update(input(body));
  assert.equal(s.sweet, 1);
  assert.equal(tracker.tasting.food?.name, "honey");
  body.mode = "airborne";
  assert.equal(tracker.update(input(body)).sweet, 0);
  // Mouth only: standing just short of it, facing it.
  const near = new FlyBody(world, { x: honey.x, z: honey.z - honey.r - 1.2, yaw: 0 });
  const m = new SenseTracker();
  assert.ok(m.update(input(near)).sweet > 0);
  assert.equal(m.tasting.byMouth, true);
});

test("wind is its own speed through the air; touch follows a stroke and eases out", () => {
  const body = new FlyBody(openTable(300), { x: 0, z: 0, yaw: 0 });
  const tracker = new SenseTracker();
  body.mode = "airborne";
  body.velocity.x = WIND_FULL_SPEED;
  let s = tracker.update(input(body));
  for (let i = 0; i < 30; i++) s = tracker.update(input(body));
  assert.ok(s.wind > 0.95);
  assert.equal(s.grounded, false);
  // Carried along with the air, it feels none.
  for (let i = 0; i < 60; i++) s = tracker.update(input(body, { air: { x: WIND_FULL_SPEED, y: 0, z: 0 } }));
  assert.ok(s.wind < 0.05);
  body.mode = "standing";
  body.velocity.x = 0;
  assert.equal(tracker.update(input(body, { stroke: 1 })).touch, 1);
  s = tracker.update(input(body));
  assert.ok(s.touch < 1 && s.touch > 0.8);
  for (let i = 0; i < 60; i++) s = tracker.update(input(body));
  assert.equal(s.touch, 0);
});

test("bumping into something in flight is felt as touch", () => {
  const body = new FlyBody(world, { x: 0, z: -150, yaw: 0 });
  const tracker = new SenseTracker();
  body.events.hit = 400;
  assert.equal(tracker.update(input(body)).touch, 1);
});
