import assert from "node:assert/strict";
import { test } from "node:test";
import { BALL_RADIUS, SWOOP_DIVE, SWOOP_SECONDS, createPicnic } from "@fly/world";
import { TableBubbles, ballAt } from "../src/index.ts";
import type { BallWire } from "../src/index.ts";

const world = createPicnic();
const where = (b: TableBubbles, t: number) => b.slots.map((s) => (b.alive(s, t) ? b.position(s, t, { x: 0, y: 0, z: 0 }) : null));

test("two devices looking at different frame rates blow the same bubbles in the same places", () => {
  const a = new TableBubbles(42, world, 8);
  const b = new TableBubbles(42, world, 8);
  // One at 60 frames a second, one at 23 with uneven frames.
  for (let t = 0; t < 600; t += 1 / 60) a.update(t);
  for (let t = 0, i = 0; t < 600; t += (1 / 23) * (i++ % 2 ? 1.5 : 0.5)) b.update(t);
  a.update(600);
  b.update(600);
  assert.deepEqual(a.slots.map((s) => s.cycle), b.slots.map((s) => s.cycle));
  const pa = where(a, 600);
  const pb = where(b, 600);
  for (let i = 0; i < 8; i++) {
    if (!pa[i] || !pb[i]) assert.equal(pa[i], pb[i]);
    else assert.ok(Math.hypot(pa[i]!.x - pb[i]!.x, pa[i]!.y - pb[i]!.y, pa[i]!.z - pb[i]!.z) < 0.01, `slot ${i}`);
  }
  // And many have come and gone in ten minutes.
  assert.ok(a.slots.reduce((n, s) => n + s.cycle, 0) > 40);
});

test("a newcomer takes up the room's bubbles as they stand and goes on with them", () => {
  const room = new TableBubbles(7, world, 8);
  for (let t = 0; t < 300; t += 0.05) room.update(t);
  const late = new TableBubbles(7, world, 8);
  late.restore(room.snapshot());
  for (let t = 300; t < 400; t += 0.05) {
    room.update(t);
    late.update(t);
  }
  assert.deepEqual(late.slots.map((s) => s.cycle), room.slots.map((s) => s.cycle));
});

test("a bubble burst by a fly is burst on every device told of it, and only the bubble it was", () => {
  const a = new TableBubbles(3, world, 8);
  for (let t = 0; t < 10; t += 0.05) a.update(t);
  const s = a.slots[2];
  assert.equal(a.pop(2, s.cycle + 1, 10), false);
  assert.equal(a.pop(2, s.cycle, 10), true);
  a.update(10 + 0.2);
  assert.equal(a.slots[2].cycle, s.cycle);
  assert.ok(a.slots[2].t0 >= 10.12 - 1e-9);
});

test("a thrown ball is where the Swoop tool's path has it at the room's time, and bursts the bubbles it meets", () => {
  const ball: BallWire = { by: 1, at: 1000, from: [0, 100, 0], via: [10, 0, 0], to: [0, 400, 300] };
  const out = { x: 0, y: 0, z: 0 };
  assert.deepEqual(ballAt(ball, 0, out), { x: 0, y: 100, z: 0 }, "before the throw it waits where it will dive from");
  assert.deepEqual(ballAt(ball, 1000 + (SWOOP_DIVE + 0.01) * SWOOP_SECONDS * 1000, out), { x: 10, y: 0, z: 0 });
  const b = new TableBubbles(9, world, 8);
  b.update(30);
  const target = b.slots.find((s) => b.alive(s, 30))!;
  const p = b.position(target, 30, { x: 0, y: 0, z: 0 });
  // A ball that hangs where the bubble is, from before 29.9 s until after 30.
  const still: BallWire = { by: 1, at: 0, from: [p.x, p.y, p.z], via: [p.x, p.y, p.z], to: [p.x, p.y, p.z] };
  b.hitBy(29.9, 30, BALL_RADIUS, still);
  assert.ok(target.poppedAt > 29.89 && target.poppedAt <= 30);
});
