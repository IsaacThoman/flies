import assert from "node:assert/strict";
import { test } from "node:test";
import { AWAY, EXTRAPOLATE, FlyTrack, MIN_DELAY, RoomClock, createFlyState } from "../src/index.ts";

const state = (t: number, x: number, yaw = 0, vx = 0) => {
  const s = createFlyState();
  s.t = t;
  s.x = x;
  s.yaw = yaw;
  s.vx = vx;
  return s;
};

test("another fly is drawn between the two states either side of the moment", () => {
  const track = new FlyTrack();
  track.push(state(1000, 0), 1060);
  track.push(state(1050, 5), 1110);
  const out = createFlyState();
  assert.equal(track.sample(1025, out), "between");
  assert.ok(Math.abs(out.x - 2.5) < 1e-9);
  assert.equal(track.sample(990, out), "between");
  assert.equal(out.x, 0);
});

test("its heading turns the short way round, across ±π", () => {
  const track = new FlyTrack();
  track.push(state(0, 0, 3.1), 50);
  track.push(state(50, 0, -3.1), 100);
  const out = createFlyState();
  track.sample(25, out);
  assert.ok(Math.abs(Math.abs(out.yaw) - Math.PI) < 0.01, `yaw ${out.yaw}`);
});

test("past the newest state it carries on along its velocity a moment, then holds; one that is away holds at once", () => {
  const track = new FlyTrack();
  track.push(state(0, 0, 0, 10), 50);
  track.push(state(50, 0.5, 0, 10), 100);
  const out = createFlyState();
  assert.equal(track.sample(100, out), "ahead");
  assert.ok(Math.abs(out.x - 1) < 1e-9);
  assert.equal(track.sample(50 + EXTRAPOLATE + 500, out), "held");
  assert.ok(Math.abs(out.x - (0.5 + (10 * EXTRAPOLATE) / 1000)) < 1e-9);
  const away = state(100, 2, 0, 10);
  away.flags = AWAY;
  track.push(away, 150);
  track.sample(400, out);
  assert.equal(out.x, 2);
});

test("a state older than the newest is dropped", () => {
  const track = new FlyTrack();
  track.push(state(100, 1), 150);
  track.push(state(50, 9), 160);
  assert.equal(track.late, 1);
  assert.equal(track.count, 1);
});

test("how far in the past it is drawn follows how late and how unevenly states arrive", () => {
  const steady = new FlyTrack();
  const uneven = new FlyTrack();
  for (let i = 0; i < 200; i++) {
    steady.push(state(i * 50, 0), i * 50 + 40);
    uneven.push(state(i * 50, 0), i * 50 + 40 + (i % 3) * 60);
  }
  assert.ok(steady.delay >= MIN_DELAY && steady.delay < 120, `steady ${steady.delay}`);
  assert.ok(uneven.delay > steady.delay + 60, `uneven ${uneven.delay}`);
  // A device sending every 100 ms rather than 50 is drawn further back, so there is always a state ahead.
  const slow = new FlyTrack();
  for (let i = 0; i < 200; i++) slow.push(state(i * 100, 0), i * 100 + 40);
  assert.ok(slow.delay > 40 + 100, `slow ${slow.delay}`);
});

test("the room's clock is taken from the quickest round trip, and eased toward rather than jumped", () => {
  const clock = new RoomClock();
  // The room is 5000 ms ahead; the network takes 40 ms each way, one sample 200 ms one way.
  clock.sample(0, 5040, 80);
  assert.ok(Math.abs(clock.now(80) - 5080) < 1e-9);
  clock.sample(100, 5300, 500);
  assert.equal(clock.rtt, 80);
  assert.ok(Math.abs(clock.offset - 5000) < 1e-9, "the slow sample is ignored");
  clock.sample(1000, 6012, 1020);
  // A better sample, 2 ms off: eased into.
  assert.ok(Math.abs(clock.offset - 5000) < 1e-9);
  clock.update(1);
  assert.ok(clock.offset > 5000 && clock.offset < 5002);
});
