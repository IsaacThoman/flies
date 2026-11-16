import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AIRBORNE, BITES, EATING, FLIES, FLY, FLY_MAX, HANDS, HOLDING, PROTOCOL, createFlyState, decodeBites, decodeFlies, dropOwner,
  encodeBites, encodeFlies, encodeFly, foundId, isTableCode, readState, seqAtOrAfter, stateLength, tableCode,
} from "../src/index.ts";
import type { FlyState } from "../src/index.ts";

function sampleState(): FlyState {
  const s = createFlyState();
  s.flags = AIRBORNE | EATING | HANDS | HOLDING;
  s.seq = 65535;
  s.epoch = 300;
  s.t = 123456.4;
  s.x = -123.456;
  s.y = 87.65;
  s.z = 301.2;
  s.yaw = -2.5;
  s.upX = 0.3;
  s.upZ = -0.2;
  s.vx = 410.4;
  s.vy = -12;
  s.vz = 3;
  Object.assign(s.pose, { speed: -3.3, turn: 2.2, wings: 0.7, groom: 0.1, feed: 0.9, crouch: 0.4, pitch: 0.5, roll: -0.3 });
  Object.assign(s.hand, { x: 10.5, y: 2.25, z: -40.1, eyeX: 400, eyeY: 120.5, eyeZ: -300, tool: 3, variant: 1 });
  return s;
}

test("a fly's state goes over the wire in 33 bytes, 47 with the hand, and comes back as near as the eye can tell", () => {
  const view = new DataView(new ArrayBuffer(FLY_MAX));
  const s = sampleState();
  const n = encodeFly(view, s);
  assert.equal(n, 47);
  s.flags &= ~HANDS;
  assert.equal(encodeFly(view, s), 33);
  s.flags |= HANDS;
  encodeFly(view, s);
  assert.equal(view.getUint8(0), FLY);
  const back = createFlyState();
  assert.equal(readState(view, 1, back), 1 + stateLength(s.flags));
  assert.equal(back.flags, s.flags);
  assert.equal(back.seq, 65535);
  assert.equal(back.epoch, 300 & 0xff, "the place's count wraps at a byte");
  assert.equal(back.t, 123456);
  for (const k of ["x", "y", "z"] as const) assert.ok(Math.abs(back[k] - s[k]) <= 0.01, k);
  // Yaw comes back in [0, 2π), the same heading.
  assert.ok(Math.abs(Math.atan2(Math.sin(back.yaw - s.yaw), Math.cos(back.yaw - s.yaw))) < 1e-4);
  assert.ok(Math.abs(back.upX - 0.3) < 0.01 && Math.abs(back.upZ + 0.2) < 0.01);
  assert.equal(back.vx, 410);
  for (const k of ["speed", "turn", "wings", "groom", "feed", "crouch", "pitch", "roll"] as const) assert.ok(Math.abs(back.pose[k] - s.pose[k]) < 0.13, k);
  assert.ok(Math.abs(back.hand.x - 10.5) < 0.03 && Math.abs(back.hand.eyeY - 120.5) < 0.06);
  assert.equal(back.hand.tool, 3);
  assert.equal(back.hand.variant, 1);
});

test("a short or broken message is refused, not read past its end", () => {
  const view = new DataView(new ArrayBuffer(20));
  assert.equal(readState(view, 1, createFlyState()), -1);
  const batch = new DataView(new Uint8Array([FLIES, 3, 1]).buffer);
  assert.equal(decodeFlies(batch, createFlyState(), () => {}), -1);
});

test("a batch carries every fly's state with its player's id", () => {
  const a = sampleState();
  a.id = 4;
  const b = sampleState();
  b.id = 7;
  b.flags = 0;
  b.x = 5;
  const view = new DataView(new ArrayBuffer(256));
  const n = encodeFlies(view, [a, b]);
  assert.equal(n, 2 + 1 + 46 + 1 + 32);
  const seen: [number, number][] = [];
  assert.equal(decodeFlies(new DataView(view.buffer, 0, n), createFlyState(), (s) => seen.push([s.id, Math.round(s.x)])), 2);
  assert.deepEqual(seen, [[4, -123], [7, 5]]);
});

test("bites carry the food and how much, with the sender's count", () => {
  const view = new DataView(new ArrayBuffer(64));
  const n = encodeBites(view, 70000, [{ food: 3, amount: 0.0123 }, { food: 2_000_007, amount: 0.5 }]);
  assert.equal(n, 20);
  assert.equal(view.getUint8(0), BITES);
  const got: [number, number][] = [];
  assert.equal(decodeBites(new DataView(view.buffer, 0, n), (f, a) => got.push([f, a])), 70000 & 0xffff);
  assert.equal(got[0][0], 3);
  assert.ok(Math.abs(got[0][1] - 0.0123) < 1e-6);
  assert.equal(got[1][0], 2_000_007);
});

test("sequence numbers compare across their wrap", () => {
  assert.ok(seqAtOrAfter(5, 65530));
  assert.ok(!seqAtOrAfter(65530, 5));
  assert.ok(seqAtOrAfter(7, 7));
});

test("dropped food is named for its player, found food for where it is", () => {
  assert.equal(dropOwner(3_000_012), 3);
  assert.equal(dropOwner(11), 0);
  assert.equal(foundId("strawberry juice", 10.1, -4), foundId("strawberry juice", 10.2, -4.1));
  assert.notEqual(foundId("strawberry juice", 10, -4), foundId("strawberry juice", 30, -4));
  assert.equal(dropOwner(foundId("crumb", 1, 1)), 0);
  assert.equal(PROTOCOL, 1);
});

test("a table's code is ten letters and digits that can't be mistaken for one another, and nothing else is one", () => {
  const random = (bytes: Uint8Array<ArrayBuffer>) => crypto.getRandomValues(bytes);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = tableCode(random);
    assert.ok(isTableCode(code), code);
    assert.ok(!/[01ilo]/.test(code), code);
    seen.add(code);
  }
  assert.equal(seen.size, 200);
  for (const bad of ["", "abc", "ABCDEFGHJK", "abcdefghj1", "abcdefghjkm", null, 12345]) assert.ok(!isTableCode(bad), String(bad));
});
