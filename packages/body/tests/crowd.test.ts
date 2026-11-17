import assert from "node:assert/strict";
import { test } from "node:test";
import { Pantry, World } from "@fly/world";
import { BODY_HALF, BODY_RADIUS, BODY_UP, CONTACT_TOUCH, Crowd, FlyBody, MAX_NEIGHBOURS, SenseTracker, createIntent, pointToSegment, segmentToSegment } from "../src/index.ts";
import type { Forces, Intent } from "../src/index.ts";

const openTable = (r: number) => new World({ floor: { kind: "circle", r }, solids: [], patches: [], start: { x: 0, z: 0, yaw: 0 }, ceiling: 320 });
const DT = 1 / 60;
const still: Forces = { air: { x: 0, y: 0, z: 0 }, threat: null, meal: null };
const intent = (i: Partial<Intent> = {}): Intent => ({ ...createIntent(), live: true, ...i });
const scratch = { ax: 0, az: 0, bx: 0, bz: 0 };

/** The gap between two flies' bodies (negative when they overlap), mm. */
function gap(a: FlyBody, b: { x: number; z: number; yaw: number }) {
  const h = 1.05;
  const d = segmentToSegment(
    a.position.x - Math.sin(a.yaw) * h, a.position.z - Math.cos(a.yaw) * h, a.position.x + Math.sin(a.yaw) * h, a.position.z + Math.cos(a.yaw) * h,
    b.x - Math.sin(b.yaw) * h, b.z - Math.cos(b.yaw) * h, b.x + Math.sin(b.yaw) * h, b.z + Math.cos(b.yaw) * h, scratch,
  );
  return d - BODY_RADIUS * 2;
}

test("walking into another fly, it can't go through: it stops against it or slides past, and feels it", () => {
  const world = openTable(200);
  for (const [z, yaw] of [[0, 0], [0.8, 0.3], [-1.2, Math.PI / 2]] as const) {
    const body = new FlyBody(world, { x: -8, z, yaw: Math.PI / 2 });
    const crowd = new Crowd(world);
    Object.assign(crowd.add()!, { x: 0, y: 0, z: 0, yaw });
    let deepest = 0;
    let touched = 0;
    for (let t = 0; t < 3; t += DT) {
      body.step(intent({ speed: 10, walking: true }), still, DT);
      crowd.resolve(body, DT);
      deepest = Math.max(deepest, -gap(body, { x: 0, z: 0, yaw }));
      touched = Math.max(touched, crowd.touch);
      // Where it is pushed: where the two met, inside the other's body, at its middle's height.
      if (crowd.touch > 0) {
        const s = Math.sin(yaw) * BODY_HALF;
        const c = Math.cos(yaw) * BODY_HALF;
        const into = pointToSegment(crowd.contact.x, crowd.contact.z, -s, -c, s, c, scratch);
        assert.ok(into <= BODY_RADIUS + 1e-9 && Math.abs(crowd.contact.y - body.position.y - BODY_UP) < 1e-9, `${z}/${yaw}: pushed at ${JSON.stringify(crowd.contact)}`);
      }
    }
    // Pushed out each frame: never more than a frame's walk inside it.
    assert.ok(deepest < (10 * DT) + 1e-6, `${z}/${yaw}: ${deepest} mm into it`);
    assert.equal(touched, CONTACT_TOUCH);
    if (z !== 0) assert.ok(body.position.x > 2, `${z}/${yaw}: slid past (${body.position.x.toFixed(2)})`);
  }
});

test("its antennae press on another fly's body as on a wall", () => {
  const world = openTable(200);
  const body = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
  const crowd = new Crowd(world);
  const senses = new SenseTracker();
  const pantry = new Pantry(world, []);
  const feel = () => senses.update({ dt: DT, body, world, pantry, looming: [], air: { x: 0, y: 0, z: 0 }, eyesOpen: true, proboscis: 0, bodies: crowd });
  assert.equal(feel().bumpLeft, 0);
  // Another fly crossways just ahead of its head, a little to its left.
  Object.assign(crowd.add()!, { x: 0.3, y: 0, z: 2.2, yaw: Math.PI / 2 });
  const felt = feel();
  assert.equal(felt.bumpLeft, 1);
  assert.equal(felt.bumpRight, 1);
  // One standing on a sugar cube's top, high above, is not in the way.
  crowd.neighbours[0].y = 16;
  for (let i = 0; i < 60; i++) feel();
  assert.equal(feel().bumpLeft, 0);
});

test("flying into another fly, it bounces off and feels the hit", () => {
  const world = openTable(200);
  const body = new FlyBody(world, { x: -10, z: 0, yaw: Math.PI / 2 });
  const crowd = new Crowd(world);
  Object.assign(crowd.add()!, { x: 0, y: 5, z: 0, yaw: 0 });
  body.mode = "airborne";
  body.position.y = 5;
  body.velocity.x = 300;
  let hit = 0;
  let back = Infinity;
  for (let i = 0; i < 10; i++) {
    body.step(intent({ wings: 0.6 }), still, DT);
    crowd.resolve(body, DT);
    hit = Math.max(hit, body.events.hit);
    // Once it has hit (its wings then turn it to its new course and carry it round the other fly).
    if (hit > 0 && back === Infinity) {
      back = body.velocity.x;
      assert.ok(body.position.x < 0, "not through it");
    }
  }
  assert.ok(back < 0, "bounced back");
  assert.ok(hit > 200, `hit at ${hit} mm/s`);
});

test("alone, there is nothing to meet", () => {
  const world = openTable(200);
  const body = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
  const crowd = new Crowd(world);
  crowd.resolve(body, DT);
  assert.equal(crowd.touch, 0);
  assert.equal(crowd.inside(0, 0.75, 0, 0), false);
});

test("a front leg on another fly tastes him, on its feet; the nearest other fly's side is known", () => {
  const world = openTable(200);
  const body = new FlyBody(world, { x: 0, z: 0, yaw: 0 });
  const crowd = new Crowd(world);
  const senses = new SenseTracker();
  const pantry = new Pantry(world, []);
  const feel = () => senses.update({ dt: DT, body, world, pantry, looming: [], air: { x: 0, y: 0, z: 0 }, eyesOpen: true, proboscis: 0, bodies: crowd });
  assert.equal(feel().maleTaste, 0);
  assert.equal(crowd.sideOf(body), 0);
  // Another fly crossways ahead, its body under the front legs' tarsi, more to the fly's left (it faces +z; its left is +x).
  Object.assign(crowd.add()!, { x: 0.7, y: 0, z: 2.4, yaw: Math.PI / 2 });
  assert.equal(feel().maleTaste, 1);
  assert.equal(crowd.sideOf(body), 1);
  crowd.neighbours[0].x = -0.7;
  assert.equal(crowd.sideOf(body), -1);
  // Too far ahead for the legs to reach: the taste eases out.
  crowd.neighbours[0].z = 4;
  const fading = feel().maleTaste;
  assert.ok(fading > 0 && fading < 1, `${fading}`);
  for (let i = 0; i < 60; i++) feel();
  assert.equal(feel().maleTaste, 0);
  // Off its feet, its legs are on nothing.
  crowd.neighbours[0].z = 2.4;
  body.mode = "airborne";
  assert.equal(feel().maleTaste, 0);
});

test("a crowd holds only so many: at a full table it keeps the flies nearest, whatever order they come in", () => {
  const crowd = new Crowd(openTable(200));
  // Every other fly at a table of 128, the farthest first and the nearest last, then some in between.
  const order = [...Array.from({ length: 127 }, (_, i) => 127 - i), 40, 0.5];
  for (const d of order) {
    const n = crowd.add(d * d);
    if (n) Object.assign(n, { x: d, y: 0, z: 0, yaw: 0 });
  }
  assert.equal(crowd.count, MAX_NEIGHBOURS);
  assert.deepEqual(crowd.neighbours.map((n) => n.x).sort((a, b) => a - b), [0.5, ...Array.from({ length: MAX_NEIGHBOURS - 1 }, (_, i) => i + 1)]);
  assert.equal(crowd.add(200 * 200), null);
  crowd.clear();
  assert.ok(crowd.add(200 * 200), "an empty crowd takes any");
});
